// SPDX-License-Identifier: GPL-3.0-only

use super::*;
use std::{collections::HashMap, fs, path::Path};

use duckdb::{params, Connection};
use serde_json::Value;

fn basic_request() -> EngineRequest {
    serde_json::from_str(include_str!("../fixtures/next_open_basic.request.json")).unwrap()
}

fn reversal_request(signals: Vec<BacktestSignal>) -> EngineRequest {
    let mut request = basic_request();
    request.config.initial_capital = 1000.0;
    request.config.order_sizing = OrderSizing {
        mode: OrderSizingMode::FixedQty,
        value: Some(10.0),
    };
    request.config.trading_settings.allow_short_selling = true;
    request.config.trading_settings.allow_long_margin_trading = false;
    request.config.trading_settings.min_trade_step = 1.0;
    request.config.trading_settings.contract_multiplier = 1.0;
    request.bars = vec![
        OhlcvBar {
            ts: "2026-01-01T09:30:00.000Z".to_string(),
            open: 10.0,
            high: 11.0,
            low: 9.0,
            close: 10.0,
            volume: 1000.0,
        },
        OhlcvBar {
            ts: "2026-01-02T09:30:00.000Z".to_string(),
            open: 11.0,
            high: 13.0,
            low: 10.0,
            close: 12.0,
            volume: 1000.0,
        },
        OhlcvBar {
            ts: "2026-01-03T09:30:00.000Z".to_string(),
            open: 13.0,
            high: 15.0,
            low: 12.0,
            close: 14.0,
            volume: 1000.0,
        },
        OhlcvBar {
            ts: "2026-01-04T09:30:00.000Z".to_string(),
            open: 15.0,
            high: 17.0,
            low: 14.0,
            close: 16.0,
            volume: 1000.0,
        },
    ];
    request.instrument.bar_count = request.bars.len();
    request.signals = signals;
    request.price_mode = PriceMode::NextOpen;
    request
}

fn current_close_request(bars: Vec<OhlcvBar>, signals: Vec<BacktestSignal>) -> EngineRequest {
    let mut request = reversal_request(signals);
    request.bars = bars;
    request.instrument.bar_count = request.bars.len();
    request.price_mode = PriceMode::CurClose;
    request
}

fn assert_metric_json_close(actual: &Value, expected: &Value, path: &str) {
    match expected {
        Value::Number(expected_number) => {
            let actual_value = actual
                .as_f64()
                .unwrap_or_else(|| panic!("{path} must be a number"));
            let expected_value = expected_number
                .as_f64()
                .unwrap_or_else(|| panic!("{path} expected number must be finite"));
            assert!(
                (actual_value - expected_value).abs() <= 1e-9,
                "{path}: expected {actual_value} to be close to {expected_value}"
            );
        }
        Value::Array(expected_items) => {
            let actual_items = actual
                .as_array()
                .unwrap_or_else(|| panic!("{path} must be an array"));
            assert_eq!(actual_items.len(), expected_items.len(), "{path} length");
            for (index, expected_item) in expected_items.iter().enumerate() {
                assert_metric_json_close(
                    &actual_items[index],
                    expected_item,
                    &format!("{path}[{index}]"),
                );
            }
        }
        Value::Object(expected_object) => {
            let actual_object = actual
                .as_object()
                .unwrap_or_else(|| panic!("{path} must be an object"));
            let mut actual_keys = actual_object.keys().collect::<Vec<_>>();
            let mut expected_keys = expected_object.keys().collect::<Vec<_>>();
            actual_keys.sort();
            expected_keys.sort();
            assert_eq!(actual_keys, expected_keys, "{path} keys");
            for (key, expected_value) in expected_object {
                assert_metric_json_close(
                    actual_object.get(key).unwrap_or(&Value::Null),
                    expected_value,
                    &format!("{path}.{key}"),
                );
            }
        }
        _ => assert_eq!(actual, expected, "{path}"),
    }
}

