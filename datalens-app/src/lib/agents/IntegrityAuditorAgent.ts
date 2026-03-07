import { AgentBus } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import type { IntegrityResult, FinalAuditResult } from './types';

/**
 * IntegrityAuditorAgent: Verifies that no data was lost during the
 * cleaning process by comparing row counts and column presence.
 */
export class IntegrityAuditorAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'validator', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: any): Promise<void> {
        if (message.type === 'AUDIT_INTEGRITY') {
            const result = await this.execute(message.payload);
            this.communicate(message.from, 'INTEGRITY_AUDITED', result);
        }
    }

    public async execute(context: {
        rawData: Record<string, unknown>[];
        cleanedData: Record<string, unknown>[];
    }): Promise<IntegrityResult> {
        const start = Date.now();
        const { rawData, cleanedData } = context;
        const errors: string[] = [];

        // 1. Row count check
        const rowCountMatch = rawData.length === cleanedData.length;
        if (!rowCountMatch) {
            errors.push(`Pérdida de filas: original=${rawData.length}, limpio=${cleanedData.length}`);
        }

        // 2. Column count check
        const rawCols = rawData.length > 0 ? Object.keys(rawData[0]) : [];
        const cleanCols = cleanedData.length > 0 ? Object.keys(cleanedData[0]) : [];
        const columnCountMatch = rawCols.length === cleanCols.length;

        if (!columnCountMatch) {
            errors.push(`Diferencia en columnas: original=${rawCols.length}, limpio=${cleanCols.length}`);
        }

        // 3. Check all original columns are present
        const missingCols = rawCols.filter(c => !cleanCols.includes(c));
        if (missingCols.length > 0) {
            errors.push(`Columnas faltantes: ${missingCols.join(', ')}`);
        }

        // 4. Numeric checksum (sum of all numeric values should be close)
        if (rowCountMatch) {
            for (const col of rawCols) {
                const rawSum = rawData.reduce((acc, row) => {
                    const val = Number(String(row[col]).replace(/,/g, ''));
                    return isNaN(val) ? acc : acc + val;
                }, 0);

                const cleanSum = cleanedData.reduce((acc, row) => {
                    const val = Number(row[col]);
                    return isNaN(val) ? acc : acc + val;
                }, 0);

                // Only flag if both have significant numeric content and differ
                if (rawSum > 0 && cleanSum > 0) {
                    const diff = Math.abs(rawSum - cleanSum);
                    const tolerance = rawSum * 0.001; // 0.1% tolerance
                    if (diff > tolerance) {
                        errors.push(`Checksum columna "${col}": original=${rawSum.toFixed(2)}, limpio=${cleanSum.toFixed(2)}, diff=${diff.toFixed(2)}`);
                    }
                }
            }
        }

        AgentLogger.logExecution(this.id, Date.now() - start);
        return {
            valid: errors.length === 0,
            rowCountMatch,
            columnCountMatch,
            errors
        };
    }

    // ── Role B: Verify analysis claims against actual data ──

    /**
     * When the user rejects the Analyst's analysis, this method checks the data
     * to provide verified facts that help the Analyst correct its next attempt.
     */
    public verifyAnalysisClaim(
        cleanedData: Record<string, unknown>[],
        userFeedback: string
    ): string {
        const cols = cleanedData.length > 0 ? Object.keys(cleanedData[0]) : [];
        const rowCount = cleanedData.length;

        // Build basic facts about the data
        const facts: string[] = [`El dataset tiene ${rowCount} filas y ${cols.length} columnas.`];

        for (const col of cols) {
            const values = cleanedData.map(r => r[col]).filter(v => v != null);
            const numericValues = values.map(v => Number(v)).filter(v => !isNaN(v));

            if (numericValues.length > values.length * 0.5) {
                const sum = numericValues.reduce((a, b) => a + b, 0);
                const avg = sum / numericValues.length;
                const max = Math.max(...numericValues);
                const min = Math.min(...numericValues);
                facts.push(`Columna "${col}": min=${min}, max=${max}, promedio=${avg.toFixed(2)}, total=${sum.toFixed(2)}`);
            } else {
                const uniques = new Set(values.map(String));
                facts.push(`Columna "${col}": ${uniques.size} valores únicos`);
            }
        }

        return `Comentario del usuario: ${userFeedback}\n\nVerificación de datos (Agente Auditor):\n${facts.join('\n')}`;
    }

    // ── Role C: Final audit — report vs source ──

    /**
     * Compares the generated report data against the source dataset to ensure
     * the aggregated numbers are consistent.
     */
    public auditFinalReport(
        sourceData: Record<string, unknown>[],
        reportData: Array<{ name: string; value: number }>
    ): FinalAuditResult {
        const discrepancies: string[] = [];

        if (!reportData || reportData.length === 0) {
            return { passed: true, discrepancies: ['Sin datos de reporte para auditar.'] };
        }

        // Sum of report values
        const reportTotal = reportData.reduce((acc, d) => acc + d.value, 0);

        // Try to find matching numeric column in source
        const cols = sourceData.length > 0 ? Object.keys(sourceData[0]) : [];
        let bestMatch = { col: '', sourceSum: 0, diff: Infinity };

        for (const col of cols) {
            const colSum = sourceData.reduce((acc, row) => {
                const val = Number(row[col]);
                return isNaN(val) ? acc : acc + val;
            }, 0);

            const diff = Math.abs(colSum - reportTotal);
            if (diff < bestMatch.diff) {
                bestMatch = { col, sourceSum: colSum, diff };
            }
        }

        if (bestMatch.diff > 0 && bestMatch.sourceSum > 0) {
            const tolerance = bestMatch.sourceSum * 0.01; // 1% tolerance
            if (bestMatch.diff > tolerance) {
                discrepancies.push(`La suma del reporte (${reportTotal.toFixed(2)}) difiere de la columna "${bestMatch.col}" (${bestMatch.sourceSum.toFixed(2)}) en ${bestMatch.diff.toFixed(2)}`);
            }
        }

        AgentLogger.logStep(this.id, `Auditoría final: ${discrepancies.length === 0 ? 'PASADA' : discrepancies.join(' | ')}`);

        return {
            passed: discrepancies.length === 0,
            discrepancies
        };
    }
}
