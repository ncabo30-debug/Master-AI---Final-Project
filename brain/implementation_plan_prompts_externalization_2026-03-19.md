# Plan: Externalización de Prompts de Agentes a Markdown

## ¿Qué problema resuelve este cambio?

Hoy, las instrucciones que le damos a la IA para cada agente están **embebidas dentro del código TypeScript**. Esto tiene consecuencias graves para el equipo:

1. **Para cambiar el tono o el comportamiento de un agente, hay que tocar código.** Si querés que el `AnalystAgent` hable más formal, o que el `ChatAgent` responda en inglés, tenés que abrir un `.ts`, buscar el `prompt = \`...\``, editarlo dentro de un template literal, y rezar para no romper una coma o una variable.

2. **El contexto de cada agente es invisible como "documento".** No podés leer fácilmente qué le decís a cada agente sin navegar por el código. Es exactamente lo opuesto a la metodología Van Clief: no hay "mapa", no hay "habitaciones" legibles.

3. **El riesgo de romper código es alto.** Un prompt vive dentro de un template literal (`` ` `` backtick) de múltiples líneas. Si accidentalmente editás una variable `${variable}` mal o dejás un backtick sin cerrar, el TypeScript explota.

**La solución:** mover cada prompt a un archivo `.md` independiente con variables marcadas como `{{VARIABLE}}`. El agente carga el archivo, reemplaza las variables con datos reales, y lo envía a la IA. Vos podés editar el `.md` como un documento normal.

---

## Cómo se alinea esto con la metodología Van Clief

| Principio Van Clief | Antes (problema) | Después (solución) |
| :--- | :--- | :--- |
| **Carpetas como UI** | Los prompts viven en código TypeScript | Los prompts viven en `src/lib/agents/prompts/*.md` como documentos editables |
| **Lenguaje natural como interfaz** | La instrucción está escrita en TypeScript + Markdown mezclado | El archivo `.md` es 100% lenguaje natural con marcadores `{{VAR}}` |
| **Enrutador claro** | El agente sabe implícitamente qué prompt usar (el que tiene hardcodeado) | El enrutador es el nombre del archivo: `analyst.md` → `AnalystAgent`, `schema.md` → `SchemaAgent` |
| **Solo cargar lo que se necesita** | El código ya lo cumplía, pero el contexto no era visible | Cada `.md` encapsula su propia "habitación" de instrucciones |
| **Convenciones de nombre = base de datos** | No había convención | `[nombre-agente].md` + `[nombre-agente].[sub-tarea].md` para agentes multi-prompt |

---

## Inventario completo de prompts actuales

Esta tabla cataloga **todos los prompts** que existen hoy en el código y que serán externalizados:

| Archivo `.md` a crear | Agente origen | Tipo de llamada LLM | Variables de contexto |
| :--- | :--- | :--- | :--- |
| `analyst.md` | `AnalystAgent.ts` | `callRaw` (flash) | `{{SUMMARIES}}`, `{{FEEDBACK}}` |
| `schema.md` | `SchemaAgent.ts` | `call` (flash) | `{{BASIC_SCHEMA}}`, `{{SAMPLE_DATA}}` |
| `viz-expert.md` | `VizExpertAgent.ts` | `call` (pro) | `{{ANALYSIS}}`, `{{COLUMNS_DESC}}` |
| `chat-classifier.md` | `ChatAgent.ts` (paso 0) | `callRaw` (flash) | `{{SCHEMA}}`, `{{QUESTION}}` |
| `chat-meta.md` | `ChatAgent.ts` (path B) | `callRaw` (pro) | `{{SCHEMA}}`, `{{QUESTION}}` |
| `chat-sql.md` | `ChatAgent.ts` (path A, SQL gen) | `callRaw` (flash) | `{{SCHEMA_DESC}}`, `{{QUESTION}}`, `{{RETRY_CONTEXT}}` |
| `chat-answer.md` | `ChatAgent.ts` (path A, respuesta) | `callRaw` (pro) | `{{QUESTION}}`, `{{TOTAL_ROWS}}`, `{{RESULT_PREVIEW}}` |
| `comprehension.md` | `ComprehensionAgent.ts` | `call` (pro) | `{{SCHEMA}}`, `{{NUMERIC_COLS}}`, `{{CATEGORY_COLS}}`, `{{CATEGORY_OPTIONS}}` |
| `cleaner-adaptive.md` | `CleanerAgent.ts` (iteración ≥2) | `call` (flash) | `{{ERRORS}}`, `{{PROFILE_COLUMNS}}`, `{{SAMPLE_DATA}}` |

> **Nota**: `ProfilerAgent`, `FileInspectorAgent`, `OutlierDetectorAgent`, `DuplicateDetectorAgent`, `IntegrityAuditorAgent`, `FormatValidatorAgent`, `ReportAgent`, `SpecialistAgent`, y `ValidatorAgent` **no usan prompts LLM directos** o son puramente heurísticos. No se externalizan.

---

## Propuesta de Cambios

### Principio de diseño: ¿Por qué `{{VARIABLE}}` y no otra sintaxis?

Se elige el patrón `{{VARIABLE_NAME}}` por estas razones:
1. Es legible en texto plano sin conocer el lenguaje de programación
2. No colisiona con sintaxis Markdown estándar (no hay `{{` en Markdown)
3. Se puede buscar con `grep -r "{{" .` para auditar todas las variables de un vistazo
4. Si el nombre de la variable está mal, el sistema lanza un error claro en lugar de silenciarlo

---

### Componente 1: Servicio de carga de prompts (`PromptLoader`)

#### [NEW] `src/lib/agents/core/PromptLoader.ts`

**Responsabilidad:** Cargar un archivo `.md` por nombre, reemplazar los `{{VARIABLES}}` con los valores reales, y retornar el string final listo para enviar al LLM.

**Por qué vive en `core/`:** Es infraestructura compartida por todos los agentes, igual que `LLMService` o `AgentLogger`.

**Comportamiento de error:** Si una variable esperada `{{VAR}}` no tiene valor correspondiente en el mapa, lanzará un `Error` claro indicando exactamente qué variable falta y en qué archivo. Esto asegura que si editás un `.md` y usás una variable nueva, el agente te avisará en desarrollo que te olvidaste de pasarla.

**Comportamiento en build:** Los archivos `.md` se leen en **runtime** con `fs.readFileSync`. Esto significa que Next.js no los bundlea — viven como archivos del sistema de archivos del servidor. Para producción, se debe asegurar que el directorio `prompts/` esté incluido en el build de Next.js (se configurará en `next.config.ts`).

```typescript
// API pública del PromptLoader
class PromptLoader {
  // Carga el prompt del archivo y reemplaza variables
  static load(promptName: string, variables: Record<string, string>): string

  // Valida que no queden {{VARIABLES}} sin reemplazar en el prompt final
  private static validate(rendered: string, promptName: string): void
}
```

---

### Componente 2: Directorio de prompts

#### [NEW] Directorio `src/lib/agents/prompts/`

Cada archivo sigue la convención `[agente].md` o `[agente].[subtarea].md`:

```
src/lib/agents/prompts/
├── analyst.md              ← AnalystAgent prompt
├── schema.md               ← SchemaAgent prompt  
├── viz-expert.md           ← VizExpertAgent prompt
├── comprehension.md        ← ComprehensionAgent prompt
├── cleaner-adaptive.md     ← CleanerAgent (modo AI retry)
├── chat-classifier.md      ← ChatAgent: determina si necesita SQL
├── chat-meta.md            ← ChatAgent: respuesta sin datos (schema only)
├── chat-sql.md             ← ChatAgent: generación de SQL
└── chat-answer.md          ← ChatAgent: formulación de respuesta natural
```

**Por qué está dentro de `src/lib/agents/` y no en raíz:** Los prompts son parte de la lógica de agentes. Moverlos a la raíz crearía confusión. La carpeta `prompts/` es hermana de `core/`, lo cual refleja su mismo nivel de importancia.

---

### Componente 3: Modificación de agentes

#### [MODIFY] `AnalystAgent.ts`
Reemplazar el template literal del prompt por `PromptLoader.load('analyst', { SUMMARIES: summaryText, FEEDBACK: feedbackSection })`.

El agente mantiene toda la lógica: transformar `summaries` en texto, construir el `feedbackSection`, manejar el fallback si el LLM falla. Solo la **instrucción** (el texto del prompt) pasa a Markdown.

#### [MODIFY] `SchemaAgent.ts`
Externalizar el prompt de `enrichSchemaWithAI`.

#### [MODIFY] `VizExpertAgent.ts`
Externalizar el prompt principal de propuesta de visualizaciones.

#### [MODIFY] `ChatAgent.ts`
Este agente tiene **3 prompts** + 1 sub-prompt de retry. Los 3 principales se eksteriorizan. El retry es un fragmento de contexto (`retryContext`) que se inyecta en `chat-sql.md` via la variable `{{RETRY_CONTEXT}}` (vacío en el primer intento, con el error en el segundo).

#### [MODIFY] `ComprehensionAgent.ts`
Externalizar el prompt de generación de preguntas. El `{{CATEGORY_OPTIONS}}` incluirá los valores dinámicos de opciones que hoy están hardcodeados dentro del template literal.

#### [MODIFY] `CleanerAgent.ts`
El prompt del método `cleanWithAI` (modo retry adaptativo) se externaliza a `cleaner-adaptive.md`.

#### [MODIFY] `next.config.ts`
Agregar la carpeta `prompts/` a `outputFileTracingIncludes` para que los archivos `.md` estén disponibles en el servidor en producción.

---

## Plan de Verificación

### 1. Script de verificación de prompts (`test-prompts.js`)

Verifica sin llamar al LLM:
- Que cada archivo `.md` existe para los 9 prompts catalogados
- Que las variables `{{VAR}}` coinciden entre el agente y el archivo `.md`
- Que el `PromptLoader.load()` renderiza sin dejar tokens sin reemplazar

```bash
node test-prompts.js
# Salida esperada: ✅ Todos los prompts validados correctamente (9/9)
```

### 2. Build TypeScript

```bash
npx tsc --noEmit
# Criterio: cero errores
```

### 3. Build de producción

```bash
npm run build
# Criterio: build exitoso, sin warnings de archivos no encontrados
```

### 4. Verificación funcional manual

1. `npm run dev`
2. Subir `sample_sales_data.csv` (ya existe en la raíz del proyecto)
3. Verificar que el análisis narrativo aparezca correctamente en el tab Dashboard
4. Hacer una pregunta en el chat: `"¿Cuánto vendí en total?"` y verificar respuesta con datos reales

### 5. Prueba de edición sin romper código (la más importante)

1. Abrir `src/lib/agents/prompts/analyst.md`
2. Cambiar: `"Hablale como un colega"` → `"Hablale en tono muy formal y ejecutivo"`
3. **Sin tocar ningún `.ts`**, reiniciar el servidor y re-subir el CSV
4. Verificar que el análisis refleje el nuevo tono
5. Rollback al `.md` original

---

## Qué NO cambia

- La arquitectura de agentes (ManagerAgent, AgentBus, AgentBase) permanece intacta
- Los tipos TypeScript en `types.ts` no se modifican
- El flujo de datos entre agentes no cambia
- La lógica de fallback de cada agente se mantiene en TypeScript
- El `DataStore`, pipeline de limpieza heurística, y todos los agentes no-LLM quedan sin tocar
