import { AgentBus, type AgentMessage } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import { LLMService } from './core/LLMService';
import type { SchemaMap, SpecialistCodeResult } from './types';

export class SpecialistAgent extends AgentBase {
    constructor(id: string, tenantId: string, bus: AgentBus) {
        super(id, 'specialist', tenantId, bus);
        AgentRegistry.register(this);
    }

    protected async handleMessage(message: AgentMessage): Promise<void> {
        if (message.type === 'CREATE_CODE') {
            const result = await this.execute(message.payload as {
                schema: SchemaMap;
                answers?: Record<string, string>;
            });
            this.communicate(message.from, 'CODE_CREATED', result);
        }
    }

    public async execute(context: { schema: SchemaMap; answers?: Record<string, string> }): Promise<SpecialistCodeResult> {
        const { schema, answers } = context;


        const prompt = `Eres un Científico de Datos Experto escribiendo JavaScript. Tu objetivo es escribir JAVASCRIPT PURO funcional para generar un Dashboard.
Esquema de los datos: ${JSON.stringify(schema, null, 2)}
Foco del usuario (campo seleccionado): ${JSON.stringify(answers)}

INSTRUCCIONES CRÍTICAS:
1. Tu respuesta se pasará DIRECTAMENTE y sin procesar a la función "eval()" o "vm.runInContext()". NO PUEDE HABER NINGÚN CARÁCTER AJENO A JS EXCEPTO EL BLOQUE DE CÓDIGO.
2. Formato estrictamente JSON. Todo tu código irá dentro de la key "code" como string: { "code": "tu codigo aqui escapado" }
3. Tienes acceso a un arreglo global llamado "data".
4. El script DEBE terminar asignando el resultado a "globalThis.result".
5. "globalThis.result" DEBE ser algo como { title: "Ventas", data: [{name:"A", value: 10}] }.

Ejemplo estricto de respuesta JSON:
{
  "code": "const res = []; /* iterar data */ globalThis.result = { title: 'T', data: res };"
}`;

        try {
            const jsonContent = await LLMService.call(prompt, this.id, 'pro');
            const apiData = JSON.parse(jsonContent) as { code?: string };

            if (!apiData.code) {
                throw new Error("El LLM no devolvió el código en la clave 'code'");
            }

            return { code: apiData.code };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            AgentLogger.error(this.id, `SpecialistAgent Logic Error: ${message}`);
            return { error: message };
        }
    }
}
