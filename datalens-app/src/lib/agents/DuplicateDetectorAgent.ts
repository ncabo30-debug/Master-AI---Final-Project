import { AgentBus } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import type { DuplicateReport } from './types';

/**
 * DuplicateDetectorAgent (M1): Detecta y maneja duplicados.
 *
 * - Duplicados exactos: hash de fila completa → eliminar automáticamente.
 * - Duplicados parciales: coinciden en columnas clave pero difieren en menores → solo flaggear.
 * - Genera un reporte para que el AnalystAgent lo tenga en cuenta.
 */
export class DuplicateDetectorAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'validator', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: any): Promise<void> {
        if (message.type === 'DETECT_DUPLICATES') {
            const result = await this.execute(message.payload);
            this.communicate(message.from, 'DUPLICATES_DETECTED', result);
        }
    }

    public async execute(context: {
        data: Record<string, unknown>[];
        keyColumns?: string[];
    }): Promise<{
        cleanedData: Record<string, unknown>[];
        report: DuplicateReport;
    }> {
        const start = Date.now();
        const { data } = context;

        // Auto-inferir columnas clave si no se proporcionan
        const keyColumns = context.keyColumns || this.inferKeyColumns(data);

        // 1. Detectar y eliminar duplicados exactos
        const seen = new Map<string, number>(); // hash → first index
        const exactDuplicateIndices = new Set<number>();

        for (let i = 0; i < data.length; i++) {
            const hash = this.hashRow(data[i]);
            if (seen.has(hash)) {
                exactDuplicateIndices.add(i);
            } else {
                seen.set(hash, i);
            }
        }

        // 2. Detectar duplicados parciales (coinciden en columnas clave)
        const partialFlagged: { rowIndex: number; matchedWith: number }[] = [];
        const flaggedRows: number[] = [];

        if (keyColumns.length > 0) {
            const keyMap = new Map<string, number>(); // key hash → first index

            for (let i = 0; i < data.length; i++) {
                if (exactDuplicateIndices.has(i)) continue; // Ya eliminado

                const keyHash = this.hashRowByColumns(data[i], keyColumns);
                if (keyMap.has(keyHash)) {
                    const originalIndex = keyMap.get(keyHash)!;
                    // Solo flaggear si difieren en columnas no-clave
                    const fullHashA = this.hashRow(data[originalIndex]);
                    const fullHashB = this.hashRow(data[i]);
                    if (fullHashA !== fullHashB) {
                        partialFlagged.push({ rowIndex: i, matchedWith: originalIndex });
                        flaggedRows.push(i);
                    }
                } else {
                    keyMap.set(keyHash, i);
                }
            }
        }

        // 3. Crear dataset limpio (sin duplicados exactos)
        const cleanedData = data.filter((_, i) => !exactDuplicateIndices.has(i));

        const report: DuplicateReport = {
            exactRemoved: exactDuplicateIndices.size,
            partialFlagged,
            flaggedRows
        };

        AgentLogger.logStep(this.id,
            `🔍 Duplicados: ${report.exactRemoved} exactos eliminados, ${report.partialFlagged.length} parciales flaggeados`
        );
        AgentLogger.logExecution(this.id, Date.now() - start);

        return { cleanedData, report };
    }

    /**
     * Infiere columnas clave: columnas con alta cardinalidad (potenciales IDs)
     * o columnas con nombre sugestivo (id, código, nombre).
     */
    private inferKeyColumns(data: Record<string, unknown>[]): string[] {
        if (data.length === 0) return [];
        const cols = Object.keys(data[0]);
        const keyPatterns = /^(id|codigo|code|nombre|name|email|rut|dni|cuit)$/i;

        const keys = cols.filter(col => {
            // Por nombre
            if (keyPatterns.test(col)) return true;
            // Por unicidad alta (>80% valores únicos)
            const uniques = new Set(data.slice(0, 200).map(r => String(r[col])));
            return uniques.size > data.slice(0, 200).length * 0.8;
        });

        return keys.length > 0 ? keys : cols.slice(0, 2); // Fallback: primeras 2 columnas
    }

    private hashRow(row: Record<string, unknown>): string {
        return JSON.stringify(Object.values(row));
    }

    private hashRowByColumns(row: Record<string, unknown>, cols: string[]): string {
        return JSON.stringify(cols.map(c => row[c]));
    }
}
