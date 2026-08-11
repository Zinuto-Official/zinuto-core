// SPDX-License-Identifier: GPL-3.0-only

use super::cancellation::{CsvFolderStagingCancellationToken, CSV_FOLDER_STAGING_CANCELLED};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

pub(super) fn resolve_import_staging_worker_count(item_count: usize) -> usize {
    if item_count == 0 {
        return 0;
    }
    let cpu_count = thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(2);
    let target = (cpu_count / 2).clamp(2, 4);
    std::cmp::min(item_count, target)
}

pub(super) fn run_import_staging_worker_pool<T, R, F, G>(
    items: Vec<T>,
    worker_count: usize,
    process: F,
    on_item_complete: G,
) -> Result<Vec<R>, String>
where
    T: Send,
    R: Send,
    F: Fn(T) -> Result<R, String> + Sync,
    G: FnMut(&R),
{
    run_import_staging_worker_pool_internal(items, worker_count, None, process, on_item_complete)
}

pub(super) fn run_import_staging_cancellable_worker_pool<T, R, F, G>(
    items: Vec<T>,
    worker_count: usize,
    cancellation: &CsvFolderStagingCancellationToken,
    process: F,
    on_item_complete: G,
) -> Result<Vec<R>, String>
where
    T: Send,
    R: Send,
    F: Fn(T) -> Result<R, String> + Sync,
    G: FnMut(&R),
{
    run_import_staging_worker_pool_internal(
        items,
        worker_count,
        Some(cancellation),
        process,
        on_item_complete,
    )
}

