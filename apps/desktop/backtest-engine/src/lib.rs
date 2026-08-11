// SPDX-License-Identifier: GPL-3.0-only

mod batch_engine;
mod batch_protocol;
mod metrics;
mod model;
mod signal_evaluator;

pub use batch_engine::run_batch_engine;
pub use batch_protocol::{
    AstAssignmentExpression, AstExpression, AstProgram, BacktestBatchEngineRequest,
    BacktestBatchEngineResponse, BacktestBatchEquityLine, BacktestBatchFillLine,
    BacktestBatchResultLine, BacktestEngineError, BatchArtifactPaths, CompiledBacktestSignalPlan,
};
pub use model::{
    BacktestConfig, BacktestConflict, BacktestEquityPoint, BacktestFill, BacktestInstrument,
    BacktestResult, BacktestResultSummary, BacktestSignal, EngineRequest, EngineResponse, OhlcvBar,
    OrderSizing, OrderSizingMode, PriceMode, Side, TradingSettings,
};

use metrics::compute_persisted_metrics;

const EPSILON: f64 = 1e-8;
const MAX_ORDER_AMOUNT_SEARCH_STEPS: usize = 1_000_000_000;
pub const BATCH_ENGINE_VERSION: &str = "backtest-batch-v1";

pub fn evaluate_compiled_signal_plan(
    plan: &CompiledBacktestSignalPlan,
    bars: &[OhlcvBar],
) -> Result<(Vec<BacktestSignal>, Vec<BacktestConflict>), BacktestEngineError> {
    signal_evaluator::evaluate_signal_plan(plan, bars)
}

#[derive(Debug, Clone)]
struct PositionState {
    cash: f64,
    position_qty: f64,
    avg_cost: f64,
    open_cost: f64,
    realized_pnl: f64,
    closed_trades: usize,
    winning_trades: usize,
}

#[derive(Debug, Clone)]
struct PlannedAction {
    side: Side,
    raw_signal: &'static str,
    bar_index: usize,
    fill_index: usize,
}

fn round_number(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    (value * 100_000_000.0).round() / 100_000_000.0
}

fn quantize_qty(value: f64, step: f64) -> f64 {
    let normalized_step = if step.is_finite() && step > EPSILON {
        step
    } else {
        1.0
    };
    if !value.is_finite() || value <= EPSILON {
        return 0.0;
    }
    round_number((value / normalized_step + EPSILON).floor() * normalized_step)
}

fn mark_equity(state: &PositionState, bar: &OhlcvBar, contract_multiplier: f64) -> f64 {
    round_number(state.cash + state.position_qty * bar.close * contract_multiplier)
}

fn price_for_bar(bar: &OhlcvBar, side: Side, mode: PriceMode) -> f64 {
    let price = match mode {
        PriceMode::NextOpen => bar.open,
        PriceMode::CurClose => bar.close,
    };
    if price.is_finite() && price > EPSILON {
        return price;
    }
    match side {
        Side::Buy => bar.high.max(0.0),
        Side::Sell => bar.low.max(0.0),
    }
}

fn non_negative_rate(value: f64) -> f64 {
    if !value.is_finite() || value <= 0.0 {
        return 0.0;
    }
    value / 100.0
}

fn non_negative_amount(value: f64) -> f64 {
    if !value.is_finite() || value <= 0.0 {
        return 0.0;
    }
    value
}

fn apply_minimum_charge(raw_amount: f64, minimum_amount: f64) -> f64 {
    let amount = raw_amount.max(0.0);
    let minimum = minimum_amount.max(0.0);
    if minimum <= EPSILON {
        return amount;
    }
    amount.max(minimum)
}

fn normalized_asset_class(settings: &TradingSettings) -> String {
    settings.asset_class.trim().to_uppercase()
}

fn should_apply_stamp_duty(settings: &TradingSettings, side: Side) -> bool {
    let mode = settings.stamp_duty_mode.trim().to_uppercase();
    mode == "DOUBLE"
        || (mode == "BUY" && side == Side::Buy)
        || (mode == "SELL" && side == Side::Sell)
}

