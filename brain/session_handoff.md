# Session Handoff — 2026-03-23 (actualizado)

## Estado general
La app funciona localmente. El pipeline multi-archivo está implementado y compila sin errores.
**La Fase H (rediseño del pipeline) está completa.** Siguiente objetivo: migrar a arquitectura de producción (Vercel + Railway + Supabase).

Ver el plan completo en: `brain/arquitectura_produccion_2026-03-19.md`

### Visión del producto — Los 4 niveles de inteligencia de negocio
El sistema debe evolucionar de una herramienta de limpieza/análisis de datos a un sistema de agentes especializados que entiende el negocio del cliente, cruza información entre dominios, y le habla al dueño en lenguaje concreto con recomendaciones accionables.
Ver el plan funcional completo en: `brain/vision_agentes_negocio_2026-03-23.md`

### ⚠️ Notas de prioridad entre roadmaps
- **H completado — puede procederse con la migración a producción**
- **Los bugs D-1 a D-7 quedaron absorbidos por H-2 y H-9** — resueltos.
- **F-7 (`StrategyAgent`) y F-8 (`CrossReferenceAgent`) quedan supersedidos por G-2 y G-4** — no implementar de forma independiente.
- **G-3 debe implementarse antes que G-4** — el Agente de Negocio depende de que la memoria de 3 capas exista en Supabase.

---

## ✅ PRIORIDAD 1 — Rediseño del pipeline (FASE H) — COMPLETADA

Todas las tareas H implementadas y funcionando. Build limpio: `npx tsc --noEmit` OK.

### Lo que hace el flujo actual
`rawData → detectar issues sin tocar nada → usuario ve original con problemas resaltados → confirma → se crea cleanedData → análisis sobre cleanedData`

### Tareas H completadas
- [x] H-1: `DataStore.ts` — `originalData` inmutable, `cleanedData` separado, `getOriginalData()`
- [x] H-2: `ManagerAgent` separado en `detectIssues()` + `applyNormalization()`
- [x] H-3: API actions `detect_issues` y `apply_cleaning` en `route.ts`
- [x] H-4: Estados `DETECTING`, `AWAITING_VALIDATION`, `CLEANING` en `fileQueue.ts`
- [x] H-5: Tipos `IssueReport` + `DetectedIssue` + `normalizedValue` en `types.ts`
- [x] H-6: `useFileQueue.ts` — `runDetection()`, `runCleaning()`, `confirmAndClean()`
- [x] H-7+H-8: `InteractiveSheet` + `SchemaValidationFlow` — modo controlado, controlled props
- [x] H-9: Bugs D-1 a D-7 resueltos en `CleanerAgent` (fechas, lowercase, formato)
- [x] H-10: `ReconciliationReport` en `IntegrityAuditorAgent`

### Panel de validación pre-normalización (implementado esta sesión)
El panel "Problemas Detectados" en `SchemaValidationFlow` muestra:
- **Fechas no estándar** con el valor normalizado exacto: `feb-26 → 26/02/2026`
- **Números con formato sucio** (moneda, miles): `$1,234.56 → 1234.56`
- **Valores no parseables** en columna numérica: `texto → (nulo)` — severidad ERROR (pérdida de dato)
- **Placeholders nulos** en columnas tipadas: `N/A → (nulo)`
- Checkbox por issue + "Aprobar todos" / "Ignorar todos"
- La tabla resalta las celdas problemáticas (mismo estado compartido con el panel)
- Outliers e issues globales (`column: '*'`) NO se muestran aquí (separados)

### Shared utility `dateUtils.ts`
`datalens-app/src/lib/agents/dateUtils.ts` — contiene `parseDate`, `formatDateToString`, `detectDominantDateFormat`, `detectMostCommonYear`. Usada por tanto `ManagerAgent` (preview) como `CleanerAgent` (normalización). Garantiza que el valor mostrado en el panel es exactamente el que producirá la normalización.

---

## 🔴 Pendientes dentro de Fase H (deuda técnica)

