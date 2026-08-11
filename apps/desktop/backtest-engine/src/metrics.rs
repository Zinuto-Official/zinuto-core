// SPDX-License-Identifier: GPL-3.0-only

use std::collections::HashMap;

use serde_json::json;

use super::{
    BacktestConfig, BacktestEquityPoint, BacktestFill, BacktestInstrument, PositionState, Side,
};

const METRIC_EPSILON: f64 = 1e-12;
const YEAR_DAYS: f64 = 365.2425;
const YEAR_MS: f64 = YEAR_DAYS * 24.0 * 60.0 * 60.0 * 1000.0;
const YEAR_MINUTES: f64 = YEAR_DAYS * 24.0 * 60.0;
const DEFAULT_ROLLING_WINDOW: usize = 20;
const DEFAULT_HISTOGRAM_BINS: usize = 12;
const DEFAULT_PERSISTED_SERIES_POINTS: usize = 400;

#[derive(Clone)]
struct MetricPoint {
    bar_index: usize,
    bar_time: Option<String>,
    time_ms: Option<i64>,
    equity: f64,
    drawdown: f64,
}

#[derive(Clone)]
struct ReturnPoint {
    bar_index: usize,
    bar_time: Option<String>,
    value: f64,
}

struct TradeStats {
    trade_pnl: Vec<f64>,
    total_cost: f64,
    total_fee: f64,
    total_tax: f64,
    total_slippage: f64,
}

fn parse_time_ms(value: Option<&str>) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value.unwrap_or(""))
        .ok()
        .map(|date| date.timestamp_millis())
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

fn variance(values: &[f64], sample: bool) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    let avg = mean(values);
    let divisor = if sample {
        values.len() - 1
    } else {
        values.len()
    } as f64;
    values
        .iter()
        .map(|value| (value - avg).powi(2))
        .sum::<f64>()
        / divisor
}

fn standard_deviation(values: &[f64], sample: bool) -> f64 {
    variance(values, sample).max(0.0).sqrt()
}

fn percentile(values: &[f64], probability: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut ordered = values.to_vec();
    ordered.sort_by(|left, right| left.total_cmp(right));
    let position = ((probability * ordered.len() as f64).ceil() as isize - 1)
        .clamp(0, ordered.len() as isize - 1) as usize;
    ordered[position]
}

fn compound_return(values: &[f64]) -> f64 {
    values
        .iter()
        .fold(1.0, |product, value| product * (1.0 + value))
        - 1.0
}

fn annualized_arithmetic_return(values: &[f64], periods_per_year: f64) -> f64 {
    mean(values) * periods_per_year
}

fn annualized_geometric_return(
    total_return: f64,
    period_count: usize,
    periods_per_year: f64,
) -> f64 {
    if period_count == 0 || 1.0 + total_return <= 0.0 {
        0.0
    } else {
        (1.0 + total_return).powf(periods_per_year / period_count as f64) - 1.0
    }
}

fn normalize_metric_points(
    equity_curve: &[BacktestEquityPoint],
    initial_capital: f64,
) -> Vec<MetricPoint> {
    let mut points: Vec<MetricPoint> = equity_curve
        .iter()
        .filter(|point| point.equity.is_finite())
        .map(|point| MetricPoint {
            bar_index: point.bar_index,
            bar_time: if point.bar_time.trim().is_empty() {
                None
            } else {
                Some(point.bar_time.clone())
            },
            time_ms: parse_time_ms(Some(&point.bar_time)),
            equity: point.equity,
            drawdown: point.drawdown.max(0.0),
        })
        .collect();
    points.sort_by_key(|point| point.bar_index);
    let mut peak = if initial_capital > METRIC_EPSILON {
        initial_capital
    } else {
        points.first().map(|point| point.equity).unwrap_or(0.0)
    };
    for point in &mut points {
        peak = peak.max(point.equity);
        let computed = if peak > METRIC_EPSILON {
            ((peak - point.equity) / peak).max(0.0)
        } else {
            0.0
        };
        point.drawdown = point.drawdown.max(computed);
    }
    points
}

