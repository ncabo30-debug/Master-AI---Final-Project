# Plan de Rediseño del Pipeline — Preservación del Original + Flujo en Dos Fases
**Fecha:** 2026-03-23 | Fase H del roadmap

---

## Update — 2026-03-25 | Estado de implementación

- Este documento quedó parcialmente superado por la implementación real del pipeline nuevo en `datalens-app/`.
- El flujo actual ya evolucionó desde la separación `detect_issues/apply_cleaning` hacia el pipeline de blueprint:
  - `generate_blueprint`
  - `save_blueprint_override`
  - `execute_blueprint_and_save`
- El concepto de `cleanedData` quedó absorbido por `normalizedData` como fuente de verdad.
- La validación humana ya no está pensada solo como panel de issues: ahora existe una review completa con AG Grid y edición del blueprint.
- **Lo pendiente fuerte sigue siendo Supabase**: el pipeline local está armado, pero las conexiones reales a PostgreSQL/Storage/RPC todavía no.

> Si querés, el siguiente paso natural es que te deje armada también la capa SQL/RPC de Supabase con los CREATE TABLE, metadata tables y funciones rpc listas para enchufar.

---

## El problema que resuelve este plan

El pipeline actual limpia los datos **antes** de que el usuario vea nada. Para cuando aparece la pantalla de validación, el archivo original ya fue modificado en el servidor y lo que el usuario ve son datos ya transformados, no el original con los problemas marcados.

**Lo que el usuario ve hoy:** datos ya limpios + schema detectado → confirma → análisis
**Lo que debería ver:** datos originales con problemas resaltados → confirma qué arreglar → se crea copia limpia → análisis sobre la copia

