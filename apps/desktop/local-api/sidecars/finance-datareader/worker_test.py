# SPDX-License-Identifier: GPL-3.0-only

import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

import main
import requests


class FakeFrame:
    def __init__(self, rows):
        self._rows = rows
        self.columns = list(rows[0][1]) if rows else []
        self.index = [index for index, _ in rows]

    def iterrows(self):
        yield from self._rows


class FinanceDataReaderWorkerTest(unittest.TestCase):
    def test_protocol_emission_is_ascii_and_round_trips_non_ascii_names(self):
        output = io.BytesIO()
        payload = {
            "protocol": main.PROTOCOL,
            "requestId": "catalog-encoding",
            "ok": True,
            "rows": [{"symbol": "005930", "name": "삼성전자"}],
        }
        with patch.object(main.sys, "stdout", type("Stdout", (), {"buffer": output})()):
            main._emit(payload)
        encoded = output.getvalue()
        self.assertEqual(encoded.decode("ascii"), encoded.decode("utf-8"))
        self.assertEqual(json.loads(encoded)["rows"][0]["name"], "삼성전자")

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

    def test_rejects_fred_and_ecos_before_reader_dispatch(self):
        for symbol in ("FRED:DFF", "ECOS:722Y001"):
            with self.assertRaises(main.WorkerError) as context:
                main._parse_request(
                    json.dumps(
                        {
                            "protocol": main.PROTOCOL,
                            "requestId": "blocked-source",
                            "operation": "bars",
                            "params": {
                                "marketId": "FOREX",
                                "symbol": symbol,
                                "timeframe": "1d",
                                "startAt": "2026-01-01T00:00:00Z",
                                "endAt": "2026-01-02T23:59:59Z",
                            },
                        }
                    ).encode("utf-8")
                )
            self.assertEqual(
                context.exception.code,
                "FINANCEDATAREADER_SIDECAR_OPERATION_FORBIDDEN",
            )

    def test_rejection_preserves_a_valid_request_correlation_id(self):
        response = main._handle_request_line(
            json.dumps(
                {
                    "protocol": main.PROTOCOL,
                    "requestId": "blocked-source",
                    "operation": "bars",
                    "params": {
                        "marketId": "FOREX",
                        "symbol": "FRED:DFF",
                        "timeframe": "1d",
                        "startAt": "2026-01-01T00:00:00Z",
                        "endAt": "2026-01-02T23:59:59Z",
                    },
                }
            ).encode("utf-8")
        )
        self.assertEqual(response["requestId"], "blocked-source")
        self.assertEqual(
            response["error"]["code"],
            "FINANCEDATAREADER_SIDECAR_OPERATION_FORBIDDEN",
        )

    def test_complete_ohlcv_rows_are_normalized_in_market_zone(self):
        frame = FakeFrame(
            [
                (
                    "2026-01-02",
                    {
                        "Open": 10,
                        "High": 12,
                        "Low": 9,
                        "Close": 11,
                        "Volume": 100,
                    },
                )
            ]
        )
        rows = main._canonical_rows(frame, "KR_STOCKS")
        self.assertEqual(rows[0]["timestamp"], "2026-01-02T16:00:00+09:00")
        self.assertEqual(rows[0]["close"], 11.0)

    def test_partial_or_single_value_series_is_rejected(self):
        frame = FakeFrame(
            [
                (
                    "2026-01-02",
                    {"Close": 11},
                )
            ]
        )
        with self.assertRaises(main.WorkerError) as context:
            main._canonical_rows(frame, "US_STOCKS")
        self.assertEqual(context.exception.code, "FINANCEDATAREADER_OHLCV_UNAVAILABLE")

    def test_a_share_reader_uses_the_explicit_fdr_exchange_route(self):
        with patch.object(main.fdr, "DataReader", return_value=FakeFrame(
            [
                (
                    "2026-01-02",
                    {
                        "Open": 10,
                        "High": 12,
                        "Low": 9,
                        "Close": 11,
                        "Volume": 100,
                    },
                )
            ]
        )) as reader:
            rows, upstream = main._read_bars(
                {
                    "marketId": "CN_A_SHARE",
                    "symbol": "600000",
                    "startAt": "2026-01-01T00:00:00+08:00",
                    "endAt": "2026-01-03T23:59:59+08:00",
                }
            )
        self.assertEqual(rows[0]["timestamp"], "2026-01-02T16:00:00+08:00")
        self.assertEqual(upstream, "yahoo-finance")
        self.assertEqual(reader.call_args.args[0], "SSE:600000")

    def test_every_allowed_price_market_keeps_complete_ohlcv_and_its_zone(self):
        cases = {
            "CN_A_SHARE": ("600000", "SSE:600000", "+08:00"),
            "HK_STOCKS": ("700", "HKEX:0700", "+08:00"),
            "KR_STOCKS": ("005930", "NAVER:005930", "+09:00"),
            "US_STOCKS": ("AAPL", "YAHOO:AAPL", "-05:00"),
            "JP_STOCKS": ("7203", "TSE:7203", "+09:00"),
            "VN_STOCKS": ("VNM", "HOSE:VNM", "+07:00"),
            "GLOBAL_INDICES": ("^GSPC", "YAHOO:^GSPC", "+00:00"),
            "FOREX": ("USD/KRW", "YAHOO:USD/KRW", "+00:00"),
            "COMMODITY_FUTURES": ("GC=F", "YAHOO:GC=F", "-05:00"),
            "RATE_FUTURES": ("ZN=F", "YAHOO:ZN=F", "-05:00"),
            "CRYPTO_SPOT": ("BTC/USD", "YAHOO:BTC/USD", "+00:00"),
        }
        frame = FakeFrame(
            [
                (
                    "2026-01-02",
                    {
                        "Open": 10,
                        "High": 12,
                        "Low": 9,
                        "Close": 11,
                        "Volume": 100,
                    },
                )
            ]
        )
        for market_id, (symbol, reader_symbol, zone_suffix) in cases.items():
            with self.subTest(market_id=market_id), patch.object(
                main.fdr, "DataReader", return_value=frame
            ) as reader:
                rows, upstream = main._read_bars(
                    {
                        "marketId": market_id,
                        "symbol": symbol,
                        "startAt": "2026-01-01T00:00:00Z",
                        "endAt": "2026-01-03T23:59:59Z",
                    }
                )
            self.assertEqual(reader.call_args.args[0], reader_symbol)
            self.assertEqual(upstream, main.MARKET_UPSTREAMS[market_id])
            self.assertTrue(rows[0]["timestamp"].endswith(zone_suffix))
            self.assertEqual(
                set(rows[0]),
                {"timestamp", "open", "high", "low", "close", "volume"},
            )

    def test_a_share_reader_preserves_the_shenzhen_exchange_for_daily_fallbacks(self):
        self.assertEqual(
            main._reader_request("CN_A_SHARE", "000001"),
            ("SZSE:000001", "yahoo-finance"),
        )
        self.assertEqual(
            main._reader_request("CN_A_SHARE", "300750"),
            ("SZSE:300750", "yahoo-finance"),
        )
        self.assertEqual(
            main._reader_request("CN_A_SHARE", "600000"),
            ("SSE:600000", "yahoo-finance"),
        )
        self.assertEqual(
            main._reader_request("GLOBAL_INDICES", "KS11"),
            ("KS11", "krx-index-cache"),
        )

    def test_yahoo_boundary_rows_outside_the_requested_range_are_not_staged(self):
        frame = FakeFrame(
            [
                (
                    "2023-12-31",
                    {"Open": 10, "High": 12, "Low": 9, "Close": 11, "Volume": 100},
                ),
                (
                    "2024-01-01",
                    {"Open": 11, "High": 13, "Low": 10, "Close": 12, "Volume": 110},
                ),
                (
                    "2024-01-02",
                    {"Open": 12, "High": 14, "Low": 11, "Close": 13, "Volume": 120},
                ),
            ]
        )
        rows = main._canonical_rows(
            frame,
            "CRYPTO_SPOT",
            main._parse_datetime("2024-01-01T00:00:00Z"),
            main._parse_datetime("2024-01-02T23:59:59Z"),
        )
        self.assertEqual(
            [row["timestamp"] for row in rows],
            ["2024-01-01T16:00:00+00:00", "2024-01-02T16:00:00+00:00"],
        )

    def test_upstream_stdout_cannot_corrupt_the_ndjson_response(self):
        request = json.dumps(
            {
                "protocol": main.PROTOCOL,
                "requestId": "noisy-empty-symbol",
                "operation": "bars",
                "params": {
                    "marketId": "CN_A_SHARE",
                    "symbol": "000001",
                    "timeframe": "1d",
                    "startAt": "2026-01-01T00:00:00+08:00",
                    "endAt": "2026-01-02T23:59:59+08:00",
                },
            }
        ).encode("utf-8")

        def noisy_empty_reader(*_args, **_kwargs):
            print('"000001.SZ" invalid symbol or has no data')
            return FakeFrame([])

        protocol_stdout = io.StringIO()
        diagnostic_stderr = io.StringIO()
        with patch.object(main.fdr, "DataReader", side_effect=noisy_empty_reader), redirect_stdout(
            protocol_stdout
        ), redirect_stderr(diagnostic_stderr):
            response = main._handle_request_line(request)
        self.assertEqual(protocol_stdout.getvalue(), "")
        self.assertIn("invalid symbol", diagnostic_stderr.getvalue())
        self.assertFalse(response["ok"])
        self.assertEqual(
            response["error"]["code"],
            "FINANCEDATAREADER_SYMBOL_UNAVAILABLE",
        )

    def test_retries_transient_upstream_errors_before_returning_a_failure(self):
        frame = FakeFrame(
            [
                (
                    "2026-01-02",
                    {"Open": 10, "High": 12, "Low": 9, "Close": 11, "Volume": 100},
                )
            ]
        )
        with patch.object(
            main.fdr,
            "DataReader",
            side_effect=[requests.exceptions.ConnectionError("temporary"), frame],
        ) as reader, patch.object(main.clock, "sleep") as sleep:
            rows, upstream = main._read_bars(
                {
                    "marketId": "JP_STOCKS",
                    "symbol": "7203",
                    "startAt": "2026-01-01T00:00:00+09:00",
                    "endAt": "2026-01-03T23:59:59+09:00",
                }
            )
        self.assertEqual(reader.call_count, 2)
        sleep.assert_called_once_with(main.UPSTREAM_RETRY_DELAY_SECONDS)
        self.assertEqual(upstream, "yahoo-finance")
        self.assertEqual(len(rows), 1)

    def test_missing_symbol_is_classified_without_a_protocol_or_schema_error(self):
        response = requests.Response()
        response.status_code = 404
        with patch.object(
            main.fdr,
            "DataReader",
            side_effect=requests.exceptions.HTTPError(response=response),
        ):
            with self.assertRaises(main.WorkerError) as context:
                main._read_bars(
                    {
                        "marketId": "US_STOCKS",
                        "symbol": "NO-SUCH-SYMBOL",
                        "startAt": "2026-01-01T00:00:00-05:00",
                        "endAt": "2026-01-03T23:59:59-05:00",
                    }
                )
        self.assertEqual(
            context.exception.code,
            "FINANCEDATAREADER_SYMBOL_UNAVAILABLE",
        )
        self.assertEqual(context.exception.args_payload["statusCode"], 404)

    def test_each_listing_market_is_discoverable_from_its_declared_listing_source(self):
        frame = FakeFrame([("row", {"Symbol": "TEST", "Name": "Test instrument"})])
        for market_id, listing_sources in main.LISTING_SOURCES.items():
            with self.subTest(market_id=market_id), patch.object(
                main.fdr, "StockListing", return_value=frame
            ) as listing:
                rows, upstream = main._read_instruments(
                    {"marketId": market_id, "query": ""}
                )
            self.assertEqual(
                [call.args[0] for call in listing.call_args_list], list(listing_sources)
            )
            self.assertEqual(
                upstream, "+".join(source.lower() for source in listing_sources)
            )
            self.assertEqual(
                rows,
                [{
                    "symbol": "TEST",
                    "name": "Test instrument",
                    "exchangeId": listing_sources[0],
                }],
            )

    def test_us_listing_combines_supported_exchanges_without_a_second_user_choice(self):
        frames = [
            FakeFrame([("row", {"Symbol": "AAPL", "Name": "Apple Inc."})]),
            FakeFrame([("row", {"Symbol": "IBM", "Name": "IBM"})]),
            FakeFrame([("row", {"Symbol": "SPY", "Name": "SPDR S&P 500 ETF"})]),
        ]
        with patch.object(main.fdr, "StockListing", side_effect=frames) as listing:
            rows, upstream = main._read_instruments(
                {"marketId": "US_STOCKS", "query": ""}
            )
        self.assertEqual(
            [call.args[0] for call in listing.call_args_list],
            ["NASDAQ", "NYSE", "AMEX"],
        )
        self.assertEqual(upstream, "nasdaq+nyse+amex")
        self.assertEqual(
            rows,
            [
                {"symbol": "AAPL", "name": "Apple Inc.", "exchangeId": "NASDAQ"},
                {"symbol": "IBM", "name": "IBM", "exchangeId": "NYSE"},
                {
                    "symbol": "SPY",
                    "name": "SPDR S&P 500 ETF",
                    "exchangeId": "AMEX",
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
