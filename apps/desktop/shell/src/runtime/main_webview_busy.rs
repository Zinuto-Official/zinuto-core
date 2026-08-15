// SPDX-License-Identifier: GPL-3.0-only

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

// The renderer refreshes a busy signal while a known long-running operation is
// in progress. If the signal goes stale (the renderer stopped refreshing, for
// example because it is genuinely hung), the busy state clears on its own so
// the webview watchdog can still recover the window.
const MAIN_WEBVIEW_BUSY_SIGNAL_TTL: Duration = Duration::from_secs(30);

static MAIN_WEBVIEW_BUSY: AtomicBool = AtomicBool::new(false);
static MAIN_WEBVIEW_BUSY_REFRESHED_AT: Mutex<Option<Instant>> = Mutex::new(None);

pub(crate) fn set_main_webview_busy(busy: bool) {
    MAIN_WEBVIEW_BUSY.store(busy, Ordering::SeqCst);
    let mut refreshed_at = MAIN_WEBVIEW_BUSY_REFRESHED_AT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *refreshed_at = if busy { Some(Instant::now()) } else { None };
}

pub(crate) fn is_main_webview_busy() -> bool {
    if !MAIN_WEBVIEW_BUSY.load(Ordering::SeqCst) {
        return false;
    }
    let refreshed_at = MAIN_WEBVIEW_BUSY_REFRESHED_AT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let still_busy = refreshed_at
        .map(|at| at.elapsed() <= MAIN_WEBVIEW_BUSY_SIGNAL_TTL)
        .unwrap_or(false);
    if !still_busy {
        MAIN_WEBVIEW_BUSY.store(false, Ordering::SeqCst);
    }
    still_busy
}