fn build_metric_returns(points: &[MetricPoint]) -> Vec<ReturnPoint> {
    points
        .windows(2)
        .map(|window| {
            let previous = &window[0];
            let current = &window[1];
            ReturnPoint {
                bar_index: current.bar_index,
                bar_time: current.bar_time.clone(),
                value: if previous.equity.abs() > METRIC_EPSILON {
                    current.equity / previous.equity - 1.0
                } else {
                    0.0
                },
            }
        })
        .collect()
}

fn resolve_metric_periods_per_year(points: &[MetricPoint], timeframe: &str) -> f64 {
    let timed: Vec<&MetricPoint> = points
        .iter()
        .filter(|point| point.time_ms.is_some())
        .collect();
    if timed.len() >= 2 {
        let first = timed.first().and_then(|point| point.time_ms).unwrap_or(0);
        let last = timed.last().and_then(|point| point.time_ms).unwrap_or(0);
        let elapsed_years = (last - first) as f64 / YEAR_MS;
        if elapsed_years > METRIC_EPSILON {
            return ((timed.len() - 1) as f64 / elapsed_years).max(1.0);
        }
    }
    match timeframe.trim().to_ascii_lowercase().as_str() {
        "1m" => YEAR_MINUTES,
        "5m" => YEAR_MINUTES / 5.0,
        "1h" => YEAR_MINUTES / 60.0,
        "1d" => YEAR_MINUTES / (24.0 * 60.0),
        _ => 252.0,
    }
}

fn downside_deviation(returns: &[f64], risk_free_rate: f64, periods_per_year: f64) -> (f64, f64) {
    if returns.is_empty() {
        return (0.0, 0.0);
    }
    let period_risk_free = (1.0 + risk_free_rate).powf(1.0 / periods_per_year) - 1.0;
    let squares: Vec<f64> = returns
        .iter()
        .map(|value| (value - period_risk_free).min(0.0).powi(2))
        .collect();
    let period = mean(&squares).sqrt();
    (period, period * periods_per_year.sqrt())
}

fn max_drawdown_duration(drawdowns: &[f64]) -> usize {
    let mut current = 0usize;
    let mut maximum = 0usize;
    for drawdown in drawdowns {
        if *drawdown > METRIC_EPSILON {
            current += 1;
            maximum = maximum.max(current);
        } else {
            current = 0;
        }
    }
    maximum
}

fn compute_shape(values: &[f64]) -> (f64, f64) {
    if values.len() < 2 {
        return (0.0, 0.0);
    }
    let avg = mean(values);
    let population_std = standard_deviation(values, false);
    if population_std <= METRIC_EPSILON {
        return (0.0, 0.0);
    }
    let mut third = 0.0;
    let mut fourth = 0.0;
    for value in values {
        let z = (value - avg) / population_std;
        third += z.powi(3);
        fourth += z.powi(4);
    }
    (
        third / values.len() as f64,
        fourth / values.len() as f64 - 3.0,
    )
}

fn build_histogram(values: &[f64]) -> Vec<serde_json::Value> {
    if values.is_empty() {
        return Vec::new();
    }
    let min = values.iter().copied().fold(f64::INFINITY, f64::min);
    let max = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    if (max - min).abs() <= METRIC_EPSILON {
        return vec![json!({ "min": min, "max": max, "mid": min, "count": values.len() })];
    }
    let bin_count =
        DEFAULT_HISTOGRAM_BINS.min(4usize.max((values.len() as f64).sqrt().ceil() as usize));
    let step = (max - min) / bin_count as f64;
    let mut counts = vec![0usize; bin_count];
    for value in values {
        let index =
            (((value - min) / step).floor() as isize).clamp(0, bin_count as isize - 1) as usize;
        counts[index] += 1;
    }
    (0..bin_count)
        .map(|index| {
            json!({
                "min": min + index as f64 * step,
                "max": if index + 1 == bin_count { max } else { min + (index + 1) as f64 * step },
                "mid": min + (index as f64 + 0.5) * step,
                "count": counts[index],
            })
        })
        .collect()
}

