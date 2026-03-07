import { AgentBus } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import type { SchemaMap, ReportConfig } from './types';
import { extractColumnsByType } from './utils';

export class ReportAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'report', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: any): Promise<void> {
        if (message.type === 'GENERATE_REPORT') {
            const reportConfig = await this.execute(message.payload);
            this.communicate(message.from, 'REPORT_GENERATED', { reportConfig });
        }
    }

    public async execute(context: { data: Record<string, unknown>[]; schema: SchemaMap; answers?: Record<string, string> }): Promise<ReportConfig> {
        const { data, schema, answers } = context;

        const { numericCols, categoryCols } = extractColumnsByType(schema);

        if (numericCols.length === 0) {
            return { type: 'table', data: data.slice(0, 100) as any, message: "No se encontraron datos numéricos para graficar." };
        }

        const yAxis = numericCols[0];
        let xAxis = categoryCols.length > 0 ? categoryCols[0] : 'index';
        if (answers && answers['q1']) xAxis = answers['q1'];

        let aggregatedData: Array<{ name: string; value: number }> = [];
        try {
            if (xAxis !== 'index') {
                const grouped = data.reduce((acc: Record<string, number>, row) => {
                    const key = row[xAxis];
                    if (key == null) return acc;
                    const groupKey = String(key);
                    if (!acc[groupKey]) acc[groupKey] = 0;
                    const val = Number(row[yAxis]);
                    if (!isNaN(val)) acc[groupKey] += val;
                    return acc;
                }, {} as Record<string, number>);

                aggregatedData = Object.entries(grouped)
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 15);
            } else {
                aggregatedData = data.slice(0, 20).map((r, i) => {
                    const val = Number(r[yAxis]);
                    return { name: `Row ${i}`, value: isNaN(val) ? 0 : val };
                });
            }
        } catch (err) {
            AgentLogger.error(this.id, err);
            return { type: 'table', data: data.slice(0, 50) as any, message: "Falló la generación estática." };
        }

        return { type: 'bar', xAxis: 'name', yAxis: 'value', data: aggregatedData, title: `Análisis de ${yAxis} por ${xAxis}` };
    }
}
