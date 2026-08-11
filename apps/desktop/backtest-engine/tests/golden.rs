// SPDX-License-Identifier: GPL-3.0-only

use std::process::{Command, Stdio};

#[test]
fn cli_matches_next_open_golden_fixture() {
    let bin = env!("CARGO_BIN_EXE_open-trading-practice-backtest-engine");
    let input = include_str!("../fixtures/next_open_basic.request.json");
    let mut child = Command::new(bin)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn backtest engine");
    {
        use std::io::Write;
        child
            .stdin
            .as_mut()
            .expect("stdin")
            .write_all(input.as_bytes())
            .expect("write fixture");
    }
    let output = child.wait_with_output().expect("wait for engine");
    assert!(
        output.status.success(),
        "engine exited with {:?}",
        output.status
    );
    let parsed: serde_json::Value = serde_json::from_slice(&output.stdout).expect("json output");
    assert_eq!(parsed["engine"], "RUST_SIDECAR_REFERENCE");
    assert_eq!(parsed["result"]["finalEquity"], 1040.0);
    assert_eq!(parsed["result"]["tradeCount"], 2);
    assert_eq!(parsed["result"]["summary"]["metrics"]["exact"], true);
    assert_eq!(
        parsed["result"]["summary"]["metrics"]["trades"]["profitFactor"],
        serde_json::Value::Null
    );
    assert_eq!(
        parsed["result"]["summary"]["metrics"]["trades"]["profitFactorState"],
        "POSITIVE_INFINITY"
    );
    assert_eq!(parsed["equityCurve"][1]["equity"], 1010.0);
}
