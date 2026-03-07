import { AgentBus } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import { LLMService } from './core/LLMService';
import { SQLiteService } from '@/lib/SQLiteService';
import type { SchemaMap, ChatResult } from './types';

/**
 * ChatAgent: answers free-form text questions about the dataset.
 *
 * Uses a 3-step cycle:
 * 1. LLM generates SQL from the user question + schema
 * 2. SQL is executed against in-memory SQLite with real data
 * 3. LLM formulates a natural language answer from the query results
 *
 * If the question is about metadata (not data), skips SQL entirely.
 */
export class ChatAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'chat', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: any): Promise<void> {
        if (message.type === 'ANSWER_CHAT_QUESTION') {
            const result = await this.execute(message.payload);
            this.communicate(message.from, 'CHAT_ANSWERED', result);
        }
    }

    public async execute(context: {
        schema: SchemaMap;
        question: string;
        data?: Record<string, unknown>[];
    }): Promise<ChatResult> {
        const { schema, question, data } = context;

        try {
            // Step 0: Ask LLM if this question needs SQL or can be answered from schema alone
            const classificationPrompt = `Eres un clasificador. Dada esta pregunta del usuario y el esquema de datos, determina si la pregunta:
A) Requiere consultar los datos reales (calcular, filtrar, agrupar, contar, etc.)
B) Se puede responder solo con el esquema (qué columnas hay, qué significa algo, etc.)

Esquema: ${JSON.stringify(schema, null, 2)}
Pregunta: "${question}"

Responde SOLO con la letra "A" o "B", nada más.`;

            const classification = await LLMService.callRaw(classificationPrompt, this.id, 'flash');
            const needsSQL = classification.trim().toUpperCase().startsWith('A');

            // Path B: Schema-only question
            if (!needsSQL || !data || data.length === 0) {
                const metaPrompt = `Eres un asistente de análisis de datos. Responde de forma clara y concisa en español.
Esquema del dataset: ${JSON.stringify(schema, null, 2)}
Pregunta del usuario: "${question}"
Responde basándote en lo que sabes del esquema. No inventes datos numéricos.`;

                const answer = await LLMService.callRaw(metaPrompt, this.id, 'pro');
                return { answer };
            }

            // Path A: Generate and execute SQL
            return await this.executeWithSQL(schema, question, data);

        } catch (error: any) {
            AgentLogger.error(this.id, `ChatAgent Error: ${error.message}`);
            return { answer: `No pude procesar tu pregunta: ${error.message}` };
        }
    }

    private async executeWithSQL(
        schema: SchemaMap,
        question: string,
        data: Record<string, unknown>[],
        previousError?: string
    ): Promise<ChatResult> {
        // Step 1: LLM generates SQL
        const schemaDesc = this.buildSchemaDescription(schema, data);

        const retryContext = previousError
            ? `\n\n⚠️ Tu query anterior falló con este error: "${previousError}". Corrige la query.`
            : '';

        const sqlPrompt = `Eres un experto en SQL. Genera una query SQLite para responder la pregunta del usuario.

TABLA: datos
COLUMNAS:
${schemaDesc}
${retryContext}

Pregunta: "${question}"

Reglas:
- La tabla SIEMPRE se llama "datos"
- Usa comillas dobles para nombres de columna con espacios o caracteres especiales
- Usa funciones SQLite estándar (SUM, COUNT, AVG, MAX, MIN, GROUP BY, ORDER BY, LIMIT, etc.)
- Para filtros de texto usa LIKE con % para coincidencias parciales
- Si la pregunta menciona fechas, usa funciones de fecha de SQLite (strftime, etc.)
- Limita resultados a 50 filas máximo

Responde SOLO con la query SQL, sin explicación ni backticks.`;

        const sql = (await LLMService.callRaw(sqlPrompt, this.id, 'flash'))
            .trim()
            .replace(/^```sql?\s*/i, '')
            .replace(/```$/g, '')
            .trim();

        // Step 2: Execute the SQL
        try {
            const queryResult = SQLiteService.executeQuery(data, sql);

            // Step 3: LLM formulates natural language response
            const resultPreview = JSON.stringify(queryResult.slice(0, 20), null, 2);
            const totalRows = queryResult.length;

            const answerPrompt = `Eres un asistente de datos para dueños de PYMEs (personas NO técnicas). 
Responde en español, de forma clara y directa. No uses jerga técnica.

Pregunta original: "${question}"
Resultado de la consulta (${totalRows} filas):
${resultPreview}

Formatea tu respuesta de manera clara:
- Si hay un solo valor, dilo directamente
- Si hay una tabla, presenta los datos de forma legible
- Usa negritas (**) para resaltar los valores clave
- Si hay muchos resultados, menciona los más relevantes y resume el resto
- Nunca menciones SQL, queries ni bases de datos`;

            const answer = await LLMService.callRaw(answerPrompt, this.id, 'pro');
            return { answer, sql, queryResult: queryResult.slice(0, 50) };

        } catch (sqlError: any) {
            // Retry once with the error context
            if (!previousError) {
                AgentLogger.error(this.id, `SQL failed, retrying: ${sqlError.message}`);
                return this.executeWithSQL(schema, question, data, sqlError.message);
            }

            // Second failure — give up gracefully
            return {
                answer: `No pude responder esa pregunta específica. Intenta reformularla de otra manera.`,
                sql
            };
        }
    }

    private buildSchemaDescription(schema: SchemaMap, data: Record<string, unknown>[]): string {
        const columns = Object.keys(data[0] || {});
        return columns.map(col => {
            const schemaInfo = schema[col];
            const sampleValues = data.slice(0, 5).map(r => r[col]).filter(v => v != null);
            const sampleStr = sampleValues.slice(0, 3).map(v => `"${v}"`).join(', ');

            let typeStr = 'TEXT';
            if (typeof schemaInfo === 'string') {
                typeStr = schemaInfo.toUpperCase();
            } else if (schemaInfo && typeof schemaInfo === 'object') {
                typeStr = schemaInfo.type?.toUpperCase() || 'TEXT';
            }

            return `- "${col}" (${typeStr}) — ejemplos: ${sampleStr}`;
        }).join('\n');
    }
}
