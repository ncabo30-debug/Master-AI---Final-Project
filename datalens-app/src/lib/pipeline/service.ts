import crypto from 'crypto';
import { buildHeuristicBlueprint, buildHeuristicStructuralDiagnosis, blueprintToSchema } from './blueprint';
import { exportRowsToXlsxBase64 } from './export';
import { buildDeterministicSample, profileWorkbook } from './profiling';
import { buildOriginalPreviewRows } from './preview';
import { executeStructuralPlan } from '@/lib/transformations/structuralExecutor';
import { executeColumnBlueprint } from '@/lib/transformations/executor';
import { LocalDatasetRepository } from './repositories';
import { validateNormalizedData } from './sqlValidator';
import type {
  BlueprintGenerationResult,
  DatasetManifest,
  NormalizationBlueprint,
  RawWorkbook,
  StatisticalProfile,
  StructuralDiagnosis,
  ValidationReport,
} from './types';

function createDatasetId(sourceFile: string): string {
  return `dataset_${sourceFile.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${Date.now()}`;
}

function buildManifest(workbook: RawWorkbook, sessionId: string, originalFileBase64: string): DatasetManifest {
  const datasetId = createDatasetId(workbook.sourceFile);
  const now = new Date().toISOString();
  return {
    datasetId,
    tenantId: 'tenant-default',
    sourceFile: workbook.sourceFile,
    sourceType: workbook.sourceType,
    sheetNames: workbook.sheetNames,
    status: 'BLUEPRINT_READY',
    originalHash: crypto.createHash('sha256').update(originalFileBase64).digest('hex'),
    approvedBlueprintVersion: null,
    normalizedTableName: `normalized_${datasetId}`,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildBlueprintPreview(
  workbook: RawWorkbook,
  draftBlueprint: NormalizationBlueprint
): {
  originalPreview: Record<string, unknown>[];
  normalizedPreview: Record<string, unknown>[];
} {
  const structuralResult = executeStructuralPlan(workbook, draftBlueprint.structuralPlan);
  const normalizedPreview = executeColumnBlueprint(
    structuralResult.cleanedRows.slice(0, 50),
    draftBlueprint
  );

  return {
    originalPreview: buildOriginalPreviewRows(workbook),
    normalizedPreview,
  };
}

export async function generateBlueprintPipeline(args: {
  workbook: RawWorkbook;
  sessionId: string;
  originalFileBase64: string;
  diagnosisOverride?: StructuralDiagnosis;
  blueprintOverride?: NormalizationBlueprint;
}): Promise<BlueprintGenerationResult> {
  const manifest = buildManifest(args.workbook, args.sessionId, args.originalFileBase64);
  const { profile, primaryRows } = profileWorkbook(args.workbook);
  const diagnosis = args.diagnosisOverride ?? buildHeuristicStructuralDiagnosis(profile);
  const draftBlueprint =
    args.blueprintOverride ?? buildHeuristicBlueprint(args.sessionId, manifest.datasetId, profile, diagnosis);
  const preview = buildBlueprintPreview(args.workbook, draftBlueprint);

  return {
    manifest,
    workbook: args.workbook,
    profile,
    diagnosis,
    draftBlueprint,
    preview: {
      originalPreview: buildOriginalPreviewRows(args.workbook),
      normalizedPreview: preview.normalizedPreview,
    },
    derivedSchema: blueprintToSchema(draftBlueprint),
    llmSample: buildDeterministicSample(primaryRows, 50),
  };
}

export async function executeBlueprintPipeline(args: {
  manifest: DatasetManifest;
  workbook: RawWorkbook;
  approvedBlueprint: NormalizationBlueprint;
  profile: StatisticalProfile;
  originalFileBase64: string;
}): Promise<{
  normalizedData: Record<string, unknown>[];
  validationReport: ValidationReport;
  persistenceResult: Awaited<ReturnType<LocalDatasetRepository['persistDataset']>>;
  normalizedExportBase64: string;
}> {
  const structuralResult = executeStructuralPlan(args.workbook, args.approvedBlueprint.structuralPlan);
  const normalizedData = executeColumnBlueprint(structuralResult.cleanedRows, args.approvedBlueprint);
  const validationReport = validateNormalizedData(normalizedData, args.profile, args.approvedBlueprint);
  const normalizedExportBase64 = await exportRowsToXlsxBase64(normalizedData);
  const repository = new LocalDatasetRepository();
  const persistenceResult = await repository.persistDataset({
    manifest: {
      ...args.manifest,
      approvedBlueprintVersion: args.approvedBlueprint.version,
      status: validationReport.valid ? 'READY' : 'VALIDATION_FAILED',
      updatedAt: new Date().toISOString(),
    },
    blueprint: args.approvedBlueprint,
    normalizedData,
    originalFileBase64: args.originalFileBase64,
    normalizedExportBase64,
  });

  return {
    normalizedData,
    validationReport,
    persistenceResult,
    normalizedExportBase64,
  };
}
