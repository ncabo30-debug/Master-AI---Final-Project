# Datalens — Visión de Inteligencia de Negocio
**Fecha:** 2026-03-23 | Fase G del roadmap

Este documento describe en detalle qué hace cada componente de la visión de agentes de negocio de Datalens, para qué sirve, y qué problema resuelve para el dueño de la PYME. El lado técnico se resuelve en una fase posterior.

---

## El problema que resuelve esta visión

El sistema actual de Datalens hace muy bien una cosa: toma datos sucios y los deja limpios, analizados y visualizados. Es una herramienta de preparación y exploración de datos.

Lo que esta visión agrega es la capa que le falta: **que el sistema entienda el negocio específico del cliente, cruce información entre áreas, y le diga al dueño exactamente qué hacer esta semana.** No "sus ventas variaron", sino "López y Martínez no compraron en 3 semanas, mandales un mensaje hoy".

La diferencia es entre un sistema que procesa datos y uno que actúa como un socio de negocio.

---

## Los 4 niveles — vista general

```
Datos del negocio
        ↓
┌───────────────────────────────────────────┐
│  NIVEL 1 — Agentes Especialistas          │
│  Ventas · Clientes · Finanzas · Inventario│
│  Cada uno analiza solo su área            │
└────────────────────┬──────────────────────┘
                     ↓
┌───────────────────────────────────────────┐
│  NIVEL 2 — Orquestador                    │
│  Cruza los análisis, detecta correlaciones│
│  Produce 3-5 conclusiones priorizadas     │
└────────────────────┬──────────────────────┘
                     ↓
┌───────────────────────────────────────────┐
│  NIVEL 3 — Agente de Negocio              │
│  Traduce al lenguaje del dueño            │
│  Usa la memoria, sugiere acciones hoy     │
└────────────────────┬──────────────────────┘
                     ↓
              El dueño recibe
         una recomendación accionable
                     ↓
┌───────────────────────────────────────────┐
│  NIVEL 4 — Memoria Persistente (base)     │
│  Todo lo anterior se registra y aprende   │
│  El sistema mejora ciclo a ciclo          │
└───────────────────────────────────────────┘
```

---

## G-1 — Agentes Especialistas de Dominio de Negocio

### Qué son
Cuatro agentes independientes, cada uno experto exclusivamente en su área. No saben nada de las otras áreas — eso es intencional. Su especialización es lo que les permite producir análisis profundos que un agente genérico nunca daría.

Estos agentes son **distintos a los agentes actuales** del pipeline (CleanerAgent, ProfilerAgent, etc.). Los actuales hacen ingeniería de datos. Estos leen datos ya limpios y producen inteligencia de negocio.

### Los 4 especialistas

**Agente de Ventas**
- Qué analiza: volumen de ventas por día, semana y mes; productos más vendidos; tendencias; comparativas contra períodos anteriores; estacionalidad
- Qué produce: días pico, tendencias de crecimiento o caída por producto, anomalías de ventas ("el martes de esta semana tuvo 60% menos que el martes promedio"), productos que pasaron de top 5 a segunda línea

**Agente de Clientes**
- Qué analiza: frecuencia de compra por cliente, ticket promedio, última fecha de compra, variación en el valor del cliente a lo largo del tiempo
- Qué produce: clientes en riesgo de fuga (no compraron en X semanas), clientes VIP que no recibieron atención reciente, oportunidades de upsell basadas en historial, clientes que aumentaron su ticket promedio

**Agente de Finanzas**
- Qué analiza: márgenes por producto y categoría, flujo de caja, gastos recurrentes, diferencia entre ingresos y egresos, tendencias de rentabilidad
- Qué produce: alertas de liquidez, productos que venden bien pero tienen margen negativo, tendencias de deterioro de márgenes, gastos que crecen más rápido que los ingresos

**Agente de Inventario** *(aplica según el rubro del negocio)*
- Qué analiza: rotación de productos, quiebres de stock, sobrestock, correlación entre niveles de stock y ventas perdidas
- Qué produce: productos a reponer urgente, productos que no rotan hace semanas, pérdidas estimadas por quiebre de stock, oportunidades de liberar capital en sobrestock

### Por qué funcionan mejor separados
Cuando un solo agente analiza todo, tiende a dar respuestas superficiales sobre cada área. Un agente que solo sabe de clientes va a notar que el cliente García compra cada 10 días y lleva 22 días sin comprar — eso no lo vería un agente que también está procesando finanzas e inventario al mismo tiempo.

---

## G-2 — Orquestador con Cruce y Cierre Forzado

### Qué es
El único agente que ve el output de todos los especialistas a la vez. Su trabajo no es analizar datos — es encontrar las conexiones que ningún especialista puede ver solo.

### Qué hace
Recibe los 4 análisis y busca correlaciones entre áreas. Ejemplos de cruce:

