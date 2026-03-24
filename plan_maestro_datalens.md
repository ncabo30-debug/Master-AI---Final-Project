# Plan Maestro — DataLens AI
**Fecha:** 2026-03-19 | **Versión:** 1.0

---

## 🧭 Qué es DataLens AI (contexto rápido)

Una app **Next.js** que permite subir múltiples archivos CSV, procesarlos con una cadena de agentes de IA (limpieza, schema, análisis, visualizaciones), y explorar los datos mediante chat conversacional con SQL real.

**Stack actual:** Next.js 14 · TypeScript · Tailwind · Gemini 2.5 · SQLite (in-memory) · `better-sqlite3`

**Problema central hoy:** Todo vive en local. Nada persiste entre recargas. No hay autenticación. No está deployado.

---

## ☁️ Estrategia de Nube: Supabase + Vercel

### ¿Para qué usamos cada uno?

| Plataforma | Rol en DataLens |
|---|---|
| **Supabase** | Base de datos PostgreSQL (sesiones, schema, análisis, blueprints, cálculos, anomalías) · Supabase Storage (archivos CSV y Excel generados) · Auth (si se implementa login) |
| **Vercel** | Hosting del frontend Next.js · Serverless functions para la API (route.ts y endpoints de agentes) · CI/CD automático desde GitHub |

### ⚠️ Problema crítico con Vercel Hobby (GRATIS)

> El plan gratuito de Vercel tiene **10 segundos** de timeout por request. El pipeline de DataLens tarda 2-3 minutos. **Esto es incompatible.**

### Opciones reales para el backend

| Opción | Costo | Timeout | Veredicto |
|---|---|---|---|
| **Vercel Hobby** | Gratis | 10s | ❌ No viable |
| **Railway Hobby** | ~$5/mes | Sin límite | ✅ Recomendado |
| **Render Free** | Gratis | Sin límite (spin-down 15min) | ✅ Viable para TFM |
| **Vercel Pro** | $20/mes/usuario | 300s | 💰 Caro para TFM |

### Herramientas adicionales necesarias

| Herramienta | Para qué | Plan gratuito? |
|---|---|---|
| **Supabase** | DB + Storage + Auth | ✅ Sí (500MB DB, 1GB Storage) |
| **Railway** (o Render) | Deploy del server Next.js | ✅ Sí (limitado) |
| **GitHub** | CI/CD, repositorio | ✅ Sí |
| **Upstash** (opcional) | Rate limiting por IP | ✅ Sí (10k req/día) |

> **Conclusión:** Se necesita **Supabase + Railway** (o Render) como stack mínimo gratuito. Vercel solo puede usarse si se paga Pro o si el backend se separa a Railway y Vercel sirve solo el frontend estático — pero esto complica la arquitectura. Lo más simple: **Railway para todo el Next.js app + Supabase para datos**.

---

## 📋 Inventario Completo de Tareas Pendientes

### FASE 0: Preparación para el Deploy (bloqueante)
*Estas tareas deben estar TODAS completas antes de subir a producción. Sin estas, la app no funciona en la nube.*

| ID | Tarea | Prioridad | Tipo | Asignado a | Dependencias | Puede hacer en paralelo con |
|---|---|---|---|---|---|---|
| F0-1 | **Migrar `DataStore.ts` a Supabase** (PostgreSQL + Storage) | 🔴 CRÍTICO | Código técnico | Técnico | Ninguna | F0-2, F0-4 |
| F0-2 | **Migrar `TokenTracker.ts` a Supabase** (tabla `token_usage`) | 🔴 CRÍTICO | Código técnico | Técnico | Supabase configurado | F0-1, F0-4 |
| F0-3 | **Migrar `AgentBus` y `AgentLogger`** (tabla `agent_logs` en Supabase) | 🟡 IMPORTANTE | Código técnico | Técnico | Supabase configurado | F0-4 |
| F0-4 | **Agregar `export const runtime = 'nodejs'`** en `route.ts` | 🔴 CRÍTICO | Cambio simple | Cualquiera | Ninguna | Todos |
| F0-5 | **Autenticación básica de API** (API Key en header o Supabase Auth) | 🔴 CRÍTICO | Código técnico | Técnico | F0-1 completado | F0-6 |
| F0-6 | **Crear `.env.example`** con todas las variables documentadas | 🔴 CRÍTICO | Doc / config | Cualquiera | Saber las vars de Supabase | F0-4 |
| F0-7 | **Configurar proyecto en Railway** (o Render) y deploy inicial | 🔴 CRÍTICO | DevOps | Técnico | F0-1, F0-4, F0-6 | - |
| F0-8 | **Configurar Supabase**: crear proyecto, tablas, Storage | 🔴 CRÍTICO | DevOps/DB | Técnico | Ninguna | F0-4, F0-6 |
| F0-9 | **Validación de tamaño de archivo** en frontend (50MB límite) | 🟡 IMPORTANTE | Código simple | Cualquiera | Ninguna | Todos |
| F0-10 | **Error Boundaries** en `FileMainArea` y `DashboardContent` | 🟡 IMPORTANTE | Código React | Técnico | Ninguna | Todos |

