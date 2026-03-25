'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileRecord,
  createFileRecord,
  canStartProcessing,
  getNextQueued,
  getReadyFiles,
} from './fileQueue';
import { parseSpreadsheetFile } from './pipeline/ingestion';
import type { ColumnNormalizationPlan, NormalizationBlueprint } from './pipeline/types';
import type { EnrichedSchemaField, VizProposal } from './agents/types';

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
    // best effort
  }
}

export type UseFileQueueReturn = ReturnType<typeof useFileQueue>;

export function useFileQueue() {
  const [files, setFiles] = useState<Map<string, FileRecord>>(new Map());
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const filesRef = useRef<Map<string, FileRecord>>(new Map());

  const selectedFile = selectedFileId ? (files.get(selectedFileId) ?? null) : null;
  const readyFiles = getReadyFiles(files);

  const patchFile = useCallback((fileId: string, patch: Partial<FileRecord>) => {
    setFiles((prev) => {
      const existing = prev.get(fileId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(fileId, { ...existing, ...patch });
      filesRef.current = next;
      return next;
    });
  }, []);

  const runBlueprintGeneration = useCallback(
    async (fileId: string) => {
      const file = filesRef.current.get(fileId);
      if (!file?.workbook || !file.originalFileBase64 || file.status !== 'QUEUED') return;

      try {
        patchFile(fileId, { status: 'PROFILING' });
        const result = await apiPost({
          action: 'generate_blueprint',
          workbook: file.workbook,
          originalFileBase64: file.originalFileBase64,
        });

        patchFile(fileId, {
          sessionId: result.sessionId,
          manifest: result.manifest,
          rawData: result.preview?.originalPreview ?? file.rawData,
          normalizedPreview: result.preview?.normalizedPreview ?? null,
          draftBlueprint: result.draftBlueprint,
          approvedBlueprint: result.draftBlueprint,
          schema: result.schema,
          statisticalProfile: result.profile,
          status: 'AWAITING_APPROVAL',
          issueReport: result.issueReport ?? null,
        });
      } catch (error) {
        patchFile(fileId, {
          status: 'ERROR',
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    },
    [patchFile]
  );

  const runExecution = useCallback(
    async (fileId: string, blueprint: NormalizationBlueprint) => {
      const file = filesRef.current.get(fileId);
      if (!file?.sessionId) return;

      try {
        patchFile(fileId, { status: 'EXECUTING_BLUEPRINT' });
        const result = await apiPost({
          action: 'execute_blueprint_and_save',
          sessionId: file.sessionId,
          approvedBlueprint: blueprint,
        });

        patchFile(fileId, {
          approvedBlueprint: blueprint,
          normalizedData: result.normalizedData,
          cleanedData: result.normalizedData,
          normalizedPreview: result.normalizedPreview ?? result.normalizedData?.slice(0, 50) ?? null,
          validationReport: result.validationReport,
          manifest: result.manifest,
          status: result.validationReport?.valid ? 'READY' : 'VALIDATION_FAILED',
          activeTab: result.validationReport?.valid ? 'dashboard' : 'validation',
        });

        if (result.validationReport?.valid) {
          const analysisResult = await apiPost({
            action: 'generate_analysis',
            sessionId: file.sessionId,
          });

          const vizResult = await apiPost({
            action: 'propose_visualizations',
            sessionId: file.sessionId,
          });

          patchFile(fileId, {
            analysis: analysisResult.analysis,
            vizProposals: vizResult.proposals,
            status: 'READY',
            activeTab: 'dashboard',
          });
        }
      } catch (error) {
        patchFile(fileId, {
          status: 'ERROR',
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    },
    [patchFile]
  );

  useEffect(() => {
    const currentFiles = filesRef.current;
    if (!canStartProcessing(currentFiles)) return;
    const next = getNextQueued(currentFiles);
    if (!next) return;
    runBlueprintGeneration(next.fileId);
  }, [files, runBlueprintGeneration]);

  const enqueueFiles = useCallback(async (rawFiles: File[]) => {
    const supportedFiles = rawFiles.filter((file) => /\.(csv|xlsx|xls)$/i.test(file.name));
    if (supportedFiles.length === 0) return;

    const newRecords: FileRecord[] = [];
    for (const file of supportedFiles) {
      try {
        const parsed = await parseSpreadsheetFile(file);
        const firstSheetRows =
          parsed.workbook.sheets[0]?.rawRows.slice(1).map((row) =>
            (parsed.workbook.sheets[0]?.rawRows[0] ?? []).reduce<Record<string, unknown>>((acc, header, index) => {
              acc[header || `column_${index + 1}`] = row[index] ?? '';
              return acc;
            }, {})
          ) ?? [];

        newRecords.push(
          createFileRecord(file.name, firstSheetRows, {
            workbook: parsed.workbook,
            originalFileBase64: parsed.originalFileBase64,
          })
        );
      } catch (error) {
        console.error(`Error parsing ${file.name}:`, error);
      }
    }

    if (newRecords.length === 0) return;

    setFiles((prev) => {
      const next = new Map(prev);
      newRecords.forEach((record) => next.set(record.fileId, record));
      filesRef.current = next;
      return next;
    });

    setSelectedFileId((prev) => prev ?? newRecords[0].fileId);
  }, []);

  const confirmAndClean = useCallback(
    (fileId: string, blueprint?: NormalizationBlueprint) => {
      const file = filesRef.current.get(fileId);
      const nextBlueprint = blueprint ?? file?.approvedBlueprint ?? file?.draftBlueprint;
      if (!nextBlueprint) return;
      runExecution(fileId, nextBlueprint);
    },
    [runExecution]
  );

  const handleBlueprintOverride = useCallback(
    async (
      fileId: string,
      columnId: string,
      patch: Partial<ColumnNormalizationPlan>
    ) => {
      const file = filesRef.current.get(fileId);
      if (!file?.sessionId) return;

      const result = await apiPost({
        action: 'save_blueprint_override',
        sessionId: file.sessionId,
        columnId,
        patch,
      });

      patchFile(fileId, {
        draftBlueprint: result.draftBlueprint,
        approvedBlueprint: result.draftBlueprint,
        schema: result.schema,
        normalizedPreview: result.preview?.normalizedPreview ?? file.normalizedPreview,
      });
    },
    [patchFile]
  );

  const toggleStructuralAction = useCallback(
    async (fileId: string, actionId: string, enabled: boolean) => {
      const file = filesRef.current.get(fileId);
      if (!file?.sessionId) return;

      const result = await apiPost({
        action: 'save_blueprint_override',
        sessionId: file.sessionId,
        structuralActionId: actionId,
        enabled,
      });

      patchFile(fileId, {
        draftBlueprint: result.draftBlueprint,
        approvedBlueprint: result.draftBlueprint,
        schema: result.schema,
        normalizedPreview: result.preview?.normalizedPreview ?? file.normalizedPreview,
      });
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

  const generateDashboard = useCallback(
    async (fileId: string, viz: VizProposal) => {
      const file = filesRef.current.get(fileId);
      if (!file?.sessionId) return;

      const result = await apiPost({
        action: 'generate_dashboard',
        sessionId: file.sessionId,
        answers: {
          x_axis: viz.xAxis,
          y_axis: viz.yAxis,
          chart_type: viz.chartType,
          ...(viz.groupBy && { group_by: viz.groupBy }),
        },
      });

      patchFile(fileId, {
        reportConfig: result.report,
        auditPassed: result.auditPassed,
      });
    },
    [patchFile]
  );

  const validateAndGenerateDashboard = useCallback(
    async (fileId: string, viz: VizProposal) => {
      const file = filesRef.current.get(fileId);
      if (!file?.sessionId) return;

      const result = await apiPost({
        action: 'validate_viz',
        sessionId: file.sessionId,
        viz,
      });

      if (!result.feasible) {
        throw new Error(result.issues?.join(', ') || 'Visualización no factible');
      }

      await generateDashboard(fileId, viz);
    },
    [generateDashboard]
  );

  const removeFile = useCallback((fileId: string) => {
    const file = filesRef.current.get(fileId);
    if (file?.sessionId) {
      void clearSessionLogs(file.sessionId);
    }

    setFiles((prev) => {
      const next = new Map(prev);
      next.delete(fileId);
      filesRef.current = next;
      return next;
    });

    setSelectedFileId((prev) => {
      if (prev !== fileId) return prev;
      const remaining = Array.from(filesRef.current.keys()).filter((key) => key !== fileId);
      return remaining[0] ?? null;
    });
  }, []);

  const retryFile = useCallback(
    (fileId: string) => patchFile(fileId, { status: 'QUEUED', error: null }),
    [patchFile]
  );

  const resetDashboard = useCallback(
    (fileId: string) => patchFile(fileId, { reportConfig: null, auditPassed: null }),
    [patchFile]
  );

  const setActiveTab = useCallback(
    (fileId: string, tab: FileRecord['activeTab']) => patchFile(fileId, { activeTab: tab }),
    [patchFile]
  );

  return {
    files,
    selectedFileId,
    setSelectedFileId,
    selectedFile,
    readyFiles,
    enqueueFiles,
    confirmAndClean,
    handleBlueprintOverride,
    toggleStructuralAction,
    handleSchemaOverride: async (
      fileId: string,
      column: string,
      semanticRole: EnrichedSchemaField['semantic_role']
    ) => {
      void fileId;
      void column;
      void semanticRole;
    },
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

