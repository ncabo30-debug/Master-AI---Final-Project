# Improvers Rules - 2026-03-14

Fuente leida:
- `IMPROVERS/get-shit-done-main`
- `IMPROVERS/superpowers-main`

## Reglas operativas adoptadas desde ahora

### 1. No saltar directo a codear si falta claridad
- Antes de implementar algo grande, primero clarificar objetivo, alcance, restricciones, UX esperada y criterio de exito.
- Si el pedido ya viene claro y accionable, ejecutar sin friccion innecesaria.

### 2. Plan corto, concreto y verificable
- Dividir el trabajo en tareas chicas y ejecutables.
- Cada tarea debe tener:
  - objetivo claro
  - archivos afectados
  - verificacion concreta
- Evitar planes abstractos o ceremoniales.

### 3. Contexto estable y sin deriva
- Trabajar con contexto real del repo antes de asumir.
- Mantener memoria operativa en `brain/` cuando ayude a continuar sesiones sin perder foco.
- Si una zona del proyecto ya fue auditada, reutilizar ese contexto en vez de reabrir discusiones resueltas.

### 4. Verificacion obligatoria
- No dar por terminado un cambio sin evidencia.
- Por defecto, cerrar con:
  - lint si aplica
  - typecheck si aplica
  - build o test relevante si aplica
- Si algo no se puede verificar, dejarlo dicho explicitamente.

### 5. Preferir cambios chicos y seguros
- Minimizar refactors grandes si el objetivo se puede cumplir con cambios localizados.
- Reducir riesgo antes que perseguir elegancia innecesaria.
- No tocar lo que funciona sin motivo claro.

### 6. Debugging sistematico
- Cuando algo falle:
  - reproducir
  - aislar causa
  - corregir
  - verificar que realmente quedo resuelto
- Evitar arreglos por intuicion sin confirmar causa raiz.

### 7. Evidencia antes que discurso
- Si digo que algo funciona, tiene que venir respaldado por comando, build, test o inspeccion verificable.
- Si digo que algo esta pendiente, tiene que estar verificado en codigo.

### 8. Mantener simplicidad
- YAGNI: no agregar capas o features que todavia no hacen falta.
- DRY: consolidar duplicacion real cuando aparezca.
- Evitar sobreingenieria.

### 9. Cuando convenga, trabajo por fases
- Para trabajo grande:
  - entender
  - planear
  - ejecutar
  - verificar
  - dejar handoff/documentacion minima
- Para trabajo chico, usar version reducida del mismo flujo.

### 10. Cierre prolijo
- Al terminar una tanda:
  - actualizar `session_handoff.md` si cambia el estado real de pendientes
  - actualizar `task.md` como registro historico de lo hecho

## Como voy a aplicarlo en este proyecto
- Voy a priorizar pedidos con alcance claro y entrega concreta.
- Voy a seguir trabajando con cambios pequenos, auditables y verificados.
- Voy a usar `brain/session_handoff.md` y `brain/task.md` como memoria operativa oficial.
- Si una tarea amerita plan, te lo voy a bajar a pasos cortos y accionables antes de meternos en refactors grandes.
- Si una tarea amerita ejecucion directa, la voy a resolver end-to-end y despues te cierro con evidencia.

## Nota
- Estas reglas complementan mi forma de trabajo dentro de este repo.
- No reemplazan restricciones de seguridad, sandbox, ni instrucciones superiores ya activas en la sesion.
