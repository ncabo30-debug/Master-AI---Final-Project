import { AgentLogger } from './AgentLogger';

export type AgentMessage = {
    id: string;
    from: string;
    to: string;
    type: string;
    payload: any;
    timestamp: number;
};

type Listener = (message: AgentMessage) => void;

declare global {
    var agentSessionHistories: Map<string, AgentMessage[]> | undefined;
}

if (!globalThis.agentSessionHistories) {
    globalThis.agentSessionHistories = new Map();
}

export class AgentBus {
    private listeners: Map<string, Listener[]> = new Map();
    private sessionId: string;
    private static MAX_HISTORY = 500;

    constructor(sessionId: string = 'default') {
        this.sessionId = sessionId;
    }

    /** Get message history for a specific session */
    public static getSessionHistory(sessionId: string): AgentMessage[] {
        return globalThis.agentSessionHistories?.get(sessionId) || [];
    }

    /** Clear message history for a specific session */
    public static clearSessionHistory(sessionId: string): void {
        globalThis.agentSessionHistories?.delete(sessionId);
    }

    /** Get the session history for this bus instance */
    private getHistory(): AgentMessage[] {
        const store = globalThis.agentSessionHistories!;
        if (!store.has(this.sessionId)) {
            store.set(this.sessionId, []);
        }
        return store.get(this.sessionId)!;
    }

    subscribe(agentId: string, listener: Listener) {
        if (!this.listeners.has(agentId)) {
            this.listeners.set(agentId, []);
        }
        this.listeners.get(agentId)!.push(listener);
    }

    unsubscribe(agentId: string) {
        this.listeners.delete(agentId);
    }

    publish(message: Omit<AgentMessage, 'id' | 'timestamp'>) {
        const fullMessage: AgentMessage = {
            ...message,
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
        };

        // Add to session-scoped history
        const history = this.getHistory();
        history.push(fullMessage);
        if (history.length > AgentBus.MAX_HISTORY) {
            history.shift();
        }

        // Broadcast to the specific recipient, or to all if 'to' is '*'
        if (fullMessage.to === '*') {
            this.listeners.forEach((agentListeners) => {
                agentListeners.forEach(l => l(fullMessage));
            });
        } else {
            const recipientListeners = this.listeners.get(fullMessage.to);
            if (recipientListeners) {
                recipientListeners.forEach(l => l(fullMessage));
            }
        }
    }
}
