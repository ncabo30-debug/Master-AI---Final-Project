import vm from 'node:vm';
import { AgentBus } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import type { ValidatorResult } from './types';

export class ValidatorAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'validator', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: any): Promise<void> {
        if (message.type === 'VALIDATE_CODE') {
            const result = await this.execute(message.payload);
            this.communicate(message.from, 'CODE_VALIDATED', result);
        }
    }

    public async execute(context: { code: string; data: Record<string, unknown>[] }): Promise<ValidatorResult> {
        const { code, data } = context;
        try {
            const sandbox = { data, globalThis: {} as any, console: { log: () => { } } }; // Protect console
            vm.createContext(sandbox);
            vm.runInContext(code, sandbox, { timeout: 3000 }); // Strict 3s timeout for loops

            if (!sandbox.globalThis.result || !sandbox.globalThis.result.data) {
                throw new Error("El código de la IA no asignó correctamente el {title, data} a globalThis.result.");
            }

            return { valid: true, reportConfig: sandbox.globalThis.result };
        } catch (error: any) {
            AgentLogger.error(this.id, `Validator VM Error: ${error.message}`);
            return { valid: false, error: error.message };
        }
    }
}