fn compute_trade_stats(fills: &[BacktestFill]) -> TradeStats {
    let mut ordered = fills.to_vec();
    ordered.sort_by(|left, right| {
        left.fill_index
            .cmp(&right.fill_index)
            .then_with(|| left.fill_time.cmp(&right.fill_time))
    });
    let mut position_qty: f64 = 0.0;
    let mut avg_cost = 0.0;
    let mut open_cost = 0.0;
    let mut trade_pnl = Vec::new();
    let mut total_fee = 0.0;
    let mut total_tax = 0.0;
    let mut total_slippage = 0.0;
    for fill in &ordered {
        total_fee += fill.fee.max(0.0);
        total_tax += fill.tax.max(0.0);
        total_slippage += fill.slippage.max(0.0);
        if fill.qty <= METRIC_EPSILON || fill.price <= METRIC_EPSILON {
            continue;
        }
        let multiplier = if fill.gross.abs() > METRIC_EPSILON {
            fill.gross.abs() / (fill.qty * fill.price).max(METRIC_EPSILON)
        } else {
            1.0
        };
        let signed_qty = match fill.side {
            Side::Buy => fill.qty,
            Side::Sell => -fill.qty,
        };
        let cost = fill.fee.max(0.0) + fill.tax.max(0.0) + fill.slippage.max(0.0);
        let previous_qty = position_qty;
        if previous_qty.abs() <= METRIC_EPSILON || previous_qty.signum() == signed_qty.signum() {
            let next_qty = previous_qty + signed_qty;
            avg_cost = if next_qty.abs() > METRIC_EPSILON {
                (previous_qty.abs() * avg_cost + signed_qty.abs() * fill.price) / next_qty.abs()
            } else {
                0.0
            };
            position_qty = next_qty;
            open_cost = (open_cost + cost).max(0.0);
            continue;
        }
        let closed_qty = previous_qty.abs().min(signed_qty.abs());
        let entry_cost = open_cost * closed_qty / previous_qty.abs();
        let close_cost = cost
            * if fill.qty.abs() > METRIC_EPSILON {
                closed_qty / fill.qty
            } else {
                0.0
            };
        let pnl = if previous_qty > 0.0 {
            (fill.price - avg_cost) * closed_qty * multiplier - entry_cost - close_cost
        } else {
            (avg_cost - fill.price) * closed_qty * multiplier - entry_cost - close_cost
        };
        trade_pnl.push(pnl);
        let remaining = previous_qty + signed_qty;
        if remaining.abs() <= METRIC_EPSILON {
            position_qty = 0.0;
            avg_cost = 0.0;
            open_cost = 0.0;
        } else if remaining.signum() == previous_qty.signum() {
            position_qty = remaining;
            open_cost = (open_cost - entry_cost).max(0.0);
        } else {
            position_qty = remaining;
            avg_cost = fill.price;
            open_cost = (cost - close_cost).max(0.0);
        }
    }
    TradeStats {
        trade_pnl,
        total_cost: total_fee + total_tax + total_slippage,
        total_fee,
        total_tax,
        total_slippage,
    }
}

fn compute_streaks(trade_pnl: &[f64]) -> (usize, usize) {
    let mut win_streak = 0usize;
    let mut loss_streak = 0usize;
    let mut max_wins = 0usize;
    let mut max_losses = 0usize;
    for pnl in trade_pnl {
        if *pnl > METRIC_EPSILON {
            win_streak += 1;
            loss_streak = 0;
            max_wins = max_wins.max(win_streak);
        } else if *pnl < -METRIC_EPSILON {
            loss_streak += 1;
            win_streak = 0;
            max_losses = max_losses.max(loss_streak);
        } else {
            win_streak = 0;
            loss_streak = 0;
        }
    }
    (max_wins, max_losses)
}

