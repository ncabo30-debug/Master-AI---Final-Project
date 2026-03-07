import { AgentBus } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import { LLMService, LLM_TIMEOUT_MS } from './core/LLMService';
import type { VizProposal, VizProposalsResult, ProfileResult } from './types';

/**
 * VizExpertAgent (Agent 6): Proposes 3 visualization combinations based on
 * the approved analysis and the dataset profile (column types, roles).
 */
export class VizExpertAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'specialist', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: any): Promise<void> {
        if (message.type === 'PROPOSE_VISUALIZATIONS') {
            const result = await this.execute(message.payload);
            this.communicate(message.from, 'VISUALIZATIONS_PROPOSED', result);
        }
    }

    public async execute(context: {
        analysis: string;
        profile: ProfileResult;
    }): Promise<VizProposalsResult> {
        const start = Date.now();
        const { analysis, profile } = context;

        const columnsDesc = profile.columns
            .map(c => `${c.name} (${c.inferredType})`)
            .join(', ');

        const prompt = `Eres un Experto en Data Visualization y Business Intelligence.

El análisis aprobado del dataset es:
${analysis}

Las columnas disponibles son: ${columnsDesc}

Propón EXACTAMENTE 3 combinaciones diferentes de visualización para un Dashboard. Para cada una devuelve:
- id: "viz_1", "viz_2", "viz_3"
- title: nombre descriptivo del gráfico
- description: qué insight revela esta visualización
- chartType: uno de "bar", "line", "scatter", "pie", "area", "heatmap"
- xAxis: nombre de la columna para el eje X
- yAxis: nombre de la columna para el eje Y
- groupBy: (opcional) columna para agrupar
- filters: (opcional) array de columnas sugeridas como filtros interactivos

Responde ÚNICAMENTE con JSON puro:
{
  "proposals": [
    { "id": "viz_1", "title": "...", "description": "...", "chartType": "bar", "xAxis": "...", "yAxis": "...", "groupBy": "...", "filters": ["..."] }
  ]
}`;

        try {
            const jsonContent = await LLMService.call(prompt, this.id, 'pro');
            const match = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            const cleanContent = match ? match[1] : jsonContent.trim();
            const parsed = JSON.parse(cleanContent) as VizProposalsResult;

            if (!parsed.proposals || !Array.isArray(parsed.proposals)) {
                throw new Error('Invalid viz proposals structure');
            }

            AgentLogger.logExecution(this.id, Date.now() - start);
            return parsed;
        } catch (err) {
            AgentLogger.error(this.id, err);

            // Fallback: generate basic proposals from profile
            const numerics = profile.columns.filter(c => c.inferredType === 'number');
            const categories = profile.columns.filter(c => c.inferredType === 'string');
            const dates = profile.columns.filter(c => c.inferredType === 'date');

            const xCol = categories[0]?.name || dates[0]?.name || profile.columns[0]?.name || 'x';
            const yCol = numerics[0]?.name || profile.columns[1]?.name || 'y';
            const yCol2 = numerics[1]?.name || yCol;

            const fallback: VizProposal[] = [
                { id: 'viz_1', title: `${yCol} por ${xCol}`, description: 'Comparativa principal', chartType: 'bar', xAxis: xCol, yAxis: yCol },
                { id: 'viz_2', title: `Tendencia de ${yCol2}`, description: 'Evolución temporal', chartType: 'line', xAxis: dates[0]?.name || xCol, yAxis: yCol2 },
                { id: 'viz_3', title: `Distribución de ${yCol}`, description: 'Distribución por categoría', chartType: 'pie', xAxis: xCol, yAxis: yCol },
            ];

            return { proposals: fallback };
        }
    }

    /**
     * M6: Valida que una propuesta de visualización sea factible con los datos disponibles.
     * Verifica: existencia de columnas, compatibilidad de tipo de gráfico.
     */
    public static validateFeasibility(
        viz: VizProposal,
        profile: ProfileResult
    ): { feasible: boolean; issues: string[] } {
        const issues: string[] = [];
        const colNames = new Set(profile.columns.map(c => c.name));
        const colMap = new Map(profile.columns.map(c => [c.name, c.inferredType]));

        // Verificar existencia de columnas
        if (!colNames.has(viz.xAxis)) {
            issues.push(`Columna X "${viz.xAxis}" no existe en el dataset.`);
        }
        if (!colNames.has(viz.yAxis)) {
            issues.push(`Columna Y "${viz.yAxis}" no existe en el dataset.`);
        }
        if (viz.groupBy && !colNames.has(viz.groupBy)) {
            issues.push(`Columna groupBy "${viz.groupBy}" no existe en el dataset.`);
        }
        if (viz.filters) {
            for (const f of viz.filters) {
                if (!colNames.has(f)) {
                    issues.push(`Columna de filtro "${f}" no existe en el dataset.`);
                }
            }
        }

        // Verificar compatibilidad de tipo de gráfico con tipos de datos
        const yType = colMap.get(viz.yAxis);
        const xType = colMap.get(viz.xAxis);

        if (viz.chartType === 'pie' && yType && yType !== 'number') {
            issues.push(`Gráfico pie requiere eje Y numérico, pero "${viz.yAxis}" es tipo ${yType}.`);
        }
        if (viz.chartType === 'scatter') {
            if (xType && xType !== 'number') {
                issues.push(`Scatter requiere eje X numérico, pero "${viz.xAxis}" es tipo ${xType}.`);
            }
            if (yType && yType !== 'number') {
                issues.push(`Scatter requiere eje Y numérico, pero "${viz.yAxis}" es tipo ${yType}.`);
            }
        }
        if ((viz.chartType === 'line' || viz.chartType === 'area') && xType && xType !== 'date' && xType !== 'number') {
            issues.push(`Gráfico ${viz.chartType} funciona mejor con eje X temporal o numérico, pero "${viz.xAxis}" es tipo ${xType}.`);
        }

        return { feasible: issues.length === 0, issues };
    }
}
