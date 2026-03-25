import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProfileResult, VizProposal, FileInspectionResult, DuplicateReport, OutlierReport, SchemaMap, QuestionOption, SchemaBlueprint, IssueReport } from './agents/types';
import type {
    DatasetManifest,
    NormalizationBlueprint,
    RawWorkbook,
    StatisticalProfile,
    ValidationReport,
} from './pipeline/types';

interface StoredSession {
    /** Original data — written once on first upload, NEVER overwritten. */
    originalData: Record<string, unknown>[];
    /** Cleaned/normalized data — initially equal to originalData, updated by storeCleaningResult(). */
    cleanedData: Record<string, unknown>[];
    normalizedData?: Record<string, unknown>[];
    excelBufferBase64?: string;
    normalizedExportBase64?: string;
    profile?: ProfileResult;
    statisticalProfile?: StatisticalProfile;
    schema?: SchemaMap;
    schemaBlueprint?: SchemaBlueprint;
    draftBlueprint?: NormalizationBlueprint;
    approvedBlueprint?: NormalizationBlueprint;
    questions?: QuestionOption[];
    analysis?: string;
    vizProposals?: VizProposal[];
    summaries?: Record<string, string>;
    fileInspection?: FileInspectionResult;
    originalDataSnapshot?: Record<string, unknown>[];
    duplicateReport?: DuplicateReport;
    outlierReport?: OutlierReport;
    issueReport?: IssueReport;
    workbook?: RawWorkbook;
    manifest?: DatasetManifest;
    originalFileBase64?: string;
    normalizedPreview?: Record<string, unknown>[];
    validationReport?: ValidationReport;
    persistenceStatus?: string;
    ts: number;
}

const SESSION_DIR = path.join(os.tmpdir(), 'datalens_sessions');
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL for disk

function toLegacyProfile(profile: StatisticalProfile): ProfileResult {
    return {
        columns: profile.columns.map((column) => ({
            name: column.name,
            inferredType: column.inferredType,
            detectedIssues: [],
            cleaningRules: [],
        })),
        quantitative: {
            rowCount: profile.rowCount,
            colCount: profile.columnCount,
            columns: profile.columns.map((column) => ({
                name: column.name,
                type: column.inferredType,
                nullCount: Math.round(column.nullRatio * profile.rowCount),
                uniqueCount: column.uniqueCount,
                ...(column.numericSummary && {
                    sum: column.numericSummary.sum,
                    avg: column.numericSummary.avg,
                    min: column.numericSummary.min,
                    max: column.numericSummary.max,
                }),
                ...(column.dateSummary && {
                    dateMin: column.dateSummary.min,
                    dateMax: column.dateSummary.max,
                }),
            })),
        },
    };
}

function ensureDir() {
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
}

function getSessionFile(sessionId: string): string {
    ensureDir();
    return path.join(SESSION_DIR, `${sessionId}.json`);
}