fn trading_cost(gross: f64, side: Side, settings: &TradingSettings, qty: f64) -> (f64, f64, f64) {
    let normalized_gross = if gross.is_finite() {
        gross.abs().max(0.0)
    } else {
        0.0
    };
    let normalized_qty = if qty.is_finite() { qty.max(0.0) } else { 0.0 };
    if normalized_gross <= EPSILON {
        return (0.0, 0.0, 0.0);
    }

    let asset_class = normalized_asset_class(settings);
    let commission;
    let mut transfer_fee = 0.0;
    let mut regulatory_fee = 0.0;
    let mut platform_fee = 0.0;
    let mut transaction_levy = 0.0;
    let mut tax = 0.0;
    let slippage;

    if asset_class == "FUTURES" {
        commission = normalized_qty * non_negative_amount(settings.maker_fee_rate);
        regulatory_fee = normalized_qty * non_negative_amount(settings.taker_fee_rate);
        slippage = normalized_gross * non_negative_rate(settings.slippage_rate);
    } else if asset_class == "FOREX" {
        let commission_rate = if settings.commission_rate > EPSILON {
            settings.commission_rate
        } else {
            settings.maker_fee_rate
        };
        commission = normalized_gross * non_negative_rate(commission_rate);
        slippage = normalized_gross
            * (non_negative_rate(settings.taker_fee_rate)
                + non_negative_rate(settings.slippage_rate));
    } else if asset_class == "CRYPTO" {
        let taker_rate = non_negative_rate(settings.taker_fee_rate);
        let maker_rate = non_negative_rate(settings.maker_fee_rate);
        let execution_rate = if taker_rate > EPSILON {
            taker_rate
        } else {
            maker_rate
        };
        commission = normalized_gross * execution_rate;
        slippage = normalized_gross * non_negative_rate(settings.slippage_rate);
    } else {
        let is_us_stock = settings.market_preset_id.trim() == "US_STOCK";
        commission = apply_minimum_charge(
            normalized_gross * non_negative_rate(settings.commission_rate),
            non_negative_amount(settings.commission_minimum_fee),
        );
        transfer_fee = normalized_gross * non_negative_rate(settings.transfer_fee_rate);
        regulatory_fee = if is_us_stock && side != Side::Sell {
            0.0
        } else {
            normalized_gross * non_negative_rate(settings.regulatory_fee_rate)
        };
        platform_fee = apply_minimum_charge(
            normalized_gross * non_negative_rate(settings.platform_fee_rate),
            non_negative_amount(settings.platform_fee_minimum_fee),
        );
        transaction_levy = if is_us_stock && side == Side::Sell {
            apply_minimum_charge(
                normalized_qty * non_negative_amount(settings.transaction_levy_rate),
                non_negative_amount(settings.transaction_levy_minimum_fee),
            )
        } else if is_us_stock {
            0.0
        } else {
            apply_minimum_charge(
                normalized_gross * non_negative_rate(settings.transaction_levy_rate),
                non_negative_amount(settings.transaction_levy_minimum_fee),
            )
        };
        slippage = normalized_gross * non_negative_rate(settings.slippage_rate);
        if should_apply_stamp_duty(settings, side) {
            tax = normalized_gross * non_negative_rate(settings.stamp_duty_rate);
        }
    }

    (
        round_number(commission + transfer_fee + regulatory_fee + platform_fee + transaction_levy),
        round_number(tax),
        round_number(slippage),
    )
}

fn actions_for_signal(signal: &BacktestSignal, fill_index: usize) -> Vec<PlannedAction> {
    let mut actions = Vec::new();
    if signal.sell && !signal.short {
        actions.push(PlannedAction {
            side: Side::Sell,
            raw_signal: "SELL",
            bar_index: signal.bar_index,
            fill_index,
        });
    }
    if signal.cover && !signal.buy {
        actions.push(PlannedAction {
            side: Side::Buy,
            raw_signal: "COVER",
            bar_index: signal.bar_index,
            fill_index,
        });
    }
    if signal.buy {
        actions.push(PlannedAction {
            side: Side::Buy,
            raw_signal: "BUY",
            bar_index: signal.bar_index,
            fill_index,
        });
    }
    if signal.short {
        actions.push(PlannedAction {
            side: Side::Sell,
            raw_signal: "SHORT",
            bar_index: signal.bar_index,
            fill_index,
        });
    }
    actions
}

