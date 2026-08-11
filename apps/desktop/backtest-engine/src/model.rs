// SPDX-License-Identifier: GPL-3.0-only

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineRequest {
    pub config: BacktestConfig,
    pub instrument: BacktestInstrument,
    pub bars: Vec<OhlcvBar>,
    pub signals: Vec<BacktestSignal>,
    #[serde(default = "default_price_mode")]
    pub price_mode: PriceMode,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestConfig {
    pub initial_capital: f64,
    pub order_sizing: OrderSizing,
    pub trading_settings: TradingSettings,
    #[serde(default)]
    pub start_index: Option<usize>,
    #[serde(default)]
    pub end_index: Option<usize>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderSizing {
    pub mode: OrderSizingMode,
    #[serde(default)]
    pub value: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderSizingMode {
    FixedQty,
    FixedAmount,
    EquityPercent,
    AllIn,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradingSettings {
    #[serde(default)]
    pub market_preset_id: String,
    #[serde(default)]
    pub asset_class: String,
    #[serde(default = "default_min_trade_step")]
    pub min_trade_step: f64,
    #[serde(default = "default_contract_multiplier")]
    pub contract_multiplier: f64,
    #[serde(default)]
    pub allow_short_selling: bool,
    #[serde(default)]
    pub allow_long_margin_trading: bool,
    #[serde(default)]
    pub trade_amount_includes_fees: bool,
    #[serde(default)]
    pub commission_rate: f64,
    #[serde(default)]
    pub maker_fee_rate: f64,
    #[serde(default)]
    pub taker_fee_rate: f64,
    #[serde(default)]
    pub funding_rate: f64,
    #[serde(default)]
    pub transfer_fee_rate: f64,
    #[serde(default)]
    pub regulatory_fee_rate: f64,
    #[serde(default)]
    pub platform_fee_rate: f64,
    #[serde(default)]
    pub transaction_levy_rate: f64,
    #[serde(default)]
    pub stamp_duty_rate: f64,
    #[serde(default)]
    pub slippage_rate: f64,
    #[serde(default)]
    pub commission_minimum_fee: f64,
    #[serde(default)]
    pub platform_fee_minimum_fee: f64,
    #[serde(default)]
    pub transaction_levy_minimum_fee: f64,
    #[serde(default = "default_stamp_duty_mode")]
    pub stamp_duty_mode: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestInstrument {
    pub instrument_id: String,
    pub symbol: String,
    pub base_timeframe: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub bar_count: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct OhlcvBar {
    pub ts: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    #[serde(default)]
    pub volume: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestSignal {
    pub bar_index: usize,
    #[serde(default)]
    pub buy: bool,
    #[serde(default)]
    pub sell: bool,
    #[serde(default)]
    pub short: bool,
    #[serde(default)]
    pub cover: bool,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PriceMode {
    CurClose,
    NextOpen,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineResponse {
    pub engine: &'static str,
    pub instrument: BacktestInstrument,
    pub result: BacktestResult,
    pub fills: Vec<BacktestFill>,
    pub equity_curve: Vec<BacktestEquityPoint>,
    pub conflicts: Vec<BacktestConflict>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestResult {
    pub instrument_id: String,
    pub symbol: String,
    pub timeframe: String,
    pub bars_count: usize,
    pub final_equity: f64,
    pub total_pnl: f64,
    pub profit_rate: f64,
    pub max_drawdown: f64,
    pub win_rate: f64,
    pub trade_count: usize,
    pub conflict_count: usize,
    pub summary: BacktestResultSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestResultSummary {
    pub realized_pnl: f64,
    pub closed_trades: usize,
    pub winning_trades: usize,
    pub ending_position_qty: f64,
    pub ending_avg_cost: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub equity_curve_sampled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metrics: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestFill {
    pub instrument_id: String,
    pub symbol: String,
    pub order_id: String,
    pub fill_index: usize,
    pub fill_time: String,
    pub side: Side,
    pub price: f64,
    pub qty: f64,
    pub gross: f64,
    pub fee: f64,
    pub tax: f64,
    pub slippage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestEquityPoint {
    pub instrument_id: String,
    pub symbol: String,
    pub bar_index: usize,
    pub bar_time: String,
    pub equity: f64,
    pub drawdown: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestConflict {
    pub bar_index: usize,
    pub code: String,
}

pub(crate) fn default_price_mode() -> PriceMode {
    PriceMode::NextOpen
}

fn default_min_trade_step() -> f64 {
    1.0
}

fn default_contract_multiplier() -> f64 {
    1.0
}

fn default_stamp_duty_mode() -> String {
    "SELL".to_string()
}
