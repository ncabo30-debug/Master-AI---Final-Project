import { resolveTransformation } from './router';
import type { ColumnNormalizationPlan, NormalizationBlueprint } from '@/lib/pipeline/types';

function applyPlanToRow(row: Record<string, unknown>, plan: ColumnNormalizationPlan): Record<string, unknown> {
  if (!plan.enabled) return row;

  const executor = resolveTransformation(plan);
  const sourceValue = row[plan.sourceColumn];
  const transformedValue = executor(sourceValue, plan.params);

  if (plan.transform === 'splitField' && transformedValue && typeof transformedValue === 'object' && !Array.isArray(transformedValue)) {
    const nextRow = { ...row };
    delete nextRow[plan.sourceColumn];
    Object.entries(transformedValue as Record<string, unknown>).forEach(([key, value]) => {
      nextRow[key] = value;
    });
    return nextRow;
  }

  return {
    ...row,
    [plan.targetColumn]: transformedValue,
  };
}

export function executeColumnBlueprint(
  rows: Record<string, unknown>[],
  blueprint: NormalizationBlueprint
): Record<string, unknown>[] {
  return rows.map((row) => {
    let nextRow = { ...row };
    blueprint.columnPlan.forEach((plan) => {
      nextRow = applyPlanToRow(nextRow, plan);
      if (plan.enabled && plan.targetColumn !== plan.sourceColumn && plan.transform !== 'splitField') {
        delete nextRow[plan.sourceColumn];
      }
    });
    return nextRow;
  });
}