---

### FASE 1: Bugs Críticos del Pipeline (calidad de la demo)
*Estos bugs hacen que el pipeline devuelva resultados incorrectos o falle silenciosamente.*

| ID | Tarea | Prioridad | Tipo | Asignado a | Puede hacer en paralelo con |
|---|---|---|---|---|---|
| F1-1 | **Fix `cleanWithAI`** — el LLM da instrucciones pero nunca se aplican | 🔴 CRÍTICO | Bug técnico | Técnico | F1-2, F1-3 |
| F1-2 | **Fix checksum `IntegrityAuditor`** — falsos positivos en validación | 🔴 CRÍTICO | Bug técnico | Técnico | F1-1, F1-3 |
| F1-3 | **Normalización de columnas categóricas** en `CleanerAgent` | 🟡 IMPORTANTE | Mejora calidad | Técnico | F1-1, F1-2 |
| F1-4 | **Fix parsing de fechas dd/MM vs MM/dd** en `CleanerAgent.parseDate()` | 🟡 IMPORTANTE | Bug / calidad | Técnico | F1-1, F1-3 |
| F1-5 | **Fix hash de duplicados** con claves ordenadas en `DuplicateDetectorAgent` | 🟡 IMPORTANTE | Bug / calidad | Técnico | F1-1, F1-4 |
| F1-6 | **Filtrar filas completamente nulas** post-limpieza en `CleanerAgent` | 🟢 BAJA | Mejora | Cualquiera | Todos |

---

