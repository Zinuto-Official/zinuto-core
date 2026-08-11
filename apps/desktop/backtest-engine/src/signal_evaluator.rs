// SPDX-License-Identifier: GPL-3.0-only

use std::collections::HashMap;

use super::{
    AstExpression, BacktestConflict, BacktestEngineError, BacktestSignal,
    CompiledBacktestSignalPlan, OhlcvBar,
};

#[derive(Debug, Clone)]
enum SignalValue {
    Scalar(f64),
    Series(Vec<f64>),
    Text(String),
}

#[derive(Debug, Default)]
struct SignalEvalState {
    variables: HashMap<String, SignalValue>,
    outputs: HashMap<String, SignalValue>,
    len: usize,
}

fn normalize_key(value: &str) -> String {
    value.trim().to_uppercase()
}

fn value_to_series(value: &SignalValue, len: usize) -> Vec<f64> {
    match value {
        SignalValue::Scalar(value) => vec![*value; len],
        SignalValue::Series(values) => {
            let mut output = vec![f64::NAN; len];
            for (index, value) in values.iter().enumerate().take(len) {
                output[index] = *value;
            }
            output
        }
        SignalValue::Text(value) => {
            let numeric = value.parse::<f64>().unwrap_or(f64::NAN);
            vec![numeric; len]
        }
    }
}

fn value_at(value: &SignalValue, index: usize, fallback: f64) -> f64 {
    let raw = match value {
        SignalValue::Scalar(value) => *value,
        SignalValue::Series(values) => values.get(index).copied().unwrap_or(fallback),
        SignalValue::Text(value) => value.parse::<f64>().unwrap_or(fallback),
    };
    if raw.is_finite() {
        raw
    } else {
        fallback
    }
}

fn integer_at(
    value: &SignalValue,
    index: usize,
    fallback: f64,
    minimum: usize,
    allow_zero: bool,
    absolute: bool,
) -> usize {
    let raw = value_at(value, index, fallback);
    let normalized = if absolute { raw.abs() } else { raw };
    let floored = normalized.floor();
    if allow_zero && floored == 0.0 {
        return 0;
    }
    if !floored.is_finite() || floored < minimum as f64 {
        minimum
    } else {
        floored as usize
    }
}

fn binary_numeric_op<FScalar, FSeries>(
    left: SignalValue,
    right: SignalValue,
    len: usize,
    scalar_op: FScalar,
    series_op: FSeries,
) -> SignalValue
where
    FScalar: Fn(f64, f64) -> f64,
    FSeries: Fn(f64, f64) -> f64,
{
    match (&left, &right) {
        (SignalValue::Scalar(left_value), SignalValue::Scalar(right_value)) => {
            SignalValue::Scalar(scalar_op(*left_value, *right_value))
        }
        _ => {
            let left_series = value_to_series(&left, len);
            let right_series = value_to_series(&right, len);
            SignalValue::Series(
                left_series
                    .iter()
                    .zip(right_series.iter())
                    .map(|(left_value, right_value)| series_op(*left_value, *right_value))
                    .collect(),
            )
        }
    }
}

fn truthy(value: f64) -> bool {
    value.is_finite() && value.abs() > 1e-12
}

