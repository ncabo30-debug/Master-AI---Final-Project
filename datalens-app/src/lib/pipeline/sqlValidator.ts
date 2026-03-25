import { SQLiteService } from '@/lib/SQLiteService';
import type { NormalizationBlueprint, StatisticalProfile, ValidationIssue, ValidationReport, ValidationRule } from './types';

export function buildValidationRules(
  profile: StatisticalProfile,
  blueprint: NormalizationBlueprint
): ValidationRule[] {
  const rowCountRule: ValidationRule = {
    id: 'row-count',
    name: 'Conservación de filas',
    sql: 'SELECT COUNT(*) as value FROM datos',
    severity: 'error',
    expected: String(profile.rowCount),
  };

  const nullRules = blueprint.columnPlan
    .filter((column) => column.enabled && !column.nullable)
    .map<ValidationRule>((column) => ({
      id: `nonnull-${column.targetColumn}`,
      name: `No nulls en ${column.targetColumn}`,
      sql: `SELECT COUNT(*) as value FROM datos WHERE "${column.targetColumn}" IS NULL`,
      severity: 'error',
      expected: '0',
    }));

  const numericRangeRules = blueprint.columnPlan
    .filter((column) => column.enabled && column.inferredType === 'number')
    .map<ValidationRule>((column) => ({
      id: `numeric-range-${column.targetColumn}`,
      name: `Rango numérico en ${column.targetColumn}`,
      sql: `SELECT MIN("${column.targetColumn}") as min_value, MAX("${column.targetColumn}") as max_value FROM datos`,
      severity: 'warning',
      expected: 'min/max available',
    }));

  return [rowCountRule, ...nullRules, ...numericRangeRules];
}

export function validateNormalizedData(
  normalizedData: Record<string, unknown>[],
  profile: StatisticalProfile,
  blueprint: NormalizationBlueprint
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const rules = buildValidationRules(profile, blueprint);

  rules.forEach((rule) => {
    try {
      const result = SQLiteService.executeQuery(normalizedData, rule.sql);
      const row = result[0] ?? {};
      const value = row.value ?? row.min_value ?? row.max_value ?? null;

      if (rule.id === 'row-count' && String(value) !== rule.expected) {
        issues.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Se esperaban ${rule.expected} filas y se obtuvieron ${String(value)}`,
          actual: value,
        });
      }

      if (rule.id.startsWith('nonnull-') && String(value) !== '0') {
        issues.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Se detectaron ${String(value)} nulls inesperados`,
          actual: value,
        });
      }
    } catch (error) {
      issues.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: 'error',
        message: error instanceof Error ? error.message : 'Error desconocido al ejecutar validación',
      });
    }
  });

  return {
    valid: issues.filter((issue) => issue.severity === 'error').length === 0,
    issues,
    executedAt: new Date().toISOString(),
  };
}

