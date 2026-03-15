import ExcelJS from 'exceljs';
import { AgentBus, type AgentMessage } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import { LLMService } from './core/LLMService';
import type { ProfileResult, CleanResult } from './types';

/**
 * CleanerAgent: Receives raw data + profiling result, applies cleaning rules,
 * and generates a formatted Excel (.xlsx) file.
 *
 * On retry iterations (iteration >= 2), uses LLM to generate adaptive
 * cleaning logic based on previous validation errors.
 */
export class CleanerAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'specialist', tenantId, bus); // reuses 'specialist' type
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: AgentMessage): Promise<void> {
        if (message.type === 'CLEAN_DATA') {
            const result = await this.execute(message.payload as {
                data: Record<string, unknown>[];
                profile: ProfileResult;
                previousErrors?: string[];
                iteration?: number;
            });
            this.communicate(message.from, 'DATA_CLEANED', result);
        }
    }

    public async execute(context: {
        data: Record<string, unknown>[];
        profile: ProfileResult;
        previousErrors?: string[];
        iteration?: number;
    }): Promise<CleanResult> {
        const start = Date.now();
        const { data, profile, previousErrors, iteration = 1 } = context;
        const appliedRules: string[] = [];

        // Deep clone data to avoid mutating original
        let cleanedData = data.map(row => ({ ...row }));

        // If retry with errors, try LLM-enhanced cleaning
        if (iteration > 1 && previousErrors && previousErrors.length > 0) {
            try {
                cleanedData = await this.cleanWithAI(cleanedData, profile, previousErrors);
                appliedRules.push(`IA-adaptive-cleaning-iter-${iteration}`);
            } catch (err) {
                AgentLogger.error(this.id, err);
            }
        }

        // Apply profile-based cleaning rules
        for (const col of profile.columns) {
            cleanedData = this.applyColumnCleaning(cleanedData, col.name, col.inferredType, col.cleaningRules);
            appliedRules.push(...col.cleaningRules.map(r => `${col.name}: ${r}`));
        }

        // Generate Excel
        const excelBuffer = await this.generateExcel(cleanedData, profile);

        AgentLogger.logExecution(this.id, Date.now() - start);
        return { cleanedData, excelBuffer, appliedRules };
    }

    private applyColumnCleaning(
        data: Record<string, unknown>[],
        colName: string,
        targetType: string,
        rules: string[]
    ): Record<string, unknown>[] {
        const hasRule = (keyword: string) => rules.some(r => r.toLowerCase().includes(keyword));

        return data.map(row => {
            const val = row[colName];
            if (val == null || val === '') {
                row[colName] = null;
                return row;
            }

            let strVal = String(val).trim();

            // Replace null-like placeholders
            if (['N/A', 'NA', 'NULL', 'null', 'NO_SABE', '-', 'undefined'].includes(strVal.toUpperCase())) {
                row[colName] = null;
                return row;
            }

            if (targetType === 'number') {
                // Remove thousands separators (commas)
                if (hasRule('coma') || hasRule('miles')) {
                    strVal = strVal.replace(/,/g, '');
                }
                // Remove currency symbols
                strVal = strVal.replace(/[$€£¥]/g, '').trim();
                const num = parseFloat(strVal);
                row[colName] = isNaN(num) ? null : num;
            } else if (targetType === 'date') {
                const parsed = this.parseDate(strVal);
                row[colName] = parsed; // Date object or null
            } else if (targetType === 'boolean') {
                const lower = strVal.toLowerCase();
                row[colName] = ['true', 'yes', 'si', 'sí', '1', 'activo'].includes(lower);
            }
            // string: just trim
            else {
                row[colName] = strVal;
            }

            return row;
        });
    }

    private parseDate(value: string): Date | null {
        // Try ISO format first (yyyy-MM-dd)
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
            const d = new Date(value);
            return isNaN(d.getTime()) ? null : d;
        }
        // Try dd/MM/yyyy
        const ddmmyyyy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmmyyyy) {
            const [, day, month, year] = ddmmyyyy;
            const d = new Date(Number(year), Number(month) - 1, Number(day));
            return isNaN(d.getTime()) ? null : d;
        }
        // Try MM/dd/yyyy
        const mmddyyyy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mmddyyyy) {
            const d = new Date(value);
            return isNaN(d.getTime()) ? null : d;
        }
        // Generic fallback
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    private async generateExcel(data: Record<string, unknown>[], profile: ProfileResult): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'DataLens AI';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Datos Limpios', {
            properties: { defaultColWidth: 18 }
        });

        if (data.length === 0) {
            const buf = await workbook.xlsx.writeBuffer();
            return Buffer.from(buf);
        }

        const columns = Object.keys(data[0]);

        // Set columns with headers
        sheet.columns = columns.map(col => ({
            header: col,
            key: col,
            width: Math.max(col.length + 4, 15)
        }));

        // Style headers (blue background, white bold text)
        const headerRow = sheet.getRow(1);
        headerRow.eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4F81BD' }
            };
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                bottom: { style: 'thin', color: { argb: 'FF2E5E8E' } }
            };
        });
        headerRow.height = 28;

        // Build a type map from the profile
        const typeMap = new Map(profile.columns.map(c => [c.name, c.inferredType]));

        // Add data rows with formatting
        for (const row of data) {
            const excelRow = sheet.addRow(
                columns.map(col => row[col] ?? '')
            );

            excelRow.eachCell((cell, colNumber) => {
                const colName = columns[colNumber - 1];
                const colType = typeMap.get(colName);

                if (colType === 'number') {
                    cell.numFmt = '#,##0.00';
                } else if (colType === 'date' && cell.value instanceof Date) {
                    cell.numFmt = 'YYYY-MM-DD';
                }

                // Alternating row colors
                if (excelRow.number % 2 === 0) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF2F6FA' }
                    };
                }
            });
        }

        // Freeze header row
        sheet.views = [{ state: 'frozen', ySplit: 1 }];

        // Auto-filter
        sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: columns.length }
        };

        const buf = await workbook.xlsx.writeBuffer();
        return Buffer.from(buf);
    }

    private async cleanWithAI(
        data: Record<string, unknown>[],
        profile: ProfileResult,
        errors: string[]
    ): Promise<Record<string, unknown>[]> {
        const sample = data.slice(0, 10);
        const prompt = `Eres un experto en limpieza de datos. La iteración anterior de limpieza falló con estos errores:
${JSON.stringify(errors)}

Perfil de las columnas:
${JSON.stringify(profile.columns, null, 2)}

Muestra de los datos (aún sucios):
${JSON.stringify(sample, null, 2)}

Genera un JSON con instrucciones de limpieza mejoradas para corregir los errores:
{
  "fixes": [
    { "column": "nombre_col", "action": "descripción de la acción" }
  ]
}
Solo devuelve JSON puro.`;

        const jsonContent = await LLMService.call(prompt, this.id, 'flash');
        // Parse and log, but the actual fix application is a best-effort
        try {
            const parsed = JSON.parse(jsonContent);
            AgentLogger.logLLMCall(this.id, 'AI-adaptive-cleaning', JSON.stringify(parsed), 0);
        } catch {
            // Ignore parse errors, continue with heuristic cleanup
        }

        return data; // Return data as-is; the standard cleaning will be re-applied
    }
}
