import { NextResponse } from 'next/server';
import { ManagerAgent, VizExpertAgent } from '@/lib/agents';
import { AgentBus } from '@/lib/agents/core/AgentBus';
import {
    storeData, getData, getExcelBuffer, getProfile,
    storeCleaningResult, generateSessionId,
    updateSession, getAnalysis, getSummaries, getSchema, getSchemaBlueprint
} from '@/lib/DataStore';
import { translateError } from '@/lib/ErrorTranslator';
import { applyBlueprintOverride, blueprintToSchema, schemaToBlueprint } from '@/lib/agents/schemaBlueprint';
import type { EnrichedSchemaField } from '@/lib/agents/types';

/**
 * Allow long-running requests for Gemini API inference.
 * Vercel: hobby=10s, pro=300s. Self-hosted: unlimited.
 */
export const maxDuration = 300;

export async function POST(req: Request) {
    let action: string | undefined;
    try {
        const body = await req.json();
        action = body.action;
        const { schema, answers, question, feedback, sessionId: incomingSessionId } = body;

        // ── Resolve session context ──
        let sessionId = incomingSessionId || null;

        // For actions that need data, resolve it
        const actionsNeedingData = ['clean_data', 'analyze_schema', 'generate_report', 'generate_dashboard', 'chat', 'full_pipeline'];
        let resolvedData: Record<string, unknown>[] | null = null;

        if (actionsNeedingData.includes(action!)) {
            if (body.data && Array.isArray(body.data)) {
                resolvedData = body.data as Record<string, unknown>[];
                sessionId = sessionId || generateSessionId();
                storeData(sessionId, resolvedData);
            } else if (sessionId) {
                resolvedData = getData(sessionId);
            }

            if (!resolvedData || !Array.isArray(resolvedData)) {
                return NextResponse.json(
                    { error: 'No data available. Either send data inline or provide a valid sessionId.' },
                    { status: 400 }
                );
            }
        }

        // Unique manager ID per request
        const managerId = `manager-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const resolvedSessionId = sessionId || 'default';
        const localBus = new AgentBus(resolvedSessionId);

        // Set session context for token tracking
        const { LLMService } = await import('@/lib/agents/core/LLMService');
        LLMService.currentSessionId = resolvedSessionId;

        const manager = new ManagerAgent(managerId, 'tenant-default', localBus, resolvedSessionId);

        // ── ACTION: clean_data ──
        if (action === 'clean_data') {
            console.log(`[API] Iniciando pipeline de limpieza para ${resolvedData!.length} filas.`);
            const rawText = body.rawText || undefined; // M2: raw CSV text for encoding detection
            const cleaningResult = await manager.processDataCleaning(resolvedData!, rawText);

            // Build summaries from the cleaning pipeline (including M1+M4 reports)
            const summaries: Record<string, string> = {
                'Profiler': `Perfiló ${cleaningResult.profile.columns.length} columnas: ${cleaningResult.profile.columns.map(c => `${c.name}(${c.inferredType})`).join(', ')}`,
                'Cleaner': `Limpió ${cleaningResult.cleanedData.length} filas y generó Excel formateado.`,
                'Validator': 'Validó que los tipos sobrevivieron la serialización a Excel.',
                'Auditor': `Verificó integridad: ${cleaningResult.cleanedData.length} filas consistentes con el CSV original.`
            };
            // M1: Duplicate report for analyst
            if (cleaningResult.duplicateReport) {
                const dr = cleaningResult.duplicateReport;
                summaries['Duplicados'] = `${dr.exactRemoved} duplicados exactos eliminados, ${dr.partialFlagged.length} parciales flaggeados.`;
            }
            // M4: Outlier report for analyst
            if (cleaningResult.outlierReport && cleaningResult.outlierReport.outliers.length > 0) {
                const or = cleaningResult.outlierReport;
                summaries['Outliers'] = or.outliers.map(o => {
                    const vals = o.extremeValues ? o.extremeValues.slice(0, 5).join(', ') : '?';
                    const bounds = (o.lowerBound != null && o.upperBound != null)
                        ? ` (rango normal: ${o.lowerBound} – ${o.upperBound})`
                        : '';
                    return `${o.column}: valores inusuales [${vals}]${bounds}`;
                }).join('; ');
            }
            // M2+M7: File inspection
            if (cleaningResult.fileInspection) {
                summaries['FileInspector'] = `Encoding: ${cleaningResult.fileInspection.encoding}, Delimitador: '${cleaningResult.fileInspection.delimiter}', Hash backup: ${cleaningResult.fileInspection.originalHash.substring(0, 16)}`;
            }

            // Store cleaned data + Excel + summaries + new pipeline data
            storeCleaningResult(sessionId!, cleaningResult.cleanedData, cleaningResult.excelBuffer, cleaningResult.profile);
            updateSession(sessionId!, {
                summaries,
                ...(cleaningResult.fileInspection && { fileInspection: cleaningResult.fileInspection }),
                ...(cleaningResult.originalSnapshot && { originalDataSnapshot: cleaningResult.originalSnapshot }),
                ...(cleaningResult.duplicateReport && { duplicateReport: cleaningResult.duplicateReport }),
                ...(cleaningResult.outlierReport && { outlierReport: cleaningResult.outlierReport }),
            });

            return NextResponse.json({
                sessionId,
                profile: cleaningResult.profile,
                cleanedRowCount: cleaningResult.cleanedData.length,
                duplicateReport: cleaningResult.duplicateReport || null,
                outlierReport: cleaningResult.outlierReport || null,
                fileInspection: cleaningResult.fileInspection || null,
                message: 'Data cleaned successfully.'
            });
        }

        // ── ACTION: download_excel ──
        if (action === 'download_excel') {
            if (!sessionId) {
                return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
            }
            const buffer = getExcelBuffer(sessionId);
            if (!buffer) {
                return NextResponse.json({ error: 'No Excel available for this session. Run clean_data first.' }, { status: 404 });
            }
            return new Response(Buffer.from(buffer), {
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition': `attachment; filename="datos_limpios_${sessionId}.xlsx"`,
                },
            });
        }

        // ── ACTION: analyze_schema ──
        if (action === 'analyze_schema') {
            console.log(`[API] Iniciando análisis y preguntas para ${resolvedData!.length} filas.`);
            const analysisResult = await manager.processSchemaAndQuestions(resolvedData!);
            const schemaBlueprint = schemaToBlueprint(sessionId!, analysisResult.schema);
            updateSession(sessionId!, {
                schema: analysisResult.schema,
                schemaBlueprint,
                questions: analysisResult.questions
            });
            return NextResponse.json({ ...analysisResult, schemaBlueprint, sessionId });
        }

        // ── ACTION: save_schema_override ──
        if (action === 'save_schema_override') {
            if (!sessionId) {
                return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
            }

            const currentBlueprint = getSchemaBlueprint(sessionId);
            if (!currentBlueprint) {
                return NextResponse.json({ error: 'Schema blueprint not found for session.' }, { status: 404 });
            }

            const column = typeof body.column === 'string' ? body.column : '';
            const semanticRole = body.semanticRole as EnrichedSchemaField['semantic_role'] | undefined;

            if (!column || !semanticRole) {
                return NextResponse.json({ error: 'column and semanticRole are required.' }, { status: 400 });
            }

            const nextBlueprint = applyBlueprintOverride(currentBlueprint, column, semanticRole);
            const nextSchema = blueprintToSchema(nextBlueprint);
            updateSession(sessionId, { schema: nextSchema, schemaBlueprint: nextBlueprint });
            return NextResponse.json({ schema: nextSchema, schemaBlueprint: nextBlueprint, sessionId });
        }

        // ── ACTION: generate_analysis ── (Phase 2)
        if (action === 'generate_analysis') {
            if (!sessionId) {
                return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
            }
            const summaries = getSummaries(sessionId) || { 'Sistema': 'Sin resúmenes disponibles.' };
            console.log(`[API] Generando análisis narrativo (Phase 2).`);
            const result = await manager.processAnalysis(summaries);
            updateSession(sessionId, { analysis: result.analysis });
            return NextResponse.json(result);
        }

        // ── ACTION: revise_analysis ── (Phase 2 retry)
        if (action === 'revise_analysis') {
            if (!sessionId || !feedback) {
                return NextResponse.json({ error: 'sessionId and feedback required.' }, { status: 400 });
            }
            const summaries = getSummaries(sessionId) || { 'Sistema': 'Sin resúmenes disponibles.' };
            const cleanedData = getData(sessionId);
            if (!cleanedData) {
                return NextResponse.json({ error: 'No data found for session.' }, { status: 404 });
            }
            console.log(`[API] Revisando análisis con feedback del usuario (Phase 2 retry).`);
            const result = await manager.processAnalysisWithFeedback(summaries, feedback, cleanedData);
            updateSession(sessionId, { analysis: result.analysis });
            return NextResponse.json(result);
        }

        // ── ACTION: propose_visualizations ── (Phase 3)
        if (action === 'propose_visualizations') {
            if (!sessionId) {
                return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
            }
            const analysis = getAnalysis(sessionId) || 'Análisis no disponible.';
            const profile = getProfile(sessionId);
            if (!profile) {
                return NextResponse.json({ error: 'No profile found. Run clean_data first.' }, { status: 404 });
            }
            console.log(`[API] Proponiendo 3 visualizaciones (Phase 3).`);
            const result = await manager.proposeVisualizations(analysis, profile);
            updateSession(sessionId, { vizProposals: result.proposals });
            return NextResponse.json(result);
        }

        // ── ACTION: validate_viz ── (M6: feasibility check)
        if (action === 'validate_viz') {
            if (!sessionId) {
                return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
            }
            const profile = getProfile(sessionId);
            if (!profile) {
                return NextResponse.json({ error: 'No profile found. Run clean_data first.' }, { status: 404 });
            }
            const viz = body.viz;
            if (!viz) {
                return NextResponse.json({ error: 'viz object required.' }, { status: 400 });
            }
            console.log(`[API] Validando factibilidad de visualización (M6).`);
            const result = VizExpertAgent.validateFeasibility(viz, profile);
            return NextResponse.json(result);
        }

        // ── ACTION: generate_dashboard ── (Phase 3 final)
        if (action === 'generate_dashboard') {
            if (!sessionId) {
                return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
            }
            const sessionSchema = schema || getSchema(sessionId);
            if (!sessionSchema) {
                return NextResponse.json({ error: 'Schema is required.' }, { status: 400 });
            }
            console.log(`[API] Generando dashboard final con auditoría (Phase 3).`);
            const result = await manager.generateFinalDashboard(resolvedData!, sessionSchema, answers || {});
            return NextResponse.json(result);
        }

        // ── ACTION: generate_report ──
        if (action === 'generate_report') {
            console.log(`[API] Generando reporte final en base al schema y respuestas.`);
            if (!schema) {
                return NextResponse.json({ error: 'Schema is required for generating reports.' }, { status: 400 });
            }
            const reportResult = await manager.generateFinalReport(resolvedData!, schema, answers || {});
            return NextResponse.json(reportResult);
        }

        // ── ACTION: chat ──
        if (action === 'chat') {
            console.log(`[API] Procesando pregunta del usuario en chat libre.`);
            if (!question) {
                return NextResponse.json({ error: 'Question is required for chat.' }, { status: 400 });
            }
            const sessionSchema = schema || getSchema(sessionId!);
            if (!sessionSchema) {
                return NextResponse.json({ error: 'Schema is required for chat.' }, { status: 400 });
            }
            const chatResult = await manager.processChat(resolvedData!, sessionSchema, question);
            return NextResponse.json(chatResult);
        }

        // ── ACTION: full_pipeline ── (Analysis + Viz in one call)
        if (action === 'full_pipeline') {
            if (!sessionId) {
                return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
            }
            const summaries = getSummaries(sessionId) || { 'Sistema': 'Sin resúmenes disponibles.' };
            const profile = getProfile(sessionId);
            if (!profile) {
                return NextResponse.json({ error: 'No profile found. Run clean_data first.' }, { status: 404 });
            }
            console.log(`[API] Ejecutando full_pipeline (análisis + visualizaciones).`);
            const result = await manager.processFullPipeline(summaries, profile);
            updateSession(sessionId, { analysis: result.analysis, vizProposals: result.proposals });
            return NextResponse.json({ ...result, sessionId });
        }

        return NextResponse.json({ error: 'Invalid action provided.' }, { status: 400 });

    } catch (error: unknown) {
        console.error('[API] Error in analyze route:', error);
        const translated = translateError(error instanceof Error ? error : String(error), action);
        return NextResponse.json(
            {
                error: translated.userMessage,
                suggestion: translated.suggestion,
                technicalDetail: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
            },
            { status: 500 }
        );
    }
}
