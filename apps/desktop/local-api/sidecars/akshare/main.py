# SPDX-License-Identifier: GPL-3.0-only

"""Closed AKShare adapter used by the Zinuto desktop runtime.

This worker exposes a whitelist NDJSON request contract over AKShare. It starts
no HTTP listener and never dispatches a caller-supplied function name.
"""

from __future__ import annotations

import json
import math
import os
import re
import signal
import sys
import threading
import time as clock
from datetime import datetime, time, timezone, timedelta
from importlib.metadata import version
from multiprocessing import freeze_support
from typing import Any

import akshare as ak
import requests
from akshare.stock.stock_zh_a_sina import stock_zh_a_daily, stock_zh_a_minute
from akshare.stock.stock_zh_a_tx import stock_zh_a_spot_tx
from akshare.stock_feature.stock_hist_tx import stock_zh_a_hist_tx

PROTOCOL = "zinuto.akshare.v1"
ALLOWED_OPERATIONS = {
    "index_zh_a_hist",
    "stock_info_a_code_name",
    "stock_zh_a_hist",
    "stock_zh_a_hist_min_em",
}
ALLOWED_TIMEFRAMES = {"1m", "5m", "1h", "1d"}
ALLOWED_ADJUSTMENTS = {"none", "qfq", "hfq"}
MAX_REQUEST_BYTES = 64 * 1024
MAX_ROWS = 250_000
MAX_INSTRUMENT_ROWS = 20_000
MIN_INSTRUMENT_CATALOG_ROWS = 4_000
REQUIRED_INSTRUMENT_EXCHANGES = {"SH", "SZ", "BJ"}
SHANGHAI_OFFSET = timezone(timedelta(hours=8))
DAILY_OPERATIONS = {
    "stock_zh_a_hist",
    "index_zh_a_hist",
    "stock_zh_a_hist_tx",
    "stock_zh_a_daily",
}