fn compute_exposure(points: &[MetricPoint], fills: &[BacktestFill]) -> f64 {
    if points.len() < 2 {
        return 0.0;
    }
    let mut fills_by_index: HashMap<usize, Vec<&BacktestFill>> = HashMap::new();
    for fill in fills {
        fills_by_index
            .entry(fill.fill_index)
            .or_default()
            .push(fill);
    }
    let mut position_qty: f64 = 0.0;
    let mut exposed_periods = 0usize;
    for point in points.iter().take(points.len() - 1) {
        if let Some(point_fills) = fills_by_index.get(&point.bar_index) {
            for fill in point_fills {
                position_qty += match fill.side {
                    Side::Buy => fill.qty,
                    Side::Sell => -fill.qty,
                };
            }
        }
        if position_qty.abs() > METRIC_EPSILON {
            exposed_periods += 1;
        }
    }
    exposed_periods as f64 / (points.len() - 1) as f64
}

fn build_rolling_series(
    returns: &[ReturnPoint],
    periods_per_year: f64,
    risk_free_rate: f64,
) -> (Vec<serde_json::Value>, Vec<serde_json::Value>) {
    let period_risk_free = (1.0 + risk_free_rate).powf(1.0 / periods_per_year) - 1.0;
    let mut rolling_sharpe = Vec::new();
    let mut rolling_volatility = Vec::new();
    for index in 0..returns.len() {
        let item = &returns[index];
        let start = index.saturating_sub(DEFAULT_ROLLING_WINDOW - 1);
        let sample: Vec<f64> = returns[start..=index]
            .iter()
            .map(|point| point.value)
            .collect();
        let volatility = if sample.len() >= 2 {
            standard_deviation(&sample, true) * periods_per_year.sqrt()
        } else {
            0.0
        };
        let sharpe = if volatility > METRIC_EPSILON {
            let excess: Vec<f64> = sample
                .iter()
                .map(|value| value - period_risk_free)
                .collect();
            mean(&excess) / standard_deviation(&sample, true) * periods_per_year.sqrt()
        } else {
            0.0
        };
        rolling_sharpe.push(json!({
            "barIndex": item.bar_index,
            "barTime": item.bar_time,
            "value": if sample.len() >= 2 { Some(sharpe) } else { None },
        }));
        rolling_volatility.push(json!({
            "barIndex": item.bar_index,
            "barTime": item.bar_time,
            "value": if sample.len() >= 2 { Some(volatility) } else { None },
        }));
    }
    (rolling_sharpe, rolling_volatility)
}

fn compute_monthly_returns(returns: &[ReturnPoint]) -> Vec<serde_json::Value> {
    let mut grouped: HashMap<(i32, u32), Vec<f64>> = HashMap::new();
    for item in returns {
        let Some(timestamp) = parse_time_ms(item.bar_time.as_deref()) else {
            continue;
        };
        let Some(date) = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(timestamp) else {
            continue;
        };
        grouped
            .entry((
                date.format("%Y").to_string().parse::<i32>().unwrap_or(1970),
                date.format("%m").to_string().parse::<u32>().unwrap_or(1),
            ))
            .or_default()
            .push(item.value);
    }
    let mut entries: Vec<((i32, u32), Vec<f64>)> = grouped.into_iter().collect();
    entries.sort_by_key(|((year, month), _)| (*year, *month));
    entries
        .into_iter()
        .map(|((year, month), values)| {
            json!({
                "year": year,
                "month": month,
                "value": compound_return(&values),
            })
        })
        .collect()
}

fn downsample_json_series(
    values: Vec<serde_json::Value>,
    target: usize,
) -> (Vec<serde_json::Value>, bool) {
    let normalized = target.max(2);
    if values.len() <= normalized {
        return (values, false);
    }
    let last_index = values.len() - 1;
    let denominator = normalized - 1;
    let sampled = (0..normalized)
        .map(|index| {
            let source_index = ((index * last_index) as f64 / denominator as f64).round() as usize;
            values[source_index].clone()
        })
        .collect();
    (sampled, true)
}