#[test]
fn fills_next_open_and_matches_fixture_summary() {
    let response = run_engine(basic_request());
    assert_eq!(response.fills.len(), 2);
    assert_eq!(response.result.final_equity, 1040.0);
    assert_eq!(response.result.total_pnl, 40.0);
    assert_eq!(response.result.max_drawdown, 0.0);
    assert_eq!(
        response
            .equity_curve
            .iter()
            .map(|point| point.equity)
            .collect::<Vec<_>>(),
        vec![1000.0, 1010.0, 1030.0, 1040.0]
    );
}

#[test]
fn direction_signal_reverses_long_with_one_short_fill() {
    let response = run_engine(reversal_request(vec![
        BacktestSignal {
            bar_index: 0,
            buy: true,
            sell: false,
            short: false,
            cover: false,
        },
        BacktestSignal {
            bar_index: 1,
            buy: false,
            sell: false,
            short: true,
            cover: false,
        },
    ]));

    assert_eq!(response.fills.len(), 2);
    assert_eq!(response.fills[0].side, Side::Buy);
    assert_eq!(response.fills[1].side, Side::Sell);
    assert_eq!(response.fills[1].fill_index, 2);
    assert_eq!(response.fills[1].fill_time, "2026-01-03T09:30:00.000Z");
    assert!((response.fills[1].price - 13.0).abs() <= EPSILON);
    assert!((response.fills[1].qty - 20.0).abs() <= EPSILON);
    assert!((response.result.summary.realized_pnl - 20.0).abs() <= EPSILON);
    assert_eq!(response.result.summary.closed_trades, 1);
    assert_eq!(response.result.summary.winning_trades, 1);
    assert!((response.result.summary.ending_position_qty + 10.0).abs() <= EPSILON);
    assert!((response.result.summary.ending_avg_cost - 13.0).abs() <= EPSILON);
}

#[test]
fn direction_signal_reverses_short_with_one_buy_fill() {
    let response = run_engine(reversal_request(vec![
        BacktestSignal {
            bar_index: 0,
            buy: false,
            sell: false,
            short: true,
            cover: false,
        },
        BacktestSignal {
            bar_index: 1,
            buy: true,
            sell: false,
            short: false,
            cover: false,
        },
    ]));

    assert_eq!(response.fills.len(), 2);
    assert_eq!(response.fills[0].side, Side::Sell);
    assert_eq!(response.fills[1].side, Side::Buy);
    assert_eq!(response.fills[1].fill_index, 2);
    assert_eq!(response.fills[1].fill_time, "2026-01-03T09:30:00.000Z");
    assert!((response.fills[1].price - 13.0).abs() <= EPSILON);
    assert!((response.fills[1].qty - 20.0).abs() <= EPSILON);
    assert!((response.result.summary.realized_pnl + 20.0).abs() <= EPSILON);
    assert_eq!(response.result.summary.closed_trades, 1);
    assert_eq!(response.result.summary.winning_trades, 0);
    assert!((response.result.summary.ending_position_qty - 10.0).abs() <= EPSILON);
    assert!((response.result.summary.ending_avg_cost - 13.0).abs() <= EPSILON);
}

#[test]
fn realized_pnl_includes_entry_exit_and_reversal_costs_once() {
    let mut request = reversal_request(vec![
        BacktestSignal {
            bar_index: 0,
            buy: true,
            sell: false,
            short: false,
            cover: false,
        },
        BacktestSignal {
            bar_index: 1,
            buy: false,
            sell: false,
            short: true,
            cover: false,
        },
        BacktestSignal {
            bar_index: 2,
            buy: true,
            sell: false,
            short: false,
            cover: false,
        },
    ]);
    request.config.trading_settings.commission_minimum_fee = 5.0;

    let response = run_engine(request);

    assert_eq!(
        response
            .fills
            .iter()
            .map(|fill| (fill.side, fill.qty, fill.fee))
            .collect::<Vec<_>>(),
        vec![
            (Side::Buy, 10.0, 5.0),
            (Side::Sell, 20.0, 5.0),
            (Side::Buy, 20.0, 5.0),
        ]
    );
    assert!((response.result.summary.realized_pnl + 12.5).abs() <= EPSILON);
    assert_eq!(response.result.summary.closed_trades, 2);
    assert_eq!(response.result.summary.winning_trades, 1);
    assert!((response.result.summary.ending_position_qty - 10.0).abs() <= EPSILON);
    assert!((response.result.summary.ending_avg_cost - 15.0).abs() <= EPSILON);
}

