import { AgentBus, type AgentMessage } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import { LLMService } from './core/LLMService';
import type { SchemaMap, ComprehensionResult } from './types';
import { extractColumnsByType } from './utils';

export class ComprehensionAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'comprehension', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: AgentMessage): Promise<void> {
        if (message.type === 'GENERATE_QUESTIONS') {
            const result = await this.execute(message.payload as { schema: SchemaMap });
            this.communicate(message.from, 'QUESTIONS_GENERATED', result);
        }
    }

    public async execute(context: { schema: SchemaMap }): Promise<ComprehensionResult> {
        const start = Date.now();
        const { schema } = context;

        const { numericCols, categoryCols } = extractColumnsByType(schema);



        try {
            const prompt = `Eres un experto analista de datos. Te he proveído el siguiente esquema de un archivo CSV:
${JSON.stringify(schema, null, 2)}

Tu objetivo es generar UNA ÚNICA pregunta para el usuario para decidir por cuál columna (eje X) vamos a agrupar los datos para el gráfico principal.
Las columnas numéricas (eje Y) son: ${numericCols.join(', ')}
Las columnas categóricas recomendadas para agrupar son: ${categoryCols.join(', ')}

Devuelve tu respuesta ESTRICTAMENTE en un formato JSON como este:
{
  "question": "Tu pregunta interactiva aquí...",
  "options": [ "${categoryCols.length > 0 ? categoryCols[0] : 'Opción 1'}", "${categoryCols.length > 1 ? categoryCols[1] : 'Opción 2'}" ]
}
Las opciones del JSON deben extraerse preferentemente de las columnas categóricas.
IMPORTANTE: RESPONDE ÚNICA Y EXCLUSIVAMENTE CON EL OBJETO JSON PURO. NO uses bloques de código (\`\`\`json), NO agregues explicaciones, NO agregues texto antes ni después.`;

            const jsonContent = await LLMService.call(prompt, this.id, 'pro');

            let parsed: { question?: string; options?: string[] };
            try {
                // Remove markdown blocks if present
                const match = jsonContent.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/);
                let cleanContent = match ? match[1] : jsonContent.trim();

                // Final sanitize: find the first { and last }
                const firstBrace = cleanContent.indexOf('{');
                const lastBrace = cleanContent.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
                    cleanContent = cleanContent.substring(firstBrace, lastBrace + 1);
                }

                parsed = JSON.parse(cleanContent);
            } catch {
                console.error(`[ComprehensionAgent] Failed to parse:`, jsonContent);
                parsed = { question: "No pude entender a la IA. Elige una opción técnica:", options: categoryCols };
            }

            AgentLogger.logExecution(this.id, Date.now() - start);
            return { questions: [{ id: 'q1', text: parsed.question || 'Elegí una dimensión para agrupar el gráfico principal.', options: parsed.options || categoryCols }] };

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            AgentLogger.error(this.id, `Fetch Error: ${message}`);
            return { questions: [{ id: 'q1', text: `Error en IA local (${message}). Selecciona un campo manualmente:`, options: categoryCols }] };
        }
    }
}
