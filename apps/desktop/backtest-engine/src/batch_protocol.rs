// SPDX-License-Identifier: GPL-3.0-only

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use super::{
    BacktestConfig, BacktestConflict, BacktestEquityPoint, BacktestFill, BacktestInstrument,
    BacktestResult, BacktestSignal, PriceMode,
};
use crate::model::default_price_mode;

#[derive(Debug, Error)]
pub enum BacktestEngineError {
    #[error("BACKTEST_BATCH_INVALID_REQUEST: {0}")]
    InvalidRequest(String),
    #[error("BACKTEST_BATCH_IO_FAILED: {0}")]
    Io(#[from] std::io::Error),
    #[error("BACKTEST_BATCH_DUCKDB_FAILED: {0}")]
    DuckDb(#[from] duckdb::Error),
    #[error("BACKTEST_BATCH_JSON_FAILED: {0}")]
    Json(#[from] serde_json::Error),
    #[error("BACKTEST_NATIVE_SIGNAL_PLAN_UNSUPPORTED: {0}")]
    UnsupportedSignalPlan(String),
    #[error("BACKTEST_BATCH_WORKER_FAILED: {0}")]
    Worker(String),
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestBatchEngineRequest {
    pub batch_id: String,
    pub market_db_path: String,
    pub output_dir: String,
    pub config: BacktestConfig,
    pub instruments: Vec<BacktestInstrument>,
    #[serde(default = "default_price_mode")]
    pub price_mode: PriceMode,
    #[serde(default)]
    pub worker_count: Option<usize>,
    #[serde(default)]
    pub engine_version: Option<String>,
    #[serde(default)]
    pub signal_plan: Option<CompiledBacktestSignalPlan>,
    #[serde(default)]
    pub signals_by_instrument: HashMap<String, Vec<BacktestSignal>>,
    #[serde(default)]
    pub conflicts_by_instrument: HashMap<String, Vec<BacktestConflict>>,
    #[serde(default)]
    pub max_equity_points_per_symbol: Option<usize>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledBacktestSignalPlan {
    pub version: u32,
    pub semantics_version: String,
    pub program: AstProgram,
    #[serde(default)]
    pub parameter_overrides: HashMap<String, f64>,
    #[serde(default)]
    pub output_keys: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AstProgram {
    pub body: Vec<AstAssignmentExpression>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AstAssignmentExpression {
    pub target: String,
    pub operator: String,
    pub expression: AstExpression,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum AstExpression {
    NumberLiteral {
        value: f64,
    },
    StringLiteral {
        value: String,
    },
    Identifier {
        name: String,
    },
    BinaryExpression {
        operator: String,
        left: Box<AstExpression>,
        right: Box<AstExpression>,
    },
    UnaryExpression {
        operator: String,
        argument: Box<AstExpression>,
    },
    FunctionCall {
        callee: String,
        args: Vec<AstExpression>,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchArtifactPaths {
    pub results_path: String,
    pub fills_path: String,
    pub equity_path: String,
    pub instrument_results_path: String,
    pub committed_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestBatchEngineResponse {
    pub engine: &'static str,
    pub engine_version: String,
    pub batch_id: String,
    pub total_symbols: usize,
    pub completed_symbols: usize,
    pub skipped_symbols: usize,
    pub native_workers: usize,
    pub duration_ms: u128,
    pub output: BatchArtifactPaths,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestBatchResultLine {
    pub instrument: BacktestInstrument,
    pub result: BacktestResult,
    pub conflicts: Vec<BacktestConflict>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestBatchFillLine {
    pub instrument_id: String,
    pub symbol: String,
    pub fill: BacktestFill,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestBatchEquityLine {
    pub instrument_id: String,
    pub symbol: String,
    pub point: BacktestEquityPoint,
}
