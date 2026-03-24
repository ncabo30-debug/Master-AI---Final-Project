import ExcelJS from 'exceljs';
import { AgentBus, type AgentMessage } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import { LLMService } from './core/LLMService';
import type { ProfileResult, CleanResult } from './types';
import {
    detectDominantDateFormat,
    detectMostCommonYear,
    formatDateToString,
    parseDate,
} from './dateUtils';

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

        // D-6: Filter rows where every value is null or empty string
        const beforeCount = cleanedData.length;
        cleanedData = cleanedData.filter(row =>
            Object.values(row).some(v => v !== null && v !== undefined && v !== '')
        );
        if (cleanedData.length < beforeCount) {
            appliedRules.push(`Filas completamente nulas eliminadas: ${beforeCount - cleanedData.length}`);
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

        // Pre-scan date format and year context once per column (before the row loop)
        let dominantDateFormat = 'dd/mm/yyyy';
        let yearContext = new Date().getFullYear();
        if (targetType === 'date') {
            dominantDateFormat = detectDominantDateFormat(data, colName);
            yearContext = detectMostCommonYear(data, colName);
        }

        return data.map(row => {
            const val = row[colName];
            if (val == null || val === '') {
                row[colName] = null;
                return row;
            }

            let strVal = String(val).trim();

            // Replace null-like placeholders
            if (['N/A', 'NA', 'NULL', 'NO_SABE', '-', 'UNDEFINED'].includes(strVal.toUpperCase())) {
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
                const parsed = parseDate(strVal, yearContext);
                // D-4: Output as formatted string in the document's dominant format (not Date object)
                row[colName] = parsed ? formatDateToString(parsed, dominantDateFormat) : null;
            } else if (targetType === 'boolean') {
                const lower = strVal.toLowerCase();
                row[colName] = ['true', 'yes', 'si', 'sí', '1', 'activo'].includes(lower);
            } else {
                // D-3: Only apply lowercase if the cleaning rules explicitly request it.
                // Never lowercase IDs, names, cities, or product columns by default.
                if (hasRule('lowercase') || hasRule('minúscula') || hasRule('minusculas')) {
                    row[colName] = strVal.toLowerCase();
                } else {
                    row[colName] = strVal;
                }
            }

            return row;
        });
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

    /**
     * D-1: Calls LLM for adaptive fix instructions and actually applies them to all rows.
     * Supported actions: "trim", "lowercase", "replace_nulls", "remove_commas", "to_number"
     */
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

Genera un JSON con instrucciones de limpieza para corregir los errores.
Usa SOLO estas acciones: "trim", "lowercase", "replace_nulls", "remove_commas", "to_number"
{
  "fixes": [
    { "column": "nombre_col", "action": "trim" }
  ]
}
Solo devuelve JSON puro.`;

        const jsonContent = await LLMService.call(prompt, this.id, 'flash');
        try {
            const match = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            const cleanContent = match ? match[1] : jsonContent.trim();
            const parsed = JSON.parse(cleanContent) as { fixes: { column: string; action: string }[] };
            AgentLogger.logLLMCall(this.id, 'AI-adaptive-cleaning', JSON.stringify(parsed), 0);

            // Apply each fix instruction to the full dataset
            let result = data.map(row => ({ ...row }));
            const NULL_PLACEHOLDERS = ['N/A', 'NA', 'NULL', 'NO_SABE', '-', 'UNDEFINED'];
            for (const fix of parsed.fixes ?? []) {
                result = result.map(row => {
                    const val = row[fix.column];
                    if (val == null) return row;
                    const str = String(val);
                    switch (fix.action) {
                        case 'trim':
                            row[fix.column] = str.trim();
                            break;
                        case 'lowercase':
                            row[fix.column] = str.trim().toLowerCase();
                            break;
                        case 'replace_nulls':
                            if (NULL_PLACEHOLDERS.includes(str.trim().toUpperCase()))
                                row[fix.column] = null;
                            break;
                        case 'remove_commas':
                            row[fix.column] = str.replace(/,/g, '');
                            break;
                        case 'to_number': {
                            const n = parseFloat(str.replace(/,/g, '').replace(/[$€£¥]/g, '').trim());
                            row[fix.column] = isNaN(n) ? null : n;
                            break;
                        }
                    }
                    return row;
                });
            }
            return result;
        } catch {
            AgentLogger.error(this.id, 'cleanWithAI: no se pudo parsear o aplicar la respuesta del LLM');
            return data;
        }
    }
}
