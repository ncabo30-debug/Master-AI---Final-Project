import { buildRowsFromSheet, getPrimarySheet } from './ingestion';
import type {
  ColumnInferredType,
  ColumnProfile,
  RawSheet,
  RawWorkbook,
  StatisticalProfile,
  StructuralProfile,
} from './types';

function isNullLike(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['', 'null', 'n/a', 'na', '-', '--', 's/d', 'nd', 'undefined'].includes(normalized);
}

function inferValueType(values: string[]): ColumnInferredType {
  const filtered = values.filter((value) => !isNullLike(value));
  if (filtered.length === 0) return 'string';

  const numericMatches = filtered.filter((value) => {
    const normalized = value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    return normalized !== '' && !Number.isNaN(Number(normalized));
  }).length;

  const booleanMatches = filtered.filter((value) =>
    ['true', 'false', 'yes', 'no', 'si', 'sí', '0', '1', 'x'].includes(value.toLowerCase())
  ).length;

  const dateMatches = filtered.filter((value) =>
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value) ||
    /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(value)
  ).length;

  const threshold = Math.ceil(filtered.length * 0.6);
  if (booleanMatches >= threshold) return 'boolean';
  if (dateMatches >= threshold) return 'date';
  if (numericMatches >= threshold) return 'number';
  return 'string';
}

function buildColumnProfile(rows: Record<string, unknown>[], column: string): ColumnProfile {
  const values = rows.map((row) => String(row[column] ?? ''));
  const inferredType = inferValueType(values);
  const nullCount = values.filter(isNullLike).length;
  const uniqueCount = new Set(values.map((value) => value.trim())).size;
  const sampleValues = Array.from(new Set(values.filter((value) => value.trim() !== ''))).slice(0, 5);

  const profile: ColumnProfile = {
    name: column,
    inferredType,
    nullRatio: rows.length === 0 ? 0 : nullCount / rows.length,
    uniqueCount,
    sampleValues,
  };

  if (inferredType === 'number') {
    const numericValues = values
      .map((value) => value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
      .map((value) => Number(value))
      .filter((value) => !Number.isNaN(value));

    if (numericValues.length > 0) {
      const sum = numericValues.reduce((acc, value) => acc + value, 0);
      profile.numericSummary = {
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        avg: sum / numericValues.length,
        sum,
      };
    }
  }

  if (inferredType === 'date') {
    const dates = values
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((left, right) => left.getTime() - right.getTime());

    if (dates.length > 0) {
      profile.dateSummary = {
        min: dates[0].toISOString().slice(0, 10),
        max: dates[dates.length - 1].toISOString().slice(0, 10),
      };
    }
  }

  return profile;
}

function detectSubtotalRows(sheet: RawSheet): number[] {
  return sheet.rawRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some((value) => /\b(total|subtotal)\b/i.test(value)))
    .map(({ index }) => index);
}

function detectLeadingMetadataRows(sheet: RawSheet): number {
  let count = 0;
  for (const row of sheet.rawRows) {
    const populated = row.filter((value) => value.trim() !== '').length;
    if (populated <= 1) {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

function detectHeaderRow(sheet: RawSheet): number {
  const candidate = sheet.rawRows.findIndex((row) => row.filter((value) => value.trim() !== '').length >= 2);
  return candidate >= 0 ? candidate : 0;
}

function buildStructuralProfile(workbook: RawWorkbook, primarySheet: RawSheet): StructuralProfile {
  const headerRow = detectHeaderRow(primarySheet);
  const emptyRowIndexes = primarySheet.rawRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.every((value) => value.trim() === ''))
    .map(({ index }) => index);

  const averageWidth =
    primarySheet.rawRows.length === 0
      ? 0
      : primarySheet.rawRows.reduce((acc, row) => acc + row.filter(Boolean).length, 0) / primarySheet.rawRows.length;

  const shortRowIndexes = primarySheet.rawRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.filter(Boolean).length > 0 && row.filter(Boolean).length < Math.max(1, Math.floor(averageWidth * 0.6)))
    .map(({ index }) => index);

  const compatibleSheetNames = workbook.sheets
    .filter((sheet) => {
      const firstNonEmpty = sheet.rawRows.find((row) => row.some(Boolean));
      const primaryNonEmpty = primarySheet.rawRows.find((row) => row.some(Boolean));
      return !!firstNonEmpty && !!primaryNonEmpty && firstNonEmpty.length === primaryNonEmpty.length;
    })
    .map((sheet) => sheet.name);

  return {
    sheetCount: workbook.sheets.length,
    primarySheetName: primarySheet.name,
    estimatedHeaderRow: headerRow,
    leadingMetadataRowCount: detectLeadingMetadataRows(primarySheet),
    emptyRowIndexes,
    shortRowIndexes,
    subtotalRowIndexes: detectSubtotalRows(primarySheet),
    hasMergedCells: workbook.sheets.some((sheet) => sheet.mergedRanges.length > 0),
    compatibleSheetNames,
  };
}

export function profileWorkbook(workbook: RawWorkbook): {
  profile: StatisticalProfile;
  primaryRows: Record<string, unknown>[];
} {
  const primarySheet = getPrimarySheet(workbook);
  const headerRowIndex = detectHeaderRow(primarySheet);
  const rows = buildRowsFromSheet(primarySheet, headerRowIndex);
  const columns = Object.keys(rows[0] ?? {});

  return {
    profile: {
      rowCount: rows.length,
      columnCount: columns.length,
      columns: columns.map((column) => buildColumnProfile(rows, column)),
      structural: buildStructuralProfile(workbook, primarySheet),
    },
    primaryRows: rows,
  };
}

export function buildDeterministicSample(rows: Record<string, unknown>[], size = 50): Record<string, unknown>[] {
  if (rows.length <= size) return rows;
  const start = rows.slice(0, Math.floor(size / 3));
  const middleStart = Math.max(0, Math.floor(rows.length / 2) - Math.floor(size / 6));
  const middle = rows.slice(middleStart, middleStart + Math.floor(size / 3));
  const tail = rows.slice(-Math.max(0, size - start.length - middle.length));
  return [...start, ...middle, ...tail].slice(0, size);
}

