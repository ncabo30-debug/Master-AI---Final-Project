import { NextResponse } from 'next/server';
import { AgentBus } from '@/lib/agents/core/AgentBus';
import { ManagerAgent, VizExpertAgent } from '@/lib/agents';
import {
  generateSessionId,
  getApprovedBlueprint,
  getData,
  getDiagnosis,
  getDraftBlueprint,
  getManifest,
  getNormalizedExportBase64,
  getProfile,
  getSchema,
  getStatisticalProfile,
  getValidationReport,
  getWorkbook,
  getOriginalFileBase64,
  storeBlueprintSession,
  storeNormalizedExecution,
  updateSession,
  getAnalysis,
  getSummaries,
} from '@/lib/DataStore';
import { translateError } from '@/lib/ErrorTranslator';
import { applyBlueprintColumnOverride, applyStructuralOverride, blueprintToSchema } from '@/lib/pipeline/blueprint';
import { buildBlueprintPreview } from '@/lib/pipeline/service';
import type { ColumnNormalizationPlan, NormalizationBlueprint, RawWorkbook } from '@/lib/pipeline/types';

export const maxDuration = 300;

function createManager(sessionId: string) {
  return new ManagerAgent(
    `manager-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    'tenant-default',
    new AgentBus(sessionId),
    sessionId
  );
}

export async function POST(req: Request) {
  let action: string | undefined;

  try {
    const body = await req.json();
    action = body.action;
    const sessionId = String(body.sessionId || generateSessionId());
    const manager = createManager(sessionId);

    const { LLMService } = await import('@/lib/agents/core/LLMService');
    LLMService.currentSessionId = sessionId;

    if (action === 'generate_blueprint') {
      const workbook = body.workbook as RawWorkbook | undefined;
      const originalFileBase64 = String(body.originalFileBase64 || '');

      if (!workbook || !originalFileBase64) {
        return NextResponse.json({ error: 'workbook and originalFileBase64 are required.' }, { status: 400 });
      }

      const result = await manager.generateBlueprint({
        sessionId,
        workbook,
        originalFileBase64,
      });

      storeBlueprintSession({
        sessionId,
        workbook: result.workbook,
        manifest: result.manifest,
        originalData: result.preview.originalPreview,
        statisticalProfile: result.profile,
        draftBlueprint: result.draftBlueprint,
        diagnosis: result.diagnosis,
        schema: result.derivedSchema,
        normalizedPreview: result.preview.normalizedPreview,
        originalFileBase64,
      });

      return NextResponse.json({
        sessionId,
        manifest: result.manifest,
        profile: result.profile,
        diagnosis: result.diagnosis,
        draftBlueprint: result.draftBlueprint,
        preview: result.preview,
        schema: result.derivedSchema,
        legacy: {
          deprecatedActions: ['detect_issues', 'apply_cleaning', 'clean_data', 'analyze_schema', 'download_excel'],
          retirementTarget: '2026-04-30',
        },
      });
    }

    if (action === 'save_blueprint_override') {
      const draftBlueprint = getDraftBlueprint(sessionId);
      if (!draftBlueprint) {
        return NextResponse.json({ error: 'Draft blueprint not found for session.' }, { status: 404 });
      }

      let nextBlueprint: NormalizationBlueprint = draftBlueprint;
      if (body.columnId && body.patch) {
        nextBlueprint = applyBlueprintColumnOverride(
          draftBlueprint,
          String(body.columnId),
          body.patch as Partial<ColumnNormalizationPlan>
        );
      }

      if (body.structuralActionId) {
        nextBlueprint = applyStructuralOverride(
          nextBlueprint,
          String(body.structuralActionId),
          Boolean(body.enabled)
        );
      }

      updateSession(sessionId, {
        draftBlueprint: nextBlueprint,
        schema: blueprintToSchema(nextBlueprint),
      });

      const workbook = getWorkbook(sessionId);
      const preview = workbook ? buildBlueprintPreview(workbook, nextBlueprint) : null;
      if (preview) {
        updateSession(sessionId, { normalizedPreview: preview.normalizedPreview });
      }

      return NextResponse.json({
        sessionId,
        diagnosis: getDiagnosis(sessionId),
        draftBlueprint: nextBlueprint,
        schema: blueprintToSchema(nextBlueprint),
        preview,
      });
    }

    if (action === 'execute_blueprint_and_save') {
      const manifest = getManifest(sessionId);
      const workbook = getWorkbook(sessionId);
      const profile = getStatisticalProfile(sessionId);
      const originalFileBase64 = getOriginalFileBase64(sessionId);
      const approvedBlueprint = (body.approvedBlueprint as NormalizationBlueprint | undefined) || getDraftBlueprint(sessionId);

      if (!manifest || !workbook || !profile || !originalFileBase64 || !approvedBlueprint) {
        return NextResponse.json({ error: 'Missing manifest, workbook, profile or blueprint.' }, { status: 404 });
      }

      const result = await manager.executeBlueprintAndSave({
        manifest,
        workbook,
        approvedBlueprint,
        profile,
        originalFileBase64,
      });

      storeNormalizedExecution({
        sessionId,
        approvedBlueprint,
        normalizedData: result.normalizedData,
        normalizedPreview: result.normalizedData.slice(0, 50),
        normalizedExportBase64: result.normalizedExportBase64,
        validationReport: result.validationReport,
        manifest: result.manifest,
      });

      updateSession(sessionId, {
        schema: blueprintToSchema(approvedBlueprint),
        summaries: {
          Profiler: `Perfiladas ${profile.columnCount} columnas sobre ${profile.rowCount} filas.`,
          Blueprint: `Blueprint v${approvedBlueprint.version} aplicado con ${approvedBlueprint.columnPlan.filter((column) => column.enabled).length} columnas activas.`,
          Validator: result.validationReport.valid
            ? 'La validación SQL local fue exitosa.'
            : `La validación encontró ${result.validationReport.issues.length} observaciones.`,
        },
      });

      return NextResponse.json({
        sessionId,
        manifest: result.manifest,
        normalizedData: result.normalizedData,
        normalizedPreview: result.normalizedData.slice(0, 50),
        validationReport: result.validationReport,
      });
    }

    if (action === 'get_dataset_status') {
      return NextResponse.json({
        sessionId,
        manifest: getManifest(sessionId),
        diagnosis: getDiagnosis(sessionId),
        draftBlueprint: getDraftBlueprint(sessionId),
        approvedBlueprint: getApprovedBlueprint(sessionId),
        validationReport: getValidationReport(sessionId),
      });
    }

    if (action === 'export_normalized_file') {
      const base64 = getNormalizedExportBase64(sessionId);
      if (!base64) {
        return NextResponse.json({ error: 'No normalized export available.' }, { status: 404 });
      }

      return new Response(Buffer.from(base64, 'base64'), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="normalized_${sessionId}.xlsx"`,
        },
      });
    }

    if (action === 'generate_analysis') {
      const summaries = getSummaries(sessionId) || { Sistema: 'Sin resúmenes disponibles.' };
      const result = await manager.processAnalysis(summaries);
      updateSession(sessionId, { analysis: result.analysis });
      return NextResponse.json(result);
    }

    if (action === 'revise_analysis') {
      if (!body.feedback) {
        return NextResponse.json({ error: 'feedback is required.' }, { status: 400 });
      }
      const data = getData(sessionId);
      if (!data) {
        return NextResponse.json({ error: 'No data found for session.' }, { status: 404 });
      }

      const summaries = getSummaries(sessionId) || { Sistema: 'Sin resúmenes disponibles.' };
      const result = await manager.processAnalysisWithFeedback(summaries, String(body.feedback), data);
      updateSession(sessionId, { analysis: result.analysis });
      return NextResponse.json(result);
    }

    if (action === 'propose_visualizations') {
      const analysis = getAnalysis(sessionId) || 'Análisis no disponible.';
      const profile = getProfile(sessionId);
      if (!profile) {
        return NextResponse.json({ error: 'No profile found for session.' }, { status: 404 });
      }
      const result = await manager.proposeVisualizations(analysis, profile);
      updateSession(sessionId, { vizProposals: result.proposals });
      return NextResponse.json(result);
    }

    if (action === 'validate_viz') {
      const profile = getProfile(sessionId);
      if (!profile || !body.viz) {
        return NextResponse.json({ error: 'profile and viz are required.' }, { status: 400 });
      }
      const result = VizExpertAgent.validateFeasibility(body.viz, profile);
      return NextResponse.json(result);
    }

    if (action === 'generate_dashboard') {
      const data = getData(sessionId);
      const schema = getSchema(sessionId);
      if (!data || !schema) {
        return NextResponse.json({ error: 'No normalized dataset available.' }, { status: 404 });
      }

      const result = await manager.generateFinalDashboard(
        data,
        schema,
        (body.answers as Record<string, string> | undefined) || {}
      );
      return NextResponse.json(result);
    }

    if (action === 'chat') {
      const data = getData(sessionId);
      const schema = getSchema(sessionId);
      if (!data || !schema || !body.question) {
        return NextResponse.json({ error: 'question, schema and normalized data are required.' }, { status: 400 });
      }

      const result = await manager.processChat(data, schema, String(body.question));
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action provided.' }, { status: 400 });
  } catch (error: unknown) {
    const translated = translateError(error instanceof Error ? error : String(error), action);
    return NextResponse.json(
      {
        error: translated.userMessage,
        suggestion: translated.suggestion,
        technicalDetail: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
