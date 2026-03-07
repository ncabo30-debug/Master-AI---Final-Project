import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProfileResult, VizProposal, FileInspectionResult, DuplicateReport, OutlierReport, SchemaMap, QuestionOption } from './agents/types';

interface StoredSession {
    data: Record<string, unknown>[];
    excelBufferBase64?: string;
    profile?: ProfileResult;
    schema?: SchemaMap;
    questions?: QuestionOption[];
    analysis?: string;
    vizProposals?: VizProposal[];
    summaries?: Record<string, string>;
    fileInspection?: FileInspectionResult;
    originalDataSnapshot?: Record<string, unknown>[];
    duplicateReport?: DuplicateReport;
    outlierReport?: OutlierReport;
    ts: number;
}

const SESSION_DIR = path.join(os.tmpdir(), 'datalens_sessions');
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL for disk

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

export function storeData(sessionId: string, data: Record<string, unknown>[]): string {
    const existing = readSession(sessionId);
    writeSession(sessionId, {
        data,
        excelBufferBase64: existing?.excelBufferBase64,
        profile: existing?.profile,
        schema: existing?.schema,
        questions: existing?.questions,
        ts: Date.now()
    });
    return sessionId;
}

export function storeCleaningResult(
    sessionId: string,
    cleanedData: Record<string, unknown>[],
    excelBuffer: Uint8Array,
    profile: ProfileResult
): void {
    const existing = readSession(sessionId);
    const base64Buffer = Buffer.from(excelBuffer).toString('base64');

    writeSession(sessionId, {
        ...(existing || {}),
        data: cleanedData,
        excelBufferBase64: base64Buffer,
        profile,
        ts: Date.now()
    });
}

export function getData(sessionId: string): Record<string, unknown>[] | null {
    const session = readSession(sessionId);
    if (!session) return null;
    session.ts = Date.now();
    writeSession(sessionId, session);
    return session.data;
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
