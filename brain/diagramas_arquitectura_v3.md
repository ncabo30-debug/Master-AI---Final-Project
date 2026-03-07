# Análisis de Arquitectura y Comunicación de Agentes DataLens AI

A continuación se presentan los diagramas de secuencia (`model schema`) que ilustran cómo se comunican los agentes dentro del `AgentBus` desde que el usuario sube un CSV hasta que interactúa con la plataforma.

## Situación Actual (Fase 1 y 2 completadas)

Actualmente, el sistema funciona con una extracción estructural y semántica impulsada por IA, pero el reporte final (gráfico de barras) es un cálculo estático predefinido en código.

```mermaid
sequenceDiagram
    participant U as Usuario (Frontend)
    participant API as /api/analyze
    participant M as ManagerAgent
    participant Bus as SessionBus
    participant S as SchemaAgent
    participant C as ComprehensionAgent
    participant R as ReportAgent
    participant Chat as ChatAgent
    participant LLM as Ollama (Llama 3.1)

    %% Flujo 1: Carga de CSV y Análisis de Esquema
    note over U,M: 1. Carga de Archivos
    U->>API: POST /api/analyze (action: analyze_schema, data)
    API->>M: manager.processSchemaAndQuestions(data)
    M-->>Bus: Crea Bus de Sesión Temporal
    M->>Bus: PUBLISH (to: schema_123, type: ANALYZE_SCHEMA)
    
    note over S,LLM: El SchemaAgent extrae una muestra y consulta a la IA
    Bus->>S: Escucha y Ejecuta
    S->>LLM: Infiere semantic_role, domain, analysis_variables
    LLM-->>S: JSON Enriquecido (Colores, roles, etc)
    S->>Bus: PUBLISH (to: manager-main, type: SCHEMA_ANALYZED)
    
    Bus->>M: Escucha y dispara Comprehension
    M->>Bus: PUBLISH (to: comp_123, type: GENERATE_QUESTIONS)
    Bus->>C: Escucha y Ejecuta
    C->>LLM: Analiza esquema para sugerir "eje_X"
    LLM-->>C: JSON de Pregunta e Interacción
    C->>Bus: PUBLISH (to: manager-main, type: QUESTIONS_GENERATED)
    
    M-->>API: Destruye Agentes Temporales
    API-->>U: Muestra Tabla Coloreada + Pregunta
    
    %% Flujo 2: Generación del Dashboard Fijo
    note over U,R: 2. Confirmación y Reporte Estático
    U->>API: POST (action: generate_report, answers)
    API->>M: manager.generateFinalReport()
    M->>Bus: PUBLISH (to: report_123, type: GENERATE_REPORT)
    Bus->>R: GroupBy estático hardcodeado (reduce de javascript)
    R->>Bus: PUBLISH (to: manager, type: REPORT_GENERATED)
    M-->>API: JSON Recharts
    API-->>U: Renderiza Gráfico en UI
    
    %% Flujo 3: Chat Libre Estático
    note over U,Chat: 3. Interacción vía ChatLibre
    U->>API: POST (action: chat, question)
    API->>M: manager.processChat()
    M->>Bus: PUBLISH (to: chat_123, type: ANSWER_CHAT_QUESTION)
    Bus->>Chat: Consulta al LLM sobre el esquema (Solo Metadatos)
    Chat->>LLM: Entiende question basándose en Schema
    LLM-->>Chat: Respuesta Texto
    Chat->>Bus: PUBLISH
    API-->>U: Burbuja de Texto
```

---

## Próxima Implementación (Fase 3: Specialists & Sandbox)

En la Fase 3, se introducirá la capacidad "Auto-Código". El sistema no tendrá reportes fijos ni agrupaciones en duro, sino que delegará la creación del reporte a un *Especialista Programador* que escribirá JavaScript al vuelo y a un *Validador* que se cerciorará de que el código sea seguro y corra en un Sandbox aislado.

```mermaid
sequenceDiagram
    participant U as Usuario
    participant API as /api/analyze
    participant M as ManagerAgent
    participant Bus as SessionBus
    participant S as SchemaAgent
    participant Spec as SpecialistAgent
    participant Val as ValidatorAgent
    participant Sandbox as SandboxVM
    participant LLM as Ollama (Llama 3.1)

    %% 1. Análisis Avanzado
    note over U,Sandbox: 1. Análisis de Tablas (Mismo que Fase 2)
    U->>API: Sube Datos
    API->>M: analyze_schema()
    M->>Bus: Delega a SchemaAgent
    Bus->>S: Infiriendo Variables de Análisis con IA
    S-->>M: Schema Interactivo Devuelto

    %% El gran cambio
    note over U,Sandbox: 2. Code-Driven Reporting (Fase 3)
    U->>API: Pide Dashboard (O chatea buscando un cálculo)
    API->>M: manager.generateDynamicReport()
    M->>Bus: PUBLISH (to: specialist_123, type: CREATE_CODE)
    
    Bus->>Spec: Pide crear la Lógica del Negocio
    Spec->>LLM: "Crea JavaScript puro que tome este arreglo de datos y genere X análisis"
    LLM-->>Spec: Función JS (ej: calcular Margen de Beneficio o Retención)
    Spec->>Bus: PUBLISH (to: validator_123, type: VALIDATE_CODE, payload: jsString)
    
    Bus->>Val: Intercepta e Inspecciona
    Val->>Sandbox: Inyecta el JS de la IA en un Entorno Aislado
    note right of Sandbox: El Sandbox (VM2/Function) ejecuta el Array de Datos real sobre el JS de la IA.
    Sandbox-->>Val: Ejecución exitosa (Datos JSON transformados)
    
    Val->>Bus: PUBLISH (to: manager-main, type: DATA_PROCESSED)
    M-->>API: Retorna JSON de Echarts/Recharts Dinámico
    API-->>U: Muestra un Gráfico totalmente a Medida
    
    note over M,Val: SI EL SANDBOX FALLA...
    Sandbox--xVal: "TypeScript Error / ReferenceError"
    Val->>Bus: PUBLISH (to: specialist, type: FIX_CODE, errorPayload)
    Spec->>LLM: "Tu código falló en la línea 4 con error X, arréglalo"
    LLM-->>Spec: Código Corregido
    Spec->>Val: Re-intento de Validación

```

### Cambios Claves en la Fase 3:
1. **Generación Dinámica de Código:** Ya no dependemos del objeto `ReportAgent` y su reductor duro (`reduce`). Ahora el LLM es libre de generar mapas de calor, análisis de cohortes o previsiones matemáticas escribiendo el script.
2. **Validator + Sandbox:** Nunca confiaremos ciegamente en el código de la IA local, especialmente para seguridad. Se crea una capa intermedia que ejecuta el script, y si produce un error de sintaxis, se auto-corrige mandando el log de error de vuelta a la IA ("Auto-Fixing Loop").
3. **Conversación Profunda:** El `ChatAgent` podrá escalar dudas complejas ("¿Cuál fue la desviación estándar del mes pasado?") delegándolas al `SpecialistAgent` para que escriba la consulta matemática, en vez de solo contestar leyendo esquemas.