fn eval_binary(
    operator: &str,
    left: SignalValue,
    right: SignalValue,
    len: usize,
) -> Result<SignalValue, BacktestEngineError> {
    let op = normalize_key(operator);
    let value = match op.as_str() {
        "+" => binary_numeric_op(left, right, len, |a, b| a + b, |a, b| a + b),
        "-" => binary_numeric_op(left, right, len, |a, b| a - b, |a, b| a - b),
        "*" => binary_numeric_op(left, right, len, |a, b| a * b, |a, b| a * b),
        "/" => binary_numeric_op(
            left,
            right,
            len,
            |a, b| {
                if a.is_finite() && b.is_finite() && b != 0.0 {
                    a / b
                } else {
                    f64::NAN
                }
            },
            |a, b| {
                if a.is_finite() && b.is_finite() && b != 0.0 {
                    a / b
                } else {
                    f64::NAN
                }
            },
        ),
        "%" => binary_numeric_op(
            left,
            right,
            len,
            |a, b| {
                if a.is_finite() && b.is_finite() && b != 0.0 {
                    a % b
                } else {
                    f64::NAN
                }
            },
            |a, b| {
                if a.is_finite() && b.is_finite() && b != 0.0 {
                    a % b
                } else {
                    f64::NAN
                }
            },
        ),
        "^" => binary_numeric_op(left, right, len, |a, b| a.powf(b), |a, b| a.powf(b)),
        ">" => binary_numeric_op(
            left,
            right,
            len,
            |a, b| (a > b) as i32 as f64,
            |a, b| (a > b) as i32 as f64,
        ),
        ">=" => binary_numeric_op(
            left,
            right,
            len,
            |a, b| (a >= b) as i32 as f64,
            |a, b| (a >= b) as i32 as f64,
        ),
        "<" => binary_numeric_op(
            left,
            right,
            len,
            |a, b| (a < b) as i32 as f64,
            |a, b| (a < b) as i32 as f64,
        ),
        "<=" => binary_numeric_op(
            left,
            right,
            len,
            |a, b| (a <= b) as i32 as f64,
            |a, b| (a <= b) as i32 as f64,
        ),
        "==" => binary_numeric_op(
            left,
            right,
            len,
            |a, b| (a.is_finite() && b.is_finite() && a == b) as i32 as f64,
            |a, b| (a.is_finite() && b.is_finite() && a == b) as i32 as f64,
        ),
        "!=" => binary_numeric_op(
            left,
            right,
            len,
            |a, b| (a.is_finite() && b.is_finite() && a != b) as i32 as f64,
            |a, b| (a.is_finite() && b.is_finite() && a != b) as i32 as f64,
        ),
        "AND" => binary_numeric_op(
            left,
            right,
            len,
            |a, b| (truthy(a) && truthy(b)) as i32 as f64,
            |a, b| (truthy(a) && truthy(b)) as i32 as f64,
        ),
        "OR" => binary_numeric_op(
            left,
            right,
            len,
            |a, b| (truthy(a) || truthy(b)) as i32 as f64,
            |a, b| (truthy(a) || truthy(b)) as i32 as f64,
        ),
        _ => {
            return Err(BacktestEngineError::UnsupportedSignalPlan(format!(
                "operator {operator}"
            )))
        }
    };
    Ok(value)
}

fn series_ref(input: &[f64], period: &SignalValue) -> Vec<f64> {
    let mut output = vec![f64::NAN; input.len()];
    for (index, output_value) in output.iter_mut().enumerate() {
        let offset = integer_at(period, index, 1.0, 0, true, true);
        if let Some(source_index) = index.checked_sub(offset) {
            let value = input[source_index];
            *output_value = if value.is_finite() { value } else { f64::NAN };
        }
    }
    output
}

fn rolling_ma(input: &[f64], period: &SignalValue) -> Vec<f64> {
    let mut output = vec![f64::NAN; input.len()];
    let mut sum_prefix = vec![0.0; input.len() + 1];
    let mut invalid_prefix = vec![0usize; input.len() + 1];
    for index in 0..input.len() {
        sum_prefix[index + 1] = sum_prefix[index]
            + if input[index].is_finite() {
                input[index]
            } else {
                0.0
            };
        invalid_prefix[index + 1] = invalid_prefix[index] + (!input[index].is_finite()) as usize;
    }
    for index in 0..input.len() {
        let window = integer_at(period, index, 1.0, 1, true, true);
        let start = if window == 0 {
            0
        } else if window <= index + 1 {
            index + 1 - window
        } else {
            continue;
        };
        if invalid_prefix[index + 1] == invalid_prefix[start] {
            let count = index + 1 - start;
            if count > 0 {
                output[index] = (sum_prefix[index + 1] - sum_prefix[start]) / count as f64;
            }
        }
    }
    output
}