#[test]
fn sell_and_cover_are_close_only_without_matching_positions() {
    let response = run_engine(current_close_request(
        reversal_request(Vec::new()).bars,
        vec![
            BacktestSignal {
                bar_index: 0,
                buy: false,
                sell: true,
                short: false,
                cover: false,
            },
            BacktestSignal {
                bar_index: 1,
                buy: false,
                sell: false,
                short: false,
                cover: true,
            },
        ],
    ));

    assert!(response.fills.is_empty());
    assert_eq!(
        response
            .conflicts
            .iter()
            .map(|conflict| (conflict.bar_index, conflict.code.as_str()))
            .collect::<Vec<_>>(),
        vec![(0, "NO_POSITION"), (1, "NO_POSITION")]
    );
}

#[test]
fn cash_only_buy_rejects_fixed_qty_and_fee_caps_derived_sizing() {
    for mode in [
        OrderSizingMode::FixedQty,
        OrderSizingMode::FixedAmount,
        OrderSizingMode::AllIn,
    ] {
        let mut request = current_close_request(
            vec![OhlcvBar {
                ts: "2026-01-01T09:30:00.000Z".to_string(),
                open: 100.0,
                high: 100.0,
                low: 100.0,
                close: 100.0,
                volume: 1000.0,
            }],
            vec![BacktestSignal {
                bar_index: 0,
                buy: true,
                sell: false,
                short: false,
                cover: false,
            }],
        );
        request.config.order_sizing = OrderSizing {
            mode: mode.clone(),
            value: match &mode {
                OrderSizingMode::FixedQty => Some(10.0),
                OrderSizingMode::FixedAmount => Some(1000.0),
                _ => None,
            },
        };
        request.config.trading_settings.commission_minimum_fee = 5.0;
        request.config.trading_settings.trade_amount_includes_fees = false;

        let response = run_engine(request);

        if mode == OrderSizingMode::FixedQty {
            assert!(response.fills.is_empty());
            assert_eq!(response.conflicts.len(), 1);
            assert_eq!(response.conflicts[0].code, "INSUFFICIENT_CASH");
            continue;
        }

        assert_eq!(response.fills.len(), 1, "{mode:?}");
        assert!((response.fills[0].qty - 9.0).abs() <= EPSILON);
        assert!((response.fills[0].fee - 5.0).abs() <= EPSILON);
        let ending_cash =
            response.result.final_equity - response.result.summary.ending_position_qty * 100.0;
        assert!(ending_cash >= -EPSILON, "{mode:?} cash={ending_cash}");
        assert!((ending_cash - 95.0).abs() <= EPSILON);
    }
}

#[test]
fn buy_reversal_uses_post_cover_cash_and_always_closes_the_short() {
    let mut request = current_close_request(
        vec![
            OhlcvBar {
                ts: "2026-01-01T09:30:00.000Z".to_string(),
                open: 10.0,
                high: 10.0,
                low: 10.0,
                close: 10.0,
                volume: 1000.0,
            },
            OhlcvBar {
                ts: "2026-01-02T09:30:00.000Z".to_string(),
                open: 20.0,
                high: 20.0,
                low: 20.0,
                close: 20.0,
                volume: 1000.0,
            },
        ],
        vec![
            BacktestSignal {
                bar_index: 0,
                buy: false,
                sell: false,
                short: true,
                cover: false,
            },
            BacktestSignal {
                bar_index: 1,
                buy: true,
                sell: false,
                short: false,
                cover: false,
            },
        ],
    );
    request.config.order_sizing = OrderSizing {
        mode: OrderSizingMode::AllIn,
        value: None,
    };

    let response = run_engine(request);

    assert_eq!(
        response
            .fills
            .iter()
            .map(|fill| (fill.side, fill.qty))
            .collect::<Vec<_>>(),
        vec![(Side::Sell, 100.0), (Side::Buy, 100.0)]
    );
    assert!(response.result.summary.ending_position_qty.abs() <= EPSILON);
    assert!(response.result.final_equity.abs() <= EPSILON);
}

