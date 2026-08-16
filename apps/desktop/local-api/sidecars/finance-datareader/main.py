# SPDX-License-Identifier: GPL-3.0-only

"""Closed FinanceDataReader OHLCV worker for the Zinuto desktop runtime.

The process accepts one bounded NDJSON request on stdin and exposes a small
allow-list of price-data operations.  It never exposes FRED or ECOS, and it
rejects every response that cannot retain complete OHLCV semantics.
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
from contextlib import redirect_stdout
from datetime import datetime, time
from importlib.metadata import version
from multiprocessing import freeze_support
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import FinanceDataReader as fdr
import requests

PROTOCOL = "zinuto.finance-datareader.v1"
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


def _connector_version() -> str:
    """Read the generated, audited pin from source or the frozen bundle."""
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    try:
        payload = json.loads((root / "connector-versions.json").read_text("utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("connector version manifest is invalid") from error
    value = payload.get("financedatareader") if isinstance(payload, dict) else None
    if not isinstance(value, str) or not re.fullmatch(r"[0-9A-Za-z.+-]{1,64}", value):
        raise RuntimeError("connector version manifest is invalid")
    return value


FINANCE_DATA_READER_VERSION = _connector_version()
MAX_REQUEST_BYTES = 64 * 1024
MAX_ROWS = 250_000
MAX_INSTRUMENT_ROWS = 20_000
UPSTREAM_MAX_ATTEMPTS = 2
UPSTREAM_RETRY_DELAY_SECONDS = 0.5
UPSTREAM_CONNECT_TIMEOUT_SECONDS = 5
UPSTREAM_READ_TIMEOUT_SECONDS = 20
ALLOWED_OPERATIONS = {"bars", "instruments"}
ALLOWED_MARKETS = {
    "CN_A_SHARE",
    "HK_STOCKS",
    "KR_STOCKS",
    "US_STOCKS",
    "JP_STOCKS",
    "VN_STOCKS",
    "GLOBAL_INDICES",
    "FOREX",
    "COMMODITY_FUTURES",
    "RATE_FUTURES",
    "CRYPTO_SPOT",
}
LISTING_SOURCES = {
    "HK_STOCKS": ("HKEX",),
    "KR_STOCKS": ("KRX",),
    # US equities are one user-facing market. Search the supported exchanges
    # together and retain each listing's exchange as metadata only.
    "US_STOCKS": ("NASDAQ", "NYSE", "AMEX"),
    "JP_STOCKS": ("TSE",),
    "VN_STOCKS": ("HOSE",),
}
MARKET_ZONES = {
    "CN_A_SHARE": "Asia/Shanghai",
    "HK_STOCKS": "Asia/Hong_Kong",
    "KR_STOCKS": "Asia/Seoul",
    "US_STOCKS": "America/New_York",
    "JP_STOCKS": "Asia/Tokyo",
    "VN_STOCKS": "Asia/Ho_Chi_Minh",
    "GLOBAL_INDICES": "UTC",
    "FOREX": "UTC",
    "COMMODITY_FUTURES": "America/New_York",
    "RATE_FUTURES": "America/New_York",
    "CRYPTO_SPOT": "UTC",
}
MARKET_UPSTREAMS = {
    "CN_A_SHARE": "yahoo-finance",
    "HK_STOCKS": "yahoo-finance",
    "KR_STOCKS": "naver-finance",
    "US_STOCKS": "yahoo-finance",
    "JP_STOCKS": "yahoo-finance",
    "VN_STOCKS": "yahoo-finance",
    "GLOBAL_INDICES": "yahoo-finance",
    "FOREX": "yahoo-finance",
    "COMMODITY_FUTURES": "yahoo-finance",
    "RATE_FUTURES": "yahoo-finance",
    "CRYPTO_SPOT": "yahoo-finance",
}
SYMBOL_PATTERN = re.compile(r"[A-Za-z0-9._^=/:-]{1,64}")


# FinanceDataReader calls requests directly and does not supply a timeout on
# every route. This process has no other responsibility, so bounding the
# session here makes every approved upstream request fit inside the desktop
# directory/download deadline without changing the connector package itself.
_ORIGINAL_SESSION_REQUEST = requests.sessions.Session.request


def _bounded_session_request(
    self: requests.sessions.Session,
    method: str,
    url: str,
    **kwargs: Any,
) -> requests.Response:
    kwargs.setdefault(
        "timeout",
        (UPSTREAM_CONNECT_TIMEOUT_SECONDS, UPSTREAM_READ_TIMEOUT_SECONDS),
    )
    return _ORIGINAL_SESSION_REQUEST(self, method, url, **kwargs)


requests.sessions.Session.request = _bounded_session_request


class WorkerError(Exception):
    def __init__(self, code: str, args: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.args_payload = args or {}


def _require_exact_keys(value: dict[str, Any], expected: set[str]) -> None:
    if set(value) != expected:
        raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID")


def _parse_datetime(value: Any) -> datetime:
    if not isinstance(value, str):
        raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID") from error
    if result.tzinfo is None:
        raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID")
    return result


def _parse_request(raw_line: bytes) -> dict[str, Any]:
    if not raw_line or len(raw_line) > MAX_REQUEST_BYTES:
        raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID")
    try:
        request = json.loads(raw_line)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID") from error
    if not isinstance(request, dict):
        raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID")
    _require_exact_keys(request, {"protocol", "requestId", "operation", "params"})
    if request["protocol"] != PROTOCOL:
        raise WorkerError("FINANCEDATAREADER_SIDECAR_PROTOCOL_UNSUPPORTED")
    if not isinstance(request["requestId"], str) or not re.fullmatch(
        r"[A-Za-z0-9_-]{1,128}", request["requestId"]
    ):
        raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID")
    if request["operation"] not in ALLOWED_OPERATIONS:
        raise WorkerError("FINANCEDATAREADER_SIDECAR_OPERATION_FORBIDDEN")
    params = request["params"]
    if not isinstance(params, dict):
        raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID")
    if request["operation"] == "instruments":
        _require_exact_keys(params, {"marketId", "query"})
        if (
            params["marketId"] not in ALLOWED_MARKETS
            or not isinstance(params["query"], str)
            or len(params["query"]) > 64
        ):
            raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID")
        return request
    _require_exact_keys(params, {"marketId", "symbol", "timeframe", "startAt", "endAt"})
    if (
        params["marketId"] not in ALLOWED_MARKETS
        or not isinstance(params["symbol"], str)
        or not SYMBOL_PATTERN.fullmatch(params["symbol"])
        or params["timeframe"] != "1d"
    ):
        raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID")
    if params["symbol"].upper().startswith(("FRED:", "ECOS:")):
        raise WorkerError("FINANCEDATAREADER_SIDECAR_OPERATION_FORBIDDEN")
    start_at = _parse_datetime(params["startAt"])
    end_at = _parse_datetime(params["endAt"])
    if end_at < start_at:
        raise WorkerError("FINANCEDATAREADER_SIDECAR_REQUEST_INVALID")
    return request


def _request_id_from_raw_line(raw_line: bytes) -> str | None:
    """Keep a valid correlation ID even when later request checks reject it."""
    try:
        payload = json.loads(raw_line)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    request_id = payload.get("requestId") if isinstance(payload, dict) else None
    if isinstance(request_id, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", request_id):
        return request_id
    return None


def _finite_number(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise WorkerError("FINANCEDATAREADER_UPSTREAM_SCHEMA_INVALID") from error
    if not math.isfinite(number):
        raise WorkerError("FINANCEDATAREADER_UPSTREAM_SCHEMA_INVALID")
    return number


def _find_column(columns: list[Any], expected: str) -> Any | None:
    for column in columns:
        if str(column).strip().casefold() == expected.casefold():
            return column
    return None


def _strip_suffix(symbol: str, suffix: str) -> str:
    return symbol[: -len(suffix)] if symbol.upper().endswith(suffix) else symbol


def _reader_request(market_id: str, symbol: str) -> tuple[str, str]:
    """Map a validated market symbol to FDR's explicit reader route.

    FDR's default dispatch is intentionally broad. In particular, a raw
    ``VNM`` selects a US ticker rather than the HOSE listing, while bare
    ``000001.SZ`` currently takes a different Yahoo path from ``SZSE:000001``.
    Use only FDR's documented, allow-listed routes so the catalog market,
    returned data, and provenance all describe the same market.
    """
    normalized = symbol.strip().upper()
    if market_id == "CN_A_SHARE":
        exchange = "SSE" if normalized.startswith(("5", "6", "9")) else "SZSE"
        return f"{exchange}:{normalized}", "yahoo-finance"
    if market_id == "HK_STOCKS":
        return f"HKEX:{_strip_suffix(normalized, '.HK').zfill(4)}", "yahoo-finance"
    if market_id == "KR_STOCKS":
        return f"NAVER:{normalized}", "naver-finance"
    if market_id == "US_STOCKS":
        return f"YAHOO:{normalized}", "yahoo-finance"
    if market_id == "JP_STOCKS":
        return f"TSE:{_strip_suffix(normalized, '.T')}", "yahoo-finance"
    if market_id == "VN_STOCKS":
        return f"HOSE:{_strip_suffix(normalized, '.VN')}", "yahoo-finance"
    if market_id == "GLOBAL_INDICES" and normalized == "KS11":
        # FDR intentionally routes KOSPI through its maintained KRX cache.
        return normalized, "krx-index-cache"
    return f"YAHOO:{normalized}", "yahoo-finance"


def _status_code(error: BaseException) -> int | None:
    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None)
    return status if isinstance(status, int) and 100 <= status <= 599 else None


def _is_retryable_upstream_error(error: BaseException) -> bool:
    if isinstance(error, requests.exceptions.JSONDecodeError):
        return False
    status = _status_code(error)
    if status is not None:
        return status == 408 or status == 429 or status >= 500
    return isinstance(
        error,
        (
            requests.exceptions.ConnectionError,
            requests.exceptions.Timeout,
            requests.exceptions.ChunkedEncodingError,
            TimeoutError,
            ConnectionError,
        ),
    )


def _upstream_worker_error(
    error: BaseException,
    *,
    operation: str,
    attempt_count: int,
) -> WorkerError:
    args: dict[str, Any] = {
        "upstreamErrorType": type(error).__name__,
        "attemptCount": attempt_count,
    }
    status = _status_code(error)
    if status is not None:
        args["statusCode"] = status
    if operation == "bars" and status in {400, 404, 410, 422}:
        return WorkerError("FINANCEDATAREADER_SYMBOL_UNAVAILABLE", args)
    if isinstance(
        error,
        (
            requests.exceptions.JSONDecodeError,
            json.JSONDecodeError,
            KeyError,
            IndexError,
        ),
    ):
        return WorkerError("FINANCEDATAREADER_UPSTREAM_SCHEMA_INVALID", args)
    return WorkerError("FINANCEDATAREADER_UPSTREAM_FAILED", args)


def _read_upstream(operation: str, read: Any) -> Any:
    """Run one FDR operation with bounded retries and a clean NDJSON stream."""
    for attempt in range(1, UPSTREAM_MAX_ATTEMPTS + 1):
        try:
            # Some FDR routes print validation diagnostics to stdout. stdout is
            # the closed NDJSON protocol channel, so retain diagnostics on
            # stderr and never let them corrupt a valid error response.
            with redirect_stdout(sys.stderr):
                return read()
        except WorkerError:
            raise
        except Exception as error:  # FDR exposes concrete upstream exceptions
            if _is_retryable_upstream_error(error) and attempt < UPSTREAM_MAX_ATTEMPTS:
                clock.sleep(UPSTREAM_RETRY_DELAY_SECONDS)
                continue
            raise _upstream_worker_error(
                error,
                operation=operation,
                attempt_count=attempt,
            ) from error
    raise AssertionError("unreachable")


def _daily_timestamp(value: Any, market_id: str) -> str:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as error:
        raise WorkerError("FINANCEDATAREADER_UPSTREAM_SCHEMA_INVALID") from error
    zone = ZoneInfo(MARKET_ZONES[market_id])
    if parsed.tzinfo is not None:
        return parsed.astimezone(zone).isoformat()
    # FDR's price interfaces are daily bars. A local close-time timestamp is
    # explicit and stable; the original date remains intact.
    return datetime.combine(parsed.date(), time(16, 0), zone).isoformat()


def _canonical_rows(
    frame: Any,
    market_id: str,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
) -> list[dict[str, Any]]:
    if (
        frame is None
        or not hasattr(frame, "columns")
        or not hasattr(frame, "index")
        or not hasattr(frame, "iterrows")
    ):
        raise WorkerError("FINANCEDATAREADER_UPSTREAM_SCHEMA_INVALID")
    if len(frame.index) == 0:
        raise WorkerError("FINANCEDATAREADER_SYMBOL_UNAVAILABLE")
    columns = list(frame.columns)
    required = {
        name: _find_column(columns, name)
        for name in ("Open", "High", "Low", "Close", "Volume")
    }
    if any(column is None for column in required.values()):
        # This deliberately rejects FRED/ECOS and all single-value or partial
        # series instead of inventing OHLCV fields.
        raise WorkerError("FINANCEDATAREADER_OHLCV_UNAVAILABLE")
    if len(frame.index) > MAX_ROWS:
        raise WorkerError("ACQUISITION_ROW_LIMIT_EXCEEDED", {"maxRows": MAX_ROWS})
    rows: list[dict[str, Any]] = []
    for index, record in frame.iterrows():
        timestamp = _daily_timestamp(index, market_id)
        timestamp_value = _parse_datetime(timestamp)
        # Yahoo-backed daily routes may include one calendar-boundary bar
        # immediately before a requested date. It is valid source data but was
        # not requested, so drop it before inspecting OHLCV values or staging.
        if (
            (start_at is not None and timestamp_value < start_at)
            or (end_at is not None and timestamp_value > end_at)
        ):
            continue
        values = {name: _finite_number(record[column]) for name, column in required.items()}
        rows.append(
            {
                "timestamp": timestamp,
                "open": values["Open"],
                "high": values["High"],
                "low": values["Low"],
                "close": values["Close"],
                "volume": values["Volume"],
            }
        )
    if not rows:
        raise WorkerError("FINANCEDATAREADER_SYMBOL_UNAVAILABLE")
    return rows


def _read_bars(params: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    market_id = params["marketId"]
    reader_symbol, upstream_id = _reader_request(market_id, params["symbol"])
    frame = _read_upstream(
        "bars",
        lambda: fdr.DataReader(
            reader_symbol,
            params["startAt"][:10],
            params["endAt"][:10],
        ),
    )
    return (
        _canonical_rows(
            frame,
            market_id,
            _parse_datetime(params["startAt"]),
            _parse_datetime(params["endAt"]),
        ),
        upstream_id,
    )


def _first_column(columns: list[Any], names: tuple[str, ...]) -> Any | None:
    for name in names:
        column = _find_column(columns, name)
        if column is not None:
            return column
    return None


def _read_instruments(params: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    market_id = params["marketId"]
    listing_sources = LISTING_SOURCES.get(market_id)
    if listing_sources is None:
        return [], MARKET_UPSTREAMS[market_id]
    query = params["query"].strip().casefold()
    instruments: list[dict[str, Any]] = []
    seen_symbols: set[str] = set()
    for listing_source in listing_sources:
        frame = _read_upstream(
            "instruments",
            lambda source=listing_source: fdr.StockListing(source),
        )
        if frame is None or not hasattr(frame, "columns") or not hasattr(frame, "iterrows"):
            raise WorkerError("FINANCEDATAREADER_UPSTREAM_SCHEMA_INVALID")
        columns = list(frame.columns)
        symbol_column = _first_column(columns, ("Symbol", "Code", "종목코드"))
        name_column = _first_column(columns, ("Name", "Name(eng)", "종목명"))
        if symbol_column is None or name_column is None:
            raise WorkerError("FINANCEDATAREADER_UPSTREAM_SCHEMA_INVALID")
        for _, record in frame.iterrows():
            symbol = str(record[symbol_column]).strip()
            name = str(record[name_column]).strip()
            canonical_symbol = symbol.casefold()
            if (
                not SYMBOL_PATTERN.fullmatch(symbol)
                or not name
                or name.casefold() == "nan"
                or canonical_symbol in seen_symbols
            ):
                continue
            if query and query not in canonical_symbol and query not in name.casefold():
                continue
            seen_symbols.add(canonical_symbol)
            instruments.append(
                {"symbol": symbol, "name": name, "exchangeId": listing_source}
            )
            if len(instruments) >= MAX_INSTRUMENT_ROWS:
                return instruments, "+".join(source.lower() for source in listing_sources)
    return instruments, "+".join(source.lower() for source in listing_sources)


def _runtime() -> dict[str, str]:
    try:
        installed_version = version("finance-datareader")
    except Exception as error:
        raise WorkerError("FINANCEDATAREADER_SIDECAR_PROTOCOL_UNSUPPORTED") from error
    if installed_version != FINANCE_DATA_READER_VERSION:
        raise WorkerError("FINANCEDATAREADER_SIDECAR_PROTOCOL_UNSUPPORTED")
    return {"financedatareader": installed_version}


def _response(request: dict[str, Any]) -> dict[str, Any]:
    params = request["params"]
    if request["operation"] == "bars":
        rows, upstream_id = _read_bars(params)
        return {
            "protocol": PROTOCOL,
            "requestId": request["requestId"],
            "ok": True,
            "runtime": _runtime(),
            "kind": "bars",
            "upstreamId": upstream_id,
            "rows": rows,
        }
    rows, upstream_id = _read_instruments(params)
    return {
        "protocol": PROTOCOL,
        "requestId": request["requestId"],
        "ok": True,
        "runtime": _runtime(),
        "kind": "instruments",
        "upstreamId": upstream_id,
        "rows": rows,
    }


def _failure(request_id: str | None, error: WorkerError) -> dict[str, Any]:
    return {
        "protocol": PROTOCOL,
        "requestId": request_id or "invalid",
        "ok": False,
        "error": {"code": error.code, "args": error.args_payload},
    }


def _handle_request_line(raw_line: bytes) -> dict[str, Any]:
    request_id = _request_id_from_raw_line(raw_line)
    try:
        request = _parse_request(raw_line)
        request_id = request["requestId"]
        return _response(request)
    except WorkerError as error:
        return _failure(request_id, error)
    except Exception as error:  # do not expose implementation details over NDJSON
        return _failure(
            request_id,
            WorkerError(
                "FINANCEDATAREADER_UPSTREAM_FAILED",
                {"upstreamErrorType": type(error).__name__},
            ),
        )


def main() -> None:
    freeze_support()
    _start_parent_watchdog()
    raw_line = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
    response = _handle_request_line(raw_line)
    sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
