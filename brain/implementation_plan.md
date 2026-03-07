# Implementación de Arquitectura V3 (DataLens AI)

De acuerdo con el documento `DataLens_AI_Arquitectura_v3 (1).docx`, la aplicación actual se encuentra en una versión V1/V2 básica. Para llegar a la V3 real, necesitamos implementar un ecosistema multi-agente avanzado, validaciones de código en Sandbox y un Registro de Agentes en base de datos. 

A continuación, el plan de trabajo estructurado por sesiones (alineadas al documento V3):

## Fase 1: Fundaciones de Agentes (Sesiòn 3.1)
El objetivo es migrar el sistema a una arquitectura robusta de agentes que se registran y comunican.

1. **Refactorización Core** (`src/lib/agents/core/`)
   - Mover `AgentBus` y `AgentBase` a una nueva carpeta `core`.
   - Modificar `AgentBase` para incluir propiedades formales: `id`, `type`, `tenantId`.
   - Añadir métodos estándar `execute()` y `communicate()`.
2. **Registro y Log**
   - Crear `AgentRegistry` (Clase para manejar qué agentes están vivos y disponibles).
   - Crear `AgentLogger` para registrar tokens, costos y duración en una base de datos o archivo log.
3. **Abstracción LLM**
   - Integrar el *Vercel AI SDK* en `AgentBase` para permitir el *switch* fácil entre Claude/OpenAI u Ollama, reemplazando los `fetch` actuales a la API de openai sueltos en cada agente.

## Fase 2: Schema Avanzado y Validación Visual (Sesiones 2.2, 2.3, 2.4)
El objetivo es que la IA entienda el "alma" de los datos, no solo su tipo.

1. **Schema Agent V3**
   - Modificar `SchemaAgent` para enviar una muestra de 20 filas + estadísticas a la IA.
   - Analizar el `semantic_role` (rol semántico), clasificación de dominio y variables de análisis posibles por cada columna.
2. **InteractiveSheet UI**
   - Modificar el Frontend (Paso 2) para mostrar colores por `semantic_role` (Ej: Verde=Monto, Azul=Fecha).
   - Añadir botones de confirmar/corregir por cada columna.
3. **Data Blueprints**
   - Almacenar el *Schema Blueprint* final y detectar datos sensibles.
   - Lógica para reconocer si el mismo archivo se sube dos veces (Refresh).

## Fase 3: Specialists, Sandboxing y Reportes (Sesiones 3.2, 3.3, 4.1)
El objetivo es que los agentes escriban código, en lugar de generar dashboards fijos.

1. **Specialist Agent**
   - Crear el `SpecialistAgent` capaz de operar en *CODE MODE*.
   - Este agente deberá recibir un contexto de datos, generar código JavaScript para procesarlos y devolver los datos agregados + configuración de *Recharts*.
2. **Sandbox de Ejecución**
   - Implementar un entorno seguro local (usando el constructor `Function` o `vm2` - en frontend `Function` u oculto en API) para correr el código generado por la IA en tiempo de ejecución.
3. **Validator Agent**
   - Crear `ValidatorAgent` para revisar las salidas del Sandbox (revisa sumatorias estáticas, cruces de integridad).
4. **Dashboard Dinámico**
   - Conectar las salidas aprobadas por el validator al Dashboard. 
   - Permitir múltiples gráficas según el array de reportes propuestos.

## Fase 4: Orquestación y Estrategia (Sesiones 3.4, 3.5, 4.2)
El objetivo es la comunicación empresarial y el cruce de datos.

1. **Manager Multi-Intento**
   - Modificar el `ManagerAgent` para incluir *IntentClassifier* (qué quiere el usuario), *TeamPlanner* (a qué agentes delegar) y *ResponseSynthesizer*.
2. **Cross-Reference Agent**
   - Intercomunicar múltiples *Blueprints*. Si subo Ventas y Clientes, el Agente debe trazar un diagrama de cómo se cruzan (Join Map).
