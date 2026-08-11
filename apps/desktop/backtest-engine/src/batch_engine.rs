// SPDX-License-Identifier: GPL-3.0-only

use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::Instant;

use duckdb::{params, AccessMode, Config, Connection};
use rayon::prelude::*;
use serde::Serialize;

use super::signal_evaluator::evaluate_signal_plan;
use super::{
    run_engine_internal, BacktestBatchEngineRequest, BacktestBatchEngineResponse,
    BacktestBatchEquityLine, BacktestBatchFillLine, BacktestBatchResultLine, BacktestConflict,
    BacktestEngineError, BacktestEquityPoint, BacktestFill, BacktestInstrument, BacktestResult,
    BatchArtifactPaths, EngineRequest, EngineResponse, OhlcvBar, BATCH_ENGINE_VERSION,
};

const MAX_EQUITY_POINTS_PER_SYMBOL: usize = 2_000;

#[derive(Debug, Clone)]
struct InstrumentBatchOutput {
    response: EngineResponse,
    equity_sampled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BacktestBatchInstrumentResultLine {
    instrument: BacktestInstrument,
    result: BacktestResult,
    fills: Vec<BacktestFill>,
    equity_curve: Vec<BacktestEquityPoint>,
    conflicts: Vec<BacktestConflict>,
}

struct BatchWriterMessage {
    symbol: String,
    output: Option<InstrumentBatchOutput>,
}

struct BatchWriterPaths {
    tmp_results: PathBuf,
    tmp_fills: PathBuf,
    tmp_equity: PathBuf,
    tmp_instrument_results: PathBuf,
    tmp_committed: PathBuf,
    results: PathBuf,
    fills: PathBuf,
    equity: PathBuf,
    instrument_results: PathBuf,
    committed: PathBuf,
}

#[derive(Default)]
struct BatchWriterSummary {
    processed_symbols: usize,
    completed_symbols: usize,
    any_equity_sampled: bool,
}

fn resolve_worker_count(requested: Option<usize>) -> usize {
    let detected = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(4);
    let default_count = detected.saturating_sub(1).clamp(1, 8);
    requested.unwrap_or(default_count).clamp(1, 32)
}

fn iso_from_epoch_ms(ts_ms: i64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ts_ms)
        .map(|value| value.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
        .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string())
}

fn open_market_connection(path: &Path) -> Result<Connection, BacktestEngineError> {
    let config = Config::default().access_mode(AccessMode::ReadOnly)?;
    Ok(Connection::open_with_flags(path, config)?)
}

fn load_bars_from_duckdb(
    market_db_path: &Path,
    instrument_id: &str,
    limit: usize,
) -> Result<Vec<OhlcvBar>, BacktestEngineError> {
    if instrument_id.trim().is_empty() {
        return Ok(Vec::new());
    }
    let conn = open_market_connection(market_db_path)?;
    let upper = if limit > 0 { limit as i64 } else { i64::MAX };
    let mut stmt = conn.prepare(
        "SELECT ts_ms,
                CAST(open AS DOUBLE) AS open,
                CAST(high AS DOUBLE) AS high,
                CAST(low AS DOUBLE) AS low,
                CAST(close AS DOUBLE) AS close,
                CAST(volume AS DOUBLE) AS volume
           FROM market_bars
          WHERE instrument_id = ?
            AND raw_index >= 0
            AND raw_index < ?
          ORDER BY raw_index ASC",
    )?;
    let rows = stmt.query_map(params![instrument_id, upper], |row| {
        let ts_ms: i64 = row.get(0)?;
        Ok(OhlcvBar {
            ts: iso_from_epoch_ms(ts_ms),
            open: row.get::<_, f64>(1)?,
            high: row.get::<_, f64>(2)?,
            low: row.get::<_, f64>(3)?,
            close: row.get::<_, f64>(4)?,
            volume: row.get::<_, f64>(5)?,
        })
    })?;
    let mut bars = Vec::new();
    for row in rows {
        bars.push(row?);
    }
    Ok(bars)
}

