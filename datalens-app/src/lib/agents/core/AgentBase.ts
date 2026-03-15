import { AgentBus, AgentMessage } from './AgentBus';
import { AgentLogger } from './AgentLogger';

export type AgentType =
    | 'manager'
    | 'schema'
    | 'comprehension'
    | 'specialist'
    | 'validator'
    | 'crossref'
    | 'strategy'
    | 'chat'
    | 'report'
    | 'analyst'
    | 'profiler';

export abstract class AgentBase {
    public readonly id: string;
    public readonly type: AgentType;
    public readonly tenantId: string;
    protected bus: AgentBus;

    constructor(id: string, type: AgentType, tenantId: string, bus: AgentBus) {
        this.id = id;
        this.type = type;
        this.tenantId = tenantId;
        this.bus = bus;
        this.bus.subscribe(this.id, this.handleMessage.bind(this));
    }

    /**
     * Primary message handler. Should route to execute or other internal logic.
     */
    protected abstract handleMessage(message: AgentMessage): void | Promise<void>;

    /**
     * Core execution logic for the specific agent role.
     */
    public abstract execute(context: unknown): Promise<unknown>;

    /**
     * Helper to send messages over the bus
     */
    protected communicate(to: string, messageType: string, payload: unknown) {
        AgentLogger.logCommunication(this.id, to, messageType);
        this.bus.publish({
            from: this.id,
            to,
            type: messageType,
            payload
        });
    }

    /**
     * Clean up this agent: unsubscribe from the bus and unregister from the Registry.
     * Should be called when the agent is no longer needed (e.g. in ManagerAgent's finally blocks).
     */
    public dispose(): void {
        this.bus.unsubscribe(this.id);
    }
}
