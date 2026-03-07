import { AgentBus } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import type { FileInspectionResult } from './types';

/**
 * FileInspectorAgent (M2+M7): Se ejecuta al inicio del pipeline.
 *
 * - Detecta encoding del texto mediante BOM y heurísticas.
 * - Detecta delimitador del CSV por frecuencia.
 * - Genera un hash SHA-256 del contenido original como backup inmutable.
 * - Guarda un snapshot de los datos originales para auditoría final.
 */
export class FileInspectorAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'validator', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: any): Promise<void> {
        if (message.type === 'INSPECT_FILE') {
            const result = await this.execute(message.payload);
            this.communicate(message.from, 'FILE_INSPECTED', result);
        }
    }

    /**
     * Inspecciona el texto crudo del CSV para detectar encoding,
     * delimitador y generar un hash del contenido original.
     */
    public async execute(context: {
        rawText: string;
        data: Record<string, unknown>[];
    }): Promise<{
        inspection: FileInspectionResult;
        originalSnapshot: Record<string, unknown>[];
    }> {
        const start = Date.now();
        const { rawText, data } = context;

        // 1. Detectar encoding via BOM
        const encoding = this.detectEncoding(rawText);
        const convertedToUtf8 = encoding !== 'utf-8';

        // 2. Detectar delimitador
        const { delimiter, confidence } = this.detectDelimiter(rawText);

        // 3. Generar hash SHA-256 del contenido original
        const originalHash = await this.hashContent(rawText);

        // 4. Guardar snapshot inmutable (copia profunda de las primeras 1000 filas)
        const snapshotSize = Math.min(data.length, 1000);
        const originalSnapshot = data.slice(0, snapshotSize).map(row => ({ ...row }));

        if (confidence < 0.7) {
            AgentLogger.logStep(this.id, `⚠️ Baja confianza en detección: encoding=${encoding}, delimitador='${delimiter}', confianza=${(confidence * 100).toFixed(0)}%`);
        } else {
            AgentLogger.logStep(this.id, `📁 Inspección: encoding=${encoding}, delimitador='${delimiter}', confianza=${(confidence * 100).toFixed(0)}%, hash=${originalHash.substring(0, 12)}...`);
        }

        AgentLogger.logExecution(this.id, Date.now() - start);

        return {
            inspection: { encoding, delimiter, confidence, originalHash, convertedToUtf8 },
            originalSnapshot
        };
    }

    /**
     * Detecta encoding mediante BOM (Byte Order Mark) bytes.
     * En el browser/Node el texto ya viene como string, así que detectamos
     * por presencia de caracteres típicos de encodings.
     */
    private detectEncoding(text: string): string {
        // BOM UTF-8: EF BB BF
        if (text.charCodeAt(0) === 0xFEFF) return 'utf-8-bom';
        // BOM UTF-16 LE: FF FE
        if (text.charCodeAt(0) === 0xFFFE) return 'utf-16-le';
        // BOM UTF-16 BE: FE FF
        if (text.charCodeAt(0) === 0xFEFF) return 'utf-16-be';

        // Heurística: caracteres típicos de Latin-1 no-ASCII
        const sample = text.substring(0, 2000);
        const latin1Chars = (sample.match(/[\xC0-\xFF]/g) || []).length;
        const totalChars = sample.length;

        if (latin1Chars > totalChars * 0.01) {
            return 'latin-1';
        }

        return 'utf-8';
    }

    /**
     * Detecta el delimitador del CSV por frecuencia en las primeras líneas.
     */
    private detectDelimiter(text: string): { delimiter: string; confidence: number } {
        const lines = text.split('\n').slice(0, 10).filter(l => l.trim().length > 0);
        if (lines.length === 0) return { delimiter: ',', confidence: 0.5 };

        const candidates = [',', ';', '\t', '|'];
        let bestDelim = ',';
        let bestScore = 0;
        let totalScore = 0;

        for (const delim of candidates) {
            // Contar ocurrencias por línea y ver consistencia
            const counts = lines.map(l => (l.split(delim).length - 1));
            const avg = counts.reduce((a, b) => a + b, 0) / counts.length;

            if (avg < 1) continue; // No tiene sentido si no aparece

            // Consistencia: ¿todas las líneas tienen el mismo número?
            const variance = counts.reduce((acc, c) => acc + Math.pow(c - avg, 2), 0) / counts.length;
            const consistency = avg > 0 ? 1 / (1 + variance / avg) : 0;
            const score = avg * consistency;

            totalScore += score;
            if (score > bestScore) {
                bestScore = score;
                bestDelim = delim;
            }
        }

        const confidence = totalScore > 0 ? bestScore / totalScore : 0.5;
        return { delimiter: bestDelim, confidence: Math.min(confidence, 1) };
    }

    /**
     * Genera un hash SHA-256 del contenido.
     * Usa Web Crypto API en Node 18+ o fallback simple.
     */
    private async hashContent(text: string): Promise<string> {
        try {
            const { createHash } = await import('crypto');
            return createHash('sha256').update(text).digest('hex');
        } catch {
            // Fallback: hash simple basado en contenido
            let hash = 0;
            for (let i = 0; i < Math.min(text.length, 10000); i++) {
                const char = text.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32-bit integer
            }
            return Math.abs(hash).toString(16).padStart(8, '0');
        }
    }
}
