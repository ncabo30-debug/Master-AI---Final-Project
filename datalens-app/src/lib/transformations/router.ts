import { catalog } from './catalog';
import type { ColumnNormalizationPlan } from '@/lib/pipeline/types';

export function resolveTransformation(plan: ColumnNormalizationPlan) {
  return catalog[plan.transform] ?? catalog.identity;
}