fn downsample_equity_curve(
    points: Vec<BacktestEquityPoint>,
    max_points: usize,
) -> (Vec<BacktestEquityPoint>, bool) {
    let limit = max_points.max(2);
    if points.len() <= limit {
        return (points, false);
    }
    let last_index = points.len() - 1;
    let max_drawdown_index = points
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| left.drawdown.total_cmp(&right.drawdown))
        .map(|(index, _)| index)
        .unwrap_or(0);
    let mut indexes = vec![0usize, last_index, max_drawdown_index];
    for output_index in 0..limit {
        if indexes.len() >= limit {
            break;
        }
        let source_index =
            ((output_index as f64) * (last_index as f64) / ((limit - 1) as f64)).round() as usize;
        if !indexes.contains(&source_index) {
            indexes.push(source_index);
        }
    }
    for source_index in 0..points.len() {
        if indexes.len() >= limit {
            break;
        }
        if !indexes.contains(&source_index) {
            indexes.push(source_index);
        }
    }
    indexes.sort_unstable();
    indexes.dedup();
    if indexes.len() > limit {
        let required = [0usize, last_index, max_drawdown_index];
        let mut compact: Vec<usize> = indexes
            .iter()
            .copied()
            .filter(|index| required.contains(index))
            .collect();
        for output_index in 0..limit {
            if compact.len() >= limit {
                break;
            }
            let source_index = ((output_index as f64) * (last_index as f64) / ((limit - 1) as f64))
                .round() as usize;
            if !compact.contains(&source_index) {
                compact.push(source_index);
            }
        }
        compact.sort_unstable();
        compact.dedup();
        indexes = compact;
    }
    let sampled = indexes
        .into_iter()
        .take(limit)
        .map(|index| points[index].clone())
        .collect();
    (sampled, true)
}

fn run_instrument_batch(
    request: &BacktestBatchEngineRequest,
    market_db_path: &Path,
    instrument: &BacktestInstrument,
    max_equity_points: usize,
) -> Result<Option<InstrumentBatchOutput>, BacktestEngineError> {
    let bar_limit = instrument.bar_count;
    let bars = load_bars_from_duckdb(market_db_path, &instrument.instrument_id, bar_limit)?;
    if bars.is_empty() {
        return Ok(None);
    }
    let (signals, mut conflicts) =
        if let Some(precomputed) = request.signals_by_instrument.get(&instrument.instrument_id) {
            (
                precomputed.clone(),
                request
                    .conflicts_by_instrument
                    .get(&instrument.instrument_id)
                    .cloned()
                    .unwrap_or_default(),
            )
        } else if let Some(plan) = &request.signal_plan {
            evaluate_signal_plan(plan, &bars)?
        } else {
            return Err(BacktestEngineError::UnsupportedSignalPlan(
                "missing signalPlan".to_string(),
            ));
        };
    let engine_request = EngineRequest {
        config: request.config.clone(),
        instrument: BacktestInstrument {
            bar_count: bars.len(),
            ..instrument.clone()
        },
        bars,
        signals,
        price_mode: request.price_mode,
    };
    let mut response = run_engine_internal(
        engine_request,
        std::mem::take(&mut conflicts),
        "RUST_DUCKDB_BATCH",
    );
    let (equity_curve, sampled) = downsample_equity_curve(response.equity_curve, max_equity_points);
    response.equity_curve = equity_curve;
    if sampled {
        response.result.summary.equity_curve_sampled = Some(true);
    }
    response.result.summary.engine_version = Some(BATCH_ENGINE_VERSION.to_string());
    Ok(Some(InstrumentBatchOutput {
        response,
        equity_sampled: sampled,
    }))
}

fn write_json_line<T: Serialize>(
    writer: &mut BufWriter<File>,
    value: &T,
) -> Result<(), BacktestEngineError> {
    serde_json::to_writer(&mut *writer, value)?;
    writer.write_all(b"\n")?;
    Ok(())
}

fn batch_writer_paths(output_dir: &Path) -> BatchWriterPaths {
    BatchWriterPaths {
        tmp_results: output_dir.join("results.jsonl.tmp"),
        tmp_fills: output_dir.join("fills.jsonl.tmp"),
        tmp_equity: output_dir.join("equity.jsonl.tmp"),
        tmp_instrument_results: output_dir.join("instrument-results.jsonl.tmp"),
        tmp_committed: output_dir.join("committed.json.tmp"),
        results: output_dir.join("results.jsonl"),
        fills: output_dir.join("fills.jsonl"),
        equity: output_dir.join("equity.jsonl"),
        instrument_results: output_dir.join("instrument-results.jsonl"),
        committed: output_dir.join("committed.json"),
    }
}

