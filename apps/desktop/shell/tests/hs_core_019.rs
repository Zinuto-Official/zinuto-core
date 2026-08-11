// SPDX-License-Identifier: GPL-3.0-only

use std::fs;
use std::path::PathBuf;

fn shell_path(relative: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(relative)
}

fn lines(source: &str) -> usize {
    source.trim_end().lines().count()
}

#[test]
fn hs_core_019_keeps_local_transport_below_ceiling_with_http_wire_seam() {
    let owner_path = shell_path("src/bridge/transport.rs");
    let owner = fs::read_to_string(&owner_path).expect("transport.rs should be readable");
    assert!(
        lines(&owner) <= 1000,
        "transport.rs has {} lines",
        lines(&owner)
    );
    assert!(owner.contains("mod http_wire;"));
    assert!(owner.contains("send_http_request_over_stream_with_stats"));

    let seam_path = shell_path("src/bridge/transport/http_wire.rs");
    let seam = fs::read_to_string(&seam_path).expect("http wire seam should be readable");
    assert!(
        lines(&seam) <= 1000,
        "http_wire.rs has {} lines",
        lines(&seam)
    );
    assert!(seam.contains("pub(crate) fn send_http_request_over_stream"));
    assert!(!seam.contains("mod transport"));
}