class WorkerError(Exception):
    def __init__(self, code: str, args: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.args_payload = args or {}


_PARENT_PID_ENV = "ZINUTO_PYTHON_SIDECAR_PARENT_PID"
_PARENT_WATCH_INTERVAL_SECONDS = 0.25


def _expected_parent_pid() -> int | None:
    raw = os.environ.get(_PARENT_PID_ENV, "").strip()
    if not re.fullmatch(r"[1-9][0-9]{0,9}", raw):
        return None
    parent_pid = int(raw)
    return parent_pid if parent_pid > 1 else None


def _parent_process_disappeared(expected_parent_pid: int) -> bool:
    if os.getppid() != expected_parent_pid:
        return True
    try:
        os.kill(expected_parent_pid, 0)
    except ProcessLookupError:
        return True
    except PermissionError:
        return False
    return False


def _terminate_after_parent_exit() -> None:
    # Node creates a detached POSIX process group so cancellation can reap
    # worker grandchildren. If the Node parent is killed first, terminate that
    # same isolated group rather than leaving a frozen sidecar behind.
    if os.name == "posix":
        try:
            if os.getpgrp() == os.getpid():
                os.killpg(os.getpgrp(), signal.SIGKILL)
        except OSError:
            pass
    os._exit(0)


def _start_parent_watchdog() -> None:
    # Windows uses taskkill /T from the desktop parent. The detached-process
    # case exists only on POSIX, where the worker must watch its Node parent.
    if os.name != "posix":
        return
    expected_parent_pid = _expected_parent_pid()
    if expected_parent_pid is None:
        return

    def watch_parent() -> None:
        while True:
            if _parent_process_disappeared(expected_parent_pid):
                _terminate_after_parent_exit()
            clock.sleep(_PARENT_WATCH_INTERVAL_SECONDS)

    threading.Thread(target=watch_parent, name="zinuto-parent-watchdog", daemon=True).start()


def _require_exact_keys(value: dict[str, Any], expected: set[str]) -> None:
    if set(value) != expected:
        raise WorkerError("AKSHARE_SIDECAR_REQUEST_INVALID")


def _parse_request(raw_line: bytes) -> dict[str, Any]:
    if not raw_line or len(raw_line) > MAX_REQUEST_BYTES:
        raise WorkerError("AKSHARE_SIDECAR_REQUEST_INVALID")
    try:
        request = json.loads(raw_line)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WorkerError("AKSHARE_SIDECAR_REQUEST_INVALID") from error
    if not isinstance(request, dict):
        raise WorkerError("AKSHARE_SIDECAR_REQUEST_INVALID")
    _require_exact_keys(request, {"protocol", "requestId", "operation", "params"})
    if request["protocol"] != PROTOCOL:
        raise WorkerError("AKSHARE_SIDECAR_PROTOCOL_UNSUPPORTED")
    if not isinstance(request["requestId"], str) or not re.fullmatch(
        r"[A-Za-z0-9_-]{1,128}", request["requestId"]
    ):
        raise WorkerError("AKSHARE_SIDECAR_REQUEST_INVALID")
    if request["operation"] not in ALLOWED_OPERATIONS:
        raise WorkerError("AKSHARE_SIDECAR_OPERATION_FORBIDDEN")
    params = request["params"]
    if not isinstance(params, dict):
        raise WorkerError("AKSHARE_SIDECAR_REQUEST_INVALID")
    if request["operation"] == "stock_info_a_code_name":
        _require_exact_keys(params, set())
        return request
    _require_exact_keys(
        params, {"symbol", "timeframe", "startAt", "endAt", "adjustment"}
    )
    if not isinstance(params["symbol"], str) or not re.fullmatch(
        r"[0-9]{6}", params["symbol"]
    ):
        raise WorkerError("AKSHARE_SIDECAR_REQUEST_INVALID")
    if params["timeframe"] not in ALLOWED_TIMEFRAMES:
        raise WorkerError("AKSHARE_SIDECAR_REQUEST_INVALID")
    if params["adjustment"] not in ALLOWED_ADJUSTMENTS:
        raise WorkerError("AKSHARE_SIDECAR_REQUEST_INVALID")
    try:
        start_at = datetime.fromisoformat(params["startAt"].replace("Z", "+00:00"))
        end_at = datetime.fromisoformat(params["endAt"].replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise WorkerError("AKSHARE_SIDECAR_REQUEST_INVALID") from error
    if start_at.tzinfo is None or end_at.tzinfo is None or end_at < start_at:
        raise WorkerError("AKSHARE_SIDECAR_REQUEST_INVALID")
    if request["operation"] == "stock_zh_a_hist" and params["timeframe"] != "1d":
        raise WorkerError("AKSHARE_SIDECAR_OPERATION_FORBIDDEN")
    if request["operation"] == "stock_zh_a_hist_min_em" and params["timeframe"] not in {
        "1m",
        "5m",
        "1h",
    }:
        raise WorkerError("AKSHARE_SIDECAR_OPERATION_FORBIDDEN")
    if request["operation"] == "index_zh_a_hist" and (
        params["timeframe"] != "1d" or params["adjustment"] != "none"
    ):
        raise WorkerError("AKSHARE_SIDECAR_OPERATION_FORBIDDEN")
    return request


def _finite_number(value: Any) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise WorkerError("AKSHARE_UPSTREAM_SCHEMA_INVALID")
    return number


def _daily_timestamp(value: Any) -> str:
    date_value = datetime.fromisoformat(str(value)[:10]).date()
    return datetime.combine(date_value, time(15, 0), SHANGHAI_OFFSET).isoformat()


def _minute_timestamp(value: Any) -> str:
    parsed = datetime.fromisoformat(str(value).replace(" ", "T"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=SHANGHAI_OFFSET)
    return parsed.astimezone(SHANGHAI_OFFSET).isoformat()


def _canonical_rows(frame: Any, operation: str) -> list[dict[str, Any]]:
    if frame is None or not hasattr(frame, "to_dict"):
        raise WorkerError("AKSHARE_UPSTREAM_SCHEMA_INVALID")
    records = frame.to_dict(orient="records")
    if len(records) > MAX_ROWS:
        raise WorkerError("ACQUISITION_ROW_LIMIT_EXCEEDED", {"maxRows": MAX_ROWS})
    is_daily = operation in DAILY_OPERATIONS
    columns = {
        "timestamp": ("日期", "date") if is_daily else ("时间", "day"),
        "open": ("开盘", "open"),
        "high": ("最高", "high"),
        "low": ("最低", "low"),
        "close": ("收盘", "close"),
        "volume": ("成交量", "volume", "amount"),
    }
    rows: list[dict[str, Any]] = []
    for record in records:
        if not isinstance(record, dict):
            raise WorkerError("AKSHARE_UPSTREAM_SCHEMA_INVALID")
        values = {
            name: next(
                (record[column] for column in alternatives if column in record),
                None,
            )
            for name, alternatives in columns.items()
        }
        if any(value is None for value in values.values()):
            raise WorkerError("AKSHARE_UPSTREAM_SCHEMA_INVALID")
        rows.append(
            {
                "timestamp": _daily_timestamp(values["timestamp"])
                if is_daily
                else _minute_timestamp(values["timestamp"]),
                "open": _finite_number(values["open"]),
                "high": _finite_number(values["high"]),
                "low": _finite_number(values["low"]),
                "close": _finite_number(values["close"]),
                "volume": _finite_number(values["volume"]),
            }
        )
    return rows


def _a_share_exchange_id(symbol: str) -> str | None:
    if re.fullmatch(r"(?:60[0135]|68[89])[0-9]{3}", symbol):
        return "SH"
    if re.fullmatch(r"(?:00[0-3]|30[01])[0-9]{3}", symbol):
        return "SZ"
    if re.fullmatch(r"(?:[48][0-9]{5}|92[0-9]{4})", symbol):
        return "BJ"
    return None


def _normalize_a_share_symbol(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"(?:(sh|sz|bj))?([0-9]{6})", value.strip(), re.IGNORECASE)
    if match is None:
        return None
    prefix, symbol = match.groups()
    exchange_id = _a_share_exchange_id(symbol)
    if exchange_id is None or (
        prefix is not None and prefix.upper() != exchange_id
    ):
        return None
    return symbol


def _canonical_instrument_rows(frame: Any) -> list[dict[str, Any]]:
    if frame is None or not hasattr(frame, "to_dict"):
        raise WorkerError("AKSHARE_UPSTREAM_SCHEMA_INVALID")
    records = frame.to_dict(orient="records")
    if len(records) > MAX_INSTRUMENT_ROWS:
        raise WorkerError(
            "ACQUISITION_ROW_LIMIT_EXCEEDED", {"maxRows": MAX_INSTRUMENT_ROWS}
        )
    rows_by_symbol: dict[str, dict[str, Any]] = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        symbol_value = record.get("code")
        name_value = record.get("name")
        if not isinstance(name_value, str):
            continue
        symbol = _normalize_a_share_symbol(symbol_value)
        name = name_value.strip()
        if symbol is None or not name or len(name) > 256:
            continue
        exchange_id = _a_share_exchange_id(symbol)
        if exchange_id is None:
            continue
        rows_by_symbol.setdefault(
            symbol,
            {
                "symbol": symbol,
                "name": name,
                "exchangeId": exchange_id,
                "kind": "A_SHARE",
            },
        )
    exchange_order = {"SH": 0, "SZ": 1, "BJ": 2}
    return sorted(
        rows_by_symbol.values(),
        key=lambda row: (exchange_order[row["exchangeId"]], row["symbol"]),
    )


def _require_complete_instrument_catalog(
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    exchanges = {row["exchangeId"] for row in rows}
    if (
        len(rows) < MIN_INSTRUMENT_CATALOG_ROWS
        or exchanges != REQUIRED_INSTRUMENT_EXCHANGES
    ):
        raise WorkerError("AKSHARE_UPSTREAM_SCHEMA_INVALID")
    return rows


def _fetch_a_share_instrument_catalog() -> list[dict[str, Any]]:
    try:
        return _require_complete_instrument_catalog(
            _canonical_instrument_rows(ak.stock_info_a_code_name())
        )
    except Exception as primary_error:
        try:
            return _require_complete_instrument_catalog(
                _canonical_instrument_rows(stock_zh_a_spot_tx())
            )
        except Exception:
            raise primary_error


def _a_share_tencent_symbol(symbol: str) -> str | None:
    exchange_id = _a_share_exchange_id(symbol)
    if exchange_id not in {"SH", "SZ"}:
        return None
    return f"{exchange_id.lower()}{symbol}"


def _a_share_sina_symbol(symbol: str) -> str | None:
    exchange_id = _a_share_exchange_id(symbol)
    if exchange_id is None:
        return None
    return f"{exchange_id.lower()}{symbol}"


def _filter_rows_to_requested_range(
    rows: list[dict[str, Any]], start_at: datetime, end_at: datetime
) -> list[dict[str, Any]]:
    return [
        row
        for row in rows
        if start_at <= datetime.fromisoformat(row["timestamp"]) <= end_at
    ]


def _fetch_a_share_daily(
    params: dict[str, Any], start_local: datetime, end_local: datetime
) -> tuple[list[dict[str, Any]], str]:
    adjustment = "" if params["adjustment"] == "none" else params["adjustment"]
    try:
        return (
            _canonical_rows(
                ak.stock_zh_a_hist(
                    symbol=params["symbol"],
                    period="daily",
                    start_date=start_local.strftime("%Y%m%d"),
                    end_date=end_local.strftime("%Y%m%d"),
                    adjust=adjustment,
                ),
                "stock_zh_a_hist",
            ),
            "eastmoney",
        )
    except Exception as primary_error:
        tencent_symbol = _a_share_tencent_symbol(params["symbol"])
        if tencent_symbol is not None:
            try:
                return (
                    _canonical_rows(
                        stock_zh_a_hist_tx(
                            symbol=tencent_symbol,
                            start_date=start_local.strftime("%Y%m%d"),
                            end_date=end_local.strftime("%Y%m%d"),
                            adjust=adjustment,
                        ),
                        "stock_zh_a_hist_tx",
                    ),
                    "tencent",
                )
            except Exception:
                pass
        sina_symbol = _a_share_sina_symbol(params["symbol"])
        if sina_symbol is not None:
            try:
                return (
                    _canonical_rows(
                        stock_zh_a_daily(
                            symbol=sina_symbol,
                            start_date=start_local.strftime("%Y%m%d"),
                            end_date=end_local.strftime("%Y%m%d"),
                            adjust=adjustment,
                        ),
                        "stock_zh_a_daily",
                    ),
                    "sina",
                )
            except Exception:
                pass
        raise primary_error


def _fetch_a_share_minute(
    params: dict[str, Any],
    start_at: datetime,
    end_at: datetime,
    start_local: datetime,
    end_local: datetime,
) -> tuple[list[dict[str, Any]], str]:
    periods = {"1m": "1", "5m": "5", "1h": "60"}
    adjustment = "" if params["adjustment"] == "none" else params["adjustment"]
    try:
        return (
            _canonical_rows(
                ak.stock_zh_a_hist_min_em(
                    symbol=params["symbol"],
                    start_date=start_local.strftime("%Y-%m-%d %H:%M:%S"),
                    end_date=end_local.strftime("%Y-%m-%d %H:%M:%S"),
                    period=periods[params["timeframe"]],
                    adjust=adjustment,
                ),
                "stock_zh_a_hist_min_em",
            ),
            "eastmoney",
        )
    except Exception as primary_error:
        sina_symbol = _a_share_sina_symbol(params["symbol"])
        if sina_symbol is None:
            raise primary_error
        try:
            return (
                _filter_rows_to_requested_range(
                    _canonical_rows(
                        stock_zh_a_minute(
                            symbol=sina_symbol,
                            period=periods[params["timeframe"]],
                            adjust=adjustment,
                        ),
                        "stock_zh_a_minute",
                    ),
                    start_at,
                    end_at,
                ),
                "sina",
            )
        except Exception:
            raise primary_error


def _fetch(request: dict[str, Any]) -> tuple[str, list[dict[str, Any]], str]:
    operation = request["operation"]
    if operation == "stock_info_a_code_name":
        return "instruments", _fetch_a_share_instrument_catalog(), "eastmoney"
    params = request["params"]
    start_at = datetime.fromisoformat(params["startAt"].replace("Z", "+00:00"))
    end_at = datetime.fromisoformat(params["endAt"].replace("Z", "+00:00"))
    start_local = start_at.astimezone(SHANGHAI_OFFSET)
    end_local = end_at.astimezone(SHANGHAI_OFFSET)
    if operation == "stock_zh_a_hist":
        rows, upstream_id = _fetch_a_share_daily(params, start_local, end_local)
        return "bars", _filter_rows_to_requested_range(rows, start_at, end_at), upstream_id
    elif operation == "stock_zh_a_hist_min_em":
        rows, upstream_id = _fetch_a_share_minute(
            params, start_at, end_at, start_local, end_local
        )
        return "bars", _filter_rows_to_requested_range(rows, start_at, end_at), upstream_id
    else:
        frame = ak.index_zh_a_hist(
            symbol=params["symbol"],
            period="daily",
            start_date=start_local.strftime("%Y%m%d"),
            end_date=end_local.strftime("%Y%m%d"),
        )
    return (
        "bars",
        _filter_rows_to_requested_range(
            _canonical_rows(frame, operation), start_at, end_at
        ),
        "eastmoney",
    )


def _emit(payload: dict[str, Any]) -> None:
    # NDJSON is an inter-process protocol, not a terminal. ASCII JSON keeps
    # non-ASCII upstream names independent of the Windows system code page.
    encoded = (
        json.dumps(payload, ensure_ascii=True, separators=(",", ":")) + "\n"
    ).encode("ascii")
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def _retryable_status_code(error: Exception) -> int | None:
    candidates = [
        getattr(error, "status_code", None),
        getattr(getattr(error, "response", None), "status_code", None),
    ]
    for candidate in candidates:
        try:
            status_code = int(candidate)
        except (TypeError, ValueError):
            continue
        if status_code == 429 or 500 <= status_code <= 599:
            return status_code
    return None


def _is_retryable_transport_error(error: Exception) -> bool:
    """Whether AKShare could not establish or retain an upstream connection."""
    return isinstance(error, requests.exceptions.ConnectionError)


def main() -> int:
    _start_parent_watchdog()
    request_id = "unknown"
    try:
        request = _parse_request(sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1))
        request_id = request["requestId"]
        response_kind, rows, upstream_id = _fetch(request)
        payload = {
            "protocol": PROTOCOL,
            "requestId": request_id,
            "ok": True,
            "runtime": {
                "akshare": version("akshare"),
            },
            "kind": response_kind,
            "rows": rows,
        }
        if response_kind == "bars":
            payload["upstreamId"] = upstream_id
        _emit(payload)
        return 0
    except WorkerError as error:
        _emit(
            {
                "protocol": PROTOCOL,
                "requestId": request_id,
                "ok": False,
                "error": {"code": error.code, "args": error.args_payload},
            }
        )
        return 2
    except Exception as error:  # Upstream libraries may raise many concrete types.
        retryable_status_code = _retryable_status_code(error)
        retryable_transport_error = _is_retryable_transport_error(error)
        _emit(
            {
                "protocol": PROTOCOL,
                "requestId": request_id,
                "ok": False,
                "error": {
                    "code": "AKSHARE_UPSTREAM_RETRYABLE"
                    if retryable_status_code is not None or retryable_transport_error
                    else "AKSHARE_UPSTREAM_FAILED",
                    "args": {"statusCode": retryable_status_code}
                    if retryable_status_code is not None
                    else {"upstreamErrorType": type(error).__name__},
                },
            }
        )
        return 3


if __name__ == "__main__":
    # PyInstaller starts multiprocessing helpers by re-running this executable.
    # Let its bootstrap consume those helper arguments before this worker reads
    # stdin, otherwise the helpers emit extra protocol-shaped error payloads.
    freeze_support()
    raise SystemExit(main())
