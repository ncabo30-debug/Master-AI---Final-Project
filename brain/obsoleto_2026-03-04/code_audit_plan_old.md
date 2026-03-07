# Auditoría de Código & Plan de Remediación - DataLens AI

## Resumen Ejecutivo

Se auditaron **15 archivos fuente** del backend (`src/lib/agents/` y `src/app/api/`). Se encontraron **12 problemas** clasificados por severidad.

---

## 🔴 CRÍTICOS (Bugs activos que causan fallos)

### C1. ManagerAgent: Promesas que nunca resuelven en caso de error
- **Archivos:** [ManagerAgent.ts](file:///c:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/antigravity%20test/datalens-app/src/lib/agents/ManagerAgent.ts)
- **Problema:** Los métodos `processSchemaAndQuestions`, `generateFinalReport` y `processChat` envuelven toda la lógica en `new Promise((resolve) => {...})` sin **reject**. Si un agente hijo falla silenciosamente o un mensaje nunca llega, la Promise queda **colgada para siempre**, bloqueando la API de Next.js indefinidamente.
- **Fix:** Agregar un `setTimeout` de seguridad que haga `reject` si la operación no se completa, y manejar `reject` en los catch de errores.

### C2. ChatAgent: Lógica duplicada de `fetch` que viola DRY
- **Archivos:** [ChatAgent.ts](file:///c:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/antigravity%20test/datalens-app/src/lib/agents/ChatAgent.ts)
- **Problema:** `ChatAgent` reimplementa manualmente toda la lógica de `fetch` + `AbortController` + URL building que ya existe centralizada en `LLMService`. Esto crea un punto ciego donde cambios futuros al `LLMService` (como agregar retries o logging mejorado) no se aplican al chat.
- **Fix:** Agregar un método `LLMService.callRaw()` que devuelva texto libre sin intentar parsear JSON, y usarlo en `ChatAgent`.

### C3. API Route: No hay timeout en la petición HTTP de Next.js
- **Archivos:** [route.ts](file:///c:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/antigravity%20test/datalens-app/src/app/api/analyze/route.ts)
- **Problema:** La ruta no configura `maxDuration` para Vercel/Next.js. En producción, Next.js tiene un tiempo límite de 10s (hobby) o 60s (pro). Si Ollama tarda 3 minutos, Next.js mata la request antes.
- **Fix:** Agregar `export const maxDuration = 300;` y envolver cada operación con un try/catch que retorne un 504 si se excede el tiempo.

---

## 🟠 ALTOS (Problemas de escalabilidad)

### H1. Memory Leak: Agentes nunca se limpian del Registry en todos los error paths
- **Archivos:** [ManagerAgent.ts](file:///c:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/antigravity%20test/datalens-app/src/lib/agents/ManagerAgent.ts)
- **Problema:** `AgentRegistry.unregister()` solo se llama en los paths felices. Si la Promise se queda colgada (ver C1), los agentes se acumulan en memoria.
- **Fix:** Usar un bloque `finally` después de cada Promise para garantizar la limpieza.

### H2. AgentBase: Método `send()` es un alias innecesario de `communicate()`
- **Archivos:** [AgentBase.ts](file:///c:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/antigravity%20test/datalens-app/src/lib/agents/core/AgentBase.ts)
- **Problema:** `send()` simplemente llama a `communicate()`. Tener dos métodos que hacen lo mismo confunde a futuros desarrolladores.
- **Fix:** Eliminar `send()`, dejar solo `communicate()`.

### H3. API Route: Se crea un ManagerAgent nuevo por cada request
- **Archivos:** [route.ts](file:///c:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/antigravity%20test/datalens-app/src/app/api/analyze/route.ts)
- **Problema:** Cada petición HTTP instancia un nuevo `ManagerAgent` con id fijo `'manager-main'`, lo cual colisiona con suscripciones previas del bus si hay requests concurrentes.
- **Fix:** Crear un id único por request (ej: `manager-${Date.now()}`).

---

## 🟡 MEDIOS (Calidad de código y mantenibilidad)

### M1. Uso excesivo de `any` en todo el codebase
- **Archivos:** Todos los agentes y la API route.
- **Problema:** Los parámetros `context: any`, `message: any`, `payload: any` eliminan las ventajas de TypeScript en compilación y autocompletado.
- **Fix:** Crear interfaces tipadas para `SchemaResult`, `QuestionResult`, `ReportResult`, `ChatResult` y usarlas en los métodos `execute()`.

### M2. Constante `LLM_TIMEOUT` duplicada en cada agente
- **Archivos:** `SchemaAgent.ts`, `ComprehensionAgent.ts`, `SpecialistAgent.ts`
- **Problema:** El timeout de 480000ms está hardcodeado en cada archivo individualmente. Si hay que cambiarlo, hay que tocar 3+ archivos.
- **Fix:** Mover el timeout a una constante exportada desde `LLMService` o un archivo de configuración.

### M3. Falta de tipado en `AgentMessage.payload`
- **Archivos:** [AgentBus.ts](file:///c:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/antigravity%20test/datalens-app/src/lib/agents/core/AgentBus.ts)
- **Problema:** `payload: any` hace imposible validar en compilación qué datos viajan por el bus.
- **Fix:** Mantener `any` por ahora, pero documentar con JSDoc los payloads esperados por cada tipo de mensaje.

---

## 🟢 BAJOS (Polish y mejoras menores)

### L1. `AgentLogger` no escribe a disco ni a DB
- **Problema:** Toda la trazabilidad se pierde al reiniciar el servidor. En producción, se deberían persistir los logs.
- **Fix:** Agregar un comentario `// TODO: Persist to file/DB in production` y dejarlo para una fase futura.

### L2. `globalThis.agentMessageHistory` es un array sin límite configurable
- **Archivo:** [AgentBus.ts](file:///c:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/antigravity%20test/datalens-app/src/lib/agents/core/AgentBus.ts)
- **Problema:** Aunque hay un `MAX_HISTORY = 500`, el valor no es configurable por env variable.
- **Fix:** Leer de `process.env.AGENT_MAX_HISTORY` con fallback a 500.

---

## Orden de Ejecución Propuesto

| Prioridad | ID | Descripción | Archivos |
|-----------|-----|-------------|----------|
| 1 | C1 | Timeout + reject en ManagerAgent Promises | `ManagerAgent.ts` |
| 2 | C2 | `LLMService.callRaw()` + refactor ChatAgent | `LLMService.ts`, `ChatAgent.ts` |
| 3 | C3 | `maxDuration` + error handling en API route | `route.ts` |
| 4 | H1 | Agent cleanup en todos los paths | `ManagerAgent.ts` |
| 5 | H2 | Eliminar `send()` duplicado | `AgentBase.ts` |
| 6 | H3 | ID único de Manager por request | `route.ts` |
| 7 | M2 | Centralizar constante `LLM_TIMEOUT` | `LLMService.ts`, agentes |
| 8 | M1 | Interfaces tipadas | Nuevo archivo `types.ts` |

## Verificación

Tras completar los fixes:
1. `npx tsc --noEmit` debe pasar sin errores.
2. Subir el CSV de prueba y verificar que el flujo completo funcione.
3. Verificar que el LOG exportado muestre el flujo limpio sin errores.
