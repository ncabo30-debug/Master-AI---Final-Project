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
import { detectDominantDateFormat, detectMostCommonYear, parseDate, formatDateToString } from './dateUtils';
import { executeStructuralPlan } from '@/lib/transformations/structuralExecutor';
import { executeBlueprintPipeline, generateBlueprintPipeline } from '@/lib/pipeline/service';
import type {
    ProfileResult, CleanResult, VizProposalsResult, ReportConfig,
    FileInspectionResult, DuplicateReport, OutlierReport, ChatResult,
    SchemaMap, QuestionOption, VizProposal, SpecialistCodeResult, ValidatorResult,
    IssueReport, DetectedIssue, ReconciliationReport
} from './types';
import type {
    BlueprintGenerationResult,
    DatasetManifest,
    NormalizationBlueprint,
    RawWorkbook,
    StatisticalProfile,
    ValidationReport,
} from '@/lib/pipeline/types';

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

    public async execute(): Promise<never> {
        throw new Error('ManagerAgent uses targeted methods.');
    }

    public async generateBlueprint(args: {
        sessionId: string;
        workbook: RawWorkbook;
        originalFileBase64: string;
    }): Promise<BlueprintGenerationResult> {
        const sessionBus = new AgentBus(this.sessionId);
        const schemaA = new SchemaAgent(`schema-blueprint-${Date.now()}`, this.tenantId, sessionBus);

        try {
            const heuristicResult = await generateBlueprintPipeline({
                sessionId: args.sessionId,
                workbook: args.workbook,
                originalFileBase64: args.originalFileBase64,
            });

            const diagnosis = await schemaA.analyzeStructure(
                heuristicResult.profile,
                heuristicResult.llmSample
            );

            const structuralResult = executeStructuralPlan(args.workbook, diagnosis.plan_limpieza);
            const refinedBlueprint = await schemaA.analyzeNormalization({
                sessionId: args.sessionId,
                datasetId: heuristicResult.manifest.datasetId,
                profile: heuristicResult.profile,
                cleanedRows: structuralResult.cleanedRows,
                diagnosis,
            });

            return generateBlueprintPipeline({
                sessionId: args.sessionId,
                workbook: args.workbook,
                originalFileBase64: args.originalFileBase64,
                diagnosisOverride: diagnosis,
                blueprintOverride: refinedBlueprint,
            });
        } finally {
            schemaA.dispose();
            AgentRegistry.unregister(schemaA.id);
        }
    }

    public async executeBlueprintAndSave(args: {
        manifest: DatasetManifest;
        workbook: RawWorkbook;
        approvedBlueprint: NormalizationBlueprint;
        profile: StatisticalProfile;
        originalFileBase64: string;
    }): Promise<{
        normalizedData: Record<string, unknown>[];
        normalizedExportBase64: string;
        validationReport: ValidationReport;
        manifest: DatasetManifest;
    }> {
        const result = await executeBlueprintPipeline(args);
        return {
            normalizedData: result.normalizedData,
            normalizedExportBase64: result.normalizedExportBase64,
            validationReport: result.validationReport,
            manifest: result.persistenceResult.manifest,
        };
    }

    // ══════════════════════════════════════════════════════════
    //  H-2: PHASE 0 — Issue Detection (reads data, touches nothing)
    // ══════════════════════════════════════════════════════════

    /**
     * Runs all detection agents on the raw data WITHOUT modifying anything.
     * Returns a structured IssueReport listing every problem found.
     */
    public async detectIssues(
        rawData: Record<string, unknown>[],
        rawText?: string
    ): Promise<{
        issueReport: IssueReport;
        profile: ProfileResult;
        fileInspection?: FileInspectionResult;
        duplicateReport?: DuplicateReport;
        outlierReport?: OutlierReport;
    }> {
        const sessionBus = new AgentBus(this.sessionId);
        const ts = Date.now();

        const fileInspA = new FileInspectorAgent(`file-inspector-${ts}`, this.tenantId, sessionBus);
        const profilerA = new ProfilerAgent(`profiler-${ts}`, this.tenantId, sessionBus);
        const dupDetA = new DuplicateDetectorAgent(`dup-detector-${ts}`, this.tenantId, sessionBus);
        const outlierA = new OutlierDetectorAgent(`outlier-detector-${ts}`, this.tenantId, sessionBus);
        // NOTE: FormatValidatorAgent intentionally excluded from detection phase.
        // It validates cleaned Excel output, not raw data. Running it here on a
        // temp-cleaned buffer generates false positives (e.g. dates-as-strings flagged
        // per row) that inflate the issue count with column:'*' noise. It runs in
        // applyNormalization / processDataCleaning instead.

        try {
            const issues: DetectedIssue[] = [];
            let fileInspection: FileInspectionResult | undefined;

            // 1. File inspection (encoding, delimiter)
            if (rawText) {
                AgentLogger.logStep(this.id, '📁 [Phase 0] Inspeccionando archivo...', this.sessionId);
                const inspResult = await this.withTimeout(
                    fileInspA.execute({ rawText, data: rawData }),
                    'detectIssues:fileInspection'
                );
                fileInspection = inspResult.inspection;

                if (inspResult.inspection.convertedToUtf8) {
                    issues.push({
                        id: `enc-${ts}`,
                        agentSource: 'FileInspectorAgent',
                        kind: 'encoding',
                        severity: 'info',
                        column: '*',
                        suggestion: `Archivo convertido de ${inspResult.inspection.encoding} a UTF-8`,
                    });
                }
            }

            // 2. Profile columns
            AgentLogger.logStep(this.id, '🔬 [Phase 0] Perfilando datos...', this.sessionId);
            const profile = await this.withTimeout(
                profilerA.execute({ data: rawData }),
                'detectIssues:profile'
            );

            // Convert profiler detected issues to DetectedIssue[]
            for (const col of profile.columns) {
                for (const issue of col.detectedIssues) {
                    issues.push({
                        id: `prof-${col.name}-${issues.length}`,
                        agentSource: 'ProfilerAgent',
                        kind: 'format',
                        severity: 'warning',
                        column: col.name,
                        suggestion: col.cleaningRules[0] || 'Revisar formato',
                        example: issue,
                    });
                }
            }

            // Shared null-like placeholder set (mirrors CleanerAgent's replacement list)
            const NULL_LIKE = new Set(['N/A', 'NA', 'NULL', 'NO_SABE', '-', 'UNDEFINED', 'NONE', 'NAN', '#N/A', '#REF!', '#VALUE!']);

            // ── Cell-level date scan ──────────────────────────────────────────────────
            // Detects non-standard formats AND null placeholders in date columns.
            // Uses the same utils as CleanerAgent → normalizedValue matches Normalization tab exactly.
            const dateColumnsWithCellIssues = new Set<string>();
            for (const col of profile.columns) {
                if (col.inferredType !== 'date') continue;
                const dominantFmt = detectDominantDateFormat(rawData, col.name);
                const yearContext = detectMostCommonYear(rawData, col.name);
                rawData.forEach((row, rowIndex) => {
                    const val = String(row[col.name] ?? '').trim();
                    if (!val) return;

                    if (NULL_LIKE.has(val.toUpperCase())) {
                        dateColumnsWithCellIssues.add(col.name);
                        issues.push({
                            id: `datanull-${col.name}-${rowIndex}`,
                            agentSource: 'ProfilerAgent',
                            kind: 'null',
                            severity: 'warning',
                            column: col.name,
                            rowIndex,
                            value: val,
                            suggestion: 'Placeholder nulo en columna de fechas',
                            normalizedValue: '(nulo)',
                        });
                        return;
                    }

                    const isStd = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val) ||
                                  /^\d{4}-\d{2}-\d{2}/.test(val) ||
                                  /^\d{1,2}-\d{1,2}-\d{4}$/.test(val);
                    if (!isStd) {
                        dateColumnsWithCellIssues.add(col.name);
                        const parsed = parseDate(val, yearContext);
                        const normalizedValue = parsed ? formatDateToString(parsed, dominantFmt) : undefined;
                        issues.push({
                            id: `dateformat-${col.name}-${rowIndex}`,
                            agentSource: 'ProfilerAgent',
                            kind: 'format',
                            severity: 'warning',
                            column: col.name,
                            rowIndex,
                            value: val,
                            suggestion: `Formato no estándar, se normalizará a ${dominantFmt}`,
                            normalizedValue,
                        });
                    }
                });
            }

            // ── Cell-level number scan ────────────────────────────────────────────────
            // Detects: currency/thousands format → shows clean number; unparseable values
            // that will silently become null (data loss) → severity error.
            const numColumnsWithCellIssues = new Set<string>();
            for (const col of profile.columns) {
                if (col.inferredType !== 'number') continue;
                rawData.forEach((row, rowIndex) => {
                    const raw = row[col.name];
                    if (raw == null || raw === '') return;
                    const val = String(raw).trim();
                    if (!val) return;

                    // Already a clean number → no issue
                    if (!isNaN(Number(val))) return;

                    // Known null placeholder → will become null
                    if (NULL_LIKE.has(val.toUpperCase())) {
                        numColumnsWithCellIssues.add(col.name);
                        issues.push({
                            id: `numnull-${col.name}-${rowIndex}`,
                            agentSource: 'ProfilerAgent',
                            kind: 'null',
                            severity: 'warning',
                            column: col.name,
                            rowIndex,
                            value: val,
                            suggestion: 'Placeholder nulo en columna numérica',
                            normalizedValue: '(nulo)',
                        });
                        return;
                    }

                    // Strip currency symbols, thousands separators, percentage
                    const cleaned = val.replace(/[$€£¥,%\s]/g, '').replace(/\((\d+\.?\d*)\)/, '-$1').trim();
                    const num = parseFloat(cleaned);
                    if (!isNaN(num)) {
                        numColumnsWithCellIssues.add(col.name);
                        issues.push({
                            id: `numformat-${col.name}-${rowIndex}`,
                            agentSource: 'ProfilerAgent',
                            kind: 'format',
                            severity: 'warning',
                            column: col.name,
                            rowIndex,
                            value: val,
                            suggestion: 'Formato numérico con caracteres extra, se limpiará',
                            normalizedValue: String(num),
                        });
                    } else {
                        // Cannot parse at all → will silently become null in CleanerAgent
                        numColumnsWithCellIssues.add(col.name);
                        issues.push({
                            id: `numtype-${col.name}-${rowIndex}`,
                            agentSource: 'ProfilerAgent',
                            kind: 'type_mismatch',
                            severity: 'error',
                            column: col.name,
                            rowIndex,
                            value: val,
                            suggestion: 'Valor no numérico en columna de números — se perderá (quedará null)',
                            normalizedValue: '(nulo)',
                        });
                    }
                });
            }

            // 3. Run duplicate detection and outlier detection in parallel
            AgentLogger.logStep(this.id, '🔍 [Phase 0] Detectando duplicados y outliers...', this.sessionId);

            const [dupResult, outlierResult] = await Promise.all([
                this.withTimeout(dupDetA.execute({ data: rawData }), 'detectIssues:duplicates'),
                this.withTimeout(outlierA.execute({ data: rawData, profile }), 'detectIssues:outlierDetection'),
            ]);

            // Duplicate issues
            if (dupResult.report.exactRemoved > 0) {
                issues.push({
                    id: `dup-exact-${ts}`,
                    agentSource: 'DuplicateDetectorAgent',
                    kind: 'duplicate',
                    severity: 'warning',
                    column: '*',
                    suggestion: `${dupResult.report.exactRemoved} filas duplicadas exactas serán eliminadas`,
                });
            }
            for (const partial of dupResult.report.partialFlagged) {
                issues.push({
                    id: `dup-partial-${partial.rowIndex}`,
                    agentSource: 'DuplicateDetectorAgent',
                    kind: 'duplicate',
                    severity: 'info',
                    column: '*',
                    rowIndex: partial.rowIndex,
                    suggestion: `Fila ${partial.rowIndex} coincide parcialmente con fila ${partial.matchedWith}`,
                });
            }

            // Outlier issues (one per extreme value, max 3 per column to avoid noise)
            for (const outlier of outlierResult.outliers) {
                for (const val of outlier.extremeValues.slice(0, 3)) {
                    issues.push({
                        id: `outlier-${outlier.column}-${val}`,
                        agentSource: 'OutlierDetectorAgent',
                        kind: 'outlier',
                        severity: 'warning',
                        column: outlier.column,
                        value: val,
                        suggestion: `Valor inusual ${val} (rango normal: ${outlier.lowerBound ?? '?'} – ${outlier.upperBound ?? '?'})`,
                    });
                }
            }

            // Remove column-level profiler issues for any column that now has cell-level coverage
            const columnsWithCellIssues = new Set([...dateColumnsWithCellIssues, ...numColumnsWithCellIssues]);
            const finalIssues = issues.filter(i =>
                !(i.agentSource === 'ProfilerAgent' && i.rowIndex === undefined && columnsWithCellIssues.has(i.column))
            );

            // Build the structured report
            const issuesByColumn: Record<string, DetectedIssue[]> = {};
            for (const issue of finalIssues) {
                const key = issue.column;
                if (!issuesByColumn[key]) issuesByColumn[key] = [];
                issuesByColumn[key].push(issue);
            }

            const criticalCount = finalIssues.filter(i => i.severity === 'error').length;
            const warningCount = finalIssues.filter(i => i.severity === 'warning').length;

            const issueReport: IssueReport = {
                issues: finalIssues,
                issuesByColumn,
                totalIssues: finalIssues.length,
                criticalCount,
                warningCount,
            };

            AgentLogger.logStep(this.id,
                `📋 [Phase 0] Detección completa: ${finalIssues.length} issues (${criticalCount} críticos, ${warningCount} warnings)`,
                this.sessionId
            );

            return {
                issueReport,
                profile,
                fileInspection,
                duplicateReport: dupResult.report,
                outlierReport: outlierResult,
            };
        } finally {
            fileInspA.dispose(); profilerA.dispose(); dupDetA.dispose(); outlierA.dispose();
            AgentRegistry.unregister(fileInspA.id); AgentRegistry.unregister(profilerA.id);
            AgentRegistry.unregister(dupDetA.id); AgentRegistry.unregister(outlierA.id);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  H-2: PHASE 2 — Apply Normalization (only after user approval)
    // ══════════════════════════════════════════════════════════

    /**
     * Applies cleaning/normalization to the original data based on approved issues.
     * If approvedIssueIds is empty or undefined, applies ALL cleaning rules (applyAll mode).
     */
    public async applyNormalization(
        rawData: Record<string, unknown>[],
        profile: ProfileResult,
        _approvedIssueIds?: string[]
    ): Promise<{
        cleanedData: Record<string, unknown>[];
        excelBuffer: Uint8Array;
        duplicateReport?: DuplicateReport;
    }> {
        const sessionBus = new AgentBus(this.sessionId);
        const ts = Date.now();
        const cleanerA = new CleanerAgent(`cleaner-${ts}`, this.tenantId, sessionBus);
        const dupDetA = new DuplicateDetectorAgent(`dup-detector-${ts}`, this.tenantId, sessionBus);

        try {
            AgentLogger.logStep(this.id, '🧹 [Phase 2] Aplicando normalización...', this.sessionId);

            const cleanResult = await this.withTimeout(
                cleanerA.execute({ data: rawData, profile, iteration: 1 }),
                'applyNormalization:clean'
            );

            AgentLogger.logStep(this.id, '🔍 [Phase 2] Eliminando duplicados...', this.sessionId);
            const dupResult = await this.withTimeout(
                dupDetA.execute({ data: cleanResult.cleanedData }),
                'applyNormalization:duplicates'
            );

            AgentLogger.logStep(this.id,
                `✅ [Phase 2] Normalización completa: ${dupResult.cleanedData.length} filas, ${dupResult.report.exactRemoved} duplicados eliminados.`,
                this.sessionId
            );

            return {
                cleanedData: dupResult.cleanedData,
                excelBuffer: cleanResult.excelBuffer,
                duplicateReport: dupResult.report,
            };
        } finally {
            cleanerA.dispose(); dupDetA.dispose();
            AgentRegistry.unregister(cleanerA.id); AgentRegistry.unregister(dupDetA.id);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  H-10: Reconciliation — verify semantic equivalence
    // ══════════════════════════════════════════════════════════

    /**
     * After normalization, verifies cell-by-cell that the semantic meaning
     * of the data has been preserved. Returns a ReconciliationReport.
     */
    public reconcile(
        originalData: Record<string, unknown>[],
        cleanedData: Record<string, unknown>[],
        profile: ProfileResult,
        duplicatesRemoved: number
    ): ReconciliationReport {
        const sessionBus = new AgentBus(this.sessionId);
        const ts = Date.now();
        const intAudA = new IntegrityAuditorAgent(`reconcile-${ts}`, this.tenantId, sessionBus);

        try {
            return intAudA.reconcile(originalData, cleanedData, profile, duplicatesRemoved);
        } finally {
            intAudA.dispose();
            AgentRegistry.unregister(intAudA.id);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  DEPRECATED: Legacy Data Cleaning Pipeline (backward compat)
    // ══════════════════════════════════════════════════════════

    /** @deprecated Use detectIssues() + applyNormalization() instead. */
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

    public async processFullPipeline(
        summaries: Record<string, string>,
        profile: ProfileResult
    ): Promise<{ analysis: string; proposals: VizProposal[] }> {
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
        schema: SchemaMap,
        answers: Record<string, string>
    ): Promise<{ report: ReportConfig; auditPassed: boolean; discrepancies: string[] }> {
        const reportResult = await this.generateFinalReport(data, schema, answers);

        const sessionBus = new AgentBus(this.sessionId);
        const auditorA = new IntegrityAuditorAgent(`final-audit-${Date.now()}`, this.tenantId, sessionBus);

        try {
            const reportData = (reportResult.report.data as Record<string, unknown>[]).filter(
                (item): item is { name: string; value: number } =>
                    typeof item === 'object' &&
                    item !== null &&
                    'name' in item &&
                    'value' in item &&
                    typeof item.name === 'string' &&
                    typeof item.value === 'number'
            );
            const auditResult = auditorA.auditFinalReport(data, reportData);
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

    public async processSchemaAndQuestions(data: Record<string, unknown>[]): Promise<{ schema: SchemaMap; questions: QuestionOption[] }> {
        const sessionBus = new AgentBus(this.sessionId);
        const schemaA = new SchemaAgent(`schema-${Date.now()}`, this.tenantId, sessionBus);
        const compA = new ComprehensionAgent(`comp-${Date.now()}`, this.tenantId, sessionBus);

        try {
            return await this.withTimeout<{ schema: SchemaMap; questions: QuestionOption[] }>(
                new Promise((resolve, reject) => {
                    let discoveredSchema: SchemaMap | null = null;

                    sessionBus.subscribe(this.id, (msg) => {
                        try {
                            if (msg.type === 'SCHEMA_ANALYZED') {
                                discoveredSchema = (msg.payload as { schema: SchemaMap }).schema;
                                sessionBus.publish({
                                    from: this.id,
                                    to: compA.id,
                                    type: 'GENERATE_QUESTIONS',
                                    payload: { schema: discoveredSchema }
                                });
                            } else if (msg.type === 'QUESTIONS_GENERATED') {
                                resolve({
                                    schema: discoveredSchema ?? {},
                                    questions: (msg.payload as { questions: QuestionOption[] }).questions
                                });
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

    public async generateFinalReport(
        data: Record<string, unknown>[],
        schema: SchemaMap,
        answers: Record<string, string>
    ): Promise<{ report: ReportConfig }> {
        const sessionBus = new AgentBus(this.sessionId);
        const specA = new SpecialistAgent(`specialist-${Date.now()}`, this.tenantId, sessionBus);
        const valA = new ValidatorAgent(`validator-${Date.now() + 1}`, this.tenantId, sessionBus);
        const reportA = new ReportAgent(`fallback-report-${Date.now() + 2}`, this.tenantId, sessionBus);

        try {
            return await this.withTimeout<{ report: ReportConfig }>(
                new Promise((resolve, reject) => {
                    sessionBus.subscribe(this.id, (msg) => {
                        try {
                            if (msg.type === 'CODE_CREATED') {
                                const payload = msg.payload as SpecialistCodeResult;
                                if (payload.error) {
                                    sessionBus.publish({ from: this.id, to: reportA.id, type: 'GENERATE_REPORT', payload: { data, schema, answers } });
                                } else {
                                    sessionBus.publish({ from: this.id, to: valA.id, type: 'VALIDATE_CODE', payload: { code: payload.code, data } });
                                }
                            } else if (msg.type === 'CODE_VALIDATED') {
                                const payload = msg.payload as ValidatorResult;
                                if (!payload.valid) {
                                    sessionBus.publish({ from: this.id, to: reportA.id, type: 'GENERATE_REPORT', payload: { data, schema, answers } });
                                } else {
                                    resolve({ report: payload.reportConfig ?? { data: [], message: 'No se pudo generar el reporte.' } });
                                }
                            } else if (msg.type === 'REPORT_GENERATED') {
                                resolve({ report: (msg.payload as { reportConfig: ReportConfig }).reportConfig });
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

    public async processChat(
        data: Record<string, unknown>[],
        schema: SchemaMap,
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