### H-PENDIENTE-1: CleanerAgent ignora `approvedIssueIds`
**Problema:** El usuario puede desmarcar un issue en el panel, pero `applyNormalization()` recibe `_approvedIssueIds` y **no lo usa** — CleanerAgent limpia todo igualmente.
**Impacto:** El checkbox "ignorar" no tiene efecto real en la normalización.
**Solución:** En `applyNormalization()`, pasar los `approvedIssueIds` a `CleanerAgent.execute()`, y en `applyColumnCleaning()` saltear celdas cuyos issues no están aprobados (usando el `id` del issue y el `rowIndex`).

### H-PENDIENTE-2: Fase de outliers no diseñada
**Problema:** El usuario pidió que los outliers muestren "después" (en una fase posterior a la validación de formato). No hay diseño ni pantalla para eso.
**Por decidir:** ¿En qué pestaña? ¿Antes o después de la tab de normalización? ¿El usuario puede excluir filas con outliers?

---

## 🔴 PRIORIDAD 2 — Migración a producción (Fases A, B, C)
*Hacer ahora que H está completa. Bloquea P3 en adelante.*

### FASE A — Monorepo + Supabase Setup (1 día)
- [ ] A-1: Crear carpetas `frontend/` y `backend/` en la raíz del repo
- [ ] A-2: Mover código actual de `datalens-app/` a `frontend/` (Next.js completo)
- [ ] A-3: Crear `backend/` con Express + TypeScript
- [ ] A-4: Copiar `src/lib/agents/` entero a `backend/src/lib/agents/`
- [ ] A-5: Copiar `DataStore.ts`, `TokenTracker.ts`, `SQLiteService.ts`, `ErrorTranslator.ts` a `backend/`
- [ ] A-6: Crear `shared/types.ts` con contratos de la API
- [ ] A-7: Crear proyecto en Supabase y correr el schema SQL inicial

### FASE B — Backend Express en Railway (2-3 días)
- [ ] B-1: Crear `backend/src/server.ts` (Express + CORS + middleware)
- [ ] B-2: Migrar `/api/analyze/route.ts` → `backend/src/routes/analyze.ts`
- [ ] B-3: Migrar `/api/admin/` → `backend/src/routes/admin.ts`
- [ ] B-4: Crear `middleware/auth.ts` (validación API Key)
- [ ] B-5: Crear `middleware/cors.ts` (solo dominio de Vercel)
- [ ] B-6: **Reescribir `DataStore.ts`** → Supabase PostgreSQL + Storage
- [ ] B-7: **Reescribir `TokenTracker.ts`** → tabla `token_usage` en Supabase
- [ ] B-8: **Reescribir `AgentLogger.ts`** → tabla `agent_logs` en Supabase
- [ ] B-10: Crear `backend/.env.example` con todas las variables documentadas
- [ ] B-11: Configurar deploy en Railway, conectar GitHub, setear env vars

### FASE C — Frontend adaptado en Vercel (1-2 días)
- [ ] C-1: Crear `frontend/src/lib/api-client.ts` (fetch al backend externo)
- [ ] C-2: Reemplazar `apiPost()` en `useFileQueue.ts` para usar `api-client.ts`
- [ ] C-3: Agregar `NEXT_PUBLIC_API_URL` en `frontend/.env.local`
- [ ] C-4: Eliminar `frontend/src/app/api/` (ya no hay API routes en Vercel)
- [ ] C-5: Upload de CSV directo a Supabase Storage desde el browser
- [ ] C-6: Adaptar `useFileQueue.ts`: enviar URL del archivo, no datos crudos
- [ ] C-7: Agregar validación de tamaño de archivo (50MB límite)
- [ ] C-8: Agregar Error Boundaries en `FileMainArea` y `DashboardContent`
- [ ] C-9: Agregar recovery de sesión desde localStorage
- [ ] C-10: Configurar deploy en Vercel, apuntar a `/frontend`

---

## 🟡 PRIORIDAD 3 — Externalización de prompts (independiente, ejecutar post-Fase A)

Plan completo en: `brain/implementation_plan_prompts_externalization_2026-03-19.md`

- [ ] E-1: Crear `PromptLoader.ts` en `backend/src/lib/agents/core/`
- [ ] E-2: Crear 9 archivos `.md` de prompts en `backend/src/lib/agents/prompts/`
- [ ] E-3: Modificar los 6 agentes para usar `PromptLoader`

---

## 🟢 PRIORIDAD 4 — Features funcionales (requieren producción funcionando)