#[test]
fn cover_and_buy_reversal_fully_close_an_insolvent_short() {
    for buy_reversal in [false, true] {
        let mut request = current_close_request(
            vec![
                OhlcvBar {
                    ts: "2026-01-01T09:30:00.000Z".to_string(),
                    open: 10.0,
                    high: 10.0,
                    low: 10.0,
                    close: 10.0,
                    volume: 1000.0,
                },
                OhlcvBar {
                    ts: "2026-01-02T09:30:00.000Z".to_string(),
                    open: 30.0,
                    high: 30.0,
                    low: 30.0,
                    close: 30.0,
                    volume: 1000.0,
                },
            ],
            vec![
                BacktestSignal {
                    bar_index: 0,
                    buy: false,
                    sell: false,
                    short: true,
                    cover: false,
                },
                BacktestSignal {
                    bar_index: 1,
                    buy: buy_reversal,
                    sell: false,
                    short: false,
                    cover: !buy_reversal,
                },
            ],
        );
        request.config.order_sizing = OrderSizing {
            mode: OrderSizingMode::FixedQty,
            value: Some(100.0),
        };

        let response = run_engine(request);

        assert!((response.fills[1].qty - 100.0).abs() <= EPSILON);
        assert!(response.result.summary.ending_position_qty.abs() <= EPSILON);
        assert!((response.result.final_equity + 1000.0).abs() <= EPSILON);
    }
}

#[test]
fn short_reversal_uses_post_close_equity() {
    let mut request = current_close_request(
        vec![
            OhlcvBar {
                ts: "2026-01-01T09:30:00.000Z".to_string(),
                open: 10.0,
                high: 10.0,
                low: 10.0,
                close: 10.0,
                volume: 1000.0,
            },
            OhlcvBar {
                ts: "2026-01-02T09:30:00.000Z".to_string(),
                open: 10.0,
                high: 10.0,
                low: 10.0,
                close: 10.0,
                volume: 1000.0,
            },
        ],
        vec![
            BacktestSignal {
                bar_index: 0,
                buy: true,
                sell: false,
                short: false,
                cover: false,
            },
            BacktestSignal {
                bar_index: 1,
                buy: false,
                sell: false,
                short: true,
                cover: false,
            },
        ],
    );
    request.config.order_sizing = OrderSizing {
        mode: OrderSizingMode::AllIn,
        value: None,
    };
    request.config.trading_settings.commission_rate = 10.0;

    let response = run_engine(request);

    assert_eq!(
        response
            .fills
            .iter()
            .map(|fill| (fill.side, fill.qty))
            .collect::<Vec<_>>(),
        vec![(Side::Buy, 90.0), (Side::Sell, 172.0)]
    );
    assert!((response.result.summary.ending_position_qty + 82.0).abs() <= EPSILON);
}

#[test]
fn mark_to_market_totals_include_open_position_but_trade_stats_do_not() {
    let response = run_engine(current_close_request(
        vec![
            OhlcvBar {
                ts: "2026-01-01T09:30:00.000Z".to_string(),
                open: 10.0,
                high: 10.0,
                low: 10.0,
                close: 10.0,
                volume: 1000.0,
            },
            OhlcvBar {
                ts: "2026-01-02T09:30:00.000Z".to_string(),
                open: 15.0,
                high: 15.0,
                low: 15.0,
                close: 15.0,
                volume: 1000.0,
            },
        ],
        vec![BacktestSignal {
            bar_index: 0,
            buy: true,
            sell: false,
            short: false,
            cover: false,
        }],
    ));

    assert!((response.result.final_equity - 1050.0).abs() <= EPSILON);
    assert!((response.result.total_pnl - 50.0).abs() <= EPSILON);
    assert!(response.result.summary.realized_pnl.abs() <= EPSILON);
    assert_eq!(response.result.summary.closed_trades, 0);
    assert_eq!(response.result.summary.winning_trades, 0);
    assert!((response.result.summary.ending_position_qty - 10.0).abs() <= EPSILON);
    let metrics = response.result.summary.metrics.expect("persisted metrics");
    assert_eq!(metrics["trades"]["totalTrades"], 0);
}

