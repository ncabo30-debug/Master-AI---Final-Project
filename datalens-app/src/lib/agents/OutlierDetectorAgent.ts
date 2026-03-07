import { AgentBus } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import type { OutlierReport, OutlierColumnReport, ProfileResult } from './types';

/**
 * OutlierDetectorAgent (M4): Detecta valores atípicos.
 *
 * - Numéricas: IQR (Q1 − 1.5×IQR, Q3 + 1.5×IQR)
 * - Fechas: detecta fechas en futuro >2 años o pasado >100 años
 * - No elimina nada, solo reporta para que el AnalystAgent lo mencione.
 */
export class OutlierDetectorAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'validator', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: any): Promise<void> {
        if (message.type === 'DETECT_OUTLIERS') {
            const result = await this.execute(message.payload);
            this.communicate(message.from, 'OUTLIERS_DETECTED', result);
        }
    }

    public async execute(context: {
        data: Record<string, unknown>[];
        profile: ProfileResult;
    }): Promise<OutlierReport> {
        const start = Date.now();
        const { data, profile } = context;
        const outliers: OutlierColumnReport[] = [];

        for (const col of profile.columns) {
            if (col.inferredType === 'number') {
                const report = this.detectNumericOutliers(data, col.name);
                if (report) outliers.push(report);
            } else if (col.inferredType === 'date') {
                const report = this.detectDateOutliers(data, col.name);
                if (report) outliers.push(report);
            }
        }

        const totalOutliers = outliers.reduce((acc, o) => acc + o.count, 0);
        AgentLogger.logStep(this.id,
            `📊 Outliers: ${totalOutliers} valores atípicos en ${outliers.length} columnas`
        );
        AgentLogger.logExecution(this.id, Date.now() - start);

        return { outliers };
    }

    /**
     * Detecta outliers numéricos usando el método IQR.
     * Q1 = percentil 25, Q3 = percentil 75
     * IQR = Q3 - Q1
     * Outlier si valor < Q1 - 1.5*IQR o valor > Q3 + 1.5*IQR
     */
    private detectNumericOutliers(
        data: Record<string, unknown>[],
        col: string
    ): OutlierColumnReport | null {
        const values = data
            .map(r => Number(r[col]))
            .filter(v => !isNaN(v) && isFinite(v));

        if (values.length < 4) return null;

        values.sort((a, b) => a - b);

        const q1 = this.percentile(values, 25);
        const q3 = this.percentile(values, 75);
        const iqr = q3 - q1;

        if (iqr === 0) return null; // No hay variación

        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;

        const outlierValues = values.filter(v => v < lowerBound || v > upperBound);

        if (outlierValues.length === 0) return null;

        // Reportar solo los 10 más extremos
        const extremeValues = outlierValues
            .sort((a, b) => Math.abs(b) - Math.abs(a))
            .slice(0, 10);

        return {
            column: col,
            count: outlierValues.length,
            extremeValues,
            lowerBound: Math.round(lowerBound * 100) / 100,
            upperBound: Math.round(upperBound * 100) / 100
        };
    }

    /**
     * Detecta fechas irrazonables: futuro >2 años o pasado >100 años.
     */
    private detectDateOutliers(
        data: Record<string, unknown>[],
        col: string
    ): OutlierColumnReport | null {
        const now = new Date();
        const futureLimit = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
        const pastLimit = new Date(now.getFullYear() - 100, now.getMonth(), now.getDate());

        const outlierDates: string[] = [];

        for (const row of data) {
            const val = row[col];
            if (val == null) continue;

            let date: Date;
            if (val instanceof Date) {
                date = val;
            } else {
                date = new Date(String(val));
                if (isNaN(date.getTime())) continue;
            }

            if (date > futureLimit || date < pastLimit) {
                outlierDates.push(date.toISOString().split('T')[0]);
            }
        }

        if (outlierDates.length === 0) return null;

        return {
            column: col,
            count: outlierDates.length,
            extremeValues: outlierDates.slice(0, 10)
        };
    }

    private percentile(sorted: number[], p: number): number {
        const index = (p / 100) * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) return sorted[lower];
        return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
    }
}