function readSession(sessionId: string): StoredSession | null {
    const file = getSessionFile(sessionId);
    if (!fs.existsSync(file)) return null;
    try {
        const raw = fs.readFileSync(file, 'utf-8');
        const session = JSON.parse(raw) as StoredSession;
        if (Date.now() - session.ts > TTL_MS) {
            fs.unlinkSync(file);
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

function writeSession(sessionId: string, data: StoredSession): void {
    const file = getSessionFile(sessionId);
    fs.writeFileSync(file, JSON.stringify(data), 'utf-8');
}

/**
 * H-1: Stores raw data. Sets both originalData (immutable) and cleanedData (initially equal).
 * If the session already has originalData, it is preserved — only cleanedData is refreshed.
 */
export function storeData(sessionId: string, data: Record<string, unknown>[]): string {
    const existing = readSession(sessionId);
    writeSession(sessionId, {
        originalData: existing?.originalData || data, // never overwrite original
        cleanedData: data,
        normalizedData: existing?.normalizedData || data,
        excelBufferBase64: existing?.excelBufferBase64,
        normalizedExportBase64: existing?.normalizedExportBase64,
        profile: existing?.profile,
        statisticalProfile: existing?.statisticalProfile,
        schema: existing?.schema,
        schemaBlueprint: existing?.schemaBlueprint,
        draftBlueprint: existing?.draftBlueprint,
        approvedBlueprint: existing?.approvedBlueprint,
        questions: existing?.questions,
        issueReport: existing?.issueReport,
        workbook: existing?.workbook,
        manifest: existing?.manifest,
        originalFileBase64: existing?.originalFileBase64,
        normalizedPreview: existing?.normalizedPreview,
        validationReport: existing?.validationReport,
        persistenceStatus: existing?.persistenceStatus,
        ts: Date.now()
    });
    return sessionId;
}

/**
 * H-1: Updates only cleanedData + excel + profile. Never touches originalData.
 */
export function storeCleaningResult(
    sessionId: string,
    cleanedData: Record<string, unknown>[],
    excelBuffer: Uint8Array,
    profile: ProfileResult
): void {
    const existing = readSession(sessionId);
    const base64Buffer = Buffer.from(excelBuffer).toString('base64');

    writeSession(sessionId, {
        ...(existing || { originalData: cleanedData, cleanedData }),
        cleanedData,
        normalizedData: cleanedData,
        excelBufferBase64: base64Buffer,
        profile,
        ts: Date.now()
    });
}

/** Returns cleaned data (post-normalization). All analysis agents read this. */
export function getData(sessionId: string): Record<string, unknown>[] | null {
    const session = readSession(sessionId);
    if (!session) return null;
    session.ts = Date.now();
    writeSession(sessionId, session);
    return session.normalizedData || session.cleanedData;
}

/** H-1: Returns the original, immutable data as uploaded by the user. */
export function getOriginalData(sessionId: string): Record<string, unknown>[] | null {
    const session = readSession(sessionId);
    if (!session) return null;
    return session.originalData;
}

export function getExcelBuffer(sessionId: string): Uint8Array | null {
    const session = readSession(sessionId);
    if (!session || !session.excelBufferBase64) return null;
    return new Uint8Array(Buffer.from(session.excelBufferBase64, 'base64'));
}

export function getProfile(sessionId: string): ProfileResult | null {
    return readSession(sessionId)?.profile || null;
}

export function getSchema(sessionId: string): SchemaMap | null {
    return readSession(sessionId)?.schema || null;
}

export function getSchemaBlueprint(sessionId: string): SchemaBlueprint | null {
    return readSession(sessionId)?.schemaBlueprint || null;
}

/** H-5: Stores the issue report produced by detectIssues(). */
export function storeIssueReport(sessionId: string, issueReport: IssueReport): void {
    const session = readSession(sessionId);
    if (!session) return;
    writeSession(sessionId, { ...session, issueReport, ts: Date.now() });
}

/** H-5: Retrieves the stored issue report. */
export function getIssueReport(sessionId: string): IssueReport | null {
    return readSession(sessionId)?.issueReport || null;
}

export function clearData(sessionId: string): void {
    const file = getSessionFile(sessionId);
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
}

export function generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function updateSession(sessionId: string, updates: Partial<Omit<StoredSession, 'ts'>>): void {
    const session = readSession(sessionId);
    if (!session) return;
    writeSession(sessionId, { ...session, ...updates, ts: Date.now() });
}

export function getAnalysis(sessionId: string): string | null {
    return readSession(sessionId)?.analysis || null;
}

export function getVizProposals(sessionId: string): VizProposal[] | null {
    return readSession(sessionId)?.vizProposals || null;
}

export function getSummaries(sessionId: string): Record<string, string> | null {
    return readSession(sessionId)?.summaries || null;
}

export function storeBlueprintSession(args: {
    sessionId: string;
    workbook: RawWorkbook;
    manifest: DatasetManifest;
    originalData: Record<string, unknown>[];
    statisticalProfile: StatisticalProfile;
    draftBlueprint: NormalizationBlueprint;
    schema: SchemaMap;
    normalizedPreview: Record<string, unknown>[];
    originalFileBase64: string;
}): void {
    const existing = readSession(args.sessionId);
    writeSession(args.sessionId, {
        ...(existing || { originalData: args.originalData, cleanedData: args.originalData }),
        originalData: existing?.originalData || args.originalData,
        cleanedData: args.originalData,
        normalizedData: existing?.normalizedData || args.originalData,
        workbook: args.workbook,
        manifest: args.manifest,
        originalFileBase64: args.originalFileBase64,
        statisticalProfile: args.statisticalProfile,
        profile: toLegacyProfile(args.statisticalProfile),
        draftBlueprint: args.draftBlueprint,
        schema: args.schema,
        normalizedPreview: args.normalizedPreview,
        ts: Date.now(),
    });
}

export function storeNormalizedExecution(args: {
    sessionId: string;
    approvedBlueprint: NormalizationBlueprint;
    normalizedData: Record<string, unknown>[];
    normalizedPreview: Record<string, unknown>[];
    normalizedExportBase64: string;
    validationReport: ValidationReport;
    manifest: DatasetManifest;
}): void {
    const existing = readSession(args.sessionId);
    if (!existing) return;

    writeSession(args.sessionId, {
        ...existing,
        approvedBlueprint: args.approvedBlueprint,
        normalizedData: args.normalizedData,
        cleanedData: args.normalizedData,
        normalizedPreview: args.normalizedPreview,
        normalizedExportBase64: args.normalizedExportBase64,
        validationReport: args.validationReport,
        manifest: args.manifest,
        profile: existing.profile || (existing.statisticalProfile ? toLegacyProfile(existing.statisticalProfile) : existing.profile),
        persistenceStatus: args.validationReport.valid ? 'ready' : 'validation_failed',
        ts: Date.now(),
    });
}

export function getWorkbook(sessionId: string): RawWorkbook | null {
    return readSession(sessionId)?.workbook || null;
}

export function getManifest(sessionId: string): DatasetManifest | null {
    return readSession(sessionId)?.manifest || null;
}

export function getStatisticalProfile(sessionId: string): StatisticalProfile | null {
    return readSession(sessionId)?.statisticalProfile || null;
}

export function getDraftBlueprint(sessionId: string): NormalizationBlueprint | null {
    return readSession(sessionId)?.draftBlueprint || null;
}

export function getApprovedBlueprint(sessionId: string): NormalizationBlueprint | null {
    return readSession(sessionId)?.approvedBlueprint || null;
}

export function getOriginalFileBase64(sessionId: string): string | null {
    return readSession(sessionId)?.originalFileBase64 || null;
}

export function getNormalizedPreview(sessionId: string): Record<string, unknown>[] | null {
    return readSession(sessionId)?.normalizedPreview || null;
}

export function getValidationReport(sessionId: string): ValidationReport | null {
    return readSession(sessionId)?.validationReport || null;
}

export function getNormalizedExportBase64(sessionId: string): string | null {
    return readSession(sessionId)?.normalizedExportBase64 || null;
}
