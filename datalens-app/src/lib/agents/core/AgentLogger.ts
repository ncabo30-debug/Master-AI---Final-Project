function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

export class AgentLogger {
    public static logCommunication(from: string, to: string, type: string) {
        console.log(`[AgentLogger] MSG: ${from} -> ${to} [${type}]`);
    }

    public static logExecution(agentId: string, durationMs: number, tokens?: number, cost?: number) {
        console.log(`[AgentLogger] EXEC: ${agentId} took ${durationMs}ms. Tokens: ${tokens || 0} Cost: $${cost || 0}`);
    }

    public static logStep(agentId: string, message: string, sessionId?: string) {
        console.log(`[AgentLogger] STEP [${agentId}]: ${message}`);
        if (sessionId) {
            if (!globalThis.agentSessionHistories?.has(sessionId)) {
                globalThis.agentSessionHistories?.set(sessionId, []);
            }
            globalThis.agentSessionHistories?.get(sessionId)?.push({
                id: Math.random().toString(36).substr(2, 9),
                timestamp: Date.now(),
                from: agentId,
                to: 'system',
                type: 'PIPELINE_STEP',
                payload: { message }
            });
        }
    }

    public static error(agentId: string, error: unknown, sessionId?: string) {
        console.error(`[AgentLogger] ERR [${agentId}]:`, error);

        if (sessionId) {
            if (!globalThis.agentSessionHistories?.has(sessionId)) {
                globalThis.agentSessionHistories?.set(sessionId, []);
            }
            globalThis.agentSessionHistories?.get(sessionId)?.push({
                id: Math.random().toString(36).substr(2, 9),
                timestamp: Date.now(),
                from: agentId,
                to: 'system',
                type: 'AGENT_ERROR',
                payload: { error: getErrorMessage(error) }
            });
        }
    }

    public static logLLMCall(agentId: string, prompt: string, response: string, durationMs: number, sessionId?: string) {
        if (sessionId) {
            if (!globalThis.agentSessionHistories?.has(sessionId)) {
                globalThis.agentSessionHistories?.set(sessionId, []);
            }
            globalThis.agentSessionHistories?.get(sessionId)?.push({
                id: Math.random().toString(36).substr(2, 9),
                timestamp: Date.now(),
                from: agentId,
                to: 'llm',
                type: 'LLM_TRACE',
                payload: { prompt, response, durationMs }
            });
        }
    }
}
