# Análisis de Arquitectura Multi-Agente en DataLens

Basado en la revisión del código fuente y el documento conceptual (`sould.md`), aquí tienes una explicación profunda de cómo funciona la orquestación de agentes en DataLens, paso a paso, desde la carga del archivo hasta la generación del reporte.

## 1. El Bus de Eventos (El Sistema Nervioso)
Todo el sistema backend está construido sobre un patrón de publicación/suscripción mediante la clase `AgentBus`. Cada agente no se comunica directamente con otro; envían mensajes al bus con un destinatario (`to`) y un tipo de evento (`type`). Esto permite que los diferentes agentes trabajen de forma asíncrona e independiente.

## 2. Flujo de Trabajo: Paso a Paso

### Fase 1: Ingesta de Datos y Descubrimiento del Schema
**1. El usuario carga un archivo:** En la interfaz `FileUploader` (Paso 1 del Frontend), el usuario sube un CSV/Excel que es parseado a un array JSON (filas y columnas).
**2. Llamada a la API:** El frontend envía estos datos a la ruta `/api/analyze` con la acción `analyze_schema`.
**3. Orquestación del Manager:** La API instancia un `ManagerAgent` y un bus de sesión único. El Manager publica un evento `ANALYZE_SCHEMA`.
**4. Intervención del SchemaAgent:** 
   - El `SchemaAgent` recibe los datos.
   - Revisa una muestra y **deduce automáticamente el tipo de dato** de cada columna (si es `number`, `date` o `string` categórico).
   - Devuelve un diccionario (Schema) al Manager.

### Fase 2: Comprensión y Cuestionamiento Inteligente
**5. Generación de Preguntas:** Inmediatamente después de obtener el schema, el `ManagerAgent` dispara el evento `GENERATE_QUESTIONS` hacia el `ComprehensionAgent`.
**6. Intervención del ComprehensionAgent (LLM):**
   - Este agente actúa como la interfaz humana. Se conecta a una IA local (vía Ollama o una API OpenAI compatible, según el `.env`).
   - Le envía al LLM el schema detectado y le pide que genere **una pregunta inteligente** para el usuario. Por ejemplo: *"He detectado las columnas 'Categoría' y 'Región'. ¿Por cuál de estas deseas agrupar el reporte principal?"*
   - Si no hay LLM configurado, usa un *fallback* generando la pregunta por código.
**7. Interacción en el Frontend:** El Schema y la pregunta de la IA se envían de vuelta al Frontend (Paso 2). El usuario ve una vista previa de los datos (`InteractiveSheet`) y responde la pregunta de la IA en el `ComprehensionPanel`. En esta etapa, el usuario también puede chatear libremente haciendo preguntas que son respondidas por el `ChatAgent` basándose en el esquema.

### Fase 3: Generación del Reporte (Dashboard)
**8. Envío de Respuestas:** Cuando el usuario responde la pregunta, el Frontend hace una nueva petición a `/api/analyze` con la acción `generate_report`, pasando los datos, el schema y la respuesta elegida.
**9. Intervención del ReportAgent:**
   - El `ManagerAgent` orquesta esto enviando el evento `GENERATE_REPORT`.
   - El `ReportAgent` es el "arquitecto". Toma la respuesta del usuario (por ejemplo, el usuario eligió agrupar por "Región" en el Eje X).
   - Selecciona automáticamente la primera columna numérica válida para el Eje Y.
   - **Procesa los datos:** Agrupa las filas por la columna elegida (Eje X) y suma los valores de la columna numérica (Eje Y).
   - Ordena los resultados de mayor a menor y extrae el Top 15.
   - Genera una **configuración de reporte** (tipo de gráfico, títulos, mapeos) compatible con la librería *Recharts*.
**10. Visualización Final:** El frontend recibe esta configuración estructurada y avanza al Paso 3, renderizando un `Dashboard` espectacular y reactivo sin que el usuario haya tenido que configurar manualmente ejes, agrupaciones o sumatorias.

## Resumen del "Alma" (The Soul)
El flujo refleja perfectamente la filosofía descrita en `sould.md`:
- **Privacidad Local:** Aprovechando Ollama para no enviar datos a la nube.
- **Empoderamiento:** El usuario no hace un análisis manual aburrido, la IA hace el trabajo pesado y solo pide orientación estratégica ("¿Por qué eje agrupo?").
- **Orquestación Oculta:** La complejidad de parsear, agrupar e inferir sucede transparentemente usando el ecosistema de agentes (`SchemaAgent` -> `ComprehensionAgent` -> `ReportAgent`).