#[test]
fn empty_input_reports_zero_processed_bars() {
    let mut request = basic_request();
    request.bars.clear();
    request.instrument.bar_count = 0;
    request.signals.clear();

    let response = run_engine(request);

    assert_eq!(response.result.bars_count, 0);
    assert!(response.equity_curve.is_empty());
    assert_eq!(response.result.final_equity, 1000.0);
    assert_eq!(response.result.total_pnl, 0.0);
}

#[test]
fn persisted_metrics_match_shared_next_open_golden_fixture() {
    let response = run_engine(basic_request());
    let metrics = response
        .result
        .summary
        .metrics
        .as_ref()
        .expect("persisted metrics");
    let expected: Value = serde_json::from_str(include_str!(
        "../../../../packages/shared/src/analytics/__fixtures__/next_open_basic.persisted-metrics.json"
    ))
    .unwrap();
    assert_metric_json_close(metrics, &expected, "metrics");
}

#[test]
fn batch_engine_reads_duckdb_and_writes_committed_artifacts() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("market.duckdb");
    {
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "CREATE TABLE market_bars (
                instrument_id VARCHAR NOT NULL,
                raw_index BIGINT NOT NULL,
                ts_ms BIGINT NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume REAL NOT NULL
            );",
        )
        .unwrap();
        for (index, (open, high, low, close)) in [
            (10.0, 11.0, 9.0, 10.0),
            (11.0, 13.0, 10.0, 12.0),
            (13.0, 15.0, 12.0, 14.0),
            (15.0, 17.0, 14.0, 16.0),
        ]
        .iter()
        .enumerate()
        {
            conn.execute(
                "INSERT INTO market_bars VALUES ('instrument-1', ?, ?, ?, ?, ?, ?, 1000.0)",
                params![
                    index as i64,
                    1_767_267_000_000_i64 + index as i64 * 86_400_000,
                    open,
                    high,
                    low,
                    close
                ],
            )
            .unwrap();
        }
    }

    let output_dir = temp_dir.path().join("out");
    let mut signals_by_instrument = HashMap::new();
    signals_by_instrument.insert(
        "instrument-1".to_string(),
        vec![
            BacktestSignal {
                bar_index: 0,
                buy: true,
                sell: false,
                short: false,
                cover: false,
            },
            BacktestSignal {
                bar_index: 2,
                buy: false,
                sell: true,
                short: false,
                cover: false,
            },
        ],
    );
    let base = basic_request();
    let response = run_batch_engine(BacktestBatchEngineRequest {
        batch_id: "batch-1".to_string(),
        market_db_path: db_path.to_string_lossy().to_string(),
        output_dir: output_dir.to_string_lossy().to_string(),
        config: base.config,
        instruments: vec![BacktestInstrument {
            instrument_id: "instrument-1".to_string(),
            symbol: "AAA".to_string(),
            base_timeframe: "1d".to_string(),
            name: None,
            bar_count: 4,
        }],
        price_mode: PriceMode::NextOpen,
        worker_count: Some(2),
        engine_version: None,
        signal_plan: None,
        signals_by_instrument,
        conflicts_by_instrument: HashMap::new(),
        max_equity_points_per_symbol: Some(120_000),
    })
    .unwrap();

    assert_eq!(response.engine, "RUST_DUCKDB_BATCH");
    assert_eq!(response.completed_symbols, 1);
    assert!(Path::new(&response.output.committed_path).is_file());
    let results = fs::read_to_string(response.output.results_path).unwrap();
    let first_result: serde_json::Value =
        serde_json::from_str(results.lines().next().unwrap()).unwrap();
    assert_eq!(first_result["result"]["finalEquity"], 1360.0);
    let fills = fs::read_to_string(response.output.fills_path).unwrap();
    assert!(fills.contains("\"side\":\"BUY\""));
    assert!(Path::new(&response.output.equity_path).is_file());
}