fn rolling_sum(input: &[f64], period: &SignalValue) -> Vec<f64> {
    let mut output = vec![f64::NAN; input.len()];
    let mut sum_prefix = vec![0.0; input.len() + 1];
    let mut invalid_prefix = vec![0usize; input.len() + 1];
    for index in 0..input.len() {
        sum_prefix[index + 1] = sum_prefix[index]
            + if input[index].is_finite() {
                input[index]
            } else {
                0.0
            };
        invalid_prefix[index + 1] = invalid_prefix[index] + (!input[index].is_finite()) as usize;
    }
    for index in 0..input.len() {
        let window = integer_at(period, index, 1.0, 1, true, true);
        let start = if window == 0 {
            0
        } else if window <= index + 1 {
            index + 1 - window
        } else {
            continue;
        };
        if invalid_prefix[index + 1] == invalid_prefix[start] {
            output[index] = sum_prefix[index + 1] - sum_prefix[start];
        }
    }
    output
}

fn rolling_extreme(input: &[f64], period: &SignalValue, high: bool) -> Vec<f64> {
    let mut output = vec![f64::NAN; input.len()];
    for index in 0..input.len() {
        let window = integer_at(period, index, 1.0, 1, true, true);
        let start = if window == 0 {
            0
        } else if window <= index + 1 {
            index + 1 - window
        } else {
            continue;
        };
        let mut best = if high {
            f64::NEG_INFINITY
        } else {
            f64::INFINITY
        };
        let mut valid = true;
        for value in &input[start..=index] {
            if !value.is_finite() {
                valid = false;
                break;
            }
            best = if high {
                best.max(*value)
            } else {
                best.min(*value)
            };
        }
        output[index] = if valid && best.is_finite() {
            best
        } else {
            f64::NAN
        };
    }
    output
}

fn ema(input: &[f64], period: &SignalValue) -> Vec<f64> {
    let mut output = vec![f64::NAN; input.len()];
    let mut previous: Option<f64> = None;
    for (index, value) in input.iter().enumerate() {
        let window = integer_at(period, index, 1.0, 1, false, true) as f64;
        let alpha = 2.0 / (window + 1.0);
        if !value.is_finite() {
            output[index] = previous.unwrap_or(f64::NAN);
            continue;
        }
        let next = previous
            .map(|prev| alpha * *value + (1.0 - alpha) * prev)
            .unwrap_or(*value);
        output[index] = next;
        previous = Some(next);
    }
    output
}

fn sma(input: &[f64], period: &SignalValue, weight: &SignalValue) -> Vec<f64> {
    let mut output = vec![f64::NAN; input.len()];
    let mut previous: Option<f64> = None;
    for (index, value) in input.iter().enumerate() {
        let n = integer_at(period, index, 1.0, 1, false, true) as f64;
        let m = integer_at(weight, index, 1.0, 0, true, false).min(n as usize) as f64;
        if !value.is_finite() {
            output[index] = f64::NAN;
            previous = None;
            continue;
        }
        let next = previous
            .map(|prev| (m * *value + (n - m) * prev) / n)
            .unwrap_or(*value);
        output[index] = next;
        previous = Some(next);
    }
    output
}

fn cross(left: &[f64], right: &[f64], direction: i32) -> Vec<f64> {
    let mut output = vec![f64::NAN; left.len().min(right.len())];
    for index in 1..output.len() {
        let prev_left = left[index - 1];
        let prev_right = right[index - 1];
        let cur_left = left[index];
        let cur_right = right[index];
        if !prev_left.is_finite()
            || !prev_right.is_finite()
            || !cur_left.is_finite()
            || !cur_right.is_finite()
        {
            output[index] = f64::NAN;
            continue;
        }
        let active = if direction < 0 {
            prev_left >= prev_right && cur_left < cur_right
        } else {
            prev_left <= prev_right && cur_left > cur_right
        };
        output[index] = if active { 1.0 } else { 0.0 };
    }
    output
}

