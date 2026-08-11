// SPDX-License-Identifier: GPL-3.0-only

export const LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_FILE_NAME =
  "zinuto-core-mock-market-data.zip";

const LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_ROOT = "OPEN_TRADING_PRACTICE_MOCK_MARKET_DATA";
const LOCAL_IMPORT_MOCK_SAMPLE_MIN_FILE_COUNT = 2;
const LOCAL_IMPORT_MOCK_SAMPLE_MIN_ROW_COUNT = 100;
const LOCAL_IMPORT_MOCK_SAMPLE_ROW_COUNT = 120;

export const LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_INNER_PATH =
  "OPEN_TRADING_PRACTICE_MOCK_MARKET_DATA/ZIZI.csv";

export const LOCAL_IMPORT_MOCK_SAMPLE_TITLE = "ZIZI Stock";

export const LOCAL_IMPORT_MOCK_SAMPLE_FILE_NAME = "ZIZI.csv";

const LOCAL_IMPORT_MOCK_SECOND_SAMPLE_TITLE = "MOMO Stock";
const LOCAL_IMPORT_MOCK_SECOND_SAMPLE_FILE_NAME = "MOMO.csv";

export const LOCAL_IMPORT_MOCK_SAMPLE_COLUMNS = [
  "datetime",
  "open",
  "high",
  "low",
  "close",
  "volume",
] as const;

export type LocalImportMockSampleRow = readonly [
  datetime: string,
  open: string,
  high: string,
  low: string,
  close: string,
  volume: string,
];

export type LocalImportMockSampleFile = {
  title: string;
  fileName: string;
  rows: readonly LocalImportMockSampleRow[];
};

type LocalImportMockSampleSeriesConfig = {
  startYear: number;
  startMonth: number;
  startDay: number;
  startHour: number;
  startMinute: number;
  startPrice: number;
  priceDriftPerRow: number;
  cycleMagnitude: number;
  volumeBase: number;
  volumeStep: number;
};

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION_NEEDED = 10;
const ZIP_VERSION_MADE_BY = 20;
const ZIP_STORE_METHOD = 0;
const ZIP_DOS_TIME = 0;
const ZIP_DOS_DATE = 33;

const buildCrc32Table = (): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
};

const CRC32_TABLE = buildCrc32Table();

const calculateCrc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (
  output: Uint8Array,
  offset: number,
  value: number,
): void => {
  output[offset] = value & 0xff;
  output[offset + 1] = (value >>> 8) & 0xff;
};

const writeUint32 = (
  output: Uint8Array,
  offset: number,
  value: number,
): void => {
  output[offset] = value & 0xff;
  output[offset + 1] = (value >>> 8) & 0xff;
  output[offset + 2] = (value >>> 16) & 0xff;
  output[offset + 3] = (value >>> 24) & 0xff;
};

const pad2 = (value: number): string => String(value).padStart(2, "0");

const formatMockTimestamp = (
  config: LocalImportMockSampleSeriesConfig,
  index: number,
): string => {
  const totalMinutes = config.startHour * 60 + config.startMinute + index * 5;
  const dayOffset = Math.floor(totalMinutes / (24 * 60));
  const normalizedMinutes = totalMinutes % (24 * 60);
  const hour = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  const currentDate = new Date(
    Date.UTC(config.startYear, config.startMonth - 1, config.startDay + dayOffset),
  );
  return `${currentDate.getUTCFullYear()}-${pad2(currentDate.getUTCMonth() + 1)}-${pad2(currentDate.getUTCDate())} ${pad2(hour)}:${pad2(minute)}`;
};

const formatPrice = (value: number): string => value.toFixed(2);