pub(super) fn compute_persisted_metrics(
    config: &BacktestConfig,
    instrument: &BacktestInstrument,
    equity_curve: &[BacktestEquityPoint],
    fills: &[BacktestFill],
    state: &PositionState,
) -> serde_json::Value {
    let initial_capital = config.initial_capital.max(0.0);
    let points = normalize_metric_points(equity_curve, initial_capital);
    let returns = build_metric_returns(&points);
    let return_values: Vec<f64> = returns
        .iter()
        .map(|point| point.value)
        .filter(|value| value.is_finite())
        .collect();
    let periods_per_year = resolve_metric_periods_per_year(&points, &instrument.base_timeframe);
    let risk_free_rate: f64 = 0.0;
    let final_equity = points
        .last()
        .map(|point| point.equity)
        .unwrap_or(initial_capital);
    let total_return = if initial_capital > METRIC_EPSILON {
        final_equity / initial_capital - 1.0
    } else {
        0.0
    };
    let annualized_return = annualized_arithmetic_return(&return_values, periods_per_year);
    let cagr = annualized_geometric_return(total_return, return_values.len(), periods_per_year);
    let return_std = standard_deviation(&return_values, true);
    let annual_volatility = return_std * periods_per_year.sqrt();
    let period_risk_free = (1.0 + risk_free_rate).powf(1.0 / periods_per_year) - 1.0;
    let excess_returns: Vec<f64> = return_values
        .iter()
        .map(|value| value - period_risk_free)
        .collect();
    let sharpe = if return_std > METRIC_EPSILON {
        mean(&excess_returns) / return_std * periods_per_year.sqrt()
    } else {
        0.0
    };
    let (downside_period, downside_annualized) =
        downside_deviation(&return_values, risk_free_rate, periods_per_year);
    let sortino = if downside_period > METRIC_EPSILON {
        mean(&excess_returns) / downside_period * periods_per_year.sqrt()
    } else {
        0.0
    };
    let drawdowns: Vec<f64> = points.iter().map(|point| point.drawdown).collect();
    let max_drawdown = drawdowns.iter().copied().fold(0.0, f64::max);
    let positive_drawdowns: Vec<f64> = drawdowns
        .iter()
        .copied()
        .filter(|value| *value > METRIC_EPSILON)
        .collect();
    let ulcer_index = mean(
        &drawdowns
            .iter()
            .map(|value| value.powi(2))
            .collect::<Vec<_>>(),
    )
    .sqrt();
    let trade_stats = compute_trade_stats(fills);
    let wins: Vec<f64> = trade_stats
        .trade_pnl
        .iter()
        .copied()
        .filter(|value| *value > METRIC_EPSILON)
        .collect();
    let losses: Vec<f64> = trade_stats
        .trade_pnl
        .iter()
        .copied()
        .filter(|value| *value < -METRIC_EPSILON)
        .collect();
    let gross_profit: f64 = wins.iter().sum();
    let gross_loss: f64 = losses.iter().sum::<f64>().abs();
    let (profit_factor, profit_factor_state) = if gross_loss > METRIC_EPSILON {
        (json!(gross_profit / gross_loss), "FINITE")
    } else if gross_profit > METRIC_EPSILON {
        (serde_json::Value::Null, "POSITIVE_INFINITY")
    } else {
        (serde_json::Value::Null, "NOT_AVAILABLE")
    };
    let (payoff_ratio, payoff_ratio_state) = if !losses.is_empty() {
        (json!(mean(&wins) / mean(&losses).abs()), "FINITE")
    } else if !wins.is_empty() {
        (serde_json::Value::Null, "POSITIVE_INFINITY")
    } else {
        (serde_json::Value::Null, "NOT_AVAILABLE")
    };
    let total_trades = if state.closed_trades > 0 {
        state.closed_trades
    } else {
        trade_stats.trade_pnl.len()
    };
    let winning_trades = if state.closed_trades > 0 {
        state.winning_trades
    } else {
        wins.len()
    };
    let (max_wins, max_losses) = compute_streaks(&trade_stats.trade_pnl);
    let (skewness, kurtosis) = compute_shape(&return_values);
    let best_period = returns
        .iter()
        .max_by(|left, right| left.value.total_cmp(&right.value))
        .map(|point| json!({ "barIndex": point.bar_index, "barTime": point.bar_time, "value": point.value }))
        .unwrap_or(serde_json::Value::Null);
    let worst_period = returns
        .iter()
        .min_by(|left, right| left.value.total_cmp(&right.value))
        .map(|point| json!({ "barIndex": point.bar_index, "barTime": point.bar_time, "value": point.value }))
        .unwrap_or(serde_json::Value::Null);
    let returns_series: Vec<serde_json::Value> = returns
        .iter()
        .map(|point| json!({ "barIndex": point.bar_index, "barTime": point.bar_time, "value": point.value }))
        .collect();
    let drawdown_series: Vec<serde_json::Value> = points
        .iter()
        .map(|point| json!({ "barIndex": point.bar_index, "barTime": point.bar_time, "value": -point.drawdown.abs() }))
        .collect();
    let (rolling_sharpe, rolling_volatility) =
        build_rolling_series(&returns, periods_per_year, risk_free_rate);
    let (returns_series, returns_sampled) =
        downsample_json_series(returns_series, DEFAULT_PERSISTED_SERIES_POINTS);
    let (drawdown_series, drawdown_sampled) =
        downsample_json_series(drawdown_series, DEFAULT_PERSISTED_SERIES_POINTS);
    let (rolling_sharpe, rolling_sharpe_sampled) =
        downsample_json_series(rolling_sharpe, DEFAULT_PERSISTED_SERIES_POINTS);
    let (rolling_volatility, rolling_volatility_sampled) =
        downsample_json_series(rolling_volatility, DEFAULT_PERSISTED_SERIES_POINTS);
    let series_sampled =
        returns_sampled || drawdown_sampled || rolling_sharpe_sampled || rolling_volatility_sampled;
    json!({
        "periodsPerYear": periods_per_year,
        "sampled": false,
        "seriesSampled": series_sampled,
        "exact": true,
        "returns": {
            "totalReturn": total_return,
            "CAGR": cagr,
            "annualizedReturn": annualized_return,
        },
        "risk": {
            "annualVolatility": annual_volatility,
            "sharpe": sharpe,
            "sortino": sortino,
            "calmar": if max_drawdown > METRIC_EPSILON { cagr / max_drawdown } else { 0.0 },
            "downsideDeviation": downside_annualized,
            "VaR95": percentile(&return_values, 0.05),
            "maxDrawdown": max_drawdown,
            "avgDrawdown": mean(&positive_drawdowns),
            "maxDrawdownDuration": max_drawdown_duration(&drawdowns),
            "ulcerIndex": ulcer_index,
            "sampled": false,
        },
        "trades": {
            "totalTrades": total_trades,
            "winRate": if total_trades > 0 { winning_trades as f64 / total_trades as f64 } else { 0.0 },
            "profitFactor": profit_factor,
            "profitFactorState": profit_factor_state,
            "payoffRatio": payoff_ratio,
            "payoffRatioState": payoff_ratio_state,
            "grossProfit": gross_profit,
            "grossLoss": gross_loss,
            "expectancy": mean(&trade_stats.trade_pnl),
            "avgWin": mean(&wins),
            "avgLoss": mean(&losses),
            "largestWin": wins.iter().copied().fold(0.0, f64::max),
            "largestLoss": losses.iter().copied().fold(0.0, f64::min),
            "maxConsecutiveWins": max_wins,
            "maxConsecutiveLosses": max_losses,
            "exposure": compute_exposure(&points, fills),
            "totalCost": trade_stats.total_cost,
            "totalFee": trade_stats.total_fee,
            "totalTax": trade_stats.total_tax,
            "totalSlippage": trade_stats.total_slippage,
            "realizedPnl": state.realized_pnl,
        },
        "distribution": {
            "histogram": build_histogram(&return_values),
            "skewness": skewness,
            "kurtosis": kurtosis,
            "bestPeriod": best_period,
            "worstPeriod": worst_period,
        },
        "series": {
            "returns": returns_series,
            "drawdown": drawdown_series,
            "rollingSharpe": rolling_sharpe,
            "rollingVolatility": rolling_volatility,
            "monthly": compute_monthly_returns(&returns),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::annualized_arithmetic_return;

    #[test]
    fn annualized_arithmetic_return_is_gross() {
        let period_returns = [0.01, 0.03];

        assert!((annualized_arithmetic_return(&period_returns, 12.0) - 0.24).abs() < 1e-12);
    }
}
