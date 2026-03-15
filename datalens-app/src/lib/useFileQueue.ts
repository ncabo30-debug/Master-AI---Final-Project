'use client';

/**
 * useFileQueue.ts
 * Central React hook that owns the multi-file state machine.
 * Replaces all state management previously in page.tsx.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  FileRecord,
  FileStatus,
  createFileRecord,
  canStartProcessing,
  getReadyFiles,
  getNextQueued,
} from './fileQueue';
import { parseCSVFile } from './csvParser';
import type { EnrichedSchemaField, OutlierReport, DataAnomaly, VizProposal } from './agents/types';

// ── Anomaly helper (migrated from page.tsx) ────────────────

function deriveLocalAnomaliesFromOutliers(
  rows: Record<string, unknown>[],
  outlierReport: OutlierReport | null | undefined
): DataAnomaly[] {
  if (!outlierReport || outlierReport.outliers.length === 0) return [];

  const normalizeValue = (value: unknown) => {
    if (value == null) return '';
    if (value instanceof Date) return value.toISOString();
    return String(value).trim();
  };

  const anomalies: DataAnomaly[] = [];

  outlierReport.outliers.forEach((outlier) => {
    const extremeValueSet = new Set(outlier.extremeValues.map(normalizeValue));

    rows.forEach((row, rowIndex) => {
      const cellValue = row[outlier.column];
      const normalizedCellValue = normalizeValue(cellValue);

      if (!normalizedCellValue || !extremeValueSet.has(normalizedCellValue)) return;

      anomalies.push({
        id: `outlier-${outlier.column}-${rowIndex}-${normalizedCellValue}`,
        kind: 'outlier',
        source: 'local_outlier_detector',
        severity: 'warning',
        column: outlier.column,
        rowIndex,
        value:
          typeof cellValue === 'number' || typeof cellValue === 'string'
            ? cellValue
            : normalizedCellValue,
        message: `Valor inusual detectado en ${outlier.column}`,
        metadata: {
          lowerBound: outlier.lowerBound,
          upperBound: outlier.upperBound,
        },
      });
    });
  });

  return anomalies;
}

// ── API helpers ─────────────────────────────────────────────

async function apiPost(body: Record<string, unknown>) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'API error');
  return data;
}

async function clearSessionLogs(sessionId: string) {
  try {
    await fetch(`/api/admin/logs?sessionId=${sessionId}`, { method: 'DELETE' });
  } catch {
    // non-critical
  }
}

// ── Hook ───────────────────────────────────────────────────

export type UseFileQueueReturn = ReturnType<typeof useFileQueue>;

export function useFileQueue() {
  const [files, setFiles] = useState<Map<string, FileRecord>>(new Map());
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  // Keep a ref to always access the latest files map in async pipeline callbacks
  const filesRef = useRef<Map<string, FileRecord>>(new Map());

  // Derived
  const selectedFile = selectedFileId ? (files.get(selectedFileId) ?? null) : null;
  const readyFiles = getReadyFiles(files);

  // ── Internal state updater ─────────────────────────────

  const patchFile = useCallback((fileId: string, patch: Partial<FileRecord>) => {
    setFiles((prev) => {
      const existing = prev.get(fileId);
      if (!existing) return prev;
      const next = new Map(prev);
      const updated = { ...existing, ...patch };
      next.set(fileId, updated);
      filesRef.current = next;
      return next;
    });
  }, []);

  // ── Pipeline ───────────────────────────────────────────

  const runPipelinePhase1 = useCallback(
    async (fileId: string) => {
      const file = filesRef.current.get(fileId);
      if (!file || !file.rawData) return;
      // Guard: only start if QUEUED (prevents React StrictMode double-fire)
      if (file.status !== 'QUEUED') return;

      try {
        // PARSING: clean_data
        patchFile(fileId, { status: 'PARSING' });

        const cleanResult = await apiPost({
          action: 'clean_data',
          data: file.rawData,
        });

        const sessionId: string = cleanResult.sessionId;
        const cleanedData: Record<string, unknown>[] = cleanResult.cleanedData ?? file.rawData;
        const dataAnomalies = deriveLocalAnomaliesFromOutliers(
          file.rawData,
          cleanResult.outlierReport
        );

        patchFile(fileId, { sessionId, cleanedData, dataAnomalies });

        // SCHEMA_DETECTION: analyze_schema
        patchFile(fileId, { status: 'SCHEMA_DETECTION' });

        const schemaResult = await apiPost({
          action: 'analyze_schema',
          sessionId,
        });

        patchFile(fileId, {
          schema: schemaResult.schema,
          schemaBlueprint: schemaResult.schemaBlueprint,
          questions: schemaResult.questions,
          status: 'AWAITING_VALIDATION',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        patchFile(fileId, { status: 'ERROR', error: msg });
      }
    },
    [patchFile]
  );

  const runPipelinePhase2 = useCallback(
    async (fileId: string) => {
      const file = filesRef.current.get(fileId);
      if (!file || !file.sessionId) return;
      // Guard: only continue from AWAITING_VALIDATION (prevents double-invocation)
      if (file.status !== 'AWAITING_VALIDATION') return;

      const { sessionId } = file;

      try {
        // NORMALIZING: generate_analysis
        patchFile(fileId, { status: 'NORMALIZING' });

        const analysisResult = await apiPost({
          action: 'generate_analysis',
          sessionId,
        });

        patchFile(fileId, { analysis: analysisResult.analysis });

        // VALIDATING: propose_visualizations
        patchFile(fileId, { status: 'VALIDATING' });

        const vizResult = await apiPost({
          action: 'propose_visualizations',
          sessionId,
        });

        patchFile(fileId, {
          vizProposals: vizResult.proposals,
          status: 'READY',
          activeTab: 'dashboard',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        patchFile(fileId, { status: 'ERROR', error: msg });
      }
    },
    [patchFile]
  );

  // ── Queue manager effect ───────────────────────────────

  // Whenever files map changes, check if any QUEUED file can start
  useEffect(() => {
    const currentFiles = filesRef.current;
    if (!canStartProcessing(currentFiles)) return;
    const next = getNextQueued(currentFiles);
    if (!next) return;
    runPipelinePhase1(next.fileId);
  }, [files, runPipelinePhase1]);

  // ── Public API ─────────────────────────────────────────

  const enqueueFiles = useCallback(
    async (rawFiles: File[]) => {
      const csvFiles = rawFiles.filter((f) => f.name.endsWith('.csv'));
      if (csvFiles.length === 0) return;

      // Parse all CSVs, create records, add to map
      const newRecords: FileRecord[] = [];
      for (const file of csvFiles) {
        try {
          const data = await parseCSVFile(file);
          newRecords.push(createFileRecord(file.name, data));
        } catch (err) {
          console.error(`Error parsing ${file.name}:`, err);
        }
      }

      if (newRecords.length === 0) return;

      setFiles((prev) => {
        const next = new Map(prev);
        for (const record of newRecords) {
          next.set(record.fileId, record);
        }
        filesRef.current = next;
        return next;
      });

      // Select the first new file if none selected
      setSelectedFileId((prev) => prev ?? newRecords[0].fileId);
    },
    []
  );

  const confirmSchema = useCallback(
    (fileId: string) => {
      runPipelinePhase2(fileId);
    },
    [runPipelinePhase2]
  );

  const handleSchemaOverride = useCallback(
    async (fileId: string, column: string, semanticRole: EnrichedSchemaField['semantic_role']) => {
      const file = filesRef.current.get(fileId);
      if (!file?.sessionId) return;

      try {
        const result = await apiPost({
          action: 'save_schema_override',
          sessionId: file.sessionId,
          column,
          semanticRole,
        });
        patchFile(fileId, {
          schema: result.schema,
          schemaBlueprint: result.schemaBlueprint,
        });
      } catch (err) {
        console.error('Schema override failed:', err);
      }
    },
    [patchFile]
  );

  const reviseAnalysis = useCallback(
    async (fileId: string, feedback: string) => {
      const file = filesRef.current.get(fileId);
      if (!file?.sessionId) return null;

      const result = await apiPost({
        action: 'revise_analysis',
        sessionId: file.sessionId,
        feedback,
      });
      patchFile(fileId, { analysis: result.analysis });
      return result.analysis as string;
    },
    [patchFile]
  );

  const approveAnalysis = useCallback(
    (fileId: string) => {
      patchFile(fileId, { analysisApproved: true });
    },
    [patchFile]
  );

  /**
   * Called by TabbedFileView after VizProposalPanel already validated the viz.
   * Only calls generate_dashboard (validate_viz was already done by VizProposalPanel internally).
   */
  const generateDashboard = useCallback(
    async (fileId: string, viz: VizProposal) => {
      const file = filesRef.current.get(fileId);
      if (!file?.sessionId) return;

      const vizAnswers = {
        x_axis: viz.xAxis,
        y_axis: viz.yAxis,
        chart_type: viz.chartType,
        ...(viz.groupBy && { group_by: viz.groupBy }),
      };

      const dashResult = await apiPost({
        action: 'generate_dashboard',
        sessionId: file.sessionId,
        answers: vizAnswers,
      });

      patchFile(fileId, {
        reportConfig: dashResult.report,
        auditPassed: dashResult.auditPassed,
      });
    },
    [patchFile]
  );

  const validateAndGenerateDashboard = useCallback(
    async (fileId: string, viz: VizProposal) => {
      const file = filesRef.current.get(fileId);
      if (!file?.sessionId) return;

      const { sessionId } = file;

      // validate_viz
      const feasResult = await apiPost({ action: 'validate_viz', sessionId, viz });
      if (!feasResult.feasible) {
        throw new Error(feasResult.issues?.join(', ') || 'Visualización no factible');
      }

      await generateDashboard(fileId, viz);
    },
    [patchFile, generateDashboard]
  );

  const setActiveTab = useCallback(
    (fileId: string, tab: FileRecord['activeTab']) => {
      patchFile(fileId, { activeTab: tab });
    },
    [patchFile]
  );

  const removeFile = useCallback(
    (fileId: string) => {
      const file = filesRef.current.get(fileId);
      if (file?.sessionId) clearSessionLogs(file.sessionId);

      setFiles((prev) => {
        const next = new Map(prev);
        next.delete(fileId);
        filesRef.current = next;
        return next;
      });

      setSelectedFileId((prev) => {
        if (prev !== fileId) return prev;
        // Select another file if available
        const remaining = Array.from(filesRef.current.keys()).filter((k) => k !== fileId);
        return remaining[0] ?? null;
      });
    },
    []
  );

  const retryFile = useCallback(
    (fileId: string) => {
      patchFile(fileId, { status: 'QUEUED', error: null });
    },
    [patchFile]
  );

  /** Clears reportConfig so the user can re-select a visualization. */
  const resetDashboard = useCallback(
    (fileId: string) => {
      patchFile(fileId, { reportConfig: null, auditPassed: null });
    },
    [patchFile]
  );

  return {
    files,
    selectedFileId,
    setSelectedFileId,
    selectedFile,
    readyFiles,
    enqueueFiles,
    confirmSchema,
    handleSchemaOverride,
    reviseAnalysis,
    approveAnalysis,
    validateAndGenerateDashboard,
    setActiveTab,
    removeFile,
    retryFile,
    resetDashboard,
    generateDashboard,
    chatWithFile: async (fileId: string, question: string): Promise<string> => {
      const file = filesRef.current.get(fileId);
      if (!file?.sessionId) throw new Error('No hay sesión activa');
      const result = await apiPost({ action: 'chat', sessionId: file.sessionId, question });
      return result.answer as string;
    },
  };
}
