# 📋 Session Handoff — 2026-03-07

## Estado del proyecto
Build: ✅ `npx next build` exitoso (6.6s)
Framework: Next.js 16.1.6 (Turbopack)
LLM: Gemini 2.5 Flash / Pro via `@google/generative-ai`

## Lo hecho hoy

| Cambio | Archivos principales |
|---|---|
| Fix modelos LLM (404 → 200) | `LLMService.ts` |
| Token tracking + widget costo USD | `TokenTracker.ts`, `TokenUsageWidget.tsx`, `/api/admin/tokens` |
| AnalystAgent prompt reescrito | `AnalystAgent.ts` |
| Outlier summary con valores específicos | `route.ts` (clean_data action) |
| AgentFlowVisualizer rediseñado | `AgentFlowVisualizer.tsx` |
| DashboardContent sanitización | `DashboardContent.tsx` |
| Auditoría end-to-end (7 bugs encontrados) | Documentado en `task.md` |

## Para la próxima sesión

### Arrancar por estos 7 bugs (en orden de prioridad):

1. **BUG 1** (CRITICAL): `page.tsx` L48/L175 — `DELETE /api/admin/logs` sin `sessionId` → logs nunca se borran
2. **BUG 3** (HIGH): `AnalysisPanel.tsx` L77 — `generateAnalysis()` en render body (no `useEffect`)
3. **BUG 4** (HIGH): `VizProposalPanel.tsx` L53 — `loadProposals()` en render body
4. **BUG 2** (MEDIUM): `AnalysisPanel.tsx` L134 — markdown mostrado como texto crudo (instalar `react-markdown`)
5. **BUG 6** (LOW): `AnalysisPanel.tsx` — inline styles dark-only, no respeta light theme
6. **BUG 5** (LOW): `ComprehensionPanel.tsx` L4 — import `lucide-react` sin usar
7. **BUG 7** (LOW): `TokenUsageWidget.tsx` — icon "token" no existe en Material Symbols

### Luego implementar:
- **Outlier highlighting** en `InteractiveSheet.tsx`: recibir `outlierReport` como prop, marcar celdas fuera de rango con fondo naranja + tooltip

### Deuda técnica arrastrada (sesión 01/03/2026, no resuelto aún):

#### Backend
- [ ] **DRY column extraction**: `ReportAgent.ts` L23-29 y `ComprehensionAgent.ts` L25-29 tienen la misma lógica para extraer `numericCols`/`categoryCols`. Crear helper `extractColumnsByType(schema)` en `agents/utils.ts`.
- [ ] **AgentBus `unsubscribe()`**: Los agentes se suscriben al bus en su constructor pero no se desuscriben al limpiarse del Registry. Agregar `unsubscribe(agentId)` y llamarlo desde `AgentRegistry.unregister()`.
- [ ] **`globalBus` exportado pero no usado**: `AgentBus.ts` exporta `globalBus` que nadie importa. Eliminar o documentar para Fase 4.

#### Frontend
- [ ] **DashboardContent botones decorativos**: "Exportar CSV" y "Nuevo Gráfico" no tienen `onClick` handler. Implementar funcionalidad o eliminar hasta Fase 4.
- [ ] **DashboardContent insight hardcodeado**: El panel "Insight Generado" muestra texto estático. Conectar al `StrategyAgent` en Fase 4.
- [ ] **InteractiveSheet override no propaga**: Los botones ✓/✏️ funcionan visualmente pero el override de `semantic_role` no se envía de vuelta al backend/SchemaAgent.

### Referencia rápida de arquitectura
```
Frontend: page.tsx → [FileUploader, InteractiveSheet, ComprehensionPanel, AnalysisPanel, VizProposalPanel, Dashboard]
API: /api/analyze (POST con actions: clean_data, analyze_schema, generate_analysis, etc.)
Backend: ManagerAgent → [ProfilerAgent, CleanerAgent, SchemaAgent, ComprehensionAgent, AnalystAgent, VizExpertAgent, SpecialistAgent, ValidatorAgent]
Tracking: TokenTracker (session-scoped) + AgentLogger + AgentBus (session-isolated)
```