- Ventas dice "los jueves vendemos 40% más" + Inventario dice "los viernes hay quiebre de stock frecuente en A, B y C" → Orquestador concluye: "Estás perdiendo ventas los viernes porque no reponés stock después del pico del jueves"

- Clientes dice "López no compra hace 3 semanas" + Finanzas dice "el margen de los productos que compra López es el más alto del catálogo" → Orquestador concluye: "El cliente de mayor margen del negocio está en riesgo de irse — es prioridad 1 esta semana"

- Ventas dice "el producto X creció 30% este mes" + Finanzas dice "el producto X tiene margen negativo desde hace 2 meses" → Orquestador concluye: "Estás vendiendo más del producto que más te hace perder — hay que decidir si subir el precio o discontinuarlo"

### La característica crítica: el cierre forzado
El orquestador **no delibera, no pide más información, no da vueltas**. Con lo que recibe, concluye. Siempre. Su output tiene un formato fijo:

```
Conclusión 1 (urgencia alta):
  - Problema detectado: ...
  - Áreas involucradas: Ventas + Inventario
  - Acción sugerida: ...

Conclusión 2 (urgencia media):
  - ...
```

Máximo 5 conclusiones, ordenadas por urgencia. Si los datos no alcanzan para 5, devuelve las que tiene. Nunca devuelve texto libre ni análisis descriptivo.

### Manejo de contradicciones entre especialistas
Cuando dos especialistas se contradicen ("ventas crecen" vs "margen negativo"), el orquestador no elige uno — lo marca explícitamente como una tensión de negocio y la convierte en una decisión que el dueño tiene que tomar. Eso transforma una limitación en valor real.

---

## G-3 — Sistema de Memoria Persistente de 3 Capas + Perfil de Negocio

### Por qué hace falta una memoria estructurada
Si se guarda todo sin estructura, después de 6 meses hay miles de registros. El Agente de Negocio no puede procesar todo eso en cada conversación — los LLMs tienen límites de contexto. Si no se comprime bien, el sistema que prometía "mejorar con el tiempo" se vuelve más lento y menos preciso. Lo opuesto a lo prometido.

### Las 3 capas

**Capa 1 — Memoria inmediata (últimas 4 semanas)**
- Contenido: todos los análisis de los últimos 4 ciclos en detalle completo
- Uso: el agente de negocio la consulta para dar contexto reciente ("la semana pasada notamos X, esta semana se repite")
- Se conserva sin comprimir

**Capa 2 — Memoria media (últimos 12 meses, comprimida)**
- Contenido: resúmenes mensuales. Cada mes se comprime a un párrafo por área: "En agosto las ventas crecieron 15%, el producto estrella fue X, el cliente más activo fue Y, el margen promedio fue Z%"
- Uso: permite detectar estacionalidad y comparar contra el mismo período del año anterior
- Se genera automáticamente al cierre de cada mes

**Capa 3 — Perfil permanente del negocio**
- Contenido: lo que no cambia o cambia muy lento. No crece ilimitadamente — se actualiza pero no se acumula:
  - Rubro del negocio
  - Estacionalidades confirmadas (picos en diciembre, baja en enero)
  - Clientes clave (los 5 que generan el 60% del margen)
  - Productos estrella (los que combinan alto volumen + buen margen)
  - Patrones confirmados (ej: "los viernes siempre hay quiebre de stock")
  - Qué recomendaciones históricamente siguió el dueño y funcionaron
- Uso: el agente de negocio lo cita cuando hace recomendaciones ("la última vez que esto pasó en octubre, hiciste X y funcionó")

### El perfil de negocio como activo del cliente
Esta memoria es lo que hace irracional abandonar Datalens después de 6 meses. Irse significa perder el historial de inteligencia del propio negocio — y eso no se recupera.

---

## G-4 — Agente de Negocio

### Qué es
El único agente que habla directamente con el dueño. No muestra datos — muestra decisiones. Toma el output del orquestador, consulta las 3 capas de memoria, y traduce todo al lenguaje del dueño de PYME.

### Cómo habla
No habla como un analista de datos ni como un consultor de management. Habla como alguien que conoce ese negocio específico desde adentro.

**Mal (genérico):** "Se observa una tendencia descendente en la retención de clientes. Se recomienda revisar la estrategia de fidelización."

**Bien (concreto):** "López y Martínez no compraron en 3 semanas. Los dos juntos son el 18% de tu margen mensual. ¿Querés que te prepare un mensaje para mandarlés hoy?"

### Sus reglas de comportamiento
- Nunca menciona datos sin atarlos a una acción
- Nunca usa frases genéricas de management ("optimizar", "revisar", "considerar")
- Siempre menciona nombres reales de clientes, productos o números cuando están disponibles en la memoria
- Siempre termina con 1-2 acciones concretas que se pueden ejecutar esta semana
- Sabe qué recomendaciones el dueño ya atendió y no las repite
- Adapta la profundidad según el perfil del usuario (dueño sin conocimiento técnico vs. gerente con contexto financiero)

