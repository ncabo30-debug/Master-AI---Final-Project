import { AgentBus } from './core/AgentBus';
import { AgentBase } from './core/AgentBase';
import { AgentRegistry } from './core/AgentRegistry';
import { AgentLogger } from './core/AgentLogger';
import { SchemaAgent } from './SchemaAgent';
import { ComprehensionAgent } from './ComprehensionAgent';
import { ReportAgent } from './ReportAgent';
import { ChatAgent } from './ChatAgent';
import { SpecialistAgent } from './SpecialistAgent';
import { ValidatorAgent } from './ValidatorAgent';
import { ProfilerAgent } from './ProfilerAgent';
import { CleanerAgent } from './CleanerAgent';
import { FormatValidatorAgent } from './FormatValidatorAgent';
import { IntegrityAuditorAgent } from './IntegrityAuditorAgent';
import { AnalystAgent } from './AnalystAgent';
import { VizExpertAgent } from './VizExpertAgent';
import { FileInspectorAgent } from './FileInspectorAgent';
import { DuplicateDetectorAgent } from './DuplicateDetectorAgent';
import { OutlierDetectorAgent } from './OutlierDetectorAgent';
import { LLM_TIMEOUT_MS } from './core/LLMService';
import type {
    ProfileResult, CleanResult, VizProposalsResult, FinalAuditResult,
    ReportConfig, FileInspectionResult, DuplicateReport, OutlierReport, ChatResult
} from './types';

/**
 * Orchestrator agent. Spins up child agents in isolated session buses,
 * coordinates message passing, and resolves/rejects the parent HTTP promise.
 *
 * SAFETY: Every Promise has a ceiling timeout and a `finally` block
 * that unregisters all child agents to prevent memory leaks.
 */
export class ManagerAgent extends AgentBase {
    /** Maximum time (ms) we'll wait for an entire orchestration round before rejecting. */
    private static readonly ORCHESTRATION_TIMEOUT = LLM_TIMEOUT_MS + 60_000;

    /** Session ID for scoping logs and bus history */
    private sessionId: string;

    constructor(id: string, tenantId: string, bus: AgentBus, sessionId: string = 'default') {
        super(id, 'manager', tenantId, bus);
        this.sessionId = sessionId;
        AgentRegistry.register(this);
    }

    protected handleMessage(): void { /* Manager is not message-driven */ }

    public async execute(): Promise<any> {
        throw new Error('ManagerAgent uses targeted methods.');
    }

    // ── Data Cleaning Pipeline ─────────────────────────────────

