# Bundled market-data provenance

The GPL source tree includes two compressed sample datasets at the request and
rights confirmation of the repository owner. Their per-file SHA-256
values, row counts, time ranges, and transformations are recorded in the
dataset manifests beside the files.

## Nasdaq Data Link WIKI EOD 100

- Runtime path:
  `apps/desktop/local-api/src/infrastructure/assets/system-market-seed/wiki-eod-100/`
- Source dataset: `WIKI/PRICES` adjusted OHLCV export
- Source record:
  `https://docs.data.nasdaq.com/v1.0/docs/in-depth-usage`
- Acquisition record date: 2026-04-27
- Snapshot end date: 2018-03-27
- Prepared snapshot version:
  `2026-04-27-v1-nasdaq-data-link-wiki-eod-100`
- Transformation: selected 100 symbols, used adjusted OHLCV columns, rejected
  rows listed in `manifest.json`, normalized market dates to
  `America/New_York`, and gzip-compressed one CSV per symbol.
- Rights basis: Nasdaq Data Link describes WIKI EOD as community-curated data
  released into the public domain. The repository owner separately confirmed
  redistribution of this exact checksum-bound snapshot on 2026-07-17.

## HistData FX 1m 2025 Q1

- Runtime path:
  `apps/desktop/local-api/src/infrastructure/assets/system-market-seed/histdata-fx-1m-2025q1/`
- Source dataset: HistData FX one-minute data, 2025 Q1
- Source record: `https://www.histdata.com/download-free-forex-data/`
- Timestamp specification:
  `https://www.histdata.com/f-a-q/data-files-detailed-specification/`
- Acquisition record date: 2026-04-27
- Prepared snapshot version: `2026-07-30-v2-histdata-fx-1m-2025q1-fixed-est`
- Transformation: selected 13 currency pairs, trimmed day boundaries,
  parsed HistData's source-local timestamps as fixed EST (`UTC-05:00`, without
  daylight-saving adjustment), displayed and calendar-grouped the resulting
  instants in `America/New_York`, and gzip-compressed one CSV per symbol.
- Rights basis: HistData publishes the source files as free downloadable data;
  the repository owner confirmed the company's right to redistribute this
  exact checksum-bound prepared snapshot on 2026-07-17. Private evidence is
  retained by the copyright holder. This statement does not assert that
  HistData uses an open-source data license.

The copyright holder's launch record must retain the applicable acquisition and
redistribution evidence for these exact snapshots. This repository does not
grant rights in third-party data beyond the rights held by its distributor.
Every bundled file is identified by its individual SHA-256 value in the
adjacent `manifest.json`; those manifests, rather than a mutable filename, are
the boundary of the redistribution statement above.