fn resolve_entry_qty(
    request: &EngineRequest,
    state: &PositionState,
    side: Side,
    price: f64,
    equity: f64,
) -> f64 {
    let settings = &request.config.trading_settings;
    let multiplier = settings.contract_multiplier.max(EPSILON);
    let value = request.config.order_sizing.value.unwrap_or(0.0);
    if request.config.order_sizing.mode == OrderSizingMode::FixedQty {
        return quantize_qty(value, settings.min_trade_step);
    }
    let mut amount = match request.config.order_sizing.mode {
        OrderSizingMode::FixedAmount => value,
        OrderSizingMode::EquityPercent => equity * value.max(0.0) / 100.0,
        OrderSizingMode::AllIn => {
            if side == Side::Buy {
                state.cash
            } else {
                equity
            }
        }
        OrderSizingMode::FixedQty => value,
    };
    if side == Side::Buy && !settings.allow_long_margin_trading {
        amount = amount.min(state.cash.max(0.0));
    }
    resolve_qty_from_trade_amount(
        side,
        amount,
        price,
        settings.min_trade_step,
        multiplier,
        settings,
    )
}

fn trading_cost_for_qty(
    side: Side,
    qty: f64,
    price: f64,
    multiplier: f64,
    settings: &TradingSettings,
) -> f64 {
    let gross = qty * price * multiplier;
    let (fee, tax, slippage) = trading_cost(gross, side, settings, qty);
    fee + tax + slippage
}

fn can_buy_qty_fit_amount(
    side: Side,
    qty: f64,
    amount: f64,
    price: f64,
    multiplier: f64,
    settings: &TradingSettings,
) -> bool {
    if qty <= EPSILON {
        return true;
    }
    let cost = trading_cost_for_qty(side, qty, price, multiplier, settings);
    qty * price * multiplier + cost <= amount + EPSILON
}

fn can_sell_qty_reach_amount(
    side: Side,
    qty: f64,
    amount: f64,
    price: f64,
    multiplier: f64,
    settings: &TradingSettings,
) -> bool {
    if qty <= EPSILON {
        return false;
    }
    let cost = trading_cost_for_qty(side, qty, price, multiplier, settings);
    qty * price * multiplier - cost + EPSILON >= amount
}

fn resolve_qty_from_trade_amount(
    side: Side,
    amount: f64,
    price: f64,
    trade_step: f64,
    contract_multiplier: f64,
    settings: &TradingSettings,
) -> f64 {
    if !amount.is_finite() || amount <= EPSILON || !price.is_finite() || price <= EPSILON {
        return 0.0;
    }
    let normalized_trade_step = if trade_step.is_finite() && trade_step > EPSILON {
        trade_step
    } else {
        1.0
    };
    let normalized_multiplier = if contract_multiplier.is_finite() && contract_multiplier > EPSILON
    {
        contract_multiplier
    } else {
        1.0
    };
    let step_gross = normalized_trade_step * price * normalized_multiplier;
    if !step_gross.is_finite() || step_gross <= EPSILON {
        return 0.0;
    }
    if !settings.trade_amount_includes_fees {
        return quantize_qty(
            amount / (price * normalized_multiplier),
            normalized_trade_step,
        );
    }

    if side == Side::Buy {
        let max_steps = ((amount / step_gross) + EPSILON).floor().max(0.0) as usize;
        let mut low = 0usize;
        let mut high = max_steps.min(MAX_ORDER_AMOUNT_SEARCH_STEPS);
        while low < high {
            let mid = (low + high).div_ceil(2);
            let qty = mid as f64 * normalized_trade_step;
            if can_buy_qty_fit_amount(side, qty, amount, price, normalized_multiplier, settings) {
                low = mid;
            } else {
                high = mid.saturating_sub(1);
            }
        }
        return round_number(low as f64 * normalized_trade_step);
    }

    let mut low = ((amount / step_gross) - EPSILON).ceil().max(1.0) as usize;
    let mut high = low;
    while high < MAX_ORDER_AMOUNT_SEARCH_STEPS
        && !can_sell_qty_reach_amount(
            side,
            high as f64 * normalized_trade_step,
            amount,
            price,
            normalized_multiplier,
            settings,
        )
    {
        high = MAX_ORDER_AMOUNT_SEARCH_STEPS.min((high + 1).max(high.saturating_mul(2)));
    }
    if high >= MAX_ORDER_AMOUNT_SEARCH_STEPS {
        return round_number(high as f64 * normalized_trade_step);
    }
    while low < high {
        let mid = (low + high) / 2;
        let qty = mid as f64 * normalized_trade_step;
        if can_sell_qty_reach_amount(side, qty, amount, price, normalized_multiplier, settings) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }
    round_number(low as f64 * normalized_trade_step)
}

