# SPDX-License-Identifier: GPL-3.0-only

import json
import io
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import main


class FakeFrame:
    def __init__(self, records):
        self.records = records

    def to_dict(self, orient):
        if orient != "records":
            raise AssertionError("unexpected orientation")
        return self.records


class WorkerMappingTest(unittest.TestCase):
    def test_protocol_emission_is_ascii_and_round_trips_non_ascii_names(self):
        output = io.BytesIO()
        payload = {
            "protocol": main.PROTOCOL,
            "requestId": "catalog-encoding",
            "ok": True,
            "rows": [{"symbol": "000001", "name": "平安银行"}],
        }
        with patch.object(main.sys, "stdout", SimpleNamespace(buffer=output)):
            main._emit(payload)
        encoded = output.getvalue()
        self.assertEqual(encoded.decode("ascii"), encoded.decode("utf-8"))
        self.assertEqual(json.loads(encoded)["rows"][0]["name"], "平安银行")

    def test_parent_watchdog_detects_only_a_missing_or_reparented_parent(self):
        with patch.object(main.os, "getppid", return_value=123), patch.object(
            main.os, "kill"
        ) as kill:
            self.assertFalse(main._parent_process_disappeared(123))
            kill.assert_called_once_with(123, 0)

        with patch.object(main.os, "getppid", return_value=1):
            self.assertTrue(main._parent_process_disappeared(123))

        with patch.object(main.os, "getppid", return_value=123), patch.object(
            main.os, "kill", side_effect=ProcessLookupError
        ):
            self.assertTrue(main._parent_process_disappeared(123))

    def test_daily_chinese_columns_map_to_canonical_fields(self):
        rows = main._canonical_rows(
            FakeFrame(
                [
                    {
                        "日期": "2026-07-18",
                        "开盘": 10,
                        "最高": 12,
                        "最低": 9,
                        "收盘": 11,
                        "成交量": 100,
                    }
                ]
            ),
            "stock_zh_a_hist",
        )
        self.assertEqual(rows[0]["timestamp"], "2026-07-18T15:00:00+08:00")
        self.assertEqual(
            [rows[0][key] for key in ("open", "high", "low", "close", "volume")],
            [10.0, 12.0, 9.0, 11.0, 100.0],
        )

    def test_minute_chinese_columns_map_to_canonical_fields(self):
        rows = main._canonical_rows(
            FakeFrame(
                [
                    {
                        "时间": "2026-07-18 09:35:00",
                        "开盘": 20,
                        "最高": 21,
                        "最低": 19,
                        "收盘": 20.5,
                        "成交量": 200,
                    }
                ]
            ),
            "stock_zh_a_hist_min_em",
        )
        self.assertEqual(rows[0]["timestamp"], "2026-07-18T09:35:00+08:00")
        self.assertEqual(rows[0]["close"], 20.5)

    def test_catalog_maps_only_real_a_share_symbols_to_their_exchange(self):
        rows = main._canonical_instrument_rows(
            FakeFrame(
                [
                    {"code": "sh600000", "name": "浦发银行"},
                    {"code": "SZ000001", "name": " 平安银行 "},
                    {"code": "301001", "name": "凯淳股份"},
                    {"code": "688981", "name": "中芯国际"},
                    {"code": "871396", "name": "常辅股份"},
                    {"code": "bj920000", "name": "安徽凤凰"},
                    {"code": "SH", "name": "forbidden token"},
                    {"code": "SZ", "name": "forbidden token"},
                    {"code": "BJ", "name": "forbidden token"},
                    {"code": "sh000001", "name": "mismatched market"},
                    {"code": "399001", "name": "深证成指"},
                    {"code": "900901", "name": "上证 B 股"},
                    {"code": "200002", "name": "深证 B 股"},
                    {"code": "600000", "name": "duplicate"},
                    {"code": None, "name": "invalid"},
                ]
            )
        )
        self.assertEqual(
            rows,
            [
                {
                    "symbol": "600000",
                    "name": "浦发银行",
                    "exchangeId": "SH",
                    "kind": "A_SHARE",
                },
                {
                    "symbol": "688981",
                    "name": "中芯国际",
                    "exchangeId": "SH",
                    "kind": "A_SHARE",
                },
                {
                    "symbol": "000001",
                    "name": "平安银行",
                    "exchangeId": "SZ",
                    "kind": "A_SHARE",
                },
                {
                    "symbol": "301001",
                    "name": "凯淳股份",
                    "exchangeId": "SZ",
                    "kind": "A_SHARE",
                },
                {
                    "symbol": "871396",
                    "name": "常辅股份",
                    "exchangeId": "BJ",
                    "kind": "A_SHARE",
                },
                {
                    "symbol": "920000",
                    "name": "安徽凤凰",
                    "exchangeId": "BJ",
                    "kind": "A_SHARE",
                },
            ],
        )

    def test_catalog_uses_tencent_when_exchange_directory_fails(self):
        request = main._parse_request(
            json.dumps(
                {
                    "protocol": main.PROTOCOL,
                    "requestId": "catalog-fallback",
                    "operation": "stock_info_a_code_name",
                    "params": {},
                }
            ).encode("utf-8")
        )

        def stock_info_a_code_name():
            raise main.requests.exceptions.ConnectionError("connection reset")

        def stock_zh_a_spot_tx():
            return FakeFrame(
                [
                    {"code": "sh600000", "name": "浦发银行"},
                    {"code": "sz000001", "name": "平安银行"},
                    {"code": "bj920000", "name": "安徽凤凰"},
                ]
            )

        with patch.object(
            main,
            "ak",
            SimpleNamespace(stock_info_a_code_name=stock_info_a_code_name),
        ), patch.object(main, "stock_zh_a_spot_tx", stock_zh_a_spot_tx), patch.object(
            main, "MIN_INSTRUMENT_CATALOG_ROWS", 3
        ):
            kind, rows, _upstream_id = main._fetch(request)
        self.assertEqual(kind, "instruments")
        self.assertEqual([row["symbol"] for row in rows], ["600000", "000001", "920000"])

    def test_catalog_uses_tencent_when_exchange_directory_is_incomplete(self):
        request = main._parse_request(
            json.dumps(
                {
                    "protocol": main.PROTOCOL,
                    "requestId": "catalog-incomplete-primary",
                    "operation": "stock_info_a_code_name",
                    "params": {},
                }
            ).encode("utf-8")
        )

        def stock_info_a_code_name():
            return FakeFrame(
                [
                    {"code": "600000", "name": "浦发银行"},
                    {"code": "000001", "name": "平安银行"},
                ]
            )

        def stock_zh_a_spot_tx():
            return FakeFrame(
                [
                    {"code": "sh600000", "name": "浦发银行"},
                    {"code": "sz000001", "name": "平安银行"},
                    {"code": "bj920000", "name": "安徽凤凰"},
                ]
            )

        with patch.object(
            main,
            "ak",
            SimpleNamespace(stock_info_a_code_name=stock_info_a_code_name),
        ), patch.object(main, "stock_zh_a_spot_tx", stock_zh_a_spot_tx), patch.object(
            main, "MIN_INSTRUMENT_CATALOG_ROWS", 3
        ):
            kind, rows, _upstream_id = main._fetch(request)
        self.assertEqual(kind, "instruments")
        self.assertEqual([row["symbol"] for row in rows], ["600000", "000001", "920000"])

    def test_catalog_rejects_an_incomplete_tencent_fallback(self):
        request = main._parse_request(
            json.dumps(
                {
                    "protocol": main.PROTOCOL,
                    "requestId": "catalog-incomplete-fallback",
                    "operation": "stock_info_a_code_name",
                    "params": {},
                }
            ).encode("utf-8")
        )

        def stock_info_a_code_name():
            raise main.requests.exceptions.ConnectionError("connection reset")

        def stock_zh_a_spot_tx():
            return FakeFrame(
                [
                    {"code": "600000", "name": "浦发银行"},
                    {"code": "000001", "name": "平安银行"},
                ]
            )

        with patch.object(
            main,
            "ak",
            SimpleNamespace(stock_info_a_code_name=stock_info_a_code_name),
        ), patch.object(main, "stock_zh_a_spot_tx", stock_zh_a_spot_tx), patch.object(
            main, "MIN_INSTRUMENT_CATALOG_ROWS", 1
        ):
            with self.assertRaises(main.requests.exceptions.ConnectionError):
                main._fetch(request)

    def test_catalog_request_is_whitelisted_with_no_caller_parameters(self):
        request = main._parse_request(
            json.dumps(
                {
                    "protocol": main.PROTOCOL,
                    "requestId": "catalog-1",
                    "operation": "stock_info_a_code_name",
                    "params": {},
                }
            ).encode("utf-8")
        )
        self.assertEqual(request["params"], {})

        with self.assertRaises(main.WorkerError) as context:
            main._parse_request(
                json.dumps(
                    {
                        "protocol": main.PROTOCOL,
                        "requestId": "catalog-2",
                        "operation": "stock_info_a_code_name",
                        "params": {"symbol": "SH"},
                    }
                ).encode("utf-8")
            )
        self.assertEqual(context.exception.code, "AKSHARE_SIDECAR_REQUEST_INVALID")

    def test_index_is_daily_unadjusted_and_calls_raw_six_digit_symbol(self):
        request_payload = {
            "protocol": main.PROTOCOL,
            "requestId": "index-1",
            "operation": "index_zh_a_hist",
            "params": {
                "symbol": "000001",
                "timeframe": "1d",
                "startAt": "2026-07-01T00:00:00+08:00",
                "endAt": "2026-07-18T23:59:59+08:00",
                "adjustment": "none",
            },
        }
        request = main._parse_request(json.dumps(request_payload).encode("utf-8"))
        calls = []

        def index_zh_a_hist(**kwargs):
            calls.append(kwargs)
            return FakeFrame(
                [
                    {
                        "日期": "2026-07-18",
                        "开盘": 3500,
                        "最高": 3520,
                        "最低": 3480,
                        "收盘": 3510,
                        "成交量": 1000,
                    }
                ]
            )

        with patch.object(
            main, "ak", SimpleNamespace(index_zh_a_hist=index_zh_a_hist)
        ):
            kind, rows, upstream_id = main._fetch(request)
        self.assertEqual(kind, "bars")
        self.assertEqual(upstream_id, "eastmoney")
        self.assertEqual(rows[0]["timestamp"], "2026-07-18T15:00:00+08:00")
        self.assertEqual(
            calls,
            [
                {
                    "symbol": "000001",
                    "period": "daily",
                    "start_date": "20260701",
                    "end_date": "20260718",
                }
            ],
        )

        for invalid_update in (
            {"timeframe": "1h"},
            {"adjustment": "qfq"},
            {"symbol": "INDEX-000001"},
        ):
            invalid = json.loads(json.dumps(request_payload))
            invalid["params"].update(invalid_update)
            with self.subTest(invalid_update=invalid_update):
                with self.assertRaises(main.WorkerError) as context:
                    main._parse_request(json.dumps(invalid).encode("utf-8"))
                self.assertIn(
                    context.exception.code,
                    {
                        "AKSHARE_SIDECAR_REQUEST_INVALID",
                        "AKSHARE_SIDECAR_OPERATION_FORBIDDEN",
                    },
                )

    def test_index_uses_sina_when_eastmoney_disconnects(self):
        request = main._parse_request(
            json.dumps(
                {
                    "protocol": main.PROTOCOL,
                    "requestId": "index-fallback",
                    "operation": "index_zh_a_hist",
                    "params": {
                        "symbol": "000300",
                        "timeframe": "1d",
                        "startAt": "2026-07-01T00:00:00+08:00",
                        "endAt": "2026-07-18T23:59:59+08:00",
                        "adjustment": "none",
                    },
                }
            ).encode("utf-8")
        )
        calls = []

        def index_zh_a_hist(**_kwargs):
            raise main.requests.exceptions.ConnectionError("connection reset")

        def stock_zh_index_daily(**kwargs):
            calls.append(kwargs)
            return FakeFrame(
                [
                    {
                        "date": "2026-07-18",
                        "open": 3500,
                        "high": 3520,
                        "low": 3480,
                        "close": 3510,
                        "volume": 1000,
                    }
                ]
            )

        with patch.object(
            main, "ak", SimpleNamespace(index_zh_a_hist=index_zh_a_hist)
        ), patch.object(main, "stock_zh_index_daily", stock_zh_index_daily):
            kind, rows, upstream_id = main._fetch(request)
        self.assertEqual(kind, "bars")
        self.assertEqual(upstream_id, "sina")
        self.assertEqual(rows[0]["timestamp"], "2026-07-18T15:00:00+08:00")
        self.assertEqual(calls, [{"symbol": "sh000300"}])
        self.assertEqual(main._a_share_index_symbol("399001"), "sz399001")
        self.assertEqual(main._a_share_index_symbol("899050"), "bj899050")

    def test_daily_uses_tencent_when_eastmoney_disconnects(self):
        request = main._parse_request(
            json.dumps(
                {
                    "protocol": main.PROTOCOL,
                    "requestId": "daily-fallback",
                    "operation": "stock_zh_a_hist",
                    "params": {
                        "symbol": "600000",
                        "timeframe": "1d",
                        "startAt": "2026-07-20T00:00:00+08:00",
                        "endAt": "2026-07-24T23:59:59+08:00",
                        "adjustment": "qfq",
                    },
                }
            ).encode("utf-8")
        )
        calls = []

        def stock_zh_a_hist(**kwargs):
            raise main.requests.exceptions.ConnectionError("connection reset")

        def stock_zh_a_hist_tx(**kwargs):
            calls.append(kwargs)
            return FakeFrame(
                [
                    {
                        "date": "2026-07-24",
                        "open": 10,
                        "high": 12,
                        "low": 9,
                        "close": 11,
                        "amount": 100,
                    }
                ]
            )

        with patch.object(
            main,
            "ak",
            SimpleNamespace(
                stock_zh_a_hist=stock_zh_a_hist,
            ),
        ), patch.object(main, "stock_zh_a_hist_tx", stock_zh_a_hist_tx):
            kind, rows, upstream_id = main._fetch(request)
        self.assertEqual(kind, "bars")
        self.assertEqual(upstream_id, "tencent")
        self.assertEqual(rows[0]["timestamp"], "2026-07-24T15:00:00+08:00")
        self.assertEqual(rows[0]["volume"], 100.0)
        self.assertEqual(
            calls,
            [
                {
                    "symbol": "sh600000",
                    "start_date": "20260720",
                    "end_date": "20260724",
                    "adjust": "qfq",
                }
            ],
        )

    def test_daily_filters_rows_outside_the_requested_instant_range(self):
        request = main._parse_request(
            json.dumps(
                {
                    "protocol": main.PROTOCOL,
                    "requestId": "daily-boundary",
                    "operation": "stock_zh_a_hist",
                    "params": {
                        "symbol": "000001",
                        "timeframe": "1d",
                        "startAt": "2024-01-01T00:00:00.000Z",
                        "endAt": "2024-01-10T23:59:59.999Z",
                        "adjustment": "none",
                    },
                }
            ).encode("utf-8")
        )

        def stock_zh_a_hist(**_kwargs):
            return FakeFrame(
                [
                    {
                        "日期": "2024-01-10",
                        "开盘": 10,
                        "最高": 12,
                        "最低": 9,
                        "收盘": 11,
                        "成交量": 100,
                    },
                    {
                        "日期": "2024-01-11",
                        "开盘": 11,
                        "最高": 13,
                        "最低": 10,
                        "收盘": 12,
                        "成交量": 120,
                    },
                ]
            )

        with patch.object(
            main,
            "ak",
            SimpleNamespace(stock_zh_a_hist=stock_zh_a_hist),
        ):
            kind, rows, upstream_id = main._fetch(request)

        self.assertEqual(kind, "bars")
        self.assertEqual(upstream_id, "eastmoney")
        self.assertEqual(
            rows,
            [
                {
                    "timestamp": "2024-01-10T15:00:00+08:00",
                    "open": 10.0,
                    "high": 12.0,
                    "low": 9.0,
                    "close": 11.0,
                    "volume": 100.0,
                }
            ],
        )

    def test_empty_requested_bar_ranges_are_reported_as_no_data(self):
        cases = (
            ("stock_zh_a_hist", "daily-no-data"),
            ("stock_zh_a_hist_min_em", "minute-no-data"),
        )
        for operation, request_id in cases:
            with self.subTest(operation=operation):
                request = main._parse_request(
                    json.dumps(
                        {
                            "protocol": main.PROTOCOL,
                            "requestId": request_id,
                            "operation": operation,
                            "params": {
                                "symbol": "000001",
                                "timeframe": "1d" if operation == "stock_zh_a_hist" else "1h",
                                "startAt": "2026-07-24T00:00:00+08:00",
                                "endAt": "2026-07-24T23:59:59+08:00",
                                "adjustment": "none",
                            },
                        }
                    ).encode("utf-8")
                )
                fetch_name = (
                    "_fetch_a_share_daily"
                    if operation == "stock_zh_a_hist"
                    else "_fetch_a_share_minute"
                )
                with patch.object(main, fetch_name, return_value=([], "eastmoney")):
                    with self.assertRaises(main.WorkerError) as context:
                        main._fetch(request)
                self.assertEqual(context.exception.code, "AKSHARE_NO_DATA")

    def test_empty_requested_index_range_is_reported_as_no_data(self):
        request = main._parse_request(
            json.dumps(
                {
                    "protocol": main.PROTOCOL,
                    "requestId": "index-no-data",
                    "operation": "index_zh_a_hist",
                    "params": {
                        "symbol": "000001",
                        "timeframe": "1d",
                        "startAt": "2026-07-24T00:00:00+08:00",
                        "endAt": "2026-07-24T23:59:59+08:00",
                        "adjustment": "none",
                    },
                }
            ).encode("utf-8")
        )
        with patch.object(main, "_fetch_a_share_index", return_value=([], "eastmoney")):
            with self.assertRaises(main.WorkerError) as context:
                main._fetch(request)
        self.assertEqual(context.exception.code, "AKSHARE_NO_DATA")

    def test_minute_uses_sina_and_filters_the_requested_range_when_eastmoney_disconnects(
        self,
    ):
        request = main._parse_request(
            json.dumps(
                {
                    "protocol": main.PROTOCOL,
                    "requestId": "minute-fallback",
                    "operation": "stock_zh_a_hist_min_em",
                    "params": {
                        "symbol": "000001",
                        "timeframe": "1h",
                        "startAt": "2026-07-24T09:00:00+08:00",
                        "endAt": "2026-07-24T15:00:00+08:00",
                        "adjustment": "none",
                    },
                }
            ).encode("utf-8")
        )
        calls = []

        def stock_zh_a_hist_min_em(**kwargs):
            raise main.requests.exceptions.ConnectionError("connection reset")

        def stock_zh_a_minute(**kwargs):
            calls.append(kwargs)
            return FakeFrame(
                [
                    {
                        "day": "2026-07-23 15:00:00",
                        "open": 10,
                        "high": 12,
                        "low": 9,
                        "close": 11,
                        "volume": 100,
                    },
                    {
                        "day": "2026-07-24 10:00:00",
                        "open": 20,
                        "high": 22,
                        "low": 19,
                        "close": 21,
                        "volume": 200,
                    },
                ]
            )

        with patch.object(
            main,
            "ak",
            SimpleNamespace(
                stock_zh_a_hist_min_em=stock_zh_a_hist_min_em,
            ),
        ), patch.object(main, "stock_zh_a_minute", stock_zh_a_minute):
            kind, rows, upstream_id = main._fetch(request)
        self.assertEqual(kind, "bars")
        self.assertEqual(upstream_id, "sina")
        self.assertEqual(
            rows,
            [
                {
                    "timestamp": "2026-07-24T10:00:00+08:00",
                    "open": 20.0,
                    "high": 22.0,
                    "low": 19.0,
                    "close": 21.0,
                    "volume": 200.0,
                }
            ],
        )
        self.assertEqual(
            calls,
            [{"symbol": "sz000001", "period": "60", "adjust": ""}],
        )

    def test_adjusted_minute_fallback_applies_the_effective_sina_factor(self):
        for adjustment, factor_column, factor, expected_open in (
            ("qfq", "qfq_factor", 1.25, 16.0),
            ("hfq", "hfq_factor", 3.0, 60.0),
        ):
            with self.subTest(adjustment=adjustment):
                request = main._parse_request(
                    json.dumps(
                        {
                            "protocol": main.PROTOCOL,
                            "requestId": f"minute-{adjustment}",
                            "operation": "stock_zh_a_hist_min_em",
                            "params": {
                                "symbol": "000001",
                                "timeframe": "5m",
                                "startAt": "2026-07-24T09:00:00+08:00",
                                "endAt": "2026-07-24T15:00:00+08:00",
                                "adjustment": adjustment,
                            },
                        }
                    ).encode("utf-8")
                )
                calls = []

                def stock_zh_a_hist_min_em(**_kwargs):
                    raise main.requests.exceptions.ConnectionError("connection reset")

                def stock_zh_a_minute(**kwargs):
                    calls.append(kwargs)
                    return FakeFrame(
                        [
                            {
                                "day": "2026-07-24 10:00:00",
                                "open": 20,
                                "high": 22,
                                "low": 19,
                                "close": 21,
                                "volume": 200,
                            }
                        ]
                    )

                def stock_zh_a_daily(**kwargs):
                    calls.append(kwargs)
                    return FakeFrame(
                        [
                            {"date": "1900-01-01", factor_column: factor + 1},
                            {"date": "2026-07-16", factor_column: factor},
                        ]
                    )

                with patch.object(
                    main,
                    "ak",
                    SimpleNamespace(stock_zh_a_hist_min_em=stock_zh_a_hist_min_em),
                ), patch.object(
                    main, "stock_zh_a_minute", stock_zh_a_minute
                ), patch.object(main, "stock_zh_a_daily", stock_zh_a_daily):
                    kind, rows, upstream_id = main._fetch(request)
                self.assertEqual(kind, "bars")
                self.assertEqual(upstream_id, "sina")
                self.assertEqual(rows[0]["open"], expected_open)
                self.assertEqual(rows[0]["volume"], 200.0)
                self.assertEqual(
                    calls,
                    [
                        {"symbol": "sz000001", "period": "5", "adjust": ""},
                        {
                            "symbol": "sz000001",
                            "adjust": f"{adjustment}-factor",
                        },
                    ],
                )

    def test_daily_uses_sina_for_a_beijing_exchange_symbol_when_eastmoney_disconnects(
        self,
    ):
        request = main._parse_request(
            json.dumps(
                {
                    "protocol": main.PROTOCOL,
                    "requestId": "beijing-daily-fallback",
                    "operation": "stock_zh_a_hist",
                    "params": {
                        "symbol": "920000",
                        "timeframe": "1d",
                        "startAt": "2026-07-20T00:00:00+08:00",
                        "endAt": "2026-07-24T23:59:59+08:00",
                        "adjustment": "none",
                    },
                }
            ).encode("utf-8")
        )
        calls = []

        def stock_zh_a_hist(**kwargs):
            raise main.requests.exceptions.ConnectionError("connection reset")

        def stock_zh_a_daily(**kwargs):
            calls.append(kwargs)
            return FakeFrame(
                [
                    {
                        "date": "2026-07-24",
                        "open": 10,
                        "high": 12,
                        "low": 9,
                        "close": 11,
                        "volume": 100,
                    }
                ]
            )

        with patch.object(
            main,
            "ak",
            SimpleNamespace(
                stock_zh_a_hist=stock_zh_a_hist,
            ),
        ), patch.object(main, "stock_zh_a_daily", stock_zh_a_daily):
            kind, rows, upstream_id = main._fetch(request)
        self.assertEqual(kind, "bars")
        self.assertEqual(upstream_id, "sina")
        self.assertEqual(rows[0]["timestamp"], "2026-07-24T15:00:00+08:00")
        self.assertEqual(
            calls,
            [
                {
                    "symbol": "bj920000",
                    "start_date": "20260720",
                    "end_date": "20260724",
                    "adjust": "",
                }
            ],
        )

    def test_retryable_status_is_bounded_to_429_and_5xx(self):
        retryable = RuntimeError()
        retryable.status_code = 429
        response_retryable = RuntimeError()
        response_retryable.response = type("Response", (), {"status_code": 503})()
        permanent = RuntimeError()
        permanent.status_code = 403
        self.assertEqual(main._retryable_status_code(retryable), 429)
        self.assertEqual(main._retryable_status_code(response_retryable), 503)
        self.assertIsNone(main._retryable_status_code(permanent))

    def test_connection_errors_are_retryable_transport_failures(self):
        self.assertTrue(
            main._is_retryable_transport_error(
                main.requests.exceptions.ConnectionError("connection reset")
            )
        )
        self.assertFalse(main._is_retryable_transport_error(RuntimeError()))


if __name__ == "__main__":
    unittest.main()