const buildMockRows = (
  config: LocalImportMockSampleSeriesConfig,
): LocalImportMockSampleRow[] =>
  Array.from({ length: LOCAL_IMPORT_MOCK_SAMPLE_ROW_COUNT }, (_, index) => {
    const cycleOffset = ((index % 9) - 4) * config.cycleMagnitude;
    const open = config.startPrice + index * config.priceDriftPerRow + cycleOffset;
    const close = open + ((index % 7) - 3) * 0.04;
    const high = Math.max(open, close) + 0.14 + (index % 4) * 0.03;
    const low = Math.min(open, close) - 0.13 - (index % 3) * 0.02;
    const volume =
      config.volumeBase + index * config.volumeStep + (index % 11) * 8750;
    return [
      formatMockTimestamp(config, index),
      formatPrice(open),
      formatPrice(high),
      formatPrice(low),
      formatPrice(close),
      String(volume),
    ] as const;
  });

const PRIMARY_LOCAL_IMPORT_MOCK_SAMPLE_FILE: LocalImportMockSampleFile = {
  title: LOCAL_IMPORT_MOCK_SAMPLE_TITLE,
  fileName: LOCAL_IMPORT_MOCK_SAMPLE_FILE_NAME,
  rows: buildMockRows({
    startYear: 2026,
    startMonth: 1,
    startDay: 2,
    startHour: 9,
    startMinute: 30,
    startPrice: 12.42,
    priceDriftPerRow: 0.06,
    cycleMagnitude: 0.035,
    volumeBase: 1_820_000,
    volumeStep: 9_800,
  }),
};

const SECONDARY_LOCAL_IMPORT_MOCK_SAMPLE_FILE: LocalImportMockSampleFile = {
  title: LOCAL_IMPORT_MOCK_SECOND_SAMPLE_TITLE,
  fileName: LOCAL_IMPORT_MOCK_SECOND_SAMPLE_FILE_NAME,
  rows: buildMockRows({
    startYear: 2026,
    startMonth: 1,
    startDay: 5,
    startHour: 9,
    startMinute: 30,
    startPrice: 28.16,
    priceDriftPerRow: -0.04,
    cycleMagnitude: 0.05,
    volumeBase: 2_460_000,
    volumeStep: 11_200,
  }),
};

export const LOCAL_IMPORT_MOCK_SAMPLE_FILES = [
  PRIMARY_LOCAL_IMPORT_MOCK_SAMPLE_FILE,
  SECONDARY_LOCAL_IMPORT_MOCK_SAMPLE_FILE,
] as const;

export const LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_INNER_PATHS =
  LOCAL_IMPORT_MOCK_SAMPLE_FILES.map(
    (file) => `${LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_ROOT}/${file.fileName}`,
  );

export const LOCAL_IMPORT_MOCK_SAMPLE_ROWS =
  PRIMARY_LOCAL_IMPORT_MOCK_SAMPLE_FILE.rows;

const assertLocalImportMockSampleDataset = (
  files: readonly LocalImportMockSampleFile[],
): void => {
  if (files.length < LOCAL_IMPORT_MOCK_SAMPLE_MIN_FILE_COUNT) {
    throw new Error("LOCAL_IMPORT_MOCK_SAMPLE_FILES_TOO_FEW");
  }
  for (const file of files) {
    if (file.rows.length < LOCAL_IMPORT_MOCK_SAMPLE_MIN_ROW_COUNT) {
      throw new Error("LOCAL_IMPORT_MOCK_SAMPLE_ROWS_TOO_FEW");
    }
  }
};

assertLocalImportMockSampleDataset(LOCAL_IMPORT_MOCK_SAMPLE_FILES);

export const buildLocalImportMockSampleCsv = (
  file: LocalImportMockSampleFile = PRIMARY_LOCAL_IMPORT_MOCK_SAMPLE_FILE,
): string =>
  [LOCAL_IMPORT_MOCK_SAMPLE_COLUMNS.join(","), ...file.rows.map((row) => row.join(","))].join(
    "\r\n",
  ) + "\r\n";

type ZipStoredEntry = {
  fileNameBytes: Uint8Array;
  fileBytes: Uint8Array;
  crc32: number;
  localHeaderOffset: number;
};