fn run_import_staging_worker_pool_internal<T, R, F, G>(
    items: Vec<T>,
    worker_count: usize,
    cancellation: Option<&CsvFolderStagingCancellationToken>,
    process: F,
    mut on_item_complete: G,
) -> Result<Vec<R>, String>
where
    T: Send,
    R: Send,
    F: Fn(T) -> Result<R, String> + Sync,
    G: FnMut(&R),
{
    if items.is_empty() {
        return Ok(Vec::new());
    }
    if cancellation
        .map(CsvFolderStagingCancellationToken::is_cancelled)
        .unwrap_or(false)
    {
        return Err(CSV_FOLDER_STAGING_CANCELLED.to_string());
    }
    let item_count = items.len();
    let worker_count = std::cmp::max(1, std::cmp::min(worker_count, item_count));
    let queue = Arc::new(Mutex::new(
        items.into_iter().enumerate().collect::<VecDeque<_>>(),
    ));
    let (sender, receiver) = mpsc::channel::<(usize, Result<R, String>)>();
    // Once the first worker error is observed, no further queued items are
    // started: the pool short-circuits instead of doing wasted work after a
    // guaranteed failure (workers short-circuit note).
    let stop_after_error = Arc::new(AtomicBool::new(false));

    thread::scope(|scope| {
        for _ in 0..worker_count {
            let queue = Arc::clone(&queue);
            let sender = sender.clone();
            let stop_after_error = Arc::clone(&stop_after_error);
            let process = &process;
            scope.spawn(move || loop {
                if cancellation
                    .map(CsvFolderStagingCancellationToken::is_cancelled)
                    .unwrap_or(false)
                {
                    break;
                }
                if stop_after_error.load(Ordering::Relaxed) {
                    break;
                }
                let next = match queue.lock() {
                    Ok(mut guard) => {
                        if cancellation
                            .map(CsvFolderStagingCancellationToken::is_cancelled)
                            .unwrap_or(false)
                            || stop_after_error.load(Ordering::Relaxed)
                        {
                            None
                        } else {
                            guard.pop_front()
                        }
                    }
                    Err(_) => {
                        let _ = sender.send((0, Err("CSV_STAGE_BRIDGE_FAILED".to_string())));
                        break;
                    }
                };
                let Some((index, item)) = next else {
                    break;
                };
                let result = process(item);
                if result.is_err() {
                    // Stop dequeuing as soon as a worker observes a failure so
                    // queued items are not started after a guaranteed failure;
                    // the receiver flag below is a second guard for workers
                    // that were already between dequeue and send.
                    stop_after_error.store(true, Ordering::Relaxed);
                }
                if sender.send((index, result)).is_err() {
                    break;
                }
            });
        }
        drop(sender);

        let mut results: Vec<Option<R>> = (0..item_count).map(|_| None).collect();
        let mut first_error: Option<String> = None;
        for (index, result) in receiver {
            match result {
                Ok(item) => {
                    if index < results.len()
                        && !cancellation
                            .map(CsvFolderStagingCancellationToken::is_cancelled)
                            .unwrap_or(false)
                    {
                        on_item_complete(&item);
                        results[index] = Some(item);
                    }
                }
                Err(code) => {
                    if first_error.is_none() {
                        first_error = Some(code);
                        stop_after_error.store(true, Ordering::Relaxed);
                    }
                }
            }
        }

        if cancellation
            .map(CsvFolderStagingCancellationToken::is_cancelled)
            .unwrap_or(false)
        {
            return Err(CSV_FOLDER_STAGING_CANCELLED.to_string());
        }
        if let Some(error) = first_error {
            return Err(error);
        }
        results
            .into_iter()
            .map(|item| item.ok_or_else(|| "CSV_STAGE_BRIDGE_FAILED".to_string()))
            .collect::<Result<Vec<_>, _>>()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_staging_worker_count_uses_bounded_parallelism() {
        assert_eq!(resolve_import_staging_worker_count(0), 0);
        assert_eq!(resolve_import_staging_worker_count(1), 1);
        assert_eq!(resolve_import_staging_worker_count(2), 2);
        let many_files_worker_count = resolve_import_staging_worker_count(100);
        assert!((2..=4).contains(&many_files_worker_count));
    }

    #[test]
    fn import_staging_worker_pool_preserves_output_order_and_reports_completions() {
        let mut completed = 0_usize;
        let results = run_import_staging_worker_pool(
            vec![3, 1, 2],
            2,
            |value| Ok(value * 10),
            |_| {
                completed += 1;
            },
        )
        .expect("worker pool should succeed");

        assert_eq!(results, vec![30, 10, 20]);
        assert_eq!(completed, 3);
    }

    #[test]
    fn import_staging_worker_pool_returns_worker_error() {
        let result = run_import_staging_worker_pool(
            vec![1, 2, 3],
            2,
            |value| {
                if value == 2 {
                    return Err("CSV_FILE_MISSING".to_string());
                }
                Ok(value)
            },
            |_| {},
        );

        assert_eq!(result, Err("CSV_FILE_MISSING".to_string()));
    }

    #[test]
    fn cancelled_worker_pool_does_not_start_later_queued_items() {
        let cancellation = CsvFolderStagingCancellationToken::default();
        let mut completed = 0_usize;
        let started = Mutex::new(Vec::new());
        let result = run_import_staging_cancellable_worker_pool(
            vec![1, 2, 3],
            1,
            &cancellation,
            |value| {
                started
                    .lock()
                    .expect("started list should lock")
                    .push(value);
                cancellation.cancel();
                Ok(value)
            },
            |_| {
                completed += 1;
            },
        );

        assert_eq!(result, Err(CSV_FOLDER_STAGING_CANCELLED.to_string()));
        assert_eq!(*started.lock().expect("started list should lock"), vec![1],);
        assert_eq!(completed, 0);
    }

    #[test]
    fn worker_pool_stops_dequeuing_items_after_the_first_error() {
        let started = Mutex::new(Vec::new());
        let result = run_import_staging_worker_pool(
            vec![1, 2, 3, 4, 5],
            1,
            |value| {
                started
                    .lock()
                    .expect("started list should lock")
                    .push(value);
                if value == 2 {
                    return Err("CSV_FILE_MISSING".to_string());
                }
                Ok(value)
            },
            |_| {},
        );

        assert_eq!(result, Err("CSV_FILE_MISSING".to_string()));
        assert_eq!(
            *started.lock().expect("started list should lock"),
            vec![1, 2],
            "items queued after the first error must never be started",
        );
    }
}
