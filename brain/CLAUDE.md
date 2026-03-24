# CLAUDE.md — Datalens AI

## Lo primero que tenés que hacer al empezar cualquier sesión

Leer `brain/session_handoff.md`. Ese archivo tiene el estado actual del proyecto, las prioridades en orden, los bugs pendientes y las tareas completadas. Sin leerlo, no tenés contexto.

Si hay algo que el usuario menciona como "lo vimos la última vez" o "ya lo decidimos", buscá la referencia en `brain/` antes de preguntar.

---

## Qué es Datalens

Sistema de agentes de IA para PYMEs. Toma datos de negocio (ventas, clientes, finanzas, inventario), los limpia, los analiza, y produce recomendaciones concretas en lenguaje simple para el dueño.

**No es un dashboard.** Es un sistema de agentes que entiende el negocio específico del cliente y mejora con el tiempo.

El producto tiene dos capas:
1. **Pipeline de datos** — limpieza, validación, análisis descriptivo, visualizaciones (ya implementado)
2. **Inteligencia de negocio** — 4 niveles de agentes especializados que producen recomendaciones accionables (en roadmap, Fase G)

---

## Estructura del repositorio

```
Projecto Final Master IA/
├── brain/                        ← Toda la documentación del proyecto
│   ├── CLAUDE.md                 ← Este archivo
│   ├── session_handoff.md        ← Estado actual + roadmap priorizado (LEER SIEMPRE)
│   ├── task.md                   ← Log histórico de sesiones
│   ├── arquitectura_produccion_2026-03-19.md   ← Plan de migración Vercel+Railway+Supabase
│   ├── vision_agentes_negocio_2026-03-23.md    ← Visión funcional de los 4 niveles de agentes
│   └── implementation_plan_prompts_externalization_2026-03-19.md
│
├── datalens-app/                 ← Código actual (Next.js, todo en un solo repo por ahora)
│   └── src/
│       ├── app/
│       │   └── api/              ← API routes de Next.js (se migrarán a backend Express)
│       ├── components/           ← Todos los componentes React
│       └── lib/
│           ├── agents/           ← Todos los agentes de IA
│           │   ├── core/         ← AgentBase, AgentBus, AgentRegistry, AgentLogger, LLMService
│           │   ├── CleanerAgent.ts
│           │   ├── AnalystAgent.ts
│           │   ├── ManagerAgent.ts
│           │   └── ... (resto de agentes)
│           ├── DataStore.ts      ← Almacenamiento in-memory de sesiones (se migrará a Supabase)
│           ├── TokenTracker.ts   ← Tracking de uso y costo de tokens
│           └── SQLiteService.ts  ← Base de datos in-memory para chat con SQL
│
└── IMPROVERS/                    ← Herramientas de mejora de prompts (ignorar en trabajo normal)
```

---

## Arquitectura objetivo (producción)

El código actual está todo en `datalens-app/` (Next.js monolítico). La arquitectura de producción lo divide en:

- **`frontend/`** → Vercel (Next.js, solo UI, sin API routes)
- **`backend/`** → Railway (Express + TypeScript, todos los agentes)
- **`shared/`** → Tipos TypeScript compartidos
- **Supabase** → PostgreSQL + Storage (reemplaza DataStore, TokenTracker, AgentLogger)

Ver el plan completo en `brain/arquitectura_produccion_2026-03-19.md`.

---

## Estado del pipeline actual (lo que ya funciona)

1. Usuario sube uno o más CSV
2. **Fase 1** (limpieza): FileInspectorAgent → ProfilerAgent → CleanerAgent → DuplicateDetectorAgent → IntegrityAuditorAgent → OutlierDetectorAgent → ValidatorAgent → FormatValidatorAgent
3. **Fase 2** (análisis): SchemaAgent → AnalystAgent → VizExpertAgent → ComprehensionAgent
4. Usuario puede chatear con los datos via SQL (ChatAgent → SQLiteService)
5. ManagerAgent coordina todo el flujo

Build limpio confirmado: `npm run lint` OK · `npx tsc --noEmit` OK · `npm run build` OK

---

## Convenciones de código

- **TypeScript estricto** — no usar `any`, no ignorar errores de tipos
- **Agentes** — todos extienden `AgentBase`, se registran en `AgentRegistry`, se comunican via `AgentBus`
- **LLM calls** — siempre a través de `LLMService`, nunca llamadas directas a la API
- **Errores** — usar `ErrorTranslator.ts` para mensajes al usuario, no exponer errores técnicos
- **Tokens** — toda llamada LLM debe pasar por `TokenTracker`

---

## Qué NO tocar sin preguntar primero

- `AgentBase.ts`, `AgentBus.ts`, `AgentRegistry.ts` — son el núcleo del sistema multi-agente
- `LLMService.ts` — abstracción del proveedor LLM, cambios aquí afectan todos los agentes
- `SQLiteService.ts` — funciona bien, tiene lógica delicada de in-memory DB
- El pipeline de Fase 1 en general — tiene bugs conocidos que se están corrigiendo (ver D-1 a D-7 en handoff), no agregar complejidad encima

---

## Documentos de referencia

| Documento | Para qué |
|---|---|
| `brain/session_handoff.md` | Estado actual, roadmap, bugs pendientes — SIEMPRE leer primero |
| `brain/arquitectura_produccion_2026-03-19.md` | Schema de Supabase, estructura de monorepo, variables de entorno |
| `brain/vision_agentes_negocio_2026-03-23.md` | Visión funcional completa de los 4 niveles de agentes (Fase G) |
| `brain/implementation_plan_prompts_externalization_2026-03-19.md` | Plan de externalización de prompts a .md |
| `brain/task.md` | Log histórico de lo que se hizo en cada sesión |