fn flat_state_after_close(
    request: &EngineRequest,
    state: &PositionState,
    side: Side,
    qty: f64,
    price: f64,
) -> PositionState {
    let multiplier = request
        .config
        .trading_settings
        .contract_multiplier
        .max(EPSILON);
    let gross = qty * price * multiplier;
    let cost = trading_cost_for_qty(
        side,
        qty,
        price,
        multiplier,
        &request.config.trading_settings,
    );
    let mut post_close = state.clone();
    post_close.cash =
        round_number(state.cash + if side == Side::Sell { gross } else { -gross } - cost);
    post_close.position_qty = 0.0;
    post_close.avg_cost = 0.0;
    post_close.open_cost = 0.0;
    post_close
}

fn cap_buy_qty_to_available_cash(
    request: &EngineRequest,
    state: &PositionState,
    requested_qty: f64,
    price: f64,
) -> f64 {
    let settings = &request.config.trading_settings;
    let trade_step = if settings.min_trade_step.is_finite() && settings.min_trade_step > EPSILON {
        settings.min_trade_step
    } else {
        1.0
    };
    let normalized_requested_qty = quantize_qty(requested_qty, trade_step);
    if settings.allow_long_margin_trading || normalized_requested_qty <= EPSILON {
        return normalized_requested_qty;
    }

    let multiplier = settings.contract_multiplier.max(EPSILON);
    let mut low = 0usize;
    let mut high = ((normalized_requested_qty / trade_step + EPSILON)
        .floor()
        .max(0.0) as usize)
        .min(MAX_ORDER_AMOUNT_SEARCH_STEPS);
    while low < high {
        let middle = (low + high).div_ceil(2);
        let qty = middle as f64 * trade_step;
        let cost = trading_cost_for_qty(Side::Buy, qty, price, multiplier, settings);
        if qty * price * multiplier + cost <= state.cash + EPSILON {
            low = middle;
        } else {
            high = middle.saturating_sub(1);
        }
    }
    round_number(low as f64 * trade_step)
}

fn is_buy_qty_affordable(
    request: &EngineRequest,
    state: &PositionState,
    qty: f64,
    price: f64,
) -> bool {
    let settings = &request.config.trading_settings;
    if settings.allow_long_margin_trading {
        return true;
    }
    let trade_step = if settings.min_trade_step.is_finite() && settings.min_trade_step > EPSILON {
        settings.min_trade_step
    } else {
        1.0
    };
    let normalized_qty = quantize_qty(qty, trade_step);
    let multiplier = settings.contract_multiplier.max(EPSILON);
    let cost = trading_cost_for_qty(Side::Buy, normalized_qty, price, multiplier, settings);
    normalized_qty * price * multiplier + cost <= state.cash + EPSILON
}

