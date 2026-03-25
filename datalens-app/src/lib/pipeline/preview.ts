import { getPrimarySheet } from './ingestion';
import { buildDeterministicSample } from './profiling';
import type { RawWorkbook } from './types';

function toSpreadsheetColumnLabel(index: number): string {
  let label = '';
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label;
}

export function buildOriginalPreviewRows(workbook: RawWorkbook, size = 50): Record<string, unknown>[] {
  const primarySheet = getPrimarySheet(workbook);
  const maxColumns = primarySheet.rawRows.reduce((max, row) => Math.max(max, row.length), 0);

  if (maxColumns === 0) {
    return [];
  }

  const rows = primarySheet.rawRows.map((row) => {
    const record: Record<string, unknown> = {};

    for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
      record[toSpreadsheetColumnLabel(columnIndex)] = row[columnIndex] ?? '';
    }

    return record;
  });

  return buildDeterministicSample(rows, size);
}
