# Proximas mejoras desde `datalens_prompts_claude_code.docx`

Fuente: `C:\Users\Keyrus\OneDrive - Keyrus\Escritorio\Projecto Final Master IA\datalens_prompts_claude_code.docx`

Fecha de lectura: 2026-03-14

## Objetivo general
El documento propone tres capacidades nuevas para DataLens AI:
- Schema Blueprint extendido con listas, modulos y formulas estructurales.
- Trazabilidad persistente de calculos en una tabla `calculations`.
- Vista de tabla interactiva con AG Grid, anomalias resaltadas y revision puntual con AI.

## Mejora 1 - Schema Blueprint extendido

### Que agrega
- Un Blueprint por workspace con versionado y estado.
- Separacion formal entre:
  - `lists`: entidades maestras
  - `modules`: tablas de hechos con dimensiones y metricas
  - `calculated_fields`: formulas estructurales derivadas

### Requerimientos funcionales
- El `SchemaAgent` debe detectar automaticamente:
  - propiedades de lista por baja variabilidad relativa al ID
  - metricas de modulo por comportamiento numerico variable por combinacion de dimensiones
  - dimension tiempo cuando la columna sea fecha o periodo
  - referencias a listas cuando un ID actue como FK hacia otra entidad
- El output debe guardarse como JSON versionado por workspace.
- Si la estructura se repite, incrementar version.
- Si la estructura cambia, crear nuevo blueprint y archivar el anterior.

### Estructura esperada del Blueprint
- Metadatos: `blueprint_id`, `version`, `created_at`, `source_files`, `status`
- `lists`
- `modules`
- `calculated_fields`
- `user_validations`

### Persistencia requerida
Tabla `schema_blueprints` en Supabase con:
- `id`
- `workspace_id`
- `blueprint_json`
- `version`
- `status`
- `created_at`

### Impacto arquitectonico
- El Blueprint pasa a ser la fuente de verdad estructural del workspace.
- Debe alimentar al frontend, al `ValidatorAgent` y a futuros flujos de correccion.

## Mejora 2 - Tabla `calculations` para trazabilidad

### Problema que resuelve
- Hoy los calculos respondidos por AI pueden perderse.
- Se necesita auditabilidad y reproduccion de cada resultado numerico.

### Requerimientos funcionales
- Crear tabla `calculations` en Supabase.
- Cuando el `ManagerAgent` responda preguntas numericas:
  - total
  - promedio
  - suma
  - porcentaje
  - comparacion entre periodos
  debe registrar el calculo ademas de responder al usuario.
- Cuando el usuario pregunte como se calculo un resultado, el sistema debe recuperar el registro existente y mostrar:
  - `formula_human`
  - `formula_excel`
- No debe recalcular en ese caso.

### Campos requeridos en `calculations`
- `id`
- `blueprint_id`
- `workspace_id`
- `module_id`
- `label`
- `formula_human`
- `formula_excel`
- `formula_sql`
- `formula_python`
- `result`
- `triggered_by`
- `question_ref`
- `created_at`

### Regla de negocio
- Registrar solo preguntas que impliquen calculo numerico.
- Preguntas descriptivas puras no se registran.
- Si una visualizacion requiere calculo subyacente, se registra el calculo, no necesariamente la solicitud visual.

## Mejora 3 - Vista de tabla interactiva con AG Grid

### Objetivo UX
Despues de normalizar datos, el usuario debe poder:
- filtrar por columna
- ordenar
- seleccionar filas por checkbox
- pinear columnas clave
- ver anomalias resaltadas
- mandar filas seleccionadas al AI
- exportar CSV

### Componente propuesto
Crear `DataTable` con props:
- `blueprintId`
- `moduleId`
- `onReviewWithAI`

### Requerimientos tecnicos
- Usar `ag-grid-react` y `ag-grid-community`.
- Cargar datos del modulo desde Supabase.
- Cargar anomalias desde tabla `anomalies`.
- Activar:
  - seleccion multiple
  - filtros por tipo
  - ordenamiento
  - resize
  - reordenamiento de columnas
- Pinear automaticamente columnas clave como `id` y fecha.
- Exportar CSV con la API de AG Grid.

### Resaltado de anomalias
- Si hay anomalía para `row_id + column_key`:
  - `warning`: fondo amarillo
  - `error`: fondo rojo claro con texto rojo oscuro
- Mostrar `reason` como tooltip.

### Header y acciones
- Mostrar badge con total de anomalias no resueltas.
- Habilitar boton `Revisar con AI` solo si hay filas seleccionadas.
- El boton debe mostrar el conteo de filas seleccionadas.

### Tabla requerida
Tabla `anomalies` en Supabase con:
- `id`
- `blueprint_id`
- `workspace_id`
- `row_id`
- `column_key`
- `reason`
- `severity`
- `resolved`
- `created_at`

## Mejora 4 - Integracion DataTable <-> chat del Manager Agent

### Flujo esperado
- Usuario selecciona filas en `DataTable`.
- Click en `Revisar con AI`.
- El chat inserta un mensaje automatico con cantidad de filas, modulo y `row_ids`.
- El `ManagerAgent` vuelve a buscar esas filas en Supabase.
- El `ManagerAgent` tambien carga sus anomalias.
- La respuesta debe:
  - describir hallazgos en esas filas
  - indicar si las anomalias siguen presentes
  - proponer correcciones concretas
  - ofrecer confirmacion de correccion

### Si el usuario confirma correccion
- actualizar la tabla de hechos
- marcar anomalias como `resolved = true`
- incrementar version del Blueprint

## Orden recomendado de implementacion
1. Extender Schema Blueprint.
2. Crear tabla `calculations` e integrarla al `ManagerAgent`.
3. Crear `DataTable` con AG Grid.
4. Integrar `DataTable` con chat y flujo de correccion.

## Dependencias nuevas
- `ag-grid-react`
- `ag-grid-community`

## Principios arquitectonicos a respetar
- El AI interpreta y propone.
- El `ValidatorAgent` ejecuta SQL deterministico.
- Las formulas de `calculated_fields` y los calculos auditables no deben depender de inferencia libre del AI en tiempo de ejecucion.