fn resolve_action_qty(
    request: &EngineRequest,
    state: &PositionState,
    action: &PlannedAction,
    price: f64,
    equity: f64,
) -> Result<f64, &'static str> {
    let abs_position = state.position_qty.abs();
    if action.raw_signal == "SELL" {
        return if state.position_qty > EPSILON {
            Ok(abs_position)
        } else {
            Err("NO_POSITION")
        };
    }
    if action.raw_signal == "COVER" {
        if state.position_qty >= -EPSILON {
            return Err("NO_POSITION");
        }
        return Ok(abs_position);
    }
    if action.raw_signal == "BUY" && state.position_qty < -EPSILON {
        let post_close = flat_state_after_close(request, state, Side::Buy, abs_position, price);
        let entry_qty =
            resolve_entry_qty(request, &post_close, action.side, price, post_close.cash).max(0.0);
        let is_fixed_quantity = request.config.order_sizing.mode == OrderSizingMode::FixedQty;
        let executable_entry_qty = if is_fixed_quantity
            && !is_buy_qty_affordable(request, &post_close, entry_qty, price)
        {
            0.0
        } else {
            cap_buy_qty_to_available_cash(request, &post_close, entry_qty, price)
        };
        // The cover portion always reduces risk. An unaffordable explicit
        // new-long quantity must not be silently partially filled.
        return Ok(round_number(abs_position + executable_entry_qty));
    }
    if action.raw_signal == "SHORT" && state.position_qty > EPSILON {
        if !request.config.trading_settings.allow_short_selling {
            return Ok(abs_position);
        }
        let post_close = flat_state_after_close(request, state, Side::Sell, abs_position, price);
        let entry_qty =
            resolve_entry_qty(request, &post_close, action.side, price, post_close.cash).max(0.0);
        return Ok(round_number(abs_position + entry_qty));
    }
    if action.side == Side::Sell
        && state.position_qty <= EPSILON
        && !request.config.trading_settings.allow_short_selling
    {
        return Err("SHORT_SELLING_DISABLED");
    }
    let qty = resolve_entry_qty(request, state, action.side, price, equity);
    if qty <= EPSILON {
        return Err("QUANTITY_ZERO");
    }
    if action.side == Side::Buy {
        if request.config.order_sizing.mode == OrderSizingMode::FixedQty
            && !is_buy_qty_affordable(request, state, qty, price)
        {
            return Err("INSUFFICIENT_CASH");
        }
        let affordable_qty = cap_buy_qty_to_available_cash(request, state, qty, price);
        return if affordable_qty > EPSILON {
            Ok(affordable_qty)
        } else {
            Err("INSUFFICIENT_CASH")
        };
    }
    Ok(qty)
}

fn record_close_trade(state: &mut PositionState, pnl: f64) {
    state.closed_trades += 1;
    if pnl > EPSILON {
        state.winning_trades += 1;
    }
}

fn apply_buy(state: &mut PositionState, qty: f64, price: f64, multiplier: f64, cost: f64) {
    let previous_qty = state.position_qty;
    let gross = qty * price * multiplier;
    state.cash = round_number(state.cash - gross - cost);
    if previous_qty < -EPSILON {
        let closed_qty = qty.min(previous_qty.abs());
        let close_cost = if qty > EPSILON {
            cost * closed_qty / qty
        } else {
            cost
        };
        let entry_cost = state.open_cost * closed_qty / previous_qty.abs();
        let close_pnl =
            (state.avg_cost - price) * closed_qty * multiplier - entry_cost - close_cost;
        state.realized_pnl = round_number(state.realized_pnl + close_pnl);
        record_close_trade(state, close_pnl);
        let next_qty = previous_qty + qty;
        state.position_qty = round_number(next_qty);
        if next_qty < -EPSILON {
            state.open_cost = round_number((state.open_cost - entry_cost).max(0.0));
        } else {
            state.avg_cost = if next_qty > EPSILON { price } else { 0.0 };
            state.open_cost = if next_qty > EPSILON {
                round_number((cost - close_cost).max(0.0))
            } else {
                0.0
            };
        }
        return;
    }
    let next_qty = previous_qty + qty;
    state.avg_cost = if next_qty > EPSILON {
        round_number(((previous_qty.max(0.0) * state.avg_cost) + qty * price) / next_qty)
    } else {
        0.0
    };
    state.position_qty = round_number(next_qty);
    state.open_cost = round_number((state.open_cost + cost).max(0.0));
}

fn apply_sell(state: &mut PositionState, qty: f64, price: f64, multiplier: f64, cost: f64) {
    let previous_qty = state.position_qty;
    let gross = qty * price * multiplier;
    state.cash = round_number(state.cash + gross - cost);
    if previous_qty > EPSILON {
        let closed_qty = qty.min(previous_qty);
        let close_cost = if qty > EPSILON {
            cost * closed_qty / qty
        } else {
            cost
        };
        let entry_cost = state.open_cost * closed_qty / previous_qty;
        let close_pnl =
            (price - state.avg_cost) * closed_qty * multiplier - entry_cost - close_cost;
        state.realized_pnl = round_number(state.realized_pnl + close_pnl);
        record_close_trade(state, close_pnl);
        let next_qty = previous_qty - qty;
        state.position_qty = round_number(next_qty);
        if next_qty > EPSILON {
            state.open_cost = round_number((state.open_cost - entry_cost).max(0.0));
        } else {
            state.avg_cost = if next_qty < -EPSILON { price } else { 0.0 };
            state.open_cost = if next_qty < -EPSILON {
                round_number((cost - close_cost).max(0.0))
            } else {
                0.0
            };
        }
        return;
    }
    let next_abs_qty = (previous_qty - qty).abs();
    state.avg_cost = if next_abs_qty > EPSILON {
        round_number(((previous_qty.min(0.0).abs() * state.avg_cost) + qty * price) / next_abs_qty)
    } else {
        0.0
    };
    state.position_qty = round_number(previous_qty - qty);
    state.open_cost = round_number((state.open_cost + cost).max(0.0));
}