Además, en `DataStore.ts` el campo `session.data` se sobreescribe con los datos limpios ([DataStore.ts:82](../datalens-app/src/lib/DataStore.ts#L82)), perdiendo el original. Solo existe un `originalDataSnapshot` parcial que nunca se muestra en la UI.

---

## El flujo correcto (objetivo de este plan)

```
FASE 0 — Detección (agentes leen el original, no tocan nada)
  rawData → FileInspector + Profiler + DuplicateDetector +
            OutlierDetector + FormatValidator + IntegrityAuditor
  → Produce: lista estructurada de issues por columna/celda

FASE 1 — Validación por el usuario (pantalla actual rediseñada)
  Se muestra el CSV ORIGINAL con los issues superpuestos como highlights
  El usuario puede:
    - Ver qué problemas detectó cada agente y en qué celda
    - Corregir el rol semántico de columnas (ya existente)
    - Aprobar o descartar issues individuales
    - Clic en "Confirmar y normalizar"

FASE 2 — Normalización (recién acá se toca el archivo)
  rawData + issues aprobados → CleanerAgent aplica correcciones
  → Produce: cleanedData (copia normalizada)
  → originalData queda intacto en DataStore, nunca se sobreescribe

FASE 3 — Análisis (sin cambios respecto al pipeline actual)
  SchemaAgent → AnalystAgent → VizExpertAgent
  Todo sobre cleanedData, nunca sobre originalData
```

---

## Tareas de implementación — Fase H

### H-1 — Rediseñar `DataStore.ts` para preservar el original
**Archivo:** `datalens-app/src/lib/DataStore.ts`

Cambios:
- Agregar campo `originalData: Record<string, unknown>[]` a `StoredSession` — se escribe una sola vez en `storeData()` y **nunca se sobreescribe**
- Renombrar el campo `data` a `cleanedData` para dejar explícito que es la versión procesada
- `storeData()` guarda en `originalData` y también en `cleanedData` (inicialmente son iguales)
- `storeCleaningResult()` solo actualiza `cleanedData`, nunca `originalData`
- Agregar `getOriginalData(sessionId)` como función pública
- Todos los agentes que hoy leen `getData()` siguen funcionando sin cambios (leen `cleanedData`)

**Por qué es el primer paso:** todo lo demás depende de que el DataStore tenga la distinción correcta entre original y limpio.

---

### H-2 — Separar `ManagerAgent.processDataCleaning()` en dos métodos
**Archivo:** `datalens-app/src/lib/agents/ManagerAgent.ts`

Cambios:
- Crear `detectIssues(rawData)` → corre solo los agentes de detección:
  - `FileInspectorAgent` — encoding, delimitador, hash
  - `ProfilerAgent` — tipos inferidos por columna
  - `DuplicateDetectorAgent` — filas duplicadas exactas y parciales
  - `OutlierDetectorAgent` — valores estadísticamente inusuales
  - `FormatValidatorAgent` — fechas mal formateadas, números como texto, etc.
  - `IntegrityAuditorAgent` — checksum de integridad
  - Devuelve un `IssueReport` estructurado (ver H-5)
  - **No modifica los datos. No llama a CleanerAgent.**

- Crear `applyNormalization(rawData, approvedIssues)` → corre solo `CleanerAgent` con las instrucciones específicas de qué corregir
  - Recibe el rawData original + la lista de issues que el usuario aprobó
  - Devuelve `cleanedData`
  - Acá es donde se resuelven los bugs D-1 a D-7 (están todos en CleanerAgent y sus agentes asociados)

- Mantener `processDataCleaning()` como wrapper deprecated que llama ambos en secuencia (para no romper nada mientras se migra)

---

### H-3 — Nuevas acciones en la API: `detect_issues` + `apply_cleaning`
**Archivo:** `datalens-app/src/app/api/analyze/route.ts`

Nueva acción `detect_issues`:
- Recibe: `data` (rawData del CSV), `sessionId`
- Llama: `manager.detectIssues(rawData)`
- Guarda: `originalData` en DataStore (inmutable de acá en adelante), `issueReport` en sesión
- Devuelve: `{ sessionId, issueReport, profile }` — nunca devuelve datos modificados

Nueva acción `apply_cleaning`:
- Recibe: `sessionId`, `approvedIssues` (array de issue IDs que el usuario confirmó, o flag `applyAll: true`)
- Lee: `originalData` del DataStore
- Llama: `manager.applyNormalization(originalData, approvedIssues)`
- Guarda: `cleanedData` en DataStore
- Devuelve: `{ sessionId, cleanedRowCount, changesSummary }`

La acción `clean_data` existente queda en el código pero marcada como deprecated. No eliminar hasta que todo esté migrado y probado.

---

### H-4 — Nuevos estados en `fileQueue.ts`
**Archivo:** `datalens-app/src/lib/fileQueue.ts`

Nuevos estados del pipeline:
```
QUEUED → DETECTING → AWAITING_VALIDATION → CLEANING → SCHEMA_DETECTION → ... → READY
```

- `DETECTING` (reemplaza `PARSING`) — corre `detect_issues`, muestra spinner "Detectando problemas..."
- `AWAITING_VALIDATION` — sin cambios en el nombre, pero ahora significa "esperando que el usuario revise el original con issues"
- `CLEANING` (nuevo) — corre `apply_cleaning` después de la confirmación del usuario, muestra "Normalizando datos..."
- El resto de los estados (`SCHEMA_DETECTION`, `NORMALIZING`, `VALIDATING`, `READY`) no cambian

Agregar labels en `FILE_STATUS_LABEL`:
```ts
DETECTING: 'Detectando problemas...',
CLEANING:  'Normalizando datos...',
```

---

### H-5 — Nuevo tipo `IssueReport` + actualizar `FileRecord`
**Archivos:** `datalens-app/src/lib/agents/types.ts` y `datalens-app/src/lib/fileQueue.ts`

Nuevo tipo `IssueReport`:
```ts
interface DetectedIssue {
  id: string;                    // identificador único del issue
  agentSource: string;           // qué agente lo detectó
  kind: 'format' | 'duplicate' | 'outlier' | 'encoding' | 'null' | 'type_mismatch';
  severity: 'error' | 'warning' | 'info';
  column: string;                // columna afectada
  rowIndex?: number;             // fila afectada (si es un issue de celda)
  value?: unknown;               // valor problemático
  suggestion: string;            // qué haría el CleanerAgent si se aprueba
  example?: string;              // "2026/03/01" → se convertiría a "2026-03-01"
}

interface IssueReport {
  issues: DetectedIssue[];
  issuesByColumn: Record<string, DetectedIssue[]>;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
}
```

Cambios en `FileRecord`:
- Agregar `issueReport: IssueReport | null`
- `cleanedData` ya existía — queda igual
- `rawData` ya existía — ahora tiene un rol más explícito: es lo que se muestra en la validación

---

### H-6 — Refactorizar `useFileQueue.ts`
**Archivo:** `datalens-app/src/lib/useFileQueue.ts`

Cambios:
- Renombrar `runPipelinePhase1()` → `runDetection()` — llama a `detect_issues`
- Crear `runCleaning(fileId, approvedIssueIds)` — llama a `apply_cleaning`, luego lanza Phase 2
- `confirmSchema()` pasa a llamarse `confirmAndClean(fileId, approvedIssueIds)` — es el trigger que el usuario activa desde la UI
- Phase 2 (`runPipelinePhase2`) no cambia — sigue corriendo `generate_analysis` + `propose_visualizations`

Nuevo método público en el hook:
```ts
confirmAndClean: (fileId: string, approvedIssueIds: string[]) => void
```

---

### H-7 — Rediseñar `InteractiveSheet.tsx`
**Archivo:** `datalens-app/src/components/InteractiveSheet.tsx`

Cambios:
- Recibir `issueReport: IssueReport` en lugar de `anomalies: DataAnomaly[]`
- Mostrar `rawData` (datos originales) como contenido de la tabla — no `cleanedData`
- Por cada celda con issue: highlight de color según severidad (rojo=error, amarillo=warning)
- En el header de cada columna con issues: badge con el conteo y tipo
- Al hacer hover sobre una celda problemática: tooltip con "Problema detectado: X. Si confirmás, se convertirá a: Y"
- Cada issue tiene un checkbox: el usuario puede desmarcar los que no quiere corregir
- Estado local: `approvedIssueIds` — array de IDs de issues que el usuario dejó marcados (por defecto todos)

---

### H-8 — Actualizar `SchemaValidationFlow.tsx`
**Archivo:** `datalens-app/src/components/layout/SchemaValidationFlow.tsx`

Cambios:
- Pasar `file.rawData` a `InteractiveSheet` en lugar de `file.cleanedData`
- Pasar `file.issueReport` en lugar de `file.dataAnomalies`
- El botón de continuar pasa a llamarse "Confirmar y normalizar"
- Al hacer clic, recoge los `approvedIssueIds` del estado de `InteractiveSheet` y llama a `confirmAndClean(fileId, approvedIssueIds)`
- Mostrar resumen de issues antes del botón: "Se encontraron X problemas. Se corregirán Y. Se ignorarán Z."

---

### H-9 — Resolver bugs D-1 a D-7 como parte de H-2
Los bugs del pipeline listados como PRIORIDAD 2 (D series) son todos problemas dentro de los agentes que ahora se separan claramente. Resolverlos durante la implementación de H-2:

| Bug | Dónde se resuelve en H |
|---|---|
| D-1: CleanerAgent.cleanWithAI() instrucciones no aplicadas | H-2: `applyNormalization()` — CleanerAgent |
| D-2: IntegrityAuditorAgent checksum falsos positivos | H-2: `detectIssues()` — IntegrityAuditorAgent |
| D-3: Normalización categórica (lowercase) | H-2: `applyNormalization()` — CleanerAgent |
| D-4: parseDate() dd/MM vs MM/dd mismo regex | H-2: `detectIssues()` + `applyNormalization()` — FormatValidatorAgent + CleanerAgent |
| D-5: DuplicateDetectorAgent.hashRow() orden de claves | H-2: `detectIssues()` — DuplicateDetectorAgent |
| D-6: Filtrar filas completamente nulas post-limpieza | H-2: `applyNormalization()` — CleanerAgent |
| D-7: ProfilerAgent muestra 50 filas estratificadas | H-2: `detectIssues()` — ProfilerAgent |

**Al completar H-2 con estos fixes integrados, los ítems D-1 a D-7 quedan cerrados.**

---

### H-10 — Validación de Reconciliación: garantía de equivalencia semántica
**Agente:** ampliar `IntegrityAuditorAgent.ts` con un nuevo método `reconcile()`

Este es el paso que cierra el ciclo de confianza: después de que `applyNormalization()` produce el `cleanedData`, antes de continuar al análisis, se corre una validación celda a celda que prueba que el significado de cada dato es idéntico en ambas versiones. La normalización solo puede haber cambiado el formato, nunca el dato en sí.

#### Qué verifica

**1. Reconciliación de filas**
```
cleanedData.length + duplicatesRemoved = originalData.length
```
Si esto no se cumple, hay filas que desaparecieron sin justificación — error bloqueante.

**2. Equivalencia semántica celda a celda por tipo de dato**

El agente conoce el tipo de cada columna (del `IssueReport` generado en H-2) y aplica la comparación correcta:

| Tipo de columna | Cómo compara |
|---|---|
| **Date / Timeline** | Parsea ambos valores como timestamp → compara como entero de ms → deben ser iguales. `"01/03/2026"` y `"2026-03-01"` dan el mismo timestamp → ✅ |
| **Numeric / Metric** | Strip de símbolos en el original (`$`, `€`, `,`, espacios) → convierte ambos a float → compara con tolerancia de 0.001%. `"1.234,56"` y `1234.56` son iguales → ✅ |
| **String / Dimension** | Trim + lowercase en ambos → compara. `" Juan Pérez "` y `"juan pérez"` → ✅ |
| **ID** | Comparación exacta de string. Un ID no se puede transformar. `"ORD-1001"` debe ser `"ORD-1001"` → sin cambios permitidos |

**3. Output: `ReconciliationReport`**
```ts
interface ReconciliationDiscrepancy {
  column: string;
  rowIndex: number;
  originalValue: unknown;      // lo que había en el original
  cleanedValue: unknown;       // lo que quedó después de limpiar
  reason: string;              // "El valor numérico cambió: 1234 → 1200"
  severity: 'blocking' | 'warning';
}

interface ReconciliationReport {
  passed: boolean;
  rowsAccounted: boolean;
  reconciliationRate: number;         // % de celdas que reconcilian (debe ser 100%)
  discrepancies: ReconciliationDiscrepancy[];
  duplicatesRemoved: number;          // filas eliminadas por deduplicación (esperado)
  blockingCount: number;
  warningCount: number;
}
```

#### Cuándo bloquea y cuándo advierte

- **Blocking**: un valor numérico cambió de magnitud, un ID fue alterado, desaparecieron filas sin justificación → el usuario debe revisar antes de continuar
- **Warning**: un string quedó con un cambio de mayúsculas distinto al esperado, una fecha con ambigüedad de interpretación → se muestra pero no bloquea

#### Cómo se muestra en la UI

Después de que el usuario confirma y se aplica la normalización (estado `CLEANING`), antes de pasar a `SCHEMA_DETECTION`, se muestra una pantalla de resultado de reconciliación:

- ✅ Si pasa al 100%: badge verde "Datos verificados — todos los valores reconcilian con el original" y continúa automáticamente
- ⚠️ Si hay warnings: resumen con las discrepancias menores, botón para revisar o ignorar y continuar
- ❌ Si hay discrepancias bloqueantes: se muestran las celdas específicas con el valor original vs el valor limpio, y el usuario debe decidir qué hacer

Esta pantalla es también una muestra de transparencia hacia el usuario — puede ver exactamente qué cambió y confirmar que está bien antes de que los agentes analicen.

---

## Orden de ejecución

```
H-1 (DataStore)               ← base de todo, hacerlo primero
    ↓
H-5 (tipos IssueReport)       ← definir contratos antes de implementar
    ↓
H-2 (ManagerAgent split)      ← lógica core + fixes de bugs D series
    ↓
H-10 (ReconciliationReport)   ← ampliar IntegrityAuditorAgent, definir tipos
    ↓
H-3 (API actions)             ← exponer los nuevos métodos + acción de reconciliación
    ↓
H-4 (fileQueue estados)       ← actualizar la máquina de estados
    ↓
H-6 (useFileQueue hook)       ← conectar frontend con la nueva API
    ↓
H-7 + H-8 (UI)                ← InteractiveSheet + SchemaValidationFlow + pantalla de reconciliación
```

---

## Por qué hacer esto antes de la migración a producción

Migrar la arquitectura rota a producción (Vercel + Railway) y después rediseñarla implica hacer el trabajo de migración dos veces. Es más eficiente:

1. Implementar H en el codebase actual (`datalens-app/`)
2. Verificar que funciona localmente
3. Migrar la arquitectura correcta a producción

El rediseño no agrega dependencias nuevas — trabaja con las mismas librerías y estructura de agentes existente.

---

## Criterios de éxito (cómo saber que H está completo)

- [ ] Subir un CSV con fechas en formato incorrecto → la pantalla muestra el CSV original con las celdas problemáticas resaltadas, sin haberlas tocado
- [ ] El usuario puede desmarcar un issue específico y al confirmar, ese dato queda tal como estaba en el original
- [ ] En DataStore, `originalData` y `cleanedData` son dos registros distintos y `originalData` nunca cambia después de la carga
- [ ] El análisis (AnalystAgent) corre sobre `cleanedData`, nunca sobre `originalData`
- [ ] Una fecha en formato `"01/03/2026"` en el original aparece como `"2026-03-01"` en el limpio → la reconciliación detecta que son la misma fecha → `passed: true`
- [ ] Un número `"1.234,56"` en el original aparece como `1234.56` en el limpio → reconciliación pasa
- [ ] Si CleanerAgent accidentalmente cambia `1234` a `1200`, la reconciliación lo marca como `blocking` y el usuario lo ve antes de continuar
- [ ] Si se eliminaron 3 duplicados, la diferencia de filas no es flaggeada como error — está contabilizada en `duplicatesRemoved`
- [ ] Los bugs D-1 a D-7 no se reproducen
- [ ] `npm run build` + `npx tsc --noEmit` sin errores