3. **Strategy Agent**
   - El ChatBot final que responde consultas estratégicas y rutea consultas técnicas de nuevo a los especialistas.

---

# Historial de Implementación y Contexto (Phase Tracking)
*Este registro sirve para asentar rápidamente qué se logró en cada sesión y retomar el contexto sin pérdida de información.*

### [COMPLETADO] Sesión 2026-03-04: 5 Mejoras Estructurales
- **Estado:** Finalizado.
- **Logros:**
  - Logs aislados por sesión (`AgentBus` → `Map<sessionId, logs[]>`)
  - Pipeline encadenado (`processFullPipeline()` + action `full_pipeline`)
  - Chat con SQL real (`better-sqlite3` + `SQLiteService.ts`)
  - Análisis obligatorio antes del dashboard (`analysisApproved` state)
  - Errores comprensibles (`ErrorTranslator.ts` con 10 patrones regex)

### [COMPLETADO] Sesión 2026-03-05: UI Redesign + Navigation Fix
- **Estado:** Finalizado.
- **Logros:**
  - Redesign completo de la UI a estilo SaaS corporativo
  - Fix de navegación sidebar (todas las tabs funcionales)
  - Fix de freeze en `ComprehensionAgent` (prompt issue)

### [COMPLETADO] Sesión 2026-03-07: Refinamiento + Auditoría E2E
- **Estado:** Finalizado (con 7 bugs pendientes documentados).
- **Logros:**
  - Fix modelos LLM: `gemini-2.5-flash` / `gemini-2.5-pro` (404 → 200)
  - Token tracking completo con widget de costo USD (`TokenTracker.ts`, `TokenUsageWidget.tsx`)
  - AnalystAgent prompt reescrito: consultor → dueño PYME (español rioplatense, max 300 palabras)
  - Tabla "Estructura detectada" (tipo de cada columna) en análisis
  - Outlier summary enriquecido con valores específicos + rango normal
  - AgentFlowVisualizer rediseñado (swim lanes, paralelismo, colores IA)
  - DashboardContent sanitización contra objetos en chart data
  - Auditoría end-to-end: 7 bugs encontrados y documentados

### [PENDIENTE] Bugs de Auditoría (prioridad para próxima sesión)
- **BUG 1** (CRITICAL): `DELETE /api/admin/logs` sin sessionId → logs nunca se limpian
- **BUG 2** (MEDIUM): AnalysisPanel no renderiza markdown (instalar react-markdown)
- **BUG 3** (HIGH): `generateAnalysis()` en render body de AnalysisPanel
- **BUG 4** (HIGH): `loadProposals()` en render body de VizProposalPanel
- **BUG 5** (LOW): Import lucide-react sin usar en ComprehensionPanel
- **BUG 6** (LOW): AnalysisPanel inline styles dark-only
- **BUG 7** (LOW): TokenUsageWidget icon "token" no existe
- **FEATURE**: Outlier highlighting en InteractiveSheet (celdas atípicas en naranja)

### [PENDIENTE] Fase 4: Orquestación Estratégica
- **Estado:** Pendiente de inicio.
- **Objetivo:** Convertir el sistema reactivo (un solo CSV -> un solo gráfico) en un ecosistema proactivo, capaz de entender la intención del usuario e interrelacionar datos.
- **Siguientes Pasos (Roadmap):**
  1. **Manager Multi-Intento:** Mejorar el `ManagerAgent` para que en vez de seguir un flujo duro, lea la pregunta del usuario con su **IntentClassifier**, decidiendo si necesita generar código (`SpecialistAgent`), responder teoría (`StrategyAgent`), o cruzar bases de datos (`CrossReferenceAgent`).
  2. **Strategy Agent:** Un agente de chatbot final que da respuestas gerenciales (ej. "Tus ventas caen los fines de semana, te recomiendo hacer una promoción").
  3. **Cross-Reference Blueprinting:** Poder cargar Múltiples Tablas y pedir gráficos que crucen dos esquemas a la vez empleando JOINs en el Sandbox.