fn apply_fill(
    request: &EngineRequest,
    state: &mut PositionState,
    action: &PlannedAction,
    qty: f64,
    price: f64,
    fill_bar: &OhlcvBar,
    fill_seq: usize,
) -> BacktestFill {
    let multiplier = request
        .config
        .trading_settings
        .contract_multiplier
        .max(EPSILON);
    let gross = round_number(qty * price * multiplier);
    let (fee, tax, slippage) =
        trading_cost(gross, action.side, &request.config.trading_settings, qty);
    let cost = fee + tax + slippage;
    match action.side {
        Side::Buy => apply_buy(state, qty, price, multiplier, cost),
        Side::Sell => apply_sell(state, qty, price, multiplier, cost),
    };
    BacktestFill {
        instrument_id: request.instrument.instrument_id.clone(),
        symbol: request.instrument.symbol.clone(),
        order_id: format!(
            "backtest:{}:{}:{}",
            request.instrument.instrument_id, action.fill_index, fill_seq
        ),
        fill_index: action.fill_index,
        fill_time: fill_bar.ts.clone(),
        side: action.side,
        price: round_number(price),
        qty: round_number(qty),
        gross,
        fee,
        tax,
        slippage,
    }
}

struct ActionExecutionContext<'a> {
    request: &'a EngineRequest,
    fill_bar: &'a OhlcvBar,
    mark_bar: &'a OhlcvBar,
}

fn execute_actions(
    context: &ActionExecutionContext<'_>,
    state: &mut PositionState,
    conflicts: &mut Vec<BacktestConflict>,
    fills: &mut Vec<BacktestFill>,
    actions: &[PlannedAction],
    fill_seq: &mut usize,
) {
    let multiplier = context
        .request
        .config
        .trading_settings
        .contract_multiplier
        .max(EPSILON);
    for action in actions {
        let equity = mark_equity(state, context.mark_bar, multiplier);
        let price = price_for_bar(context.fill_bar, action.side, context.request.price_mode);
        let qty = match resolve_action_qty(context.request, state, action, price, equity) {
            Ok(value) => value,
            Err(code) => {
                conflicts.push(BacktestConflict {
                    bar_index: action.bar_index,
                    code: code.to_string(),
                });
                continue;
            }
        };
        if qty <= EPSILON {
            continue;
        }
        fills.push(apply_fill(
            context.request,
            state,
            action,
            qty,
            price,
            context.fill_bar,
            *fill_seq,
        ));
        *fill_seq += 1;
    }
}