fn remove_existing_batch_artifacts(paths: &BatchWriterPaths) -> Result<(), BacktestEngineError> {
    for path in [
        &paths.tmp_results,
        &paths.tmp_fills,
        &paths.tmp_equity,
        &paths.tmp_instrument_results,
        &paths.tmp_committed,
        &paths.results,
        &paths.fills,
        &paths.equity,
        &paths.instrument_results,
        &paths.committed,
    ] {
        if path.exists() {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

fn write_batch_progress(processed_symbols: usize, total_symbols: usize, symbol: &str) {
    let progress = serde_json::json!({
        "event": "progress",
        "completed": processed_symbols,
        "total": total_symbols,
        "symbol": symbol,
    });
    eprintln!("{progress}");
}

fn open_new_jsonl_writer(path: &Path) -> Result<BufWriter<File>, BacktestEngineError> {
    Ok(BufWriter::new(
        OpenOptions::new().create_new(true).write(true).open(path)?,
    ))
}

fn write_instrument_output_artifacts(
    output: &InstrumentBatchOutput,
    results_writer: &mut BufWriter<File>,
    fills_writer: &mut BufWriter<File>,
    equity_writer: &mut BufWriter<File>,
    instrument_results_writer: &mut BufWriter<File>,
) -> Result<(), BacktestEngineError> {
    write_json_line(
        results_writer,
        &BacktestBatchResultLine {
            instrument: output.response.instrument.clone(),
            result: output.response.result.clone(),
            conflicts: output.response.conflicts.clone(),
        },
    )?;
    for fill in &output.response.fills {
        write_json_line(
            fills_writer,
            &BacktestBatchFillLine {
                instrument_id: fill.instrument_id.clone(),
                symbol: fill.symbol.clone(),
                fill: fill.clone(),
            },
        )?;
    }
    for point in &output.response.equity_curve {
        write_json_line(
            equity_writer,
            &BacktestBatchEquityLine {
                instrument_id: point.instrument_id.clone(),
                symbol: point.symbol.clone(),
                point: point.clone(),
            },
        )?;
    }
    write_json_line(
        instrument_results_writer,
        &BacktestBatchInstrumentResultLine {
            instrument: output.response.instrument.clone(),
            result: output.response.result.clone(),
            fills: output.response.fills.clone(),
            equity_curve: output.response.equity_curve.clone(),
            conflicts: output.response.conflicts.clone(),
        },
    )?;
    Ok(())
}

pub fn run_batch_engine(
    request: BacktestBatchEngineRequest,
) -> Result<BacktestBatchEngineResponse, BacktestEngineError> {
    let started = Instant::now();
    let total_symbols = request.instruments.len();
    let market_db_path = PathBuf::from(request.market_db_path.trim());
    if !market_db_path.is_file() {
        return Err(BacktestEngineError::InvalidRequest(
            "marketDbPath does not point to a file".to_string(),
        ));
    }
    let output_dir = PathBuf::from(request.output_dir.trim());
    fs::create_dir_all(&output_dir)?;
    let worker_count = resolve_worker_count(request.worker_count);
    let max_equity_points = request
        .max_equity_points_per_symbol
        .unwrap_or(MAX_EQUITY_POINTS_PER_SYMBOL)
        .max(2);
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(worker_count)
        .build()
        .map_err(|error| BacktestEngineError::Worker(error.to_string()))?;

    let paths = batch_writer_paths(&output_dir);
    remove_existing_batch_artifacts(&paths)?;
    let writer_paths = BatchWriterPaths {
        tmp_results: paths.tmp_results.clone(),
        tmp_fills: paths.tmp_fills.clone(),
        tmp_equity: paths.tmp_equity.clone(),
        tmp_instrument_results: paths.tmp_instrument_results.clone(),
        tmp_committed: paths.tmp_committed.clone(),
        results: paths.results.clone(),
        fills: paths.fills.clone(),
        equity: paths.equity.clone(),
        instrument_results: paths.instrument_results.clone(),
        committed: paths.committed.clone(),
    };
    let (sender, receiver) = mpsc::channel::<BatchWriterMessage>();
    let writer_handle =
        thread::spawn(move || -> Result<BatchWriterSummary, BacktestEngineError> {
            let mut results_writer = open_new_jsonl_writer(&writer_paths.tmp_results)?;
            let mut fills_writer = open_new_jsonl_writer(&writer_paths.tmp_fills)?;
            let mut equity_writer = open_new_jsonl_writer(&writer_paths.tmp_equity)?;
            let mut instrument_results_writer =
                open_new_jsonl_writer(&writer_paths.tmp_instrument_results)?;
            let mut summary = BatchWriterSummary::default();

            for message in receiver {
                summary.processed_symbols += 1;
                if let Some(output) = message.output {
                    summary.completed_symbols += 1;
                    summary.any_equity_sampled |= output.equity_sampled;
                    write_instrument_output_artifacts(
                        &output,
                        &mut results_writer,
                        &mut fills_writer,
                        &mut equity_writer,
                        &mut instrument_results_writer,
                    )?;
                }
                write_batch_progress(summary.processed_symbols, total_symbols, &message.symbol);
            }
            results_writer.flush()?;
            fills_writer.flush()?;
            equity_writer.flush()?;
            instrument_results_writer.flush()?;

            fs::rename(&writer_paths.tmp_results, &writer_paths.results)?;
            fs::rename(&writer_paths.tmp_fills, &writer_paths.fills)?;
            fs::rename(&writer_paths.tmp_equity, &writer_paths.equity)?;
            fs::rename(
                &writer_paths.tmp_instrument_results,
                &writer_paths.instrument_results,
            )?;

            Ok(summary)
        });

    let worker_result = pool.install(|| {
        request
            .instruments
            .par_iter()
            .try_for_each_with(sender, |sender, instrument| {
                let output =
                    run_instrument_batch(&request, &market_db_path, instrument, max_equity_points)?;
                sender
                    .send(BatchWriterMessage {
                        symbol: instrument.symbol.clone(),
                        output,
                    })
                    .map_err(|_| BacktestEngineError::Worker("batch writer closed".to_string()))?;
                Ok::<(), BacktestEngineError>(())
            })
    });

    let writer_summary = writer_handle
        .join()
        .map_err(|_| BacktestEngineError::Worker("batch writer panicked".to_string()))??;
    worker_result?;
    let skipped_symbols = total_symbols.saturating_sub(writer_summary.completed_symbols);

    let response = BacktestBatchEngineResponse {
        engine: "RUST_DUCKDB_BATCH",
        engine_version: request
            .engine_version
            .clone()
            .unwrap_or_else(|| BATCH_ENGINE_VERSION.to_string()),
        batch_id: request.batch_id.clone(),
        total_symbols,
        completed_symbols: writer_summary.completed_symbols,
        skipped_symbols,
        native_workers: worker_count,
        duration_ms: started.elapsed().as_millis(),
        output: BatchArtifactPaths {
            results_path: paths.results.to_string_lossy().to_string(),
            fills_path: paths.fills.to_string_lossy().to_string(),
            equity_path: paths.equity.to_string_lossy().to_string(),
            instrument_results_path: paths.instrument_results.to_string_lossy().to_string(),
            committed_path: paths.committed.to_string_lossy().to_string(),
        },
    };
    let mut committed_writer = BufWriter::new(
        OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&paths.tmp_committed)?,
    );
    serde_json::to_writer(
        &mut committed_writer,
        &serde_json::json!({
            "batchId": response.batch_id,
            "engine": response.engine,
            "engineVersion": response.engine_version,
            "completedSymbols": response.completed_symbols,
            "totalSymbols": response.total_symbols,
            "nativeWorkers": response.native_workers,
            "durationMs": response.duration_ms,
            "equityCurveSampled": writer_summary.any_equity_sampled,
        }),
    )?;
    committed_writer.flush()?;
    fs::rename(&paths.tmp_committed, &paths.committed)?;
    Ok(response)
}