### Formato de output típico
```
Esta semana tu prioridad es [X] porque [dato concreto].

[Contexto relevante de semanas anteriores si aplica]

Acciones sugeridas:
1. [Acción específica y ejecutable hoy o esta semana]
2. [Acción secundaria si aplica]
```

### Integración con el chat de la app
El dueño puede responder, preguntar, o pedir más detalle directamente desde el chat. Esa conversación es parte del feedback loop — lo que le importa al dueño, en qué profundiza, qué ignora, todo eso alimenta la memoria.

---

## G-5 — Feedback Loop: Seguimiento de Recomendaciones

### Por qué es crítico
Sin saber qué recomendaciones funcionaron y cuáles no, el sistema no aprende. La promesa de "cuanto más lo usás mejor funciona" requiere un mecanismo concreto de feedback.

### Los 3 canales de feedback

**Canal 1 — Feedback implícito (el más poderoso)**
El sistema analiza los datos de la semana siguiente y detecta si una recomendación fue atendida. Si la semana pasada dijo "reponé el producto A" y esta semana el stock de A subió, registra que esa recomendación fue ejecutada. No requiere ninguna acción del dueño.

**Canal 2 — Feedback mínimo explícito (en el chat)**
Al final del reporte semanal, una sola pregunta en el chat: "¿Esta semana el análisis te fue útil?" con dos opciones. Nada más. No formularios, no encuestas.

**Canal 3 — Feedback conversacional**
Todo lo que el dueño dice en el chat es feedback implícito. Si profundiza en clientes y nunca pregunta por inventario, el sistema aprende que clientes es su área de mayor interés. Si dice "eso ya lo sabía", aprende qué tipo de recomendaciones no aportan valor para ese negocio específico.

### Qué se registra
- Cada recomendación generada, con fecha y área
- Estado: sugerida / atendida / ignorada / marcada como útil
- Fuente del cierre: implícito (datos) o explícito (chat)
- Resultado cuando es detectable (si se reponía stock y las ventas subieron)

### Para qué sirve esto
- El Agente de Negocio no repite recomendaciones que el dueño históricamente ignora
- Las recomendaciones que funcionaron se refuerzan como patrones en el perfil permanente
- Con el tiempo, el sistema prioriza los tipos de insight que generaron acción real para ese cliente

---

## G-6 — Optimización de Modelo por Agente

### El problema
Cada cliente tiene su propio flujo de agentes. Si todos usan el modelo más caro, el costo por cliente escala rápido y el modelo de negocio no es rentable.

### La solución
No todos los agentes necesitan el modelo más capaz:

**Modelos pequeños y baratos** → Agentes especialistas (G-1) y Orquestador (G-2)
- Su tarea es estructurada: reciben datos en formato fijo, producen análisis en formato fijo
- No necesitan razonamiento complejo ni lenguaje natural sofisticado
- Reducción de costo estimada: 60-70% del total

**Modelo más capaz** → Agente de Negocio (G-4) únicamente
- Es el único que habla en lenguaje natural con el dueño
- Necesita contexto de memoria complejo, razonamiento sobre situaciones ambiguas, y tono adaptativo
- La calidad aquí es crítica — es la única interfaz que el dueño ve

### Resultado
El costo por cliente baja drásticamente sin sacrificar la calidad en el único punto que el dueño percibe directamente.

---

## Orden de implementación recomendado

```
G-3 (memoria + perfil en Supabase)   ← primero, es la base de todo
        ↓
G-1 (agentes especialistas)          ← pueden desarrollarse en paralelo con G-3
        ↓
G-2 (orquestador)                    ← necesita que G-1 exista
        ↓
G-4 (agente de negocio)              ← necesita G-2 + G-3
        ↓
G-5 (feedback loop)                  ← necesita G-4 funcionando para tener recomendaciones que trackear
        ↓
G-6 (optimización de modelo)         ← puede hacerse en cualquier momento post G-1/G-2, es una mejora de costo
```

### Prerequisitos antes de empezar G-1
- Producción funcionando (Fases A + B + C del session_handoff)
- Bugs del pipeline resueltos (D-1 a D-7) — los especialistas de negocio trabajan sobre datos ya limpios; datos sucios = conclusiones inválidas

---

## Lo que hace que esta visión sea alcanzable

- La arquitectura multi-agente ya existe en el proyecto (AgentBus, AgentBase, AgentRegistry)
- Supabase ya está planificado en la arquitectura de producción — solo hace falta ampliar el schema
- El chat de la app ya existe — el feedback loop conversacional se construye sobre lo que ya hay
- No requiere integraciones externas en esta fase (WhatsApp, n8n, etc.) — todo opera dentro de la app