### FASE 2: Externalización de Prompts (plan aprobado, listo para ejecutar)
*Plan completo en [brain/implementation_plan_prompts_externalization_2026-03-19.md](file:///C:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/Projecto%20Final%20Master%20IA/brain/implementation_plan_prompts_externalization_2026-03-19.md).*

| ID | Tarea | Prioridad | Tipo | Asignado a | Dependencias |
|---|---|---|---|---|---|
| F2-1 | **Crear `PromptLoader.ts`** en `src/lib/agents/core/` | 🟡 IMPORTANTE | Código técnico | Técnico (con AI) | Ninguna |
| F2-2 | **Crear 9 archivos [.md](file:///C:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/Projecto%20Final%20Master%20IA/brain/task.md)** de prompts en `src/lib/agents/prompts/` | 🟡 IMPORTANTE | Contenido / NL | Cualquiera | F2-1 |
| F2-3 | **Modificar 6 agentes** para usar `PromptLoader` | 🟡 IMPORTANTE | Código técnico | Técnico (con AI) | F2-1, F2-2 |
| F2-4 | **Actualizar [next.config.ts](file:///C:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/Projecto%20Final%20Master%20IA/datalens-app/next.config.ts)** para incluir prompts en el build | 🟡 IMPORTANTE | Config | Cualquiera | F2-1 |

---

### FASE 3: Pendientes Funcionales (post-deploy)
*Funcionalidades planificadas en los documentos de brain, que construyen sobre la base migrada a Supabase.*

| ID | Tarea | Prioridad | Tipo | Asignado a | Dependencias | Puede hacer en paralelo con |
|---|---|---|---|---|---|---|
| F3-1 | **Conectar `ComprehensionPanel` → `VizExpertAgent`** (agrupación del dashboard) | 🟡 IMPORTANTE | Código técnico | Técnico (con AI) | Deploy básico funcionando | F3-2 |
| F3-2 | **Verificar y confirmar fix del freeze** en `InteractiveSheet` | 🟡 IMPORTANTE | Testing / Bug | Cualquiera | Deploy funcionando | F3-1 |
| F3-3 | **Persistir `schema_blueprints` y `anomalies` en Supabase** | 🟡 IMPORTANTE | Código técnico | Técnico | F0 completo | F3-4 |
| F3-4 | **Tabla `calculations` auditables** + integración en `ManagerAgent` | 🟡 IMPORTANTE | Código técnico | Técnico | F3-3 | F3-5 |
| F3-5 | **`DataTable` con AG Grid** (filtros, sorting, export, columnas pineadas) | 🟡 IMPORTANTE | Código UI | Técnico (con AI) | F3-3 | F3-4 |
| F3-6 | **Integración `DataTable` ↔ chat** (revisar filas con AI) | 🟡 IMPORTANTE | Código técnico | Técnico | F3-5 | - |
| F3-7 | **`StrategyAgent`** para respuestas gerenciales | 🟢 BAJA | Código técnico | Técnico (con AI) | F3-1 | F3-8 |
| F3-8 | **`CrossReferenceAgent`** para análisis cruzado entre archivos | 🟢 BAJA | Código técnico | Técnico (con AI) | Deploy + F3-3 | F3-7 |
| F3-9 | **Manager multi-intento** con clasificación de intención | 🟢 BAJA | Código técnico | Técnico | F3-7 | - |
| F3-10 | **Aumentar muestra `ProfilerAgent`** a 50-100 filas (estratificado) | 🟢 BAJA | Mejora simple | Cualquiera | Ninguna | Todos |
| F3-11 | **Acciones para outliers** en `InteractiveSheet` (marcar/eliminar/nulificar) | 🟢 BAJA | UI + lógica | Técnico (con AI) | F3-3 | - |

---

### FASE 4: Mejoras de Producción (nice-to-have para TFM)

| ID | Tarea | Prioridad | Tipo | Asignado a |
|---|---|---|---|---|
| F4-1 | Self-hostear Material Symbols (Chrome fonts) | 🟢 BAJA | Config | Cualquiera |
| F4-2 | Upload de CSV directo a Supabase Storage (evitar payload grande) | 🟢 BAJA | Arquitectura | Técnico |
| F4-3 | Recovery de sesión desde `localStorage` o Supabase al recargar | 🟢 BAJA | UX | Técnico |
| F4-4 | Metadata y SEO (og:image, favicon propio) | 🟢 BAJA | Config | Cualquiera |
| F4-5 | Configuración centralizada de modelos Gemini | 🟢 BAJA | Código | Cualquiera |
| F4-6 | Logging estructurado (reemplazar `console.log` masivo) | 🟢 BAJA | DevOps | Técnico |
| F4-7 | Rate limiting por IP con Upstash | 🟢 BAJA | DevOps | Técnico |

---

## 🗺️ Dependencias Críticas (qué bloquea qué)

```
Supabase project setup (F0-8)
    ├──→ F0-1 (DataStore migration)
    │       ├──→ F0-5 (Auth básica)
    │       │       └──→ F0-7 (Deploy en Railway)  ← PRODUCCIÓN LOGRADA
    │       └──→ F3-3 (Persistir blueprints)
    │               ├──→ F3-4 (Calculations table)
    │               └──→ F3-5 → F3-6 (DataTable + chat)
    ├──→ F0-2 (TokenTracker migration) [paralelo con F0-1]
    └──→ F0-3 (AgentBus/Logger migration) [paralelo con F0-1, F0-2]

F0-4 (runtime = nodejs) → INDEPENDIENTE, hacer YA
F0-6 (.env.example)     → INDEPENDIENTE, hacer YA
F0-9 (File size limit)  → INDEPENDIENTE, hacer YA
F0-10 (Error Boundaries)→ INDEPENDIENTE, hacer YA

F1-1 (cleanWithAI fix)  → INDEPENDIENTE, no bloquea nada
F1-2 (checksum fix)     → INDEPENDIENTE, no bloquea nada

F2-1 (PromptLoader)     → INDEPENDIENTE de F0 (puede hacerse ya)
    └──→ F2-2 + F2-3 + F2-4 (en paralelo entre sí una vez F2-1 listo)
```

---

## 👥 División de Trabajo: Quién hace qué

### Persona Técnica
*(Tareas que requieren código complejo, integraciones, arquitectura)*

- **FASE 0:** F0-1, F0-2, F0-3, F0-5, F0-7, F0-8, F0-10
- **FASE 1:** F1-1, F1-2, F1-3, F1-4, F1-5
- **FASE 2:** F2-1, F2-3
- **FASE 3:** F3-1, F3-3, F3-4, F3-5, F3-6, F3-7, F3-8, F3-9, F3-11
- **FASE 4:** F4-2, F4-3, F4-6, F4-7

### Persona No-Técnica (con apoyo de IA)
*(Tareas accesibles con Antigravity/Claude como copiloto)*

- **FASE 0:** F0-4 (1 línea de código), F0-6 (crear un archivo de texto), F0-9 (validación simple)
- **FASE 2:** F2-2 (crear los 9 archivos [.md](file:///C:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/Projecto%20Final%20Master%20IA/brain/task.md) de prompts — puro lenguaje natural), F2-4 (config)
- **FASE 3:** F3-2 (testing manual), F3-10 (cambio simple de número en ProfilerAgent)
- **FASE 4:** F4-1, F4-4, F4-5

> **Nota:** Las tareas "con AI" implican que la persona técnica puede delegarlas parcialmente a Antigravity con supervisión.

---

## 📊 Resumen Visual del Roadmap

```
HOY            SEMANA 1-2         SEMANA 3-4         SEMANA 5+
  │                │                  │                  │
  │   FASE 0       │   FASE 1+2       │   FASE 3         │  FASE 4
  │   (Deploy)     │   (Bugs+Prompts) │   (Features)     │  (Pulido)
  │                │                  │                  │
  ▼                ▼                  ▼                  ▼
Supabase setup  Fix cleanWithAI    Blueprints         DataTable AG Grid
DataStore →DB   Fix IntegrityAud   en Supabase        StrategyAgent
TokenTracker    Fix fechas/dupl.   Calculations       CrossReference
AgentBus logs   PromptLoader       DataTable          Rate limiting
Auth API key    9 prompts .md      Chat integration   SEO/Favicon
Railway deploy  
                            ↑
                     PRODUCCIÓN LOGRADA
```

---

## ✅ Orden de Arranque Recomendado (próxima sesión)

Siguiendo las reglas de **GSD** (plan corto → ejecutar → verificar) y **Superpowers** (tareas de 2-5 min, verificables):

### Arrancar esta semana (CRÍTICO para producción):

1. **[Técnico]** Crear proyecto en Supabase y definir el schema de tablas
2. **[Técnico]** Migrar `DataStore.ts` a Supabase (estimado: 1 día)
3. **[Cualquiera]** Agregar `export const runtime = 'nodejs'` en `route.ts` ← 5 minutos
4. **[Cualquiera]** Crear `.env.example` ← 10 minutos
5. **[Técnico]** Migrar `TokenTracker` a Supabase (paralelo con 2)
6. **[Técnico]** Auth básica con API Key
7. **[Técnico]** Deploy en Railway

### En paralelo / mientras espera (cualquier persona puede avanzar):

- **[No-Técnico con AI]** Crear los 9 archivos [.md](file:///C:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/Projecto%20Final%20Master%20IA/brain/task.md) de prompts (F2-2)
- **[No-Técnico con AI]** Agregar validación de tamaño en `useFileQueue.ts` (F0-9)
- **[Técnico]** Fix `cleanWithAI` bug (F1-1) — no necesita Supabase
- **[Técnico]** Fix checksum `IntegrityAuditor` (F1-2) — no necesita Supabase

---

## 📏 Reglas Operativas del Equipo

Basadas en **get-shit-done** y **superpowers**:

1. **Antes de codear, clarificar objetivo concreto y criterio de éxito**
2. **Cada tarea debe tener verificación explícita** (lint + typecheck + build)
3. **Cambios chicos y atómicos** — un commit por tarea clara
4. **Actualizar [brain/session_handoff.md](file:///C:/Users/Keyrus/OneDrive%20-%20Keyrus/Escritorio/Projecto%20Final%20Master%20IA/brain/session_handoff.md)** al final de cada sesión
5. **YAGNI** — no implementar features que no son necesarios ahora mismo
6. **Evidencia antes que discurso** — si decís que funciona, hay build/test que lo prueba
7. **No tocar lo que funciona** sin motivo claro y documentado

---

## 🎯 Definición de "Salir en Productivo"

La app está en producción cuando:

✅ La app corre en Railway (o Render)  
✅ Los datos persisten en Supabase (sesiones, schemas, análisis)  
✅ Los archivos CSV/Excel están en Supabase Storage  
✅ La API tiene autenticación básica (API Key mínimo)  
✅ El pipeline completo funciona en la nube con un CSV real  
✅ Un usuario puede recargar la página y no pierde su trabajo  

---

*Documento generado el 2026-03-19. Fuentes: brain/task.md, brain/consideraciones_salir_a_produccion.txt, brain/pipeline_datos_problemas_y_soluciones.txt, brain/proximas_mejoras_claude_code.md, brain/session_handoff.md, brain/implementation_plan_prompts_externalization.md, IMPROVERS/get-shit-done, IMPROVERS/superpowers.*
