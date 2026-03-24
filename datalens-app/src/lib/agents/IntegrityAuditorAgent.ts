import { AgentBus, type AgentMessage } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import type { IntegrityResult, FinalAuditResult, ProfileResult, ReconciliationReport, ReconciliationDiscrepancy } from './types';

/**
 * IntegrityAuditorAgent: Verifies that no data was lost during the
 * cleaning process by comparing row counts and column presence.
 *
 * H-10: Also provides cell-by-cell reconciliation after normalization.
 */
export class IntegrityAuditorAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'validator', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: AgentMessage): Promise<void> {
        if (message.type === 'AUDIT_INTEGRITY') {
            const result = await this.execute(message.payload as {
                rawData: Record<string, unknown>[];
                cleanedData: Record<string, unknown>[];
            });
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

        // 4. D-2: Numeric checksum with proper raw-value normalization
        if (rowCountMatch) {
            const normalizeRaw = (v: unknown): string =>
                String(v).replace(/[$€£¥,\s]/g, '').trim();

            for (const col of rawCols) {
                const rawNumericCount = rawData.filter(row => {
                    const n = normalizeRaw(row[col]);
                    return n !== '' && !isNaN(Number(n));
                }).length;

                if (rawNumericCount < rawData.length * 0.5) continue;

                const rawSum = rawData.reduce((acc, row) => {
                    const val = Number(normalizeRaw(row[col]));
                    return isNaN(val) ? acc : acc + val;
                }, 0);

                const cleanSum = cleanedData.reduce((acc, row) => {
                    const val = Number(row[col]);
                    return isNaN(val) ? acc : acc + val;
                }, 0);

                if (rawSum > 0 && cleanSum > 0) {
                    const diff = Math.abs(rawSum - cleanSum);
                    const tolerance = rawSum * 0.001;
                    if (diff > tolerance) {
                        errors.push(`Checksum columna "${col}": original=${rawSum.toFixed(2)}, limpio=${cleanSum.toFixed(2)}, diff=${diff.toFixed(2)}`);
                    }
                }
            }
        }

        AgentLogger.logExecution(this.id, Date.now() - start);
        return { valid: errors.length === 0, rowCountMatch, columnCountMatch, errors };
    }

    // ═══════════════════════════════════════════════════════════
    //  H-10: Reconciliation — cell-by-cell semantic equivalence
    // ═══════════════════════════════════════════════════════════

