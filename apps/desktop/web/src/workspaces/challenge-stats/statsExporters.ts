// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiTrainingProjectDetail,
  ApiTrainingStatsReport
} from '@/api';
import type { UiLabelEntry } from '@/ui/config/uiLabels';
import type { AppUiLanguage } from '@/ui/config/uiConfig';
import { formatMarketDateByLocale } from '@zinuto/shared/marketTime';
import notoSansJpStatsUrl from '@/assets/fonts/stats-pdf/NotoSansJP-Stats.ttf?url';
import notoSansKrStatsUrl from '@/assets/fonts/stats-pdf/NotoSansKR-Stats.ttf?url';
import notoSansScStatsUrl from '@/assets/fonts/stats-pdf/NotoSansSC-Stats.ttf?url';
import { encodeCsvCell } from '@/workspaces/challenge-stats/statsCsvEncoding';

export class StatsExportError extends Error {
  readonly stage: 'CSV_DOWNLOAD' | 'PDF_BUILD' | 'PDF_SAVE';

  constructor(stage: StatsExportError['stage'], cause?: unknown) {
    super(`STATS_EXPORT_${stage}_FAILED`, { cause });
    this.name = 'StatsExportError';
    this.stage = stage;
  }
}

const downloadText = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const buildReportCsv = (
  report: ApiTrainingStatsReport,
  ui: UiLabelEntry,
  language: AppUiLanguage,
  resolvePoolDisplayName?: (samplePoolId: string, fallbackName: string) => string
): string => {
  const rows: string[][] = [];
  const pushRow = (...cells: Array<string | number>) => {
    rows.push(cells.map(encodeCsvCell));
  };

  pushRow(
    ui.statsTitle,
    formatMarketDateByLocale(report.generatedAt, language, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  );
  pushRow(ui.metricTotalTrainings, report.overview.totalSessions);
  pushRow(ui.metricTotalDays, report.overview.totalTrainingDays);
  pushRow(ui.metricTotalTrades, report.overview.totalTrades);
  pushRow(ui.metricTotalPnl, report.overview.totalPnl);
  pushRow(ui.metricTotalReturnRate, report.overview.totalReturnRate);
  pushRow(ui.metricWinRate, report.overview.winRate);
  pushRow(ui.metricProfitLossRatio, report.overview.profitLossRatio);
  pushRow(ui.metricMaxDrawdown, report.overview.maxDrawdownRate);
  pushRow(ui.metricAvgTradePnl, report.overview.averageTradePnl);
  pushRow(ui.metricAvgHold, report.overview.averageHoldBars);
  pushRow('');

  pushRow(ui.statsMonthlyPerformance);
  pushRow(
    ui.statsPeriod,
    ui.statsTrainings,
    ui.metricTotalPnl,
    ui.metricWinRate,
    ui.metricMaxDrawdown,
    ui.metricTotalReturnRate
  );
  report.monthlyPerformance.forEach((item) => {
    pushRow(item.period, item.sessionCount, item.totalPnl, item.winRate, item.maxDrawdownRate, item.totalReturnRate);
  });
  pushRow('');

  pushRow(ui.statsPoolDimension);
  pushRow(
    ui.statsSamplePool,
    ui.statsTrainings,
    ui.metricTotalReturnRate,
    ui.metricWinRate,
    ui.metricTotalTrades,
    ui.metricAvgHold
  );
  report.samplePoolStats.forEach((item) => {
    pushRow(
      resolvePoolDisplayName ? resolvePoolDisplayName(item.samplePoolId, item.samplePoolName) : item.samplePoolName,
      item.sessionCount,
      item.totalReturnRate,
      item.winRate,
      item.totalTrades,
      item.avgHoldBars
    );
  });
  pushRow('');

  pushRow(ui.statsSymbolDimension);
  pushRow(ui.statsSymbol, ui.statsTrainings, ui.statsBest, ui.statsWorst, ui.statsAverage);
  report.symbolStats.forEach((item) => {
    pushRow(item.symbol, item.sessionCount, item.bestReturn, item.worstReturn, item.avgReturn);
  });
  pushRow('');

  pushRow(ui.statsTimeframeDimension);
  pushRow(ui.statsTimeframe, ui.statsTrainings, ui.metricWinRate, ui.statsAverage, ui.metricMaxDrawdown, ui.statsTradeFrequency);
  report.timeframeStats.forEach((item) => {
    pushRow(item.timeframe, item.sessionCount, item.winRate, item.avgReturn, item.maxDrawdownRate, item.tradeFrequency);
  });

  return rows.map((row) => row.join(',')).join('\n');
};

export const buildSingleSessionCsv = (project: ApiTrainingProjectDetail, ui: UiLabelEntry): string => {
  const rows: string[][] = [];
  const push = (...cells: Array<string | number>) => {
    rows.push(cells.map(encodeCsvCell));
  };

  push(ui.statsSingleReport, project.name);
  push(ui.statsSymbol, project.symbol);
  push(ui.statsSamplePool, project.samplePoolName);
  push(ui.statsTimeframe, project.baseTimeframe);
  push(ui.statsDateRange, project.trainingDateRange);
  push(ui.metricTotalDays, project.summary.durationDays);
  push(ui.metricTotalTrades, project.summary.totalTrades);
  push(ui.metricTotalPnl, project.summary.totalPnl);
  push(ui.metricTotalReturnRate, project.summary.assetReturnRate);
  push(ui.metricMaxDrawdown, project.summary.maxDrawdownRate);
  push(ui.metricTotalFees, project.summary.tradingCost);

  return rows.map((row) => row.join(',')).join('\n');
};

export const downloadCsv = (filename: string, content: string): void => {
  try {
    downloadText(filename, content, 'text/csv;charset=utf-8');
  } catch (error) {
    throw new StatsExportError('CSV_DOWNLOAD', error);
  }
};

const PDF_FONT_URL_BY_LANGUAGE: Partial<Record<AppUiLanguage, string>> = {
  'zh-CN': notoSansScStatsUrl,
  ja: notoSansJpStatsUrl,
  ko: notoSansKrStatsUrl,
};

const encodeArrayBufferAsBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
    );
  }
  return btoa(chunks.join(''));
};

