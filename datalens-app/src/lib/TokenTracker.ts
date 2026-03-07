/**
 * TokenTracker: Tracks cumulative token usage and estimated cost per session.
 *
 * Pricing is stored as configurable constants so they can be updated
 * when Google changes rates.
 */

// ── Pricing per 1 million tokens (USD) ───────────────────
// Source: Google AI pricing page (June 2025)
// Flash = gemini-2.5-flash | Pro = gemini-2.5-pro (≤200k context)
export const MODEL_PRICING = {
    'gemini-2.5-flash': {
        inputPer1M: 0.30,   // $0.30 per 1M input tokens
        outputPer1M: 2.50,  // $2.50 per 1M output tokens
    },
    'gemini-2.5-pro': {
        inputPer1M: 1.25,   // $1.25 per 1M input tokens
        outputPer1M: 10.00, // $10.00 per 1M output tokens
    },
} as const;

export type TrackedModel = keyof typeof MODEL_PRICING;

export interface TokenUsageEntry {
    agentId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUSD: number;
    timestamp: number;
}

export interface SessionTokenSummary {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCostUSD: number;
    callCount: number;
    entries: TokenUsageEntry[];
    byModel: Record<string, {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        costUSD: number;
        callCount: number;
    }>;
}

// ── Session-scoped storage ───────────────────────────────

const sessionUsage: Map<string, TokenUsageEntry[]> = new Map();

export class TokenTracker {

    /**
     * Record a single LLM call's token usage.
     */
    public static record(
        sessionId: string,
        agentId: string,
        model: string,
        inputTokens: number,
        outputTokens: number
    ): TokenUsageEntry {
        const totalTokens = inputTokens + outputTokens;

        // Calculate cost
        const pricing = MODEL_PRICING[model as TrackedModel];
        let costUSD = 0;
        if (pricing) {
            costUSD =
                (inputTokens / 1_000_000) * pricing.inputPer1M +
                (outputTokens / 1_000_000) * pricing.outputPer1M;
        }

        const entry: TokenUsageEntry = {
            agentId,
            model,
            inputTokens,
            outputTokens,
            totalTokens,
            costUSD,
            timestamp: Date.now(),
        };

        if (!sessionUsage.has(sessionId)) {
            sessionUsage.set(sessionId, []);
        }
        sessionUsage.get(sessionId)!.push(entry);

        return entry;
    }

    /**
     * Get the cumulative summary for a session.
     */
    public static getSummary(sessionId: string): SessionTokenSummary {
        const entries = sessionUsage.get(sessionId) || [];

        const byModel: SessionTokenSummary['byModel'] = {};
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCostUSD = 0;

        for (const e of entries) {
            totalInputTokens += e.inputTokens;
            totalOutputTokens += e.outputTokens;
            totalCostUSD += e.costUSD;

            if (!byModel[e.model]) {
                byModel[e.model] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0, callCount: 0 };
            }
            byModel[e.model].inputTokens += e.inputTokens;
            byModel[e.model].outputTokens += e.outputTokens;
            byModel[e.model].totalTokens += e.inputTokens + e.outputTokens;
            byModel[e.model].costUSD += e.costUSD;
            byModel[e.model].callCount += 1;
        }

        return {
            totalInputTokens,
            totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
            totalCostUSD,
            callCount: entries.length,
            entries,
            byModel,
        };
    }

    /**
     * Clear usage data for a session.
     */
    public static clearSession(sessionId: string): void {
        sessionUsage.delete(sessionId);
    }
}