fn run_engine_internal(
    request: EngineRequest,
    initial_conflicts: Vec<BacktestConflict>,
    engine: &'static str,
) -> EngineResponse {
    let start_index = request
        .config
        .start_index
        .unwrap_or(0)
        .min(request.bars.len());
    let configured_end = request
        .config
        .end_index
        .unwrap_or_else(|| request.bars.len().saturating_sub(1));
    let end_index = configured_end.min(request.bars.len().saturating_sub(1));
    let has_bars_in_range = !request.bars.is_empty() && start_index <= end_index;
    let mut state = PositionState {
        cash: request.config.initial_capital,
        position_qty: 0.0,
        avg_cost: 0.0,
        open_cost: 0.0,
        realized_pnl: 0.0,
        closed_trades: 0,
        winning_trades: 0,
    };
    let mut conflicts = initial_conflicts;
    let mut fills = Vec::<BacktestFill>::new();
    let mut equity_curve = Vec::<BacktestEquityPoint>::new();
    let mut peak_equity = request.config.initial_capital;
    let mut max_drawdown = 0.0;
    let mut fill_seq = 0usize;
    let multiplier = request
        .config
        .trading_settings
        .contract_multiplier
        .max(EPSILON);
    let signal_by_bar_index = request
        .signals
        .iter()
        .map(|signal| (signal.bar_index, signal))
        .collect::<std::collections::HashMap<usize, &BacktestSignal>>();
    let mut pending_actions = std::collections::HashMap::<usize, Vec<PlannedAction>>::new();

    if has_bars_in_range {
        for bar_index in start_index..=end_index {
            let Some(bar) = request.bars.get(bar_index) else {
                continue;
            };
            if let Some(actions) = pending_actions.remove(&bar_index) {
                execute_actions(
                    &ActionExecutionContext {
                        request: &request,
                        fill_bar: bar,
                        mark_bar: bar,
                    },
                    &mut state,
                    &mut conflicts,
                    &mut fills,
                    &actions,
                    &mut fill_seq,
                );
            }
            if let Some(signal) = signal_by_bar_index.get(&bar_index) {
                let fill_index = if request.price_mode == PriceMode::NextOpen {
                    bar_index + 1
                } else {
                    bar_index
                };
                if fill_index > end_index || request.bars.get(fill_index).is_none() {
                    if signal.buy || signal.sell || signal.short || signal.cover {
                        conflicts.push(BacktestConflict {
                            bar_index,
                            code: "FILL_BAR_UNAVAILABLE".to_string(),
                        });
                    }
                } else if request.price_mode == PriceMode::NextOpen {
                    pending_actions
                        .entry(fill_index)
                        .or_default()
                        .extend(actions_for_signal(signal, fill_index));
                } else if let Some(fill_bar) = request.bars.get(fill_index) {
                    execute_actions(
                        &ActionExecutionContext {
                            request: &request,
                            fill_bar,
                            mark_bar: bar,
                        },
                        &mut state,
                        &mut conflicts,
                        &mut fills,
                        &actions_for_signal(signal, fill_index),
                        &mut fill_seq,
                    );
                }
            }
            let equity = mark_equity(&state, bar, multiplier);
            peak_equity = peak_equity.max(equity);
            let drawdown = if peak_equity > EPSILON {
                round_number((peak_equity - equity) / peak_equity)
            } else {
                0.0
            };
            max_drawdown = f64::max(max_drawdown, drawdown);
            equity_curve.push(BacktestEquityPoint {
                instrument_id: request.instrument.instrument_id.clone(),
                symbol: request.instrument.symbol.clone(),
                bar_index,
                bar_time: bar.ts.clone(),
                equity,
                drawdown,
            });
        }
    }

    let final_equity = equity_curve
        .last()
        .map(|point| point.equity)
        .unwrap_or(request.config.initial_capital);
    let total_pnl = round_number(final_equity - request.config.initial_capital);
    let profit_rate = if request.config.initial_capital > EPSILON {
        round_number(total_pnl / request.config.initial_capital)
    } else {
        0.0
    };
    let win_rate = if state.closed_trades > 0 {
        round_number(state.winning_trades as f64 / state.closed_trades as f64)
    } else {
        0.0
    };
    let metrics = compute_persisted_metrics(
        &request.config,
        &request.instrument,
        &equity_curve,
        &fills,
        &state,
    );

    EngineResponse {
        engine,
        instrument: request.instrument.clone(),
        result: BacktestResult {
            instrument_id: request.instrument.instrument_id.clone(),
            symbol: request.instrument.symbol.clone(),
            timeframe: request.instrument.base_timeframe.clone(),
            bars_count: if has_bars_in_range {
                end_index - start_index + 1
            } else {
                0
            },
            final_equity,
            total_pnl,
            profit_rate,
            max_drawdown: round_number(max_drawdown),
            win_rate,
            trade_count: fills.len(),
            conflict_count: conflicts.len(),
            summary: BacktestResultSummary {
                realized_pnl: state.realized_pnl,
                closed_trades: state.closed_trades,
                winning_trades: state.winning_trades,
                ending_position_qty: state.position_qty,
                ending_avg_cost: state.avg_cost,
                engine_version: None,
                equity_curve_sampled: None,
                metrics: Some(metrics),
            },
        },
        fills,
        equity_curve,
        conflicts,
    }
}

pub fn run_engine(request: EngineRequest) -> EngineResponse {
    run_engine_internal(request, Vec::new(), "RUST_SIDECAR_REFERENCE")
}

#[cfg(test)]
mod tests;
