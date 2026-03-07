import { AgentBus } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import { LLMService, LLM_TIMEOUT_MS } from './core/LLMService';
import type { AnalysisResult } from './types';

/**
 * AnalystAgent (Agent 5): Generates a conceptual analysis of the dataset
 * using the accumulated summaries from Agents 1-4 plus optional user feedback.
 *
 * Key behavior: On rejection, the user's feedback is incorporated into the
 * next prompt so the analysis is refined iteratively.
 */
export class AnalystAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'analyst', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: any): Promise<void> {
        if (message.type === 'GENERATE_ANALYSIS') {
            const result = await this.execute(message.payload);
            this.communicate(message.from, 'ANALYSIS_GENERATED', result);
        }
    }

    public async execute(context: {
        summaries: Record<string, string>;
        previousFeedback?: string;
    }): Promise<AnalysisResult> {
        const start = Date.now();
        const { summaries, previousFeedback } = context;

        const summaryText = Object.entries(summaries)
            .map(([agent, summary]) => `${agent}: ${summary}`)
            .join('\n');

        const feedbackSection = previousFeedback
            ? `\n\nFeedback previo del usuario (ATIENDE sus correcciones): ${previousFeedback}`
            : '';

        const prompt = `Eres un consultor de negocios que le habla DIRECTAMENTE al dueño de una PYME.
El usuario NO es técnico. No le hables de "datasets", "outliers estadísticos", "validez estadística" ni de formateo de datos.

Aquí están los resultados del procesamiento automático de su archivo de datos:

${summaryText}
${feedbackSection}

GENERA UN ANÁLISIS DE NEGOCIO con estas reglas estrictas:

1. **Resumen** (2-3 líneas): ¿Qué contiene este archivo? Usá números concretos del resumen (cantidad de registros, columnas, qué representan).

2. **Estructura detectada**: Generá una tabla markdown con TODAS las columnas del archivo. Columnas de la tabla: | Columna | Tipo detectado | Ejemplo |. Usá tipos legibles: "Número", "Texto", "Fecha", "ID". Si una columna parece tener un tipo incorrecto (ej: un número de orden interpretado como fecha), marcala con ⚠️.

3. **Hallazgos clave**: Mencioná todo lo RELEVANTE que encontraste. Sé específico:
   - ✅ CORRECTO: "Tenés 15 ventas registradas entre febrero 2026, con 5 productos en 3 ciudades"
   - ❌ INCORRECTO: "Se podría analizar la dimensión temporal para encontrar patrones"
   - ✅ CORRECTO: "Detectamos 1 valor inusual en Quantity: una venta con cantidad muy alta. ¿Es correcta esa venta o fue un error de carga?"
   - ❌ INCORRECTO: "Se recomienda investigar los outliers para determinar su naturaleza"

4. **Problemas encontrados**: SOLO mencioná problemas REALES que afecten al negocio. Si no hay problemas, decí "No se encontraron problemas". NUNCA hables de:
   - Formatos de datos (eso ya se corrigió automáticamente)
   - Tamaño de muestra ("necesitás más datos" NO es útil)
   - Proceso de limpieza técnica

5. **Próximos pasos concretos**: Sugerí 2-3 cosas ESPECÍFICAS que el usuario puede hacer con estos datos. Ejemplo: "Podés ver cuánto vendiste por ciudad" o "Podés comparar qué método de pago usan más tus clientes".

TONO: Hablale como un colega que le explica algo útil. Usá "vos/tenés/podés" (español rioplatense).
FORMATO: Usá markdown con headers ##, bullets, y negritas para datos importantes.
LARGO: Máximo 300 palabras. Sé conciso.`;

        try {
            const analysis = await LLMService.callRaw(prompt, this.id, 'flash');
            AgentLogger.logExecution(this.id, Date.now() - start);
            return { analysis };
        } catch (err) {
            AgentLogger.error(this.id, err);

            // Fallback: heuristic analysis
            const colCount = Object.keys(summaries).length;
            const fallback = `## Análisis Automático\n\nSe procesaron datos con la participación de ${colCount} agentes.\n\n${summaryText}\n\n> *Análisis generado por heurística (LLM no disponible).*`;
            return { analysis: fallback };
        }
    }
}
