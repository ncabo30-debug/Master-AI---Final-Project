import { buildRowsFromSheet, getPrimarySheet } from '@/lib/pipeline/ingestion';
import type { RawSheet, RawWorkbook, StructuralAction } from '@/lib/pipeline/types';

function cloneWorkbook(workbook: RawWorkbook): RawWorkbook {
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet) => ({
      ...sheet,
      rawRows: sheet.rawRows.map((row) => [...row]),
      mergedRanges: [...sheet.mergedRanges],
    })),
  };
}

function removeRows(sheet: RawSheet, rowIndexes: number[]): RawSheet {
  const blocked = new Set(rowIndexes);
  return {
    ...sheet,
    rawRows: sheet.rawRows.filter((_, index) => !blocked.has(index)),
  };
}

function collapseHeaderRows(sheet: RawSheet, rowIndexes: number[]): RawSheet {
  if (rowIndexes.length === 0) return sheet;
  const indexes = [...rowIndexes].sort((left, right) => left - right);
  const mergedHeader = indexes.reduce<string[]>((acc, rowIndex) => {
    const row = sheet.rawRows[rowIndex] ?? [];
    row.forEach((value, index) => {
      const previous = acc[index] ?? '';
      acc[index] = [previous, value].filter(Boolean).join(' ').trim();
    });
    return acc;
  }, []);

  return {
    ...sheet,
    rawRows: [mergedHeader, ...sheet.rawRows.filter((_, index) => !indexes.includes(index))],
  };
}

function fillMergedCellsDown(sheet: RawSheet): RawSheet {
  const rows = sheet.rawRows.map((row) => [...row]);
  const previousValues: string[] = [];

  rows.forEach((row) => {
    row.forEach((value, index) => {
      if (value) {
        previousValues[index] = value;
      } else if (previousValues[index]) {
        row[index] = previousValues[index];
      }
    });
  });

  return {
    ...sheet,
    rawRows: rows,
  };
}

function dropSubtotalRows(sheet: RawSheet): RawSheet {
  return {
    ...sheet,
    rawRows: sheet.rawRows.filter((row) => !row.some((value) => /\b(total|subtotal)\b/i.test(value))),
  };
}

export function executeStructuralPlan(workbook: RawWorkbook, plan: StructuralAction[]): {
  workbook: RawWorkbook;
  cleanedRows: Record<string, unknown>[];
} {
  const nextWorkbook = cloneWorkbook(workbook);
  let primarySheet = getPrimarySheet(nextWorkbook);

  plan.filter((step) => step.enabled).forEach((step) => {
    if (step.action === 'remove_rows') {
      primarySheet = removeRows(primarySheet, (step.params.rowIndexes as number[] | undefined) ?? []);
    }

    if (step.action === 'drop_subtotals') {
      primarySheet = dropSubtotalRows(primarySheet);
    }

    if (step.action === 'fill_merged_cells_down') {
      primarySheet = fillMergedCellsDown(primarySheet);
    }

    if (step.action === 'collapse_multi_row_headers') {
      primarySheet = collapseHeaderRows(primarySheet, (step.params.rowIndexes as number[] | undefined) ?? []);
    }
  });

  const headerRowIndex = plan
    .filter((step) => step.enabled && step.action === 'set_header_row')
    .map((step) => Number(step.params.rowIndex ?? 0))
    .at(-1) ?? 0;

  nextWorkbook.sheets = nextWorkbook.sheets.map((sheet) =>
    sheet.name === primarySheet.name ? primarySheet : sheet
  );

  return {
    workbook: nextWorkbook,
    cleanedRows: buildRowsFromSheet(primarySheet, headerRowIndex),
  };
}