    public async processDataCleaning(
        rawData: Record<string, unknown>[],
        rawText?: string
    ): Promise<{
        cleanedData: Record<string, unknown>[];
        excelBuffer: Uint8Array;
        profile: ProfileResult;
        fileInspection?: FileInspectionResult;
        originalSnapshot?: Record<string, unknown>[];
        duplicateReport?: DuplicateReport;
        outlierReport?: OutlierReport;
    }> {
        const MAX_ITERATIONS = 3;
        const sessionBus = new AgentBus(this.sessionId);
        const ts = Date.now();

        const fileInspA = new FileInspectorAgent(`file-inspector-${ts}`, this.tenantId, sessionBus);
        const profilerA = new ProfilerAgent(`profiler-${ts}`, this.tenantId, sessionBus);
        const cleanerA = new CleanerAgent(`cleaner-${ts}`, this.tenantId, sessionBus);
        const dupDetA = new DuplicateDetectorAgent(`dup-detector-${ts}`, this.tenantId, sessionBus);
        const fmtValA = new FormatValidatorAgent(`fmt-validator-${ts}`, this.tenantId, sessionBus);
        const outlierA = new OutlierDetectorAgent(`outlier-detector-${ts}`, this.tenantId, sessionBus);
        const intAudA = new IntegrityAuditorAgent(`integrity-${ts}`, this.tenantId, sessionBus);

        try {
            let fileInspection: FileInspectionResult | undefined;
            let originalSnapshot: Record<string, unknown>[] | undefined;

            if (rawText) {
                AgentLogger.logStep(this.id, '📁 Inspeccionando archivo (encoding, delimitador, backup)...', this.sessionId);
                const inspResult = await this.withTimeout(
                    fileInspA.execute({ rawText, data: rawData }),
                    'processDataCleaning:fileInspection'
                );
                fileInspection = inspResult.inspection;
                originalSnapshot = inspResult.originalSnapshot;
                AgentLogger.logStep(this.id, `📁 Encoding: ${fileInspection.encoding}, Delimitador: '${fileInspection.delimiter}', Hash: ${fileInspection.originalHash.substring(0, 12)}...`, this.sessionId);
            }

            AgentLogger.logStep(this.id, '🔬 Perfilando datos (textual + cuantitativo)...', this.sessionId);
            const profile = await this.withTimeout(
                profilerA.execute({ data: rawData }),
                'processDataCleaning:profile'
            );
            AgentLogger.logStep(this.id, `🔬 Perfiladas ${profile.columns.length} columnas, ${profile.quantitative?.rowCount || rawData.length} filas.`, this.sessionId);

            let previousErrors: string[] = [];
            let lastCleanResult: CleanResult | null = null;
            let duplicateReport: DuplicateReport | undefined;
            let outlierReport: OutlierReport | undefined;

            for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
                AgentLogger.logStep(this.id, `🧹 Limpieza iteración ${iteration}/${MAX_ITERATIONS}...`, this.sessionId);

                const cleanResult = await this.withTimeout(
                    cleanerA.execute({
                        data: rawData,
                        profile,
                        previousErrors: previousErrors.length > 0 ? previousErrors : undefined,
                        iteration
                    }),
                    `processDataCleaning:clean-iter-${iteration}`
                );

                AgentLogger.logStep(this.id, `🔍 Detectando duplicados (iter ${iteration})...`, this.sessionId);
                const dupResult = await this.withTimeout(
                    dupDetA.execute({ data: cleanResult.cleanedData }),
                    `processDataCleaning:duplicates-iter-${iteration}`
                );
                duplicateReport = dupResult.report;
                const dataAfterDedup = dupResult.cleanedData;
                lastCleanResult = { ...cleanResult, cleanedData: dataAfterDedup };

                AgentLogger.logStep(this.id, `✅ Validación paralela (iter ${iteration})...`, this.sessionId);
                const [formatResult, outlierResult, integrityResult] = await Promise.all([
                    this.withTimeout(
                        fmtValA.execute({ excelBuffer: cleanResult.excelBuffer, profile }),
                        `processDataCleaning:formatValidation-iter-${iteration}`
                    ),
                    this.withTimeout(
                        outlierA.execute({ data: dataAfterDedup, profile }),
                        `processDataCleaning:outlierDetection-iter-${iteration}`
                    ),
                    this.withTimeout(
                        intAudA.execute({ rawData, cleanedData: dataAfterDedup }),
                        `processDataCleaning:integrityAudit-iter-${iteration}`
                    )
                ]);

                outlierReport = outlierResult;

                if (formatResult.valid && integrityResult.valid) {
                    AgentLogger.logStep(this.id, `✅ Limpieza exitosa en iteración ${iteration}.`, this.sessionId);
                    return {
                        cleanedData: dataAfterDedup,
                        excelBuffer: cleanResult.excelBuffer,
                        profile,
                        fileInspection,
                        originalSnapshot,
                        duplicateReport,
                        outlierReport
                    };
                }

                previousErrors = [...formatResult.errors, ...integrityResult.errors];
                AgentLogger.logStep(this.id, `❌ Iteración ${iteration} falló: ${previousErrors.join(' | ')}`, this.sessionId);
            }

            AgentLogger.logStep(this.id, `⚠️ Máx iteraciones alcanzadas. Retornando mejor resultado.`, this.sessionId);
            return {
                cleanedData: lastCleanResult!.cleanedData,
                excelBuffer: lastCleanResult!.excelBuffer,
                profile,
                fileInspection,
                originalSnapshot,
                duplicateReport,
                outlierReport
            };
        } finally {
            fileInspA.dispose(); profilerA.dispose(); cleanerA.dispose();
            dupDetA.dispose(); fmtValA.dispose(); outlierA.dispose(); intAudA.dispose();
            AgentRegistry.unregister(fileInspA.id); AgentRegistry.unregister(profilerA.id);
            AgentRegistry.unregister(cleanerA.id); AgentRegistry.unregister(dupDetA.id);
            AgentRegistry.unregister(fmtValA.id); AgentRegistry.unregister(outlierA.id);
            AgentRegistry.unregister(intAudA.id);
        }
    }

    // ── Phase 2: Analysis Pipeline ──────────────────────────────

    public async processAnalysis(summaries: Record<string, string>): Promise<{ analysis: string }> {
        const sessionBus = new AgentBus(this.sessionId);
        const analystA = new AnalystAgent(`analyst-${Date.now()}`, this.tenantId, sessionBus);

        try {
            const result = await this.withTimeout(
                analystA.execute({ summaries }),
                'processAnalysis'
            );
            return result;
        } finally {
            analystA.dispose();
            AgentRegistry.unregister(analystA.id);
        }
    }

    public async processAnalysisWithFeedback(
        summaries: Record<string, string>,
        feedback: string,
        cleanedData: Record<string, unknown>[]
    ): Promise<{ analysis: string }> {
        const sessionBus = new AgentBus(this.sessionId);
        const analystA = new AnalystAgent(`analyst-${Date.now()}`, this.tenantId, sessionBus);
        const auditorA = new IntegrityAuditorAgent(`auditor-${Date.now()}`, this.tenantId, sessionBus);

        try {
            const verifiedFeedback = auditorA.verifyAnalysisClaim(cleanedData, feedback);
            const result = await this.withTimeout(
                analystA.execute({ summaries, previousFeedback: verifiedFeedback }),
                'processAnalysisWithFeedback'
            );
            return result;
        } finally {
            analystA.dispose(); auditorA.dispose();
            AgentRegistry.unregister(analystA.id);
            AgentRegistry.unregister(auditorA.id);
        }
    }

    // ── Phase 3: Visualization Pipeline ────────────────────────

    public async proposeVisualizations(
        analysis: string,
        profile: ProfileResult
    ): Promise<VizProposalsResult> {
        const sessionBus = new AgentBus(this.sessionId);
        const vizA = new VizExpertAgent(`viz-expert-${Date.now()}`, this.tenantId, sessionBus);

        try {
            const result = await this.withTimeout(
                vizA.execute({ analysis, profile }),
                'proposeVisualizations'
            );
            return result;
        } finally {
            vizA.dispose();
            AgentRegistry.unregister(vizA.id);
        }
    }

    // ── Full Pipeline (Mejora 2): Analysis → Visualizations ──────

    /**
     * Runs Analysis + Visualization in sequence server-side.
     * The frontend only needs to trigger once after cleaning completes.
     */
    public async processFullPipeline(
        summaries: Record<string, string>,
        profile: ProfileResult
    ): Promise<{ analysis: string; proposals: any[] }> {
        AgentLogger.logStep(this.id, '📝 Generando análisis narrativo...', this.sessionId);
        const analysisResult = await this.processAnalysis(summaries);

        AgentLogger.logStep(this.id, '📊 Proponiendo visualizaciones...', this.sessionId);
        const vizResult = await this.proposeVisualizations(analysisResult.analysis, profile);

        AgentLogger.logStep(this.id, '✅ Pipeline completo (análisis + visualizaciones).', this.sessionId);
        return {
            analysis: analysisResult.analysis,
            proposals: vizResult.proposals
        };
    }

    // ── Dashboard Generation ──────────────────────────────────

    public async generateFinalDashboard(
        data: Record<string, unknown>[],
        schema: any,
        answers: Record<string, string>
    ): Promise<{ report: ReportConfig; auditPassed: boolean; discrepancies: string[] }> {
        const reportResult = await this.generateFinalReport(data, schema, answers);

        const sessionBus = new AgentBus(this.sessionId);
        const auditorA = new IntegrityAuditorAgent(`final-audit-${Date.now()}`, this.tenantId, sessionBus);

        try {
            const auditResult = auditorA.auditFinalReport(data, reportResult.report.data || []);
            return {
                report: reportResult.report,
                auditPassed: auditResult.passed,
                discrepancies: auditResult.discrepancies
            };
        } finally {
            auditorA.dispose();
            AgentRegistry.unregister(auditorA.id);
        }
    }

    // ── Schema Analysis Pipeline ──────────────────────────────

    public async processSchemaAndQuestions(data: any[]): Promise<{ schema: any; questions: any[] }> {
        const sessionBus = new AgentBus(this.sessionId);
        const schemaA = new SchemaAgent(`schema-${Date.now()}`, this.tenantId, sessionBus);
        const compA = new ComprehensionAgent(`comp-${Date.now()}`, this.tenantId, sessionBus);

        try {
            return await this.withTimeout<{ schema: any; questions: any[] }>(
                new Promise((resolve, reject) => {
                    let discoveredSchema: any = null;

                    sessionBus.subscribe(this.id, (msg) => {
                        try {
                            if (msg.type === 'SCHEMA_ANALYZED') {
                                discoveredSchema = msg.payload.schema;
                                sessionBus.publish({
                                    from: this.id,
                                    to: compA.id,
                                    type: 'GENERATE_QUESTIONS',
                                    payload: { schema: discoveredSchema }
                                });
                            } else if (msg.type === 'QUESTIONS_GENERATED') {
                                resolve({ schema: discoveredSchema, questions: msg.payload.questions });
                            }
                        } catch (err) {
                            reject(err);
                        }
                    });

                    sessionBus.publish({
                        from: this.id,
                        to: schemaA.id,
                        type: 'ANALYZE_SCHEMA',
                        payload: { data }
                    });
                }),
                'processSchemaAndQuestions'
            );
        } finally {
            schemaA.dispose(); compA.dispose();
            AgentRegistry.unregister(schemaA.id);
            AgentRegistry.unregister(compA.id);
        }
    }

    public async generateFinalReport(data: any[], schema: any, answers: any): Promise<{ report: any }> {
        const sessionBus = new AgentBus(this.sessionId);
        const specA = new SpecialistAgent(`specialist-${Date.now()}`, this.tenantId, sessionBus);
        const valA = new ValidatorAgent(`validator-${Date.now() + 1}`, this.tenantId, sessionBus);
        const reportA = new ReportAgent(`fallback-report-${Date.now() + 2}`, this.tenantId, sessionBus);

        try {
            return await this.withTimeout<{ report: any }>(
                new Promise((resolve, reject) => {
                    sessionBus.subscribe(this.id, (msg) => {
                        try {
                            if (msg.type === 'CODE_CREATED') {
                                if (msg.payload.error) {
                                    sessionBus.publish({ from: this.id, to: reportA.id, type: 'GENERATE_REPORT', payload: { data, schema, answers } });
                                } else {
                                    sessionBus.publish({ from: this.id, to: valA.id, type: 'VALIDATE_CODE', payload: { code: msg.payload.code, data } });
                                }
                            } else if (msg.type === 'CODE_VALIDATED') {
                                if (!msg.payload.valid) {
                                    sessionBus.publish({ from: this.id, to: reportA.id, type: 'GENERATE_REPORT', payload: { data, schema, answers } });
                                } else {
                                    resolve({ report: msg.payload.reportConfig });
                                }
                            } else if (msg.type === 'REPORT_GENERATED') {
                                resolve({ report: msg.payload.reportConfig });
                            }
                        } catch (err) {
                            reject(err);
                        }
                    });

                    sessionBus.publish({
                        from: this.id,
                        to: specA.id,
                        type: 'CREATE_CODE',
                        payload: { schema, answers }
                    });
                }),
                'generateFinalReport'
            );
        } finally {
            specA.dispose(); valA.dispose(); reportA.dispose();
            AgentRegistry.unregister(specA.id);
            AgentRegistry.unregister(valA.id);
            AgentRegistry.unregister(reportA.id);
        }
    }

    // ── Chat with SQL ──────────────────────────────────────────

    /**
     * Answer a free-form chat question. ChatAgent now receives both
     * schema and data for SQL-based answering.
     */
    public async processChat(
        data: any[],
        schema: any,
        question: string
    ): Promise<ChatResult> {
        const sessionBus = new AgentBus(this.sessionId);
        const chatA = new ChatAgent(`chat-${Date.now()}`, this.tenantId, sessionBus);

        try {
            return await this.withTimeout<ChatResult>(
                new Promise((resolve, reject) => {
                    sessionBus.subscribe(this.id, (msg) => {
                        try {
                            if (msg.type === 'CHAT_ANSWERED') {
                                resolve(msg.payload as ChatResult);
                            }
                        } catch (err) {
                            reject(err);
                        }
                    });

                    sessionBus.publish({
                        from: this.id,
                        to: chatA.id,
                        type: 'ANSWER_CHAT_QUESTION',
                        payload: { schema, question, data }
                    });
                }),
                'processChat'
            );
        } finally {
            chatA.dispose();
            AgentRegistry.unregister(chatA.id);
        }
    }

    // ── Helpers ──────────────────────────────────────────────

    private withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`[ManagerAgent] ${label} exceeded the orchestration timeout of ${ManagerAgent.ORCHESTRATION_TIMEOUT}ms.`));
            }, ManagerAgent.ORCHESTRATION_TIMEOUT);

            promise
                .then((val) => { clearTimeout(timer); resolve(val); })
                .catch((err) => { clearTimeout(timer); reject(err); });
        });
    }
}
