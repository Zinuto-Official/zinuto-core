// SPDX-License-Identifier: GPL-3.0-only

use std::fs;
use std::io::{self, Read};

use serde::{Deserialize, Serialize};
use zinuto_core_backtest_engine::{
    evaluate_compiled_signal_plan, run_batch_engine, run_engine, BacktestBatchEngineRequest,
    BacktestConflict, BacktestSignal, CompiledBacktestSignalPlan, EngineRequest, OhlcvBar,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CliMode {
    Single,
    Batch,
    SignalPlan,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignalPlanRequest {
    semantics_version: String,
    plan: CompiledBacktestSignalPlan,
    bars: Vec<OhlcvBar>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SignalPlanResponse {
    semantics_version: String,
    signals: Vec<BacktestSignal>,
    conflicts: Vec<BacktestConflict>,
}

fn read_input() -> Result<(CliMode, String), String> {
    let mut args = std::env::args().skip(1);
    let mut mode = CliMode::Single;
    let mut input_path: Option<String> = None;
    if let Some(flag) = args.next() {
        match flag.as_str() {
            "--batch" => {
                mode = CliMode::Batch;
                if let Some(next_flag) = args.next() {
                    if next_flag != "--input" {
                        return Err(format!("unsupported argument: {next_flag}"));
                    }
                    input_path = Some(
                        args.next()
                            .ok_or_else(|| "--input requires a path".to_string())?,
                    );
                }
            }
            "--input" => {
                input_path = Some(
                    args.next()
                        .ok_or_else(|| "--input requires a path".to_string())?,
                );
            }
            "--signal-plan" => {
                mode = CliMode::SignalPlan;
                if let Some(next_flag) = args.next() {
                    if next_flag != "--input" {
                        return Err(format!("unsupported argument: {next_flag}"));
                    }
                    input_path = Some(
                        args.next()
                            .ok_or_else(|| "--input requires a path".to_string())?,
                    );
                }
            }
            _ => {
                return Err(format!("unsupported argument: {flag}"));
            }
        }
    }
    if let Some(path) = input_path {
        return fs::read_to_string(path)
            .map(|input| (mode, input))
            .map_err(|error| error.to_string());
    }
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| error.to_string())?;
    Ok((mode, input))
}

fn run() -> Result<(), String> {
    let (mode, input) = read_input()?;
    let output = match mode {
        CliMode::Single => {
            let request: EngineRequest =
                serde_json::from_str(&input).map_err(|error| error.to_string())?;
            let response = run_engine(request);
            serde_json::to_string(&response).map_err(|error| error.to_string())?
        }
        CliMode::Batch => {
            let request: BacktestBatchEngineRequest =
                serde_json::from_str(&input).map_err(|error| error.to_string())?;
            let response = run_batch_engine(request).map_err(|error| error.to_string())?;
            serde_json::to_string(&response).map_err(|error| error.to_string())?
        }
        CliMode::SignalPlan => {
            let request: SignalPlanRequest =
                serde_json::from_str(&input).map_err(|error| error.to_string())?;
            if request.semantics_version != "backtest-evaluator-v1" {
                return Err(format!(
                    "BACKTEST_NATIVE_SIGNAL_PLAN_UNSUPPORTED: semantics version {}",
                    request.semantics_version
                ));
            }
            let (signals, conflicts) = evaluate_compiled_signal_plan(&request.plan, &request.bars)
                .map_err(|error| error.to_string())?;
            serde_json::to_string(&SignalPlanResponse {
                semantics_version: request.semantics_version,
                signals,
                conflicts,
            })
            .map_err(|error| error.to_string())?
        }
    };
    println!("{output}");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