const loadStatsPdfFont = async (
  language: AppUiLanguage,
): Promise<string | null> => {
  const fontUrl = PDF_FONT_URL_BY_LANGUAGE[language];
  if (!fontUrl) {
    return null;
  }
  const response = await fetch(fontUrl, { cache: 'force-cache' });
  if (!response.ok) {
    throw new StatsExportError('PDF_BUILD');
  }
  return encodeArrayBufferAsBase64(await response.arrayBuffer());
};

export const exportReportPdf = async (
  title: string,
  lines: string[],
  language: AppUiLanguage,
): Promise<void> => {
  let jsPDF: typeof import('jspdf')['jsPDF'];
  try {
    ({ jsPDF } = await import('jspdf'));
  } catch (error) {
    throw new StatsExportError('PDF_BUILD', error);
  }
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const fontBase64 = await loadStatsPdfFont(language);
  if (fontBase64) {
    doc.addFileToVFS('NotoSansStats.ttf', fontBase64);
    doc.addFont(
      'NotoSansStats.ttf',
      'NotoSansStats',
      'normal',
      undefined,
      'Identity-H',
    );
    doc.setFont('NotoSansStats', 'normal');
  }
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const maxTextWidth = pageWidth - marginX * 2;
  let cursorY = 48;

  doc.setFontSize(16);
  doc.text(title, marginX, cursorY);
  cursorY += 24;
  doc.setFontSize(10);

  const pushLine = (line: string) => {
    const fragments = doc.splitTextToSize(line, maxTextWidth) as string[];
    for (const fragment of fragments) {
      if (cursorY > pageHeight - 40) {
        doc.addPage();
        cursorY = 44;
      }
      doc.text(fragment, marginX, cursorY);
      cursorY += 14;
    }
  };

  lines.forEach((line) => pushLine(line));
  try {
    doc.save(`${title}.pdf`);
  } catch (error) {
    throw new StatsExportError('PDF_SAVE', error);
  }
};