fn eval_function(
    name: &str,
    args: Vec<SignalValue>,
    len: usize,
    _state: &SignalEvalState,
) -> Result<SignalValue, BacktestEngineError> {
    let name = normalize_key(name);
    let numeric = |index: usize, fallback: f64| -> SignalValue {
        args.get(index)
            .cloned()
            .unwrap_or(SignalValue::Scalar(fallback))
    };
    let output = match name.as_str() {
        "REF" | "REFV" => {
            let input = value_to_series(&numeric(0, f64::NAN), len);
            SignalValue::Series(series_ref(&input, &numeric(1, 1.0)))
        }
        "MA" => {
            let input = value_to_series(&numeric(0, f64::NAN), len);
            SignalValue::Series(rolling_ma(&input, &numeric(1, 5.0)))
        }
        "SUM" => {
            let input = value_to_series(&numeric(0, f64::NAN), len);
            SignalValue::Series(rolling_sum(&input, &numeric(1, 5.0)))
        }
        "HHV" => {
            let input = value_to_series(&numeric(0, f64::NAN), len);
            SignalValue::Series(rolling_extreme(&input, &numeric(1, 5.0), true))
        }
        "LLV" => {
            let input = value_to_series(&numeric(0, f64::NAN), len);
            SignalValue::Series(rolling_extreme(&input, &numeric(1, 5.0), false))
        }
        "EMA" | "EXPMA" => {
            let input = value_to_series(&numeric(0, f64::NAN), len);
            SignalValue::Series(ema(&input, &numeric(1, 5.0)))
        }
        "SMA" => {
            let input = value_to_series(&numeric(0, f64::NAN), len);
            SignalValue::Series(sma(&input, &numeric(1, 5.0), &numeric(2, 1.0)))
        }
        "MAX" => binary_numeric_op(
            numeric(0, f64::NAN),
            numeric(1, f64::NAN),
            len,
            |a, b| {
                if a.is_finite() && b.is_finite() {
                    a.max(b)
                } else {
                    f64::NAN
                }
            },
            |a, b| {
                if a.is_finite() && b.is_finite() {
                    a.max(b)
                } else {
                    f64::NAN
                }
            },
        ),
        "MIN" => binary_numeric_op(
            numeric(0, f64::NAN),
            numeric(1, f64::NAN),
            len,
            |a, b| {
                if a.is_finite() && b.is_finite() {
                    a.min(b)
                } else {
                    f64::NAN
                }
            },
            |a, b| {
                if a.is_finite() && b.is_finite() {
                    a.min(b)
                } else {
                    f64::NAN
                }
            },
        ),
        "ABS" => {
            let value = numeric(0, f64::NAN);
            match value {
                SignalValue::Scalar(value) => SignalValue::Scalar(value.abs()),
                _ => SignalValue::Series(
                    value_to_series(&value, len)
                        .into_iter()
                        .map(f64::abs)
                        .collect(),
                ),
            }
        }
        "IF" | "IFF" => {
            let cond = value_to_series(&numeric(0, 0.0), len);
            let then_series = value_to_series(&numeric(1, f64::NAN), len);
            let else_series = value_to_series(&numeric(2, f64::NAN), len);
            SignalValue::Series(
                cond.iter()
                    .enumerate()
                    .map(|(index, value)| {
                        if truthy(*value) {
                            then_series[index]
                        } else {
                            else_series[index]
                        }
                    })
                    .collect(),
            )
        }
        "CROSS" | "CROSSUP" => {
            let left = value_to_series(&numeric(0, f64::NAN), len);
            let right = value_to_series(&numeric(1, f64::NAN), len);
            SignalValue::Series(cross(&left, &right, 1))
        }
        "CROSSDOWN" => {
            let left = value_to_series(&numeric(0, f64::NAN), len);
            let right = value_to_series(&numeric(1, f64::NAN), len);
            SignalValue::Series(cross(&left, &right, -1))
        }
        "NOT" => {
            let input = value_to_series(&numeric(0, 0.0), len);
            SignalValue::Series(
                input
                    .into_iter()
                    .map(|value| (!truthy(value)) as i32 as f64)
                    .collect(),
            )
        }
        "AND" => eval_binary("AND", numeric(0, 0.0), numeric(1, 0.0), len)?,
        "OR" => eval_binary("OR", numeric(0, 0.0), numeric(1, 0.0), len)?,
        "TRUE" => SignalValue::Scalar(1.0),
        "FALSE" => SignalValue::Scalar(0.0),
        "NULL" | "DRAWNULL" => SignalValue::Scalar(f64::NAN),
        _ => {
            return Err(BacktestEngineError::UnsupportedSignalPlan(format!(
                "function {name}"
            )))
        }
    };
    Ok(output)
}

