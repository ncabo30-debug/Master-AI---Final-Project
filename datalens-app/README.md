# DataLens App

Aplicación Next.js para ingesta, profiling, blueprint de normalización, validación humana y análisis sobre datasets tabulares.

## Levantar el proyecto

```bash
npm install
npm run dev
```

La app queda disponible en `http://localhost:3000`.

## Variables de entorno

Usá `.env.example` como referencia.

Variables relevantes para Gemini:

- `GEMINI_API_KEY`: API key de Google AI Studio.
- `GEMINI_MODEL_FLASH`: modelo base para llamadas rápidas. Default: `gemini-2.5-flash`.
- `GEMINI_MODEL_PRO`: modelo para llamadas más complejas. Default: `gemini-2.5-pro`.
- `GEMINI_DISABLE_PRO`: si vale `true`, todas las llamadas internas marcadas como `pro` se degradan automáticamente a `flash`.

## Recomendación para API gratuita de Gemini

La app hoy usa por default:

- `gemini-2.5-flash`
- `gemini-2.5-pro`

Ambos modelos existen actualmente en la Gemini Developer API y tienen free tier, pero `pro` tiene cuotas bastante más chicas que `flash`.

Si vas a trabajar con una key gratuita, la configuración más segura es:

```env
GEMINI_MODEL_FLASH=gemini-2.5-flash
GEMINI_MODEL_PRO=gemini-2.5-pro
GEMINI_DISABLE_PRO=true
```

Con eso:

- el código no cambia;
- las llamadas que hoy piden `pro` pasan a usar `flash`;
- evitás problemas por cuotas bajas o permisos más restrictivos en free tier.

Además, si una llamada `pro` falla por permisos, cuota o modelo no disponible, `LLMService` ahora intenta fallback automático a `flash`.

## Nota sobre SDK

El proyecto sigue usando `@google/generative-ai`, que es el SDK legado. Google actualmente recomienda migrar a `@google/genai`, pero no era necesario para resolver compatibilidad básica de modelos y quotas.

## Verificación rápida

```bash
npm run build
```
