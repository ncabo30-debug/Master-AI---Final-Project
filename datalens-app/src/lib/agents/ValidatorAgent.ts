import vm from 'node:vm';
import { AgentBus, type AgentMessage } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import type { ValidatorResult } from './types';

export class ValidatorAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'validator', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: AgentMessage): Promise<void> {
        if (message.type === 'VALIDATE_CODE') {
            const result = await this.execute(message.payload as {
                code: string;
                data: Record<string, unknown>[];
            });
            this.communicate(message.from, 'CODE_VALIDATED', result);
        }
    }

    public async execute(context: { code: string; data: Record<string, unknown>[] }): Promise<ValidatorResult> {
        const { code, data } = context;
        try {
            const sandbox: {
                data: Record<string, unknown>[];
                globalThis: { result?: ValidatorResult['reportConfig'] };
                console: { log: () => void };
            } = {
                data,
                globalThis: {},
                console: { log: () => { } }
            };
            vm.createContext(sandbox);
            vm.runInContext(code, sandbox, { timeout: 3000 }); // Strict 3s timeout for loops

            if (!sandbox.globalThis.result || !sandbox.globalThis.result.data) {
                throw new Error("El código de la IA no asignó correctamente el {title, data} a globalThis.result.");
            }

            return { valid: true, reportConfig: sandbox.globalThis.result };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            AgentLogger.error(this.id, `Validator VM Error: ${message}`);
            return { valid: false, error: message };
        }
    }
}
