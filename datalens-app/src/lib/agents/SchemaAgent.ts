import { AgentBus } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import { LLMService } from './core/LLMService';
import type { SchemaMap, SchemaResult } from './types';

export class SchemaAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'schema', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: any): Promise<void> {
        if (message.type === 'ANALYZE_SCHEMA') {
            const result = await this.execute(message.payload);
            this.communicate(message.from, 'SCHEMA_ANALYZED', result);
        }
    }

    public async execute(context: { data: Record<string, unknown>[] }): Promise<SchemaResult> {
        const start = Date.now();
        const { data } = context;

        // 1. Inferencia básica (estadística local)
        const basicSchema = this.inferSchema(data);

        // 2. Extraer muestra
        const sampleSize = Math.min(20, data.length);
        const sample = data.slice(0, sampleSize);

        // 3. IA Semantic Analysis
        let enhancedSchema: SchemaMap = { ...basicSchema };
        try {
            enhancedSchema = await this.enrichSchemaWithAI(basicSchema, sample);
        } catch (err) {
            AgentLogger.error(this.id, err);
            // Fallback to basic schema
        }

        AgentLogger.logExecution(this.id, Date.now() - start);
        return { schema: enhancedSchema };
    }

    private async enrichSchemaWithAI(basicSchema: SchemaMap, sample: Record<string, unknown>[]): Promise<SchemaMap> {
        const prompt = `
Eres un analista de datos experto. Te paso un esquema básico inferido y 20 filas de un dataset:

Basic Schema: ${JSON.stringify(basicSchema, null, 2)}
Sample Data: ${JSON.stringify(sample, null, 2)}

Por cada columna en el esquema, clasifica lo siguiente:
1. "semantic_role": Asigna uno de estos roles: "metric" (montos numéricos, cantidades), "dimension" (categorías, descripciones), "timeline" (fechas), "id" (identificadores únicos).
2. "domain": Un string corto sobre el dominio (Ej: "monto financiero", "nombre de cliente", "fecha de transacción").
3. "analysis_variables": Un array de 1 a 3 posibles acciones o reportes sugeridos para esta columna (ej. ["histograma", "evolución en el tiempo"]).

Devuelve ÚNICAMENTE un objeto JSON donde cada clave es el nombre de la columna y el valor es un objeto con la estructura descrita. Ejemplo:
{
  "nombre": {
    "type": "string",
    "semantic_role": "dimension",
    "domain": "nombre completo",
    "analysis_variables": ["agrupar por cliente"]
  }
}
IMPORTANTE: RESPONDE ÚNICA Y EXCLUSIVAMENTE CON EL OBJETO JSON PURO. NO uses bloques de código (\`\`\`json), NO agregues explicaciones, NO agregues texto antes ni después.`;

        const rawResponse = await LLMService.call(prompt, this.id, 'flash');

        try {
            // 1. Remove optional markdown codeblock wrappers
            const match = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            let cleanContent = match ? match[1] : rawResponse.trim();

            // 2. Extract only what's between the first { and last }
            const firstBrace = cleanContent.indexOf('{');
            const lastBrace = cleanContent.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
                cleanContent = cleanContent.substring(firstBrace, lastBrace + 1);
            }

            const parsed = JSON.parse(cleanContent) as SchemaMap;
            return parsed;
        } catch (e) {
            throw new Error(`Error parsing LLM schema JSON: ${e}. Content: ${rawResponse.substring(0, 300)}`);
        }
    }

    private inferSchema(data: Record<string, unknown>[]): Record<string, string> {
        if (!data || data.length === 0) return {};
        const sample = data[0];
        const schema: Record<string, string> = {};
        for (const key in sample) {
            const val = sample[key];
            if (!isNaN(Number(val))) {
                schema[key] = 'number';
            } else if (!isNaN(Date.parse(val as string))) {
                schema[key] = 'date';
            } else {
                schema[key] = 'string';
            }
        }
        return schema;
    }
}
