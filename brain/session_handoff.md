# Session Handoff - 2026-03-15 (post pruebas en vivo)

## Pendientes reales

### Punto pendiente funcional
- **Configuracion de agrupacion del dashboard reubicada pero aun no conectada**: Se saco `ComprehensionPanel` de `SchemaValidationFlow` porque la eleccion temprana de dimension (`q1`) estaba adelantada y no impactaba de forma real en el flujo posterior. Ahora hay avisos en `SchemaValidationFlow.tsx` y `VizProposalPanel.tsx`, pero falta implementar la conexion correcta de esa preferencia en la etapa de seleccion/generacion de visualizaciones. Retomar desde `VizProposalPanel`, `generate_dashboard` y, si aplica, `VizExpertAgent` o `ReportAgent`.

### Bug pendiente de confirmación
- **Freeze en tabla de SchemaValidationFlow**: El selector de rol semántico en `InteractiveSheet` (ej: columna `product_name`) seguía causando freeze según el usuario durante pruebas en vivo. Se aplicaron fixes (useCallback, data slice a 50 filas, guard en runPipelinePhase2) pero **no se confirmó resolución** — el usuario interrumpió antes de terminar la prueba. Verificar en próxima sesión subiendo un CSV y tocando el selector de rol en la vista AWAITING_VALIDATION.

### Deuda técnica de la sesión anterior (sin tocar en esta sesión)
- Los botones decorativos de `DashboardContent` siguen siendo deuda técnica si se espera funcionalidad real.
- El insight del dashboard sigue sin conectarse a un `StrategyAgent`.

### Roadmap funcional no implementado aún
- Persistencia real de `schema_blueprints` y `anomalies` en Supabase (actualmente todo es in-memory por sesión).
- Tabla `calculations` auditables + integración en `ManagerAgent`.
- `DataTable` con AG Grid (filtros, sorting, export CSV, columnas pineadas).
- Integración `DataTable` <-> chat para revisar filas puntuales con AI.
- `CrossReferenceAgent` para análisis cruzado visual entre archivos (era roadmap del multi-archivo doc).
- Manager multi-intento con clasificación de intención.
- `StrategyAgent` para respuestas gerenciales.

## Ya no hace falta tratar como pendiente
- Dots de estado en sidebar: visibles (fix con `inline-block` explícito en `FileListItem` y `StatusLegend`).
- Header de archivo en `TabbedFileView`: nombre, filas, columnas y badge "Listo" añadidos.
- Rediseño UX multi-archivo: **implementado y compilando**.
  - Sidebar de archivos con estados en tiempo real (dots animados).
  - Procesamiento paralelo con cola (máx. 2 activos, AWAITING_VALIDATION no cuenta slot).
  - 5 pestañas de trazabilidad por archivo: Archivo original, Esquema, Normalización, Validación, Dashboard.
  - Chat global multi-archivo en barra fija al fondo.
  - Upload drag-and-drop múltiple en sidebar.
  - Vista AdminView extraída (AgentTerminal + AgentFlowVisualizer).
  - Todos los componentes existentes reutilizados sin modificarse.
  - Backend intacto (route.ts, DataStore, agentes).
- Bugs de la tanda anterior: todos cerrados (logs, markdown, side effects, lint, tipos).
- `schema_blueprints` v1 implementado (in-memory por sesión).
- Limpieza global de lint: `npm run lint` OK, `npx tsc --noEmit` OK, `npm run build` OK (al final de la sesión anterior).
