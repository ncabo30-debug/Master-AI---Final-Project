import { AgentBase } from "./AgentBase";

export class AgentRegistry {
    private static agents: Map<string, AgentBase> = new Map();

    public static register(agent: AgentBase) {
        this.agents.set(agent.id, agent);
        console.log(`[AgentRegistry] Registered agent: ${agent.id} of type ${agent.type}`);
    }

    public static unregister(agentId: string) {
        this.agents.delete(agentId);
        console.log(`[AgentRegistry] Unregistered agent: ${agentId}`);
    }

    public static getAgent(agentId: string): AgentBase | undefined {
        return this.agents.get(agentId);
    }

    public static getAgentsByType(type: string): AgentBase[] {
        return Array.from(this.agents.values()).filter(a => a.type === type);
    }

    public static getActiveCount(): number {
        return this.agents.size;
    }
}
