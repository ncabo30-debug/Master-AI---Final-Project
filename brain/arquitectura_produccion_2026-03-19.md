# Arquitectura de Producción — DataLens AI
**Fecha:** 2026-03-19 | **Versión:** 1.0

---

## 🏗️ Arquitectura objetivo

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Browser)                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS
          ┌────────────▼─────────────┐
          │   VERCEL (Frontend)      │
          │   Next.js — solo UI      │
          │   /app, /components      │
          │   No API routes propias  │
          └────────────┬─────────────┘
                       │ API calls a backend externo
          ┌────────────▼─────────────┐
          │  RAILWAY / FLY.IO        │
          │  Express + Node.js       │
          │  Todos los agentes IA    │
          │  Sin timeout de Vercel   │
          └────┬──────────┬──────────┘
               │          │
    ┌──────────▼──┐   ┌───▼────────────────┐
    │  SUPABASE   │   │  SUPABASE STORAGE   │
    │  PostgreSQL │   │  CSV originales     │
    │  Auth (RLS) │   │  Excel generados    │
    │  sessions   │   │  por workspace      │
    │  blueprints │   └─────────────────────┘
    │  analyses   │
    │  token_usage│
    │  agent_logs │
    └─────────────┘
```

---

## 📁 Estructura del Monorepo (un solo repo, dos carpetas)

```
datalens/                          ← raíz del monorepo
├── frontend/                      ← Deploy en VERCEL
│   ├── package.json
│   ├── next.config.ts
│   ├── .env.local
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   └── globals.css
│       ├── components/            ← TODOS los componentes React actuales
│       │   ├── layout/
│       │   ├── AgentFlowVisualizer.tsx
│       │   ├── AnalysisPanel.tsx
│       │   └── ... (todos los .tsx)
│       └── lib/
│           ├── api-client.ts      ← NUEVO: cliente HTTP al backend
│           ├── csvParser.ts       ← se mantiene (parseo en browser)
│           ├── fileQueue.ts       ← se mantiene (state machine)
│           ├── useFileQueue.ts    ← se adapta (llama a api-client)
│           └── useMultiChat.ts    ← se adapta
│
├── backend/                       ← Deploy en RAILWAY / FLY.IO
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   └── src/
│       ├── server.ts              ← NUEVO: Express app entry point
│       ├── routes/
│       │   ├── analyze.ts         ← Migración de /api/analyze/route.ts
│       │   ├── admin.ts           ← Migración de /api/admin/
│       │   └── health.ts          ← NUEVO: endpoint de health check
│       ├── lib/
│       │   ├── DataStore.ts       ← REESCRIBIR: usa Supabase
│       │   ├── TokenTracker.ts    ← REESCRIBIR: usa Supabase
│       │   ├── SQLiteService.ts   ← SE MANTIENE (in-memory para chat SQL)
│       │   ├── ErrorTranslator.ts ← SE MANTIENE sin cambios
│       │   └── agents/            ← SE MUEVE entero sin cambios
│       │       ├── core/
│       │       ├── AnalystAgent.ts
│       │       ├── ChatAgent.ts
│       │       └── ... (todos los agentes)
│       └── middleware/
│           ├── auth.ts            ← NUEVO: validación API Key / JWT
│           ├── cors.ts            ← NUEVO: orígenes permitidos
│           └── rateLimit.ts       ← NUEVO: rate limiting básico
│
├── shared/                        ← Tipos compartidos
│   └── types.ts                   ← Contratos de la API entre front y back
│
├── supabase/                      ← Config local de Supabase
│   └── migrations/
│       └── 001_initial_schema.sql ← Schema completo de la DB
│
└── README.md
```

---

## 🗄️ Schema de Supabase

```sql
-- WORKSPACES (multi-tenant)
CREATE TABLE workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  plan        TEXT DEFAULT 'free',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- USERS + AUTH
CREATE TABLE workspace_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT DEFAULT 'member',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- SESSIONS (reemplaza DataStore.ts / archivos /tmp)
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_url        TEXT,
  status          TEXT DEFAULT 'QUEUED',
  row_count       INT,
  col_count       INT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- SCHEMA BLUEPRINTS
CREATE TABLE schema_blueprints (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES sessions(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  version      INT DEFAULT 1,
  blueprint    JSONB NOT NULL,
  source       TEXT DEFAULT 'AI',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ANALYSES
CREATE TABLE analyses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES sessions(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- VIZ PROPOSALS
CREATE TABLE viz_proposals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES sessions(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  proposals    JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ANOMALIES
CREATE TABLE anomalies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES sessions(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  row_id       INT,
  column_key   TEXT,
  reason       TEXT,
  severity     TEXT,
  resolved     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- CALCULATIONS (trazabilidad de cálculos)
CREATE TABLE calculations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID REFERENCES sessions(id) ON DELETE CASCADE,
  workspace_id   UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  label          TEXT NOT NULL,
  formula_human  TEXT,
  formula_sql    TEXT,
  formula_excel  TEXT,
  result         JSONB,
  question_ref   TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- TOKEN USAGE (reemplaza TokenTracker in-memory)
CREATE TABLE token_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES sessions(id) ON DELETE CASCADE,
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_name    TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  cost_usd      NUMERIC(10,6) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- AGENT LOGS (reemplaza globalThis en AgentBus/AgentLogger)
CREATE TABLE agent_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES sessions(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  agent_name   TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ROW LEVEL SECURITY (aislamiento entre clientes)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE viz_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_isolation" ON sessions
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));
-- (repetir por cada tabla)
```

---

## 🔑 Variables de Entorno

### `backend/.env`
```env
GEMINI_API_KEY=your_key_here
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
API_SECRET_KEY=clave_interna_para_validar_frontend
ALLOWED_ORIGIN=https://tu-app.vercel.app
NODE_ENV=production
LOG_LEVEL=info
```

### `frontend/.env.local`
```env
NEXT_PUBLIC_API_URL=https://tu-backend.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## ✅ Definición de "Salir en Productivo"

| Criterio | Verificación |
|---|---|
| Frontend en Vercel | `https://tu-app.vercel.app` carga la UI |
| Backend en Railway | `/health` responde `{ status: "ok" }` |
| Supabase conectado | Subir CSV → sesión aparece en tabla `sessions` |
| Pipeline completo | CSV → análisis → dashboard end-to-end en la nube |
| Multi-workspace | Dos usuarios distintos solo ven sus propios datos (RLS) |
| Persistencia | Recargar página sin perder el estado del pipeline |

---

## ⏱️ Estimaciones

| Fase | Estimado |
|---|---|
| A — Monorepo + Supabase setup | 1 día |
| B — Backend Express | 2-3 días |
| C — Frontend adaptado | 1-2 días |
| D — Bugs pipeline | 1 día |
| E — Externalizar prompts | 0.5 día |
| F — Features post-deploy | 1 semana+ |

**Total para producción (A+B+C):** ~5-6 días de trabajo técnico.
