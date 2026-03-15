# Prompt: 7 Mejoras al Pipeline Multi-Agente de DataLens AI

## Contexto

Estoy construyendo **DataLens AI**, un SaaS de análisis de datos con IA para PYMEs. El sistema procesa archivos de datos (CSV, Excel) a través de un pipeline multi-agente en 3 fases:

- **Fase 1:** Estandarización y Limpieza
- **Fase 2:** Análisis y Aprobación Humana
- **Fase 3:** BI, Visualización y Auditoría Final

Te adjunto el código actual de las Fases 2 y 3 y el diagrama del flujo completo. Necesito que implementes las 7 mejoras que detallo abajo, integrándolas al flujo existente sin romper lo que ya funciona.

Vos decidís la implementación técnica, las librerías y la estructura de código. Yo te describo solo la lógica y el comportamiento esperado.

---

## Mejora 1: Detección de Duplicados

**Ubicación:** Fase 1, después de la limpieza (Agente 2) y antes de la validación paralela.

**Comportamiento esperado:**
- Detectar filas duplicadas exactas y eliminarlas automáticamente.
- Detectar duplicados parciales (filas que coinciden en columnas clave pero difieren en columnas menores) y **no eliminarlos**, solo flaggearlos para revisión.
- Generar un reporte que indique: cuántos duplicados exactos se eliminaron, cuántos parciales se detectaron, y qué filas están involucradas.
- Este reporte debe quedar disponible en el estado del pipeline para que el Agente 5 (Analista) lo tenga en cuenta al generar conclusiones.

---

## Mejora 2: Detección de Encoding y Delimitador Pre-Parseo

**Ubicación:** Al inicio absoluto del pipeline, antes de cualquier otro agente.

**Comportamiento esperado:**
- Antes de leer el archivo, detectar automáticamente su encoding (UTF-8, Latin-1, etc.) y, si es CSV, su delimitador (coma, punto y coma, tab, etc.).
- Si el encoding no es UTF-8, convertir el archivo a UTF-8 y trabajar con la copia convertida.
- Guardar la metadata detectada (encoding original, delimitador, si hubo conversión) en el estado del pipeline.
- Si la detección tiene baja confianza, loggear una advertencia.

---

## Mejora 3: Data Profiling Cuantitativo Persistente

**Ubicación:** Fase 1, dentro del Agente 1 (Profiler).

**Comportamiento esperado:**
- Además del resumen textual que ya genera el Agente 1, calcular y guardar un perfil numérico del dataset. Este perfil es determinístico (calculado con código, no con el LLM).
- El perfil debe incluir como mínimo: cantidad de filas, cantidad de columnas, tipos de dato por columna, cantidad de nulos por columna, sumas y promedios de columnas numéricas, cantidad de valores únicos por columna, y rangos de fechas si hay columnas temporales.
- Este perfil numérico debe persistir en el estado del pipeline porque lo necesita el Agente 4 en la auditoría final (Fase 3) para comparar los números del reporte generado contra los datos originales y detectar discrepancias.

---

## Mejora 4: Detección de Outliers

**Ubicación:** Fase 1, como parte de la validación paralela (junto al Agente 3 y Agente 4).

**Comportamiento esperado:**
- Para columnas numéricas, detectar valores atípicos usando un método estadístico estándar (por ejemplo IQR).
- Para columnas de fecha, detectar fechas irrazonables (muy en el futuro o muy en el pasado).
- **No eliminar outliers**, solo reportarlos: qué columna, cuántos outliers, qué valores extremos se encontraron.
- El reporte debe quedar disponible en el estado para que el Agente 5 (Analista) lo mencione en sus conclusiones y el humano esté informado.

---

## Mejora 5: Límite de Iteraciones en el Loop de Fase 2

**Ubicación:** Fase 2, en el ciclo Agente 5 → Humano → Agente 4 → Agente 5.

**Comportamiento esperado:**
- Actualmente, si el humano rechaza el análisis, el ciclo se repite sin límite.
- Implementar un contador de iteraciones. Después de 3 rechazos consecutivos, en lugar de repetir el ciclo, entrar a un nodo de escalamiento que:
  1. Presente al humano un resumen de todos los intentos previos y los feedbacks dados.
  2. Ofrezca opciones claras: (a) aceptar el análisis actual con reservas, (b) solicitar intervención manual externa, (c) descartar y empezar con otros datos.
  3. Según la elección del humano, continuar el flujo o finalizarlo.

---

## Mejora 6: Validación de Factibilidad de Visualización

**Ubicación:** Fase 3, entre la elección del humano (Human_Approval_2) y el generador de reportes.

**Comportamiento esperado:**
- Después de que el humano elige cómo quiere visualizar los datos, validar que lo elegido sea posible con los datos disponibles.
- Verificar: ¿las columnas mencionadas existen? ¿los filtros pedidos son posibles? ¿el tipo de gráfico es compatible con los tipos de datos?
- Si es factible → continuar al generador de reportes.
- Si NO es factible → explicar al humano qué no es posible y por qué, y permitirle ajustar su elección.
- Incluir un límite de 2 iteraciones en este sub-loop para evitar ciclos infinitos aquí también.

---

## Mejora 7: Versionado del Archivo Original

**Ubicación:** Al inicio del pipeline (puede combinarse con la Mejora 2).

**Comportamiento esperado:**
- Antes de cualquier modificación, crear una copia de respaldo del archivo original con un identificador único (timestamp, hash, etc.).
- Guardar la ruta del backup y un hash del archivo original en el estado del pipeline.
- Todas las transformaciones posteriores (limpieza, eliminación de duplicados, etc.) deben operar sobre copias, nunca sobre el archivo original.
- La auditoría final (Agente 4, Fase 3) debe comparar contra este backup inmutable, no contra el archivo que pudo haber sido modificado durante el proceso.

---

## Resumen del Flujo Actualizado

```
INICIO
  → Inspección del archivo (encoding, delimitador, backup)     [Mejoras 2 y 7]
  → Profiling (textual + cuantitativo)                         [Mejora 3]
  → Limpieza
  → Detección de duplicados                                    [Mejora 1]
  → Validación paralela:
      → Validador de formatos
      → Detección de outliers                                  [Mejora 4]
      → Auditor de integridad
  → Evaluación
  → Análisis (con contador de iteraciones)                     [Mejora 5]
  → Aprobación humana
      → Si aprobado: continuar
      → Si rechazado (< 3 veces): loop normal
      → Si rechazado (>= 3 veces): escalamiento               [Mejora 5]
  → Propuestas de visualización
  → Elección humana
  → Validación de factibilidad                                 [Mejora 6]
      → Si factible: generar reportes
      → Si no factible: volver a elección humana
  → Generación de reportes
  → Auditoría final (compara contra backup original y perfil)  [Mejoras 3 y 7]
  → FIN
```

---

## Notas

- Los comentarios y prints en el código deben estar en español.
- Cada nodo nuevo debe tener manejo de errores robusto y loggear errores en el estado del pipeline.
- Mantené la simulación con `input()` para los nodos humanos (después se reemplazará por UI web).
