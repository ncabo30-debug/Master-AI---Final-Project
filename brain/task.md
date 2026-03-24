# Task Log

## 2026-03-23 — Fase H completa: validación pre-normalización + scan comprensivo de datos

### Lo que se hizo esta sesión

**Fixes al pipeline (bugs detectados al validar H):**
- `useFileQueue.ts` línea 184: `cleanedData: file.rawData` → `cleanedData: cleanResult.cleanedData ?? null` (root cause de la tab de normalización mostrando datos sin limpiar)
- `route.ts` acción `apply_cleaning`: agregado `cleanedData: normResult.cleanedData` a la respuesta (el frontend no recibía los datos limpios)
- `CleanerAgent.ts` bug D-3: removido lowercase automático de strings. Ahora solo se aplica si la cleaning rule lo pide explícitamente. `ORD-1001`, `Customer_Name`, `City`, `Product_ID` ya no se lowercasean.
- `CleanerAgent.ts` bugs D-4/D-5: reescrita lógica de fechas — `parseDate(value, yearContext)` con soporte para ISO local, YYYYMMDD compacto, slash dd/MM/yyyy, numeric dash, named-month (`feb-26`, `7-feb.`). Pre-scan de formato dominante y año de contexto antes del row loop.
- `ManagerAgent.ts`: removido `FormatValidatorAgent` de la fase de detección (generaba falsos positivos con `column: '*'`). Reducido `extremeValues` de 5 a 3 por columna.

**NormalizationTab visual:**
- Tema oscuro (`bg-slate-900`), verde en header de columnas corregidas con badge de conteo, celdas corregidas resaltadas en verde con checkmark, celdas vacías en rojo itálico, leyenda, footer con conteo de correcciones.
- `changedCellMap` (Map O(1)) para lookup eficiente.

**InteractiveSheet:**
- Agregada sección "Avisos generales" para issues con `column: '*'` (duplicados, encoding) — el conteo del banner ahora coincide con lo visible.
- Agregadas props `controlledApprovedIds?: Set<string>` y `onToggleIssue?: (id: string) => void` para modo controlado desde el padre.
- Reemplazados usos internos de `approvedIssueIds` → `effectiveApprovedIds` y `toggleIssue` → `handleToggle`.

**Panel de validación pre-normalización (SchemaValidationFlow):**
- Estado cambiado de `useState<string[]>` a `useState<Set<string>>` como fuente de verdad única.
- Panel "Problemas Detectados" antes de la tabla: columna, fila, valor original, acción propuesta con valor normalizado real, checkbox, botones "Aprobar todos"/"Ignorar todos", click en fila hace toggle.
- Conectado con InteractiveSheet en modo controlado — ambos comparten el mismo `approvedSet`.

**Shared utility `dateUtils.ts`:**
- Creado `datalens-app/src/lib/agents/dateUtils.ts` con: `parseDate`, `formatDateToString`, `detectDominantDateFormat`, `detectMostCommonYear`.
- `CleanerAgent` actualizado para importar desde `dateUtils` (removidos los 4 métodos privados).
- `ManagerAgent` también importa `dateUtils` — garantiza que el valor en el preview es exactamente el que produce la normalización.
- `DetectedIssue` extendido con `normalizedValue?: string`.

**Scan comprensivo de datos en `ManagerAgent.detectIssues()`:**

Antes: solo fechas a nivel de columna (sin `rowIndex`).
Ahora: scan cell-level para fechas Y números:

| Tipo | Detección | normalizedValue |
|---|---|---|
| Fecha | `feb-26`, `20260209`, `7-feb.` | `26/02/2026` (formato dominante del doc) |
| Fecha | `N/A`, `-` en columna fecha | `(nulo)` |
| Número | `$1,234.56`, `1.234,50` | `1234.56` |
| Número | `N/A`, `-` en columna número | `(nulo)` |
| Número | texto en columna número | `(nulo)` — severity ERROR (pérdida de dato) |

Deduplicación: issues column-level del profiler se eliminan para columnas que ya tienen cobertura cell-level (evita doble conteo).

Filtro del panel: `kind === 'format' || kind === 'type_mismatch' || (kind === 'null' && rowIndex !== undefined)`. Outliers excluidos (fase posterior). Issues globales (`column: '*'`) excluidos (van al panel de avisos de InteractiveSheet).

**Resultado:** `npx tsc --noEmit` sin errores.

---

### Pendientes identificados esta sesión

1. **CleanerAgent no usa `approvedIssueIds`** (`_approvedIssueIds` ignorado) — el checkbox "ignorar" no tiene efecto en la normalización real. Hay que pasarlo a `applyColumnCleaning` para saltear celdas no aprobadas por `rowIndex`.

2. **Fase de outliers sin diseño** — el usuario pidió que outliers aparezcan "después" de la validación de formato. No hay pantalla ni flujo definido para eso.

---

## 2026-03-19 — Reorganización completa del proyecto y plan de arquitectura de producción

- Se leyeron todos los documentos activos de `brain/`.
- Se definió la arquitectura de producción objetivo: **Frontend (Vercel) + Backend Express (Railway) + Supabase** en un monorepo con carpetas `frontend/` y `backend/`.
- Se documentó el plan de migración completo en `brain/arquitectura_produccion_2026-03-19.md` con 6 fases (A-F), schema de Supabase, variables de entorno y criterios de éxito.
- Se consolidaron todos los pendientes (bugs, prompts, features) en `brain/session_handoff.md` con sistema de prioridades.

---

## 2026-03-19 — Plan de externalización de prompts a Markdown (pendiente de ejecución)

- Gap identificado: los prompts LLM están hardcodeados en TypeScript.
- Se diseñó el plan completo en `brain/implementation_plan_prompts_externalization_2026-03-19.md`.
- Inventario: 9 prompts en 6 agentes a externalizar.
- **Estado: plan aprobado, ejecución pendiente (Fase E).**

---

## 2026-03-15 — Corrección de bugs post-rediseño UX

- Fix freeze en `InteractiveSheet`: handlers envueltos en `useCallback`, datos sliceados a 50 filas, guard en `runPipelinePhase2`. **Pendiente confirmar resolución.**
- Fix dots de estado en sidebar (`inline-block` explícito).
- Header de archivo en `TabbedFileView` con nombre, filas, columnas y badge "Listo".
- Reubicación de `ComprehensionPanel` fuera de `SchemaValidationFlow`.

---

## 2026-03-14 — Rediseño UX Multi-Archivo

- Pasó del wizard secuencial de 6 pasos a sidebar de archivos + área principal con 5 pestañas.
- Nuevos archivos: `fileQueue.ts`, `csvParser.ts`, `useFileQueue.ts`, `FileSidebar.tsx`, `FileListItem.tsx`, `FileDropTarget.tsx`, `SchemaValidationFlow.tsx`, `NormalizationTab.tsx`, etc.
- Backend intacto (route.ts, DataStore, agentes).

---

## 2026-03-14 — Limpieza global de lint, bugs prioritarios y persistencia de schema

- Lint global: `npm run lint` OK, `npx tsc --noEmit` OK, `npm run build` OK.
- `schema_blueprints` v1 implementado in-memory por sesión.
- `DataAnomaly` desacoplada del detector.

---

## Registro histórico (2026-03-04 a 2026-03-07)
- Logs aislados por sesión, pipeline encadenado (`full_pipeline`), chat con SQL real.
- Análisis obligatorio antes del dashboard, traducción de errores amigable.
- Token tracking con costo estimado.
- Reescritura del prompt de `AnalystAgent`, redesign de `AgentFlowVisualizer`.