fn eval_expression(
    expression: &AstExpression,
    state: &SignalEvalState,
) -> Result<SignalValue, BacktestEngineError> {
    match expression {
        AstExpression::NumberLiteral { value } => Ok(SignalValue::Scalar(*value)),
        AstExpression::StringLiteral { value } => Ok(SignalValue::Text(value.clone())),
        AstExpression::Identifier { name } => {
            let key = normalize_key(name);
            state
                .variables
                .get(&key)
                .cloned()
                .or_else(|| state.outputs.get(&key).cloned())
                .ok_or_else(|| {
                    BacktestEngineError::UnsupportedSignalPlan(format!("identifier {key}"))
                })
        }
        AstExpression::UnaryExpression { operator, argument } => {
            let value = eval_expression(argument, state)?;
            match normalize_key(operator).as_str() {
                "+" => Ok(value),
                "-" => match value {
                    SignalValue::Scalar(value) => Ok(SignalValue::Scalar(-value)),
                    _ => Ok(SignalValue::Series(
                        value_to_series(&value, state.len)
                            .into_iter()
                            .map(|value| -value)
                            .collect(),
                    )),
                },
                "NOT" => eval_function("NOT", vec![value], state.len, state),
                _ => Err(BacktestEngineError::UnsupportedSignalPlan(format!(
                    "unary operator {operator}"
                ))),
            }
        }
        AstExpression::BinaryExpression {
            operator,
            left,
            right,
        } => {
            let left_value = eval_expression(left, state)?;
            let right_value = eval_expression(right, state)?;
            eval_binary(operator, left_value, right_value, state.len)
        }
        AstExpression::FunctionCall { callee, args } => {
            let values = args
                .iter()
                .map(|arg| eval_expression(arg, state))
                .collect::<Result<Vec<_>, _>>()?;
            eval_function(callee, values, state.len, state)
        }
    }
}

fn build_signal_eval_state(
    bars: &[OhlcvBar],
    parameter_overrides: &HashMap<String, f64>,
) -> SignalEvalState {
    let len = bars.len();
    let mut variables = HashMap::<String, SignalValue>::new();
    let open: Vec<f64> = bars.iter().map(|bar| bar.open).collect();
    let high: Vec<f64> = bars.iter().map(|bar| bar.high).collect();
    let low: Vec<f64> = bars.iter().map(|bar| bar.low).collect();
    let close: Vec<f64> = bars.iter().map(|bar| bar.close).collect();
    let volume: Vec<f64> = bars.iter().map(|bar| bar.volume).collect();
    let amount: Vec<f64> = bars.iter().map(|bar| bar.close * bar.volume).collect();
    for key in ["OPEN", "O"] {
        variables.insert(key.to_string(), SignalValue::Series(open.clone()));
    }
    for key in ["HIGH", "H"] {
        variables.insert(key.to_string(), SignalValue::Series(high.clone()));
    }
    for key in ["LOW", "L"] {
        variables.insert(key.to_string(), SignalValue::Series(low.clone()));
    }
    for key in ["CLOSE", "C"] {
        variables.insert(key.to_string(), SignalValue::Series(close.clone()));
    }
    for key in ["VOL", "V"] {
        variables.insert(key.to_string(), SignalValue::Series(volume.clone()));
    }
    for key in ["AMOUNT", "VOLA"] {
        variables.insert(key.to_string(), SignalValue::Series(amount.clone()));
    }
    variables.insert("TRUE".to_string(), SignalValue::Scalar(1.0));
    variables.insert("FALSE".to_string(), SignalValue::Scalar(0.0));
    variables.insert("NULL".to_string(), SignalValue::Scalar(f64::NAN));
    variables.insert("DRAWNULL".to_string(), SignalValue::Scalar(f64::NAN));
    variables.insert(
        "TOTALBARSCOUNT".to_string(),
        SignalValue::Scalar(len as f64),
    );
    variables.insert(
        "CURRBARSCOUNT".to_string(),
        SignalValue::Series((0..len).map(|index| (len - index) as f64).collect()),
    );
    variables.insert(
        "ISLASTBAR".to_string(),
        SignalValue::Series(
            (0..len)
                .map(|index| (index + 1 == len) as i32 as f64)
                .collect(),
        ),
    );
    for (key, value) in parameter_overrides {
        variables.insert(normalize_key(key), SignalValue::Scalar(*value));
    }
    SignalEvalState {
        variables,
        outputs: HashMap::new(),
        len,
    }
}