const buildZipStoredEntries = (): ZipStoredEntry[] => {
  const encoder = new TextEncoder();
  let localHeaderOffset = 0;
  return LOCAL_IMPORT_MOCK_SAMPLE_FILES.map((file) => {
    const fileNameBytes = encoder.encode(
      `${LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_ROOT}/${file.fileName}`,
    );
    const fileBytes = encoder.encode(buildLocalImportMockSampleCsv(file));
    const entry = {
      fileNameBytes,
      fileBytes,
      crc32: calculateCrc32(fileBytes),
      localHeaderOffset,
    };
    localHeaderOffset += 30 + fileNameBytes.length + fileBytes.length;
    return entry;
  });
};

export const buildLocalImportMockSampleArchiveBytes = (): Uint8Array => {
  const entries = buildZipStoredEntries();
  const endDirectoryLength = 22;
  const centralDirectoryOffset = entries.reduce(
    (total, entry) => total + 30 + entry.fileNameBytes.length + entry.fileBytes.length,
    0,
  );
  const centralDirectoryLength = entries.reduce(
    (total, entry) => total + 46 + entry.fileNameBytes.length,
    0,
  );
  const output = new Uint8Array(
    centralDirectoryOffset + centralDirectoryLength + endDirectoryLength,
  );

  let offset = 0;
  for (const entry of entries) {
    writeUint32(output, offset, ZIP_LOCAL_FILE_HEADER_SIGNATURE);
    offset += 4;
    writeUint16(output, offset, ZIP_VERSION_NEEDED);
    offset += 2;
    writeUint16(output, offset, 0);
    offset += 2;
    writeUint16(output, offset, ZIP_STORE_METHOD);
    offset += 2;
    writeUint16(output, offset, ZIP_DOS_TIME);
    offset += 2;
    writeUint16(output, offset, ZIP_DOS_DATE);
    offset += 2;
    writeUint32(output, offset, entry.crc32);
    offset += 4;
    writeUint32(output, offset, entry.fileBytes.length);
    offset += 4;
    writeUint32(output, offset, entry.fileBytes.length);
    offset += 4;
    writeUint16(output, offset, entry.fileNameBytes.length);
    offset += 2;
    writeUint16(output, offset, 0);
    offset += 2;
    output.set(entry.fileNameBytes, offset);
    offset += entry.fileNameBytes.length;
    output.set(entry.fileBytes, offset);
    offset += entry.fileBytes.length;
  }

  for (const entry of entries) {
    writeUint32(output, offset, ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE);
    offset += 4;
    writeUint16(output, offset, ZIP_VERSION_MADE_BY);
    offset += 2;
    writeUint16(output, offset, ZIP_VERSION_NEEDED);
    offset += 2;
    writeUint16(output, offset, 0);
    offset += 2;
    writeUint16(output, offset, ZIP_STORE_METHOD);
    offset += 2;
    writeUint16(output, offset, ZIP_DOS_TIME);
    offset += 2;
    writeUint16(output, offset, ZIP_DOS_DATE);
    offset += 2;
    writeUint32(output, offset, entry.crc32);
    offset += 4;
    writeUint32(output, offset, entry.fileBytes.length);
    offset += 4;
    writeUint32(output, offset, entry.fileBytes.length);
    offset += 4;
    writeUint16(output, offset, entry.fileNameBytes.length);
    offset += 2;
    writeUint16(output, offset, 0);
    offset += 2;
    writeUint16(output, offset, 0);
    offset += 2;
    writeUint16(output, offset, 0);
    offset += 2;
    writeUint16(output, offset, 0);
    offset += 2;
    writeUint32(output, offset, 0);
    offset += 4;
    writeUint32(output, offset, entry.localHeaderOffset);
    offset += 4;
    output.set(entry.fileNameBytes, offset);
    offset += entry.fileNameBytes.length;
  }

  writeUint32(output, offset, ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  offset += 4;
  writeUint16(output, offset, 0);
  offset += 2;
  writeUint16(output, offset, 0);
  offset += 2;
  writeUint16(output, offset, entries.length);
  offset += 2;
  writeUint16(output, offset, entries.length);
  offset += 2;
  writeUint32(output, offset, centralDirectoryLength);
  offset += 4;
  writeUint32(output, offset, centralDirectoryOffset);
  offset += 4;
  writeUint16(output, offset, 0);

  return output;
};