- [ ] F-1: Persistir `schema_blueprints` en Supabase (hoy in-memory)
- [ ] F-2: Persistir `anomalies` en Supabase + acciones en UI
- [ ] F-3: Tabla `calculations` + integración en `ManagerAgent`
- [ ] F-4: `DataTable` con AG Grid (filtros, sorting, export, columnas pineadas)
- [ ] F-5: Integración `DataTable` ↔ chat del `ManagerAgent`
- [ ] F-6: Conectar `ComprehensionPanel` → `VizExpertAgent`
- [ ] ~~F-7: `StrategyAgent`~~ → **supersedido por G-4**
- [ ] ~~F-8: `CrossReferenceAgent`~~ → **supersedido por G-2**

---

## 🔵 PRIORIDAD 5 — Inteligencia de Negocio: Los 4 niveles de agentes
*Requiere: producción funcionando (P1) + Fase G.*
*Plan funcional completo en: `brain/vision_agentes_negocio_2026-03-23.md`*

- [ ] G-1: **Agentes especialistas de dominio** — `SalesAgent`, `CustomerAgent`, `FinanceAgent`, `InventoryAgent`
- [ ] G-2: **Orquestador con cruce y cierre forzado** — `OrchestratorAgent`
- [ ] G-3: **Sistema de memoria de 3 capas** — tablas Supabase: `business_profiles`, `weekly_summaries`, `confirmed_patterns`
- [ ] G-4: **Agente de Negocio** — `BusinessAgent` con lenguaje concreto y memoria
- [ ] G-5: **Feedback loop** — tabla `recommendations`, tracking automático
- [ ] G-6: **Optimización de modelo por agente** — modelos baratos para especialistas, top model para BusinessAgent

---

## ⚠️ Bug pendiente de confirmación
- **Freeze en `InteractiveSheet`**: El selector de rol semántico puede seguir causando freeze con CSVs grandes. Se aplicaron fixes (useCallback, data slice a 50 filas) pero no se confirmó resolución definitiva.

---

## ✅ Ya implementado y funcionando (no tocar sin razón)

### Pipeline completo
- Rediseño UX multi-archivo (sidebar + 5 pestañas + cola de procesamiento)
- **Fase H completa**: rawData inmutable → detect issues → usuario valida → confirmAndClean → cleanedData → análisis
- Panel de validación pre-normalización con preview del valor normalizado real
- Tab de Normalización con diff celda a celda (verde = corregido, rojo = vacío)
- Reconciliación post-normalización (`ReconciliationReport`)
- Chat con SQL real via SQLiteService
- TokenTracker + widget de costo
- schema_blueprints v1 in-memory
- Dots de estado animados en sidebar
- Build limpio: `npm run lint` OK · `npx tsc --noEmit` OK

### Archivos clave del pipeline (no tocar sin contexto)
| Archivo | Rol |
|---|---|
| `lib/agents/ManagerAgent.ts` | Orquestador: `detectIssues()` + `applyNormalization()` |
| `lib/agents/CleanerAgent.ts` | Limpieza de datos, importa `dateUtils.ts` |
| `lib/agents/dateUtils.ts` | Shared: `parseDate`, `formatDateToString`, `detectDominantDateFormat`, `detectMostCommonYear` |
| `lib/agents/types.ts` | Tipos: `DetectedIssue` (con `normalizedValue`), `IssueReport`, `ReconciliationReport` |
| `lib/useFileQueue.ts` | Hook: `runDetection()`, `runCleaning()`, `confirmAndClean()` |
| `lib/fileQueue.ts` | Estados: `DETECTING → AWAITING_VALIDATION → CLEANING → ... → READY` |
| `lib/DataStore.ts` | `originalData` (inmutable) + `cleanedData` por sesión |
| `app/api/analyze/route.ts` | Actions: `detect_issues`, `apply_cleaning`, `analyze_schema`, etc. |
| `components/InteractiveSheet.tsx` | Tabla con highlighting + controlled mode (`controlledApprovedIds`, `onToggleIssue`) |
| `components/layout/SchemaValidationFlow.tsx` | Panel "Problemas Detectados" + tabla + confirm button |
| `components/layout/NormalizationTab.tsx` | Diff visual rawData vs cleanedData |
