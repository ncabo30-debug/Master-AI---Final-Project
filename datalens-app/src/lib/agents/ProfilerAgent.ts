import { AgentBus, type AgentMessage } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import { LLMService } from './core/LLMService';
import type { ProfileResult, ProfileColumnInfo, QuantitativeProfile, QuantitativeColumnProfile } from './types';

const SAMPLE_SIZE = 50;

/**
 * ProfilerAgent: Analyzes raw CSV data to infer real types, detect dirty
 * data patterns, and produce cleaning rules for the CleanerAgent.
 *
 * Uses LLM to intelligently classify columns and suggest cleanup actions.
 */
export class ProfilerAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'schema', tenantId, bus); // reuses 'schema' agent type
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: AgentMessage): Promise<void> {
        if (message.type === 'PROFILE_DATA') {
            const result = await this.execute(message.payload as { data: Record<string, unknown>[] });
            this.communicate(message.from, 'DATA_PROFILED', result);
        }
    }

    public async execute(context: { data: Record<string, unknown>[] }): Promise<ProfileResult> {
        const start = Date.now();
        const { data } = context;

        if (!data || data.length === 0) {
            return { columns: [], quantitative: { rowCount: 0, colCount: 0, columns: [] } };
        }

        const columns = Object.keys(data[0]);
        // D-7: Use stratified sample (start + middle + end) instead of flat first-N
        const sample = this.buildStratifiedSample(data);

        // If LLM is available, ask it to profile the data intelligently
        try {
            const result = await this.profileWithAI(columns, sample);
            result.quantitative = this.computeQuantitativeProfile(data, columns, result);
            AgentLogger.logExecution(this.id, Date.now() - start);
            return result;
        } catch (err) {
            AgentLogger.error(this.id, err);
            // Fallback to heuristic profiling
        }

        // Heuristic fallback
        const result = this.profileHeuristic(data, columns);
        result.quantitative = this.computeQuantitativeProfile(data, columns, result);
        AgentLogger.logExecution(this.id, Date.now() - start);
        return result;
    }

    /**
     * D-7: Build a stratified sample of up to SAMPLE_SIZE rows by taking rows
     * from the start, middle, and end thirds of the dataset.
     * This gives the LLM a representative view across the full file.
     */
    private buildStratifiedSample(data: Record<string, unknown>[]): Record<string, unknown>[] {
        const n = data.length;
        if (n <= SAMPLE_SIZE) return data;

        const third = Math.floor(SAMPLE_SIZE / 3);
        const start  = data.slice(0, third);
        const midStart = Math.floor(n / 2) - Math.floor(third / 2);
        const mid    = data.slice(midStart, midStart + third);
        const end    = data.slice(n - (SAMPLE_SIZE - third * 2));

        return [...start, ...mid, ...end].slice(0, SAMPLE_SIZE);
    }

    private async profileWithAI(columns: string[], sample: Record<string, unknown>[]): Promise<ProfileResult> {
        const prompt = `Eres un experto en calidad de datos. Analiza esta muestra de un CSV y por cada columna determina:

1. "inferredType": el tipo REAL que deberían tener los datos ("string", "number", "date", "boolean")
2. "detectedIssues": array de problemas encontrados. Ejemplos: "comas como separador de miles", "formatos de fecha mixtos (dd/MM/yyyy y yyyy-MM-dd)", "valores no numéricos en columna numérica", "valores nulos o placeholder (NO_SABE, N/A)", "espacios extra"
3. "cleaningRules": array de instrucciones concretas de limpieza. Ejemplos: "quitar comas de miles", "parsear fechas con formatos mixtos, reemplazar invalidas con null", "convertir a float", "trim de espacios"

Columnas: ${JSON.stringify(columns)}
Muestra (filas estratificadas — inicio, medio y fin del archivo):
${JSON.stringify(sample, null, 2)}

Responde ÚNICAMENTE con un JSON puro:
{
  "columns": [
    {
      "name": "nombre_columna",
      "inferredType": "string|number|date|boolean",
      "detectedIssues": ["..."],
      "cleaningRules": ["..."]
    }
  ]
}`;

        const jsonContent = await LLMService.call(prompt, this.id, 'flash');
        try {
            // Extraer JSON puro ignorando bloques de markdown o texto extra
            const match = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            const cleanContent = match ? match[1] : jsonContent.trim();

            const parsed = JSON.parse(cleanContent) as ProfileResult;
            // Validate structure
            if (!parsed.columns || !Array.isArray(parsed.columns)) {
                throw new Error('Invalid profile structure');
            }
            return parsed;
        } catch {
            throw new Error(`Failed to parse profiler AI response: ${jsonContent.substring(0, 200)}`);
        }
    }

    private profileHeuristic(data: Record<string, unknown>[], columns: string[]): ProfileResult {
        const result: ProfileColumnInfo[] = columns.map(col => {
            const values = data.map(row => row[col]).filter(v => v != null && v !== '');
            const sample = values.slice(0, 50);

            let inferredType: ProfileColumnInfo['inferredType'] = 'string';
            const issues: string[] = [];
            const rules: string[] = [];

            // Check if numeric (with possible commas)
            const numericCount = sample.filter(v => {
                const cleaned = String(v).replace(/,/g, '').trim();
                return !isNaN(Number(cleaned)) && cleaned !== '';
            }).length;

            // Check if date
            const dateCount = sample.filter(v => {
                const s = String(v);
                return !isNaN(Date.parse(s)) && s.length > 4;
            }).length;

            const threshold = sample.length * 0.7;

            if (numericCount >= threshold) {
                inferredType = 'number';
                // Check for commas as thousands separators
                const hasCommas = sample.some(v => /\d,\d{3}/.test(String(v)));
                if (hasCommas) {
                    issues.push('comas como separador de miles');
                    rules.push('quitar comas de miles y convertir a float');
                } else {
                    rules.push('convertir a float');
                }
            } else if (dateCount >= threshold) {
                inferredType = 'date';
                rules.push('parsear fechas, reemplazar inválidas con null');
                // Check for mixed formats
                const hasSlash = sample.some(v => /\d{2}\/\d{2}\/\d{4}/.test(String(v)));
                const hasDash = sample.some(v => /\d{4}-\d{2}-\d{2}/.test(String(v)));
                if (hasSlash && hasDash) {
                    issues.push('formatos de fecha mixtos');
                }
            }

            // Check for null-like values
            const nullLike = sample.filter(v =>
                ['N/A', 'NA', 'NULL', 'null', 'NO_SABE', '-', ''].includes(String(v).trim().toUpperCase())
            );
            if (nullLike.length > 0) {
                issues.push(`${nullLike.length} valores nulos o placeholder`);
                rules.push('reemplazar placeholders con null');
            }

            return { name: col, inferredType, detectedIssues: issues, cleaningRules: rules };
        });

        return { columns: result };
    }

    /**
     * M3: Calcula un perfil cuantitativo determinístico (sin LLM).
     * Incluye: rowCount, colCount, y por columna: nullCount, uniqueCount,
     * sum/avg/min/max (numéricas), dateMin/dateMax (fechas).
     */
    private computeQuantitativeProfile(
        data: Record<string, unknown>[],
        columns: string[],
        profile: ProfileResult
    ): QuantitativeProfile {
        const colProfiles: QuantitativeColumnProfile[] = columns.map(col => {
            const colInfo = profile.columns.find(c => c.name === col);
            const type = colInfo?.inferredType || 'string';
            const values = data.map(r => r[col]);

            const nullCount = values.filter(v => v == null || String(v).trim() === '' ||
                ['N/A', 'NA', 'NULL', 'null', 'NO_SABE', '-'].includes(String(v).trim().toUpperCase())
            ).length;

            const uniqueCount = new Set(values.map(v => String(v))).size;

            const result: QuantitativeColumnProfile = { name: col, type, nullCount, uniqueCount };

            if (type === 'number') {
                const nums = values
                    .map(v => Number(String(v).replace(/,/g, '')))
                    .filter(n => !isNaN(n) && isFinite(n));

                if (nums.length > 0) {
                    result.sum = nums.reduce((a, b) => a + b, 0);
                    result.avg = result.sum / nums.length;
                    result.min = Math.min(...nums);
                    result.max = Math.max(...nums);
                }
            } else if (type === 'date') {
                const dates = values
                    .map(v => new Date(String(v)))
                    .filter(d => !isNaN(d.getTime()))
                    .sort((a, b) => a.getTime() - b.getTime());

                if (dates.length > 0) {
                    result.dateMin = dates[0].toISOString().split('T')[0];
                    result.dateMax = dates[dates.length - 1].toISOString().split('T')[0];
                }
            }

            return result;
        });

        return {
            rowCount: data.length,
            colCount: columns.length,
            columns: colProfiles
        };
    }
}
