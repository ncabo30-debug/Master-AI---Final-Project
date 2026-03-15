/**
 * fileQueue.ts
 * Pure types and utilities for the multi-file state machine.
 * No React dependency — safe to import from anywhere.
 */

import type {
  SchemaMap,
  SchemaBlueprint,
  QuestionOption,
  VizProposal,
  ReportConfig,
  DataAnomaly,
} from './agents/types';

// ── File pipeline states ───────────────────────────────────

export type FileStatus =
  | 'QUEUED'
  | 'PARSING'
  | 'SCHEMA_DETECTION'
  | 'AWAITING_VALIDATION'
  | 'NORMALIZING'
  | 'VALIDATING'
  | 'READY'
  | 'ERROR';

/** States that occupy a processing slot (max 2 concurrent). */
const ACTIVE_STATES: FileStatus[] = [
  'PARSING',
  'SCHEMA_DETECTION',
  'NORMALIZING',
  'VALIDATING',
];

// ── UI label / dot class mappings ─────────────────────────

export const FILE_STATUS_LABEL: Record<FileStatus, string> = {
  QUEUED:               'En cola',
  PARSING:              'Analizando archivo...',
  SCHEMA_DETECTION:     'Detectando esquema...',
  AWAITING_VALIDATION:  'Requiere atención',
  NORMALIZING:          'Normalizando datos...',
  VALIDATING:           'Validando...',
  READY:                'Listo',
  ERROR:                'Error',
};

/** CSS class for the status dot. Defined as explicit strings so Tailwind never purges them. */
export const FILE_STATUS_DOT_CLASS: Record<FileStatus, string> = {
  QUEUED:               'dot-queued',
  PARSING:              'dot-processing',
  SCHEMA_DETECTION:     'dot-processing',
  AWAITING_VALIDATION:  'dot-awaiting',
  NORMALIZING:          'dot-processing',
  VALIDATING:           'dot-processing',
  READY:                'dot-ready',
  ERROR:                'dot-error',
};

// ── FileRecord ─────────────────────────────────────────────

export type ActiveTab = 'original' | 'schema' | 'normalization' | 'validation' | 'dashboard';

export interface FileRecord {
  fileId:           string;
  fileName:         string;
  sessionId:        string | null;
  status:           FileStatus;
  /** Raw rows parsed from the CSV (before any cleaning). */
  rawData:          Record<string, unknown>[] | null;
  /** Rows returned by the clean_data API action. */
  cleanedData:      Record<string, unknown>[] | null;
  schema:           SchemaMap | null;
  schemaBlueprint:  SchemaBlueprint | null;
  questions:        QuestionOption[] | null;
  analysis:         string | null;
  analysisApproved: boolean;
  vizProposals:     VizProposal[] | null;
  reportConfig:     ReportConfig | null;
  dataAnomalies:    DataAnomaly[];
  auditPassed:      boolean | null;
  activeTab:        ActiveTab;
  error:            string | null;
}

// ── Factory ────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createFileRecord(
  fileName: string,
  rawData: Record<string, unknown>[]
): FileRecord {
  return {
    fileId:           generateId(),
    fileName,
    sessionId:        null,
    status:           'QUEUED',
    rawData,
    cleanedData:      null,
    schema:           null,
    schemaBlueprint:  null,
    questions:        null,
    analysis:         null,
    analysisApproved: false,
    vizProposals:     null,
    reportConfig:     null,
    dataAnomalies:    [],
    auditPassed:      null,
    activeTab:        'dashboard',
    error:            null,
  };
}

// ── Queue predicates ───────────────────────────────────────

/** Returns count of files occupying an active processing slot. */
export function getActiveProcessingCount(files: Map<string, FileRecord>): number {
  let count = 0;
  for (const record of files.values()) {
    if (ACTIVE_STATES.includes(record.status)) count++;
  }
  return count;
}

/** Returns true if a new file can start processing (< 2 active). */
export function canStartProcessing(files: Map<string, FileRecord>): boolean {
  return getActiveProcessingCount(files) < 2;
}

/** Returns all files in READY state. */
export function getReadyFiles(files: Map<string, FileRecord>): FileRecord[] {
  return Array.from(files.values()).filter((r) => r.status === 'READY');
}

/** Returns the next QUEUED file by insertion order, or null. */
export function getNextQueued(files: Map<string, FileRecord>): FileRecord | null {
  for (const record of files.values()) {
    if (record.status === 'QUEUED') return record;
  }
  return null;
}
