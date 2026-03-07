/**
 * Shared TypeScript interfaces for the DataLens AI agent ecosystem.
 *
 * These types replace the `any` annotations and provide compile-time
 * safety for data flowing between agents and the API layer.
 */

// ── Schema ────────────────────────────────────────────────

export interface BasicSchemaField {
    type: 'number' | 'string' | 'date';
}

export interface EnrichedSchemaField extends BasicSchemaField {
    semantic_role: 'metric' | 'dimension' | 'timeline' | 'id';
    domain: string;
    analysis_variables: string[];
}

/** A schema can be basic (string values) or enriched (object values). */
export type SchemaMap = Record<string, string | EnrichedSchemaField>;

// ── Agent Results ─────────────────────────────────────────

export interface SchemaResult {
    schema: SchemaMap;
}

export interface QuestionOption {
    id: string;
    text: string;
    options: string[];
}

export interface ComprehensionResult {
    questions: QuestionOption[];
}

export interface ReportConfig {
    type?: string;
    title?: string;
    xAxis?: string;
    yAxis?: string;
    data: Array<{ name: string; value: number }>;
    message?: string;
}

export interface ReportResult {
    report: ReportConfig;
}

export interface ChatResult {
    answer: string;
    sql?: string;
    queryResult?: Record<string, unknown>[];
}

export interface SpecialistCodeResult {
    code?: string;
    error?: string;
}

export interface ValidatorResult {
    valid: boolean;
    reportConfig?: ReportConfig;
    error?: string;
}

// ── Data Cleaning Pipeline ────────────────────────────────

export interface ProfileColumnInfo {
    name: string;
    inferredType: 'string' | 'number' | 'date' | 'boolean';
    detectedIssues: string[];
    cleaningRules: string[];
}

export interface ProfileResult {
    columns: ProfileColumnInfo[];
    quantitative?: QuantitativeProfile;
}

export interface CleanResult {
    cleanedData: Record<string, unknown>[];
    excelBuffer: Uint8Array;
    appliedRules: string[];
}

export interface FormatValidationResult {
    valid: boolean;
    errors: string[];
}

export interface IntegrityResult {
    valid: boolean;
    rowCountMatch: boolean;
    columnCountMatch: boolean;
    errors: string[];
}

// ── M2+M7: File Inspection & Backup ──────────────────────

export interface FileInspectionResult {
    encoding: string;
    delimiter: string;
    confidence: number;
    originalHash: string;
    convertedToUtf8: boolean;
}

// ── M3: Quantitative Profiling ───────────────────────────

export interface QuantitativeColumnProfile {
    name: string;
    type: string;
    nullCount: number;
    uniqueCount: number;
    sum?: number;
    avg?: number;
    min?: number;
    max?: number;
    dateMin?: string;
    dateMax?: string;
}

export interface QuantitativeProfile {
    rowCount: number;
    colCount: number;
    columns: QuantitativeColumnProfile[];
}

// ── M1: Duplicate Detection ──────────────────────────────

export interface DuplicateReport {
    exactRemoved: number;
    partialFlagged: { rowIndex: number; matchedWith: number }[];
    flaggedRows: number[];
}

// ── M4: Outlier Detection ────────────────────────────────

export interface OutlierColumnReport {
    column: string;
    count: number;
    extremeValues: (number | string)[];
    lowerBound?: number;
    upperBound?: number;
}

export interface OutlierReport {
    outliers: OutlierColumnReport[];
}

// ── M6: Viz Feasibility ──────────────────────────────────

export interface VizFeasibilityResult {
    feasible: boolean;
    issues: string[];
}

// ── Phase 2: Analysis ─────────────────────────────────────

export interface AnalysisResult {
    analysis: string;
}

// ── Phase 3: Visualization ────────────────────────────────

export interface VizProposal {
    id: string;
    title: string;
    description: string;
    chartType: 'bar' | 'line' | 'scatter' | 'pie' | 'area' | 'heatmap';
    xAxis: string;
    yAxis: string;
    groupBy?: string;
    filters?: string[];
}

export interface VizProposalsResult {
    proposals: VizProposal[];
}

export interface FinalAuditResult {
    passed: boolean;
    discrepancies: string[];
}