fn is_signal_active(value: f64) -> bool {
    value.is_finite() && value.abs() > 1e-12
}

fn derive_signals_from_outputs(
    outputs: &HashMap<String, SignalValue>,
    bar_count: usize,
) -> (Vec<BacktestSignal>, Vec<BacktestConflict>) {
    let series_for = |key: &str| -> Vec<f64> {
        outputs
            .get(key)
            .map(|value| value_to_series(value, bar_count))
            .unwrap_or_else(|| vec![0.0; bar_count])
    };
    let buy_series = series_for("BUY");
    let sell_series = series_for("SELL");
    let short_series = series_for("SHORT");
    let cover_series = series_for("COVER");
    let mut signals = Vec::with_capacity(bar_count);
    let mut conflicts = Vec::new();
    for index in 0..bar_count {
        let mut buy = is_signal_active(buy_series[index]);
        let sell = is_signal_active(sell_series[index]);
        let mut short = is_signal_active(short_series[index]);
        let cover = is_signal_active(cover_series[index]);
        if buy && sell {
            buy = false;
            conflicts.push(BacktestConflict {
                bar_index: index,
                code: "LONG_EXIT_PRIORITY".to_string(),
            });
        }
        if short && cover {
            short = false;
            conflicts.push(BacktestConflict {
                bar_index: index,
                code: "SHORT_EXIT_PRIORITY".to_string(),
            });
        }
        if buy && short {
            buy = false;
            short = false;
            conflicts.push(BacktestConflict {
                bar_index: index,
                code: "ENTRY_SIDE_CONFLICT".to_string(),
            });
        }
        signals.push(BacktestSignal {
            bar_index: index,
            buy,
            sell,
            short,
            cover,
        });
    }
    (signals, conflicts)
}

pub(super) fn evaluate_signal_plan(
    plan: &CompiledBacktestSignalPlan,
    bars: &[OhlcvBar],
) -> Result<(Vec<BacktestSignal>, Vec<BacktestConflict>), BacktestEngineError> {
    if plan.version != 1 {
        return Err(BacktestEngineError::UnsupportedSignalPlan(format!(
            "version {}",
            plan.version
        )));
    }
    if plan.semantics_version != "backtest-evaluator-v1" {
        return Err(BacktestEngineError::UnsupportedSignalPlan(format!(
            "semantics version {}",
            plan.semantics_version
        )));
    }
    let mut state = build_signal_eval_state(bars, &plan.parameter_overrides);
    for statement in &plan.program.body {
        let target = normalize_key(&statement.target);
        if target.is_empty() {
            continue;
        }
        let value = eval_expression(&statement.expression, &state)?;
        if statement.operator.trim() == ":" {
            state.outputs.insert(target.clone(), value.clone());
        }
        state.variables.insert(target, value);
    }
    Ok(derive_signals_from_outputs(&state.outputs, bars.len()))
}