    /**
     * Compares originalData vs cleanedData cell-by-cell, verifying that
     * the semantic meaning of each value is preserved after normalization.
     * Uses type-aware comparison: dates by timestamp, numbers by value,
     * strings by trim+lowercase, IDs by exact match.
     */
    public reconcile(
        originalData: Record<string, unknown>[],
        cleanedData: Record<string, unknown>[],
        profile: ProfileResult,
        duplicatesRemoved: number
    ): ReconciliationReport {
        const discrepancies: ReconciliationDiscrepancy[] = [];

        // 1. Row accounting
        const expectedRows = originalData.length - duplicatesRemoved;
        const rowsAccounted = cleanedData.length === expectedRows;
        if (!rowsAccounted) {
            discrepancies.push({
                column: '*',
                rowIndex: -1,
                originalValue: originalData.length,
                cleanedValue: cleanedData.length,
                reason: `Filas esperadas: ${expectedRows} (${originalData.length} - ${duplicatesRemoved} duplicados), encontradas: ${cleanedData.length}`,
                severity: 'blocking',
            });
        }

        // 2. Build type map from profile
        const typeMap = new Map(profile.columns.map(c => [c.name, c.inferredType]));

        // 3. Cell-by-cell comparison (up to the min of both lengths, capped for performance)
        const rowsToCheck = Math.min(cleanedData.length, originalData.length, 500);
        let totalCells = 0;
        let matchedCells = 0;

        for (let i = 0; i < rowsToCheck; i++) {
            const origRow = originalData[i];
            const cleanRow = cleanedData[i];
            const cols = Object.keys(origRow);

            for (const col of cols) {
                totalCells++;
                const origVal = origRow[col];
                const cleanVal = cleanRow[col];
                const colType = typeMap.get(col) || 'string';

                // Both null → match
                if ((origVal == null || origVal === '') && (cleanVal == null || cleanVal === '')) {
                    matchedCells++;
                    continue;
                }
                // One null other not — check if it was a null placeholder being cleaned
                if ((origVal == null || origVal === '') !== (cleanVal == null || cleanVal === '')) {
                    const origStr = String(origVal ?? '').trim().toUpperCase();
                    const nullPlaceholders = ['N/A', 'NA', 'NULL', 'NO_SABE', '-', 'UNDEFINED', ''];
                    if (nullPlaceholders.includes(origStr) && (cleanVal == null || cleanVal === '')) {
                        matchedCells++;
                        continue;
                    }
                    discrepancies.push({
                        column: col, rowIndex: i,
                        originalValue: origVal, cleanedValue: cleanVal,
                        reason: `Valor ${origVal == null ? 'nulo' : 'no-nulo'} pasó a ${cleanVal == null ? 'nulo' : 'no-nulo'}`,
                        severity: 'warning',
                    });
                    continue;
                }

                // Type-specific comparison
                let equivalent = false;
                switch (colType) {
                    case 'date': {
                        const origDate = new Date(String(origVal));
                        const cleanDate = cleanVal instanceof Date ? cleanVal : new Date(String(cleanVal));
                        equivalent = !isNaN(origDate.getTime()) && !isNaN(cleanDate.getTime())
                            && origDate.getTime() === cleanDate.getTime();
                        break;
                    }
                    case 'number': {
                        const origNum = Number(String(origVal).replace(/[$€£¥,\s]/g, '').trim());
                        const cleanNum = Number(cleanVal);
                        if (!isNaN(origNum) && !isNaN(cleanNum)) {
                            const diff = Math.abs(origNum - cleanNum);
                            equivalent = diff <= Math.abs(origNum) * 0.00001; // 0.001% tolerance
                        }
                        break;
                    }
                    default: {
                        // String / dimension: trim + lowercase comparison
                        const origStr = String(origVal).trim().toLowerCase();
                        const cleanStr = String(cleanVal).trim().toLowerCase();
                        equivalent = origStr === cleanStr;
                        break;
                    }
                }

                if (equivalent) {
                    matchedCells++;
                } else {
                    discrepancies.push({
                        column: col, rowIndex: i,
                        originalValue: origVal, cleanedValue: cleanVal,
                        reason: `Valor ${colType} cambió: "${origVal}" → "${cleanVal}"`,
                        severity: colType === 'number' ? 'blocking' : 'warning',
                    });
                }
            }
        }

        const reconciliationRate = totalCells > 0 ? (matchedCells / totalCells) * 100 : 100;
        const blockingCount = discrepancies.filter(d => d.severity === 'blocking').length;
        const warningCount = discrepancies.filter(d => d.severity === 'warning').length;

        const report: ReconciliationReport = {
            passed: blockingCount === 0 && rowsAccounted,
            rowsAccounted,
            reconciliationRate: Math.round(reconciliationRate * 100) / 100,
            discrepancies: discrepancies.slice(0, 50), // cap output
            duplicatesRemoved,
            blockingCount,
            warningCount,
        };

        AgentLogger.logStep(this.id,
            `🔄 Reconciliación: ${report.reconciliationRate}% celdas equivalentes, ${blockingCount} bloqueantes, ${warningCount} warnings`
        );

        return report;
    }

    // ── Role B: Verify analysis claims against actual data ──

    public verifyAnalysisClaim(
        cleanedData: Record<string, unknown>[],
        userFeedback: string
    ): string {
        const cols = cleanedData.length > 0 ? Object.keys(cleanedData[0]) : [];
        const rowCount = cleanedData.length;

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

    public auditFinalReport(
        sourceData: Record<string, unknown>[],
        reportData: Array<{ name: string; value: number }>
    ): FinalAuditResult {
        const discrepancies: string[] = [];

        if (!reportData || reportData.length === 0) {
            return { passed: true, discrepancies: ['Sin datos de reporte para auditar.'] };
        }

        const reportTotal = reportData.reduce((acc, d) => acc + d.value, 0);

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
            const tolerance = bestMatch.sourceSum * 0.01;
            if (bestMatch.diff > tolerance) {
                discrepancies.push(`La suma del reporte (${reportTotal.toFixed(2)}) difiere de la columna "${bestMatch.col}" (${bestMatch.sourceSum.toFixed(2)}) en ${bestMatch.diff.toFixed(2)}`);
            }
        }

        AgentLogger.logStep(this.id, `Auditoría final: ${discrepancies.length === 0 ? 'PASADA' : discrepancies.join(' | ')}`);

        return { passed: discrepancies.length === 0, discrepancies };
    }
}
