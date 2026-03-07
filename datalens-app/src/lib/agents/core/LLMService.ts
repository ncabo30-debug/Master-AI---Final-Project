import { AgentLogger } from './AgentLogger';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TokenTracker } from '@/lib/TokenTracker';

/**
 * Global timeout for all LLM calls.
 */
export const LLM_TIMEOUT_MS = 480_000;

/**
 * Centralized service for all LLM API invocations.
 *
 * - `call()`: Returns **parsed JSON**.
 * - `callRaw()`: Returns the **raw text**.
 */
export class LLMService {
    private static readonly MAX_RETRIES = 2;
    private static readonly INITIAL_BACKOFF_MS = 5_000;

    /** Active sessionId — set by the caller before making LLM calls. */
    public static currentSessionId: string = 'default';

    private static getGenAIClient(): GoogleGenerativeAI {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not defined in environment variables.');
        }
        return new GoogleGenerativeAI(apiKey);
    }

    private static extractJSON(content: string): string {
        let cleaned = content
            .replace(/```json/gi, '')
            .replace(/```javascript/gi, '')
            .replace(/```js/gi, '')
            .replace(/```/g, '');

        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        const firstBracket = cleaned.indexOf('[');
        const lastBracket = cleaned.lastIndexOf(']');

        let objCandidate = '';
        let arrCandidate = '';

        if (firstBrace !== -1 && lastBrace > firstBrace) {
            objCandidate = cleaned.substring(firstBrace, lastBrace + 1);
        }
        if (firstBracket !== -1 && lastBracket > firstBracket) {
            arrCandidate = cleaned.substring(firstBracket, lastBracket + 1);
        }

        let candidate = objCandidate.length > arrCandidate.length ? objCandidate : arrCandidate;
        if (!candidate) candidate = cleaned.trim();

        candidate = candidate.replace(/,\s*([\]}])/g, '$1');

        try {
            JSON.parse(candidate);
            return candidate;
        } catch {
            return candidate;
        }
    }

    private static getModelName(modelType: 'flash' | 'pro'): string {
        if (modelType === 'pro') {
            return 'gemini-2.5-pro';
        }
        return 'gemini-2.5-flash';
    }

    private static async fetchLLM(prompt: string, agentId: string, modelType: 'flash' | 'pro' = 'flash'): Promise<string> {
        const client = this.getGenAIClient();
        const modelName = this.getModelName(modelType);
        const model = client.getGenerativeModel({ model: modelName });

        let lastError: Error = new Error('LLM call failed with no attempts.');

        for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                const delay = this.INITIAL_BACKOFF_MS * Math.pow(3, attempt - 1);
                console.warn(`[LLMService] Retry #${attempt} for agent ${agentId} after ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            }

            const startTime = Date.now();

            try {
                const result = await model.generateContent(prompt);
                const response = result.response;
                const content = response.text().trim();

                // Extract and record token usage
                const usage = response.usageMetadata;
                const inputTokens = usage?.promptTokenCount ?? 0;
                // Gemini 2.5 thinking models separate thinking tokens from candidate tokens
                const candidateTokens = usage?.candidatesTokenCount ?? 0;
                const thinkingTokens = (usage as any)?.thoughtsTokenCount ?? 0;
                const outputTokens = candidateTokens + thinkingTokens;

                if (inputTokens > 0 || outputTokens > 0) {
                    TokenTracker.record(
                        this.currentSessionId,
                        agentId,
                        modelName,
                        inputTokens,
                        outputTokens
                    );
                    console.log(`[TokenTracker] ${agentId} | ${modelName} | in:${inputTokens} out:${candidateTokens}+think:${thinkingTokens}=${outputTokens}`);
                }

                AgentLogger.logLLMCall(agentId, prompt, content, Date.now() - startTime);
                return content;
            } catch (err: any) {
                lastError = err instanceof Error ? err : new Error(String(err));

                // Do not retry on 4xx Authentication/Permission errors
                if (lastError.message.includes('403') || lastError.message.includes('401')) {
                    AgentLogger.error(agentId, `Fatal Gemini API Error: ${lastError.message}`);
                    break;
                }
            }
        }

        throw lastError;
    }

    public static async call(prompt: string, agentId: string, modelType: 'flash' | 'pro' = 'flash'): Promise<string> {
        const raw = await this.fetchLLM(prompt, agentId, modelType);
        return this.extractJSON(raw);
    }

    public static async callRaw(prompt: string, agentId: string, modelType: 'flash' | 'pro' = 'flash'): Promise<string> {
        return this.fetchLLM(prompt, agentId, modelType);
    }
}
