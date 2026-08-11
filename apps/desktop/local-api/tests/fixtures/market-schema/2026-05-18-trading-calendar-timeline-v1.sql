CREATE TABLE market_meta (
  key VARCHAR PRIMARY KEY,
  value VARCHAR NOT NULL,
  updated_at VARCHAR NOT NULL
);

INSERT INTO market_meta (key, value, updated_at)
VALUES (
  'market_schema_version',
  '2026-05-18-trading-calendar-timeline-v1',
  '2026-05-18T00:00:00.000Z'
);

CREATE TABLE market_instruments (
  instrument_id VARCHAR PRIMARY KEY,
  symbol VARCHAR NOT NULL,
  bar_count BIGINT NOT NULL DEFAULT 0,
  updated_at VARCHAR NOT NULL
);

CREATE TABLE market_bars (
  instrument_id VARCHAR NOT NULL,
  raw_index BIGINT NOT NULL DEFAULT 0,
  ts_ms BIGINT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL
);

CREATE TABLE market_timeline_meta (
  instrument_id VARCHAR NOT NULL,
  version_token VARCHAR NOT NULL,
  display_period VARCHAR NOT NULL,
  time_zone VARCHAR NOT NULL,
  total_raw BIGINT NOT NULL,
  total_display BIGINT NOT NULL,
  build_status VARCHAR NOT NULL,
  built_at VARCHAR NOT NULL
);

CREATE TABLE market_display_bars (
  instrument_id VARCHAR NOT NULL,
  version_token VARCHAR NOT NULL,
  display_period VARCHAR NOT NULL,
  time_zone VARCHAR NOT NULL,
  display_index BIGINT NOT NULL,
  bucket_start_ms BIGINT NOT NULL,
  start_raw_index BIGINT NOT NULL,
  end_raw_index BIGINT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL
);

CREATE TABLE market_display_anchors (
  instrument_id VARCHAR NOT NULL,
  version_token VARCHAR NOT NULL,
  display_period VARCHAR NOT NULL,
  time_zone VARCHAR NOT NULL,
  display_index BIGINT NOT NULL,
  bucket_start_ms BIGINT NOT NULL,
  start_raw_index BIGINT NOT NULL
);

CREATE TABLE market_bar_chunk_anchors (
  instrument_id VARCHAR NOT NULL,
  chunk_start BIGINT NOT NULL,
  start_ts_ms BIGINT NOT NULL
);

CREATE INDEX idx_market_instruments_symbol
  ON market_instruments(symbol);
CREATE INDEX idx_market_bar_chunk_anchors_lookup
  ON market_bar_chunk_anchors(instrument_id, chunk_start);
CREATE INDEX idx_market_bars_raw_lookup
  ON market_bars(instrument_id, raw_index);
CREATE INDEX idx_market_bars_instrument_ts_lookup
  ON market_bars(instrument_id, ts_ms);
CREATE INDEX idx_market_display_bars_lookup
  ON market_display_bars(instrument_id, version_token, display_period, time_zone, display_index);
CREATE INDEX idx_market_display_anchors_lookup
  ON market_display_anchors(instrument_id, version_token, display_period, time_zone, display_index);
CREATE INDEX idx_market_display_anchors_raw_lookup
  ON market_display_anchors(instrument_id, version_token, display_period, time_zone, start_raw_index);
CREATE INDEX idx_market_timeline_meta_lookup
  ON market_timeline_meta(instrument_id, version_token, display_period, time_zone);
