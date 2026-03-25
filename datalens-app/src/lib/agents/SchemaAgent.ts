import { AgentBus, type AgentMessage } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import { LLMService } from './core/LLMService';
import { buildHeuristicBlueprint, buildHeuristicStructuralDiagnosis, normalizationBlueprintSchema, structuralDiagnosisSchema } from '@/lib/pipeline/blueprint';
import type { SchemaMap, SchemaResult } from './types';
import type {
  NormalizationBlueprint,
  StatisticalProfile,
  StructuralDiagnosis,
} from '@/lib/pipeline/types';

export class SchemaAgent extends AgentBase {
  constructor(id: string, tenantId: string, bus: AgentBus) {
    super(id, 'schema', tenantId, bus);
    AgentRegistry.register(this);
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    if (message.type === 'ANALYZE_SCHEMA') {
      const result = await this.execute(message.payload as { data: Record<string, unknown>[] });
      this.communicate(message.from, 'SCHEMA_ANALYZED', result);
    }
  }

  public async execute(context: { data: Record<string, unknown>[] }): Promise<SchemaResult> {
    const schema: SchemaMap = {};

    Object.keys(context.data[0] ?? {}).forEach((column) => {
      const sample = context.data.slice(0, 20).map((row) => row[column]).filter((value) => value != null);
      const numericRatio = sample.filter((value) => !Number.isNaN(Number(value))).length / Math.max(1, sample.length);
      const dateRatio = sample.filter((value) => !Number.isNaN(Date.parse(String(value)))).length / Math.max(1, sample.length);

      schema[column] = {
        type: numericRatio > 0.7 ? 'number' : dateRatio > 0.7 ? 'date' : 'string',
        semantic_role: numericRatio > 0.7 ? 'metric' : dateRatio > 0.7 ? 'timeline' : column.toLowerCase().includes('id') ? 'id' : 'dimension',
        domain: column,
        analysis_variables: numericRatio > 0.7 ? ['sumar', 'comparar'] : ['agrupar', 'filtrar'],
      };
    });

    return { schema };
  }

  public async analyzeStructure(
    profile: StatisticalProfile,
    sample: Record<string, unknown>[]
  ): Promise<StructuralDiagnosis> {
    const heuristic = buildHeuristicStructuralDiagnosis(profile);
    const prompt = `Eres un agente de esquema especializado en limpieza estructural.

Recibes:
- Un perfil estructural y estadístico del archivo
- Una muestra de filas

Tu tarea es devolver SOLO un JSON con:
{
  "estructura_limpia": boolean,
  "problemas_detectados": string[],
  "plan_limpieza": [
    {
      "id": string,
      "action": "remove_rows" | "set_header_row" | "drop_subtotals" | "fill_merged_cells_down" | "merge_sheets" | "collapse_multi_row_headers" | "unpivot",
      "params": object,
      "enabled": boolean,
      "source": "ai"
    }
  ]
}

Perfil:
${JSON.stringify(profile, null, 2)}

Muestra:
${JSON.stringify(sample, null, 2)}

Si el perfil heurístico ya detectó problemas relevantes, respétalos:
${JSON.stringify(heuristic, null, 2)}
`;

    try {
      const response = await LLMService.callRaw(prompt, this.id, 'flash');
      const parsed = structuralDiagnosisSchema.parse(JSON.parse(this.extractJson(response)));
      return parsed;
    } catch (error) {
      AgentLogger.error(this.id, error);
      return heuristic;
    }
  }

  public async analyzeNormalization(args: {
    sessionId: string;
    datasetId: string;
    profile: StatisticalProfile;
    cleanedRows: Record<string, unknown>[];
    diagnosis: StructuralDiagnosis;
  }): Promise<NormalizationBlueprint> {
    const heuristic = buildHeuristicBlueprint(args.sessionId, args.datasetId, args.profile, args.diagnosis);
    const sample = args.cleanedRows.slice(0, 50);

    const prompt = `Eres un agente de esquema especializado en normalización tabular.

Devuelve SOLO un JSON con esta estructura:
{
  "version": 2,
  "sessionId": "${args.sessionId}",
  "datasetId": "${args.datasetId}",
  "structuralPlan": [...],
  "columnPlan": [
    {
      "id": string,
      "sourceColumn": string,
      "targetColumn": string,
      "inferredType": "string" | "number" | "date" | "boolean",
      "postgresType": "TEXT" | "VARCHAR(100)" | "VARCHAR(255)" | "INTEGER" | "DECIMAL(10,2)" | "DECIMAL(12,4)" | "BOOLEAN" | "DATE" | "TIMESTAMP",
      "transform": "identity" | "parseDate" | "normalizeNumber" | "normalizePercentage" | "trimSpaces" | "capitalizeWords" | "fixEncoding" | "normalizeNull" | "normalizeCategory" | "normalizeBoolean" | "splitField",
      "params": object,
      "nullable": boolean,
      "enabled": boolean,
      "anomalyFlags": string[],
      "source": "ai"
    }
  ],
  "createdAt": "${heuristic.createdAt}",
  "updatedAt": "${heuristic.updatedAt}"
}

Perfil:
${JSON.stringify(args.profile, null, 2)}

Muestra limpia:
${JSON.stringify(sample, null, 2)}

Blueprint heurístico base:
${JSON.stringify(heuristic, null, 2)}
`;

    try {
      const response = await LLMService.callRaw(prompt, this.id, 'flash');
      const parsed = normalizationBlueprintSchema.parse(JSON.parse(this.extractJson(response)));
      return parsed;
    } catch (error) {
      AgentLogger.error(this.id, error);
      return heuristic;
    }
  }

  private extractJson(raw: string): string {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    let content = match ? match[1] : raw.trim();
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      content = content.slice(firstBrace, lastBrace + 1);
    }
    return content;
  }
}

