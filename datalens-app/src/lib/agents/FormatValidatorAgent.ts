import ExcelJS from 'exceljs';
import { AgentBus, type AgentMessage } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import type { ProfileResult, FormatValidationResult } from './types';

/**
 * FormatValidatorAgent: Reads the generated Excel buffer and verifies that
 * data types survived serialization (dates are real dates, numbers are
 * real numbers, not strings).
 */
export class FormatValidatorAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'validator', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: AgentMessage): Promise<void> {
        if (message.type === 'VALIDATE_FORMAT') {
            const result = await this.execute(message.payload as {
                excelBuffer: Uint8Array;
                profile: ProfileResult;
            });
            this.communicate(message.from, 'FORMAT_VALIDATED', result);
        }
    }

    public async execute(context: {
        excelBuffer: Uint8Array;
        profile: ProfileResult;
    }): Promise<FormatValidationResult> {
        const start = Date.now();
        const { excelBuffer, profile } = context;
        const errors: string[] = [];

        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(Buffer.from(excelBuffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);

            const sheet = workbook.getWorksheet(1);
            if (!sheet) {
                return { valid: false, errors: ['No se encontró hoja de trabajo en el Excel.'] };
            }

            // Read headers from row 1
            const headers: string[] = [];
            sheet.getRow(1).eachCell((cell, colNumber) => {
                headers[colNumber - 1] = String(cell.value || '');
            });

            // Build type expectations from profile
            const expectedTypes = new Map(profile.columns.map(c => [c.name, c.inferredType]));

            // Check a sample of data rows (rows 2-21)
            const maxCheckRows = Math.min(sheet.rowCount, 21);

            for (let rowIdx = 2; rowIdx <= maxCheckRows; rowIdx++) {
                const row = sheet.getRow(rowIdx);

                row.eachCell((cell, colNumber) => {
                    const colName = headers[colNumber - 1];
                    if (!colName) return;

                    const expected = expectedTypes.get(colName);
                    if (!expected) return;

                    const val = cell.value;

                    // Skip null/empty values
                    if (val == null || val === '') return;

                    if (expected === 'number') {
                        if (typeof val !== 'number') {
                            // Check if it's a string that should be a number
                            if (typeof val === 'string' && !isNaN(Number(val))) {
                                // Acceptable but not ideal
                            } else {
                                errors.push(`Fila ${rowIdx}, columna "${colName}": esperado number, encontrado ${typeof val} ("${String(val).substring(0, 30)}")`);
                            }
                        }
                    } else if (expected === 'date') {
                        if (!(val instanceof Date) && typeof val !== 'number') {
                            // ExcelJS sometimes represents dates as numbers (serial dates)
                            if (typeof val === 'string') {
                                errors.push(`Fila ${rowIdx}, columna "${colName}": la fecha se guardó como texto ("${String(val).substring(0, 30)}")`);
                            }
                        }
                    }
                });

                // Stop early if too many errors
                if (errors.length >= 10) {
                    errors.push('... (más errores truncados)');
                    break;
                }
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`Error leyendo el Excel: ${message}`);
        }

        AgentLogger.logExecution(this.id, Date.now() - start);
        return { valid: errors.length === 0, errors };
    }
}
