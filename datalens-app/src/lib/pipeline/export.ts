import ExcelJS from 'exceljs';

export async function exportRowsToXlsxBase64(
  rows: Record<string, unknown>[],
  sheetName = 'normalized'
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  const columns = Object.keys(rows[0] ?? {});

  worksheet.addRow(columns);
  rows.forEach((row) => {
    worksheet.addRow(columns.map((column) => row[column] ?? null));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}

