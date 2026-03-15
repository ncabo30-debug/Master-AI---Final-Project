/**
 * csvParser.ts
 * Shared utility for parsing CSV files with PapaParse.
 * Used by FileDropTarget and FileUploader.
 */

import Papa from 'papaparse';

export function parseCSVFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          reject(new Error('El archivo CSV está vacío o no tiene un formato válido.'));
          return;
        }
        resolve(results.data);
      },
      error: (err) => {
        reject(new Error(`Error al leer el archivo: ${err.message}`));
      },
    });
  });
}
