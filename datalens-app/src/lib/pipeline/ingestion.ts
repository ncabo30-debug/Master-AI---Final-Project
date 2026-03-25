import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { RawSheet, RawWorkbook, SourceFileType } from './types';

function inferSourceType(fileName: string): SourceFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xls')) return 'xls';
  return 'csv';
}

function normalizeMatrix(matrix: unknown[][]): string[][] {
  return matrix.map((row) =>
    row.map((cell) => {
      if (cell == null) return '';
      return String(cell).trim();
    })
  );
}

function parseCsvTextToSheet(text: string): RawSheet {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: false,
  });

  return {
    name: 'Sheet1',
    rawRows: normalizeMatrix((parsed.data as unknown[][]) ?? []),
    mergedRanges: [],
  };
}

function parseWorkbookBuffer(buffer: ArrayBuffer, sourceFile: string, sourceType: SourceFileType): RawWorkbook {
  if (sourceType === 'csv') {
    const text = new TextDecoder('utf-8').decode(buffer);
    return {
      sourceFile,
      sourceType,
      sheetNames: ['Sheet1'],
      sheets: [parseCsvTextToSheet(text)],
    };
  }

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      blankrows: true,
      defval: '',
    }) as unknown[][];

    return {
      name,
      rawRows: normalizeMatrix(matrix),
      mergedRanges: (sheet['!merges'] ?? []).map((merge) => XLSX.utils.encode_range(merge)),
    };
  });

  return {
    sourceFile,
    sourceType,
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets,
  };
}

export async function parseSpreadsheetFile(file: File): Promise<{
  workbook: RawWorkbook;
  originalFileBase64: string;
}> {
  const sourceType = inferSourceType(file.name);
  const buffer = await file.arrayBuffer();
  const workbook = parseWorkbookBuffer(buffer, file.name, sourceType);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const originalFileBase64 = btoa(binary);

  return {
    workbook,
    originalFileBase64,
  };
}

export function buildRowsFromSheet(sheet: RawSheet, headerRowIndex = 0): Record<string, unknown>[] {
  const headerRow = sheet.rawRows[headerRowIndex] ?? [];
  const headers = headerRow.map((value, index) => value || `column_${index + 1}`);

  return sheet.rawRows.slice(headerRowIndex + 1).map((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  });
}

export function getPrimarySheet(workbook: RawWorkbook): RawSheet {
  return workbook.sheets.find((sheet) => sheet.rawRows.some((row) => row.some(Boolean))) ?? workbook.sheets[0];
}
