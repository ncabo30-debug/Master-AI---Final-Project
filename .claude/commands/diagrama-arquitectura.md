# Generar diagrama de arquitectura actual en FigJam

Explorá el codebase actual de `datalens-app/src/` y generá un diagrama de flujo en FigJam que represente la arquitectura del sistema tal como está implementada HOY.

## Pasos a seguir

### 1. Explorar el código actualizado

Usá el agente Explore para mapear:

- **Agentes activos**: todos los archivos en `lib/agents/` — qué hace cada uno, en qué orden se ejecutan, si corren en paralelo o secuencialmente
- **Orquestación**: métodos principales de `ManagerAgent.ts` (detectIssues, applyNormalization, reconcile, processSchemaAndQuestions, processAnalysis, proposeVisualizations, processChat) y su secuencia
- **API routes**: `app/api/` — qué actions expone cada route y a qué métodos del Manager mapean
- **Puntos de decisión**: bifurcaciones importantes (usuario aprueba/ignora issues, SQL path vs metadata path, fallbacks, reintentos)
- **Infraestructura**: DataStore, AgentBus, AgentRegistry, SQLiteService — cómo conectan todo

### 2. Construir el diagrama Mermaid

Usá `mcp__figma__generate_diagram` con estas reglas:

- **Tipo**: `flowchart TD` (top-down)
- **Colores por fase** (usar `style` al final del bloque):
  - Fase 1A - Detección: `fill:#E8F4FD,stroke:#2196F3`
  - Fase 1B - Limpieza: `fill:#FFF3E0,stroke:#FF9800`
  - Fase 2 - Análisis: `fill:#E8F5E9,stroke:#4CAF50`
  - Fase 3 - Chat: `fill:#F3E5F5,stroke:#9C27B0`
- **Subgraphs** para agrupar cada fase
- Incluir: nombre del agente + descripción de 1 línea de qué hace
- Incluir: puntos de decisión del usuario (rombos `{}`) y bifurcaciones
- Incluir: inputs/outputs clave entre fases (parallelogramos `[[ ]]`)
- **No incluir** detalles de implementación interna de cada agente — solo su rol en el flujo

### 3. Mostrar el resultado

Después de crear el diagrama, mostrá el link de FigJam como markdown clickeable y describí brevemente qué cambió respecto al diagrama anterior (si el usuario lo menciona).

## Criterio de calidad

El diagrama es correcto si alguien que no conoce el código puede seguir el camino de un CSV desde que se sube hasta que el usuario recibe una respuesta de chat, viendo exactamente qué agente toca los datos en cada paso y en qué orden.
