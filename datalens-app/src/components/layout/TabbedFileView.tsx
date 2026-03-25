'use client';

import { useState } from 'react';
import type { ActiveTab, FileRecord } from '@/lib/fileQueue';
import type { UseFileQueueReturn } from '@/lib/useFileQueue';
import type { VizProposal } from '@/lib/agents/types';
import InteractiveSheet from '@/components/InteractiveSheet';
import AnalysisPanel from '@/components/AnalysisPanel';
import VizProposalPanel from '@/components/VizProposalPanel';
import Dashboard from '@/components/Dashboard';
import SchemaTab from './SchemaTab';
import NormalizationTab from './NormalizationTab';
import ValidationTab from './ValidationTab';

interface TabbedFileViewProps {
  file: FileRecord;
  queue: UseFileQueueReturn;
}

interface Tab {
  id: ActiveTab;
  label: string;
  icon: string;
  hasData: boolean;
}

export default function TabbedFileView({ file, queue }: TabbedFileViewProps) {
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);

  const tabs: Tab[] = [
    { id: 'original', label: 'Archivo original', icon: 'table_view', hasData: !!file.rawData },
    { id: 'schema', label: 'Blueprint', icon: 'schema', hasData: !!file.draftBlueprint },
    { id: 'normalization', label: 'Normalización', icon: 'auto_fix_high', hasData: !!file.normalizedData },
    { id: 'validation', label: 'Validación', icon: 'verified_user', hasData: !!file.validationReport },
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', hasData: !!file.analysis },
  ];

  const activeTab = file.activeTab ?? 'dashboard';
  const rowCount = file.rawData?.length ?? 0;
  const colCount = file.rawData?.[0] ? Object.keys(file.rawData[0]).length : 0;

  const handleVizChosen = async (viz: VizProposal) => {
    setIsDashboardLoading(true);
    try {
      await queue.generateDashboard(file.fileId, viz);
    } finally {
      setIsDashboardLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border-dark bg-surface-dark/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-100">{file.fileName}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {rowCount.toLocaleString()} filas · {colCount} columnas
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-900/30 px-2.5 py-1 text-xs font-semibold text-green-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
              {file.status === 'VALIDATION_FAILED' ? 'Validación fallida' : 'Listo'}
            </span>
            <button
              onClick={() => queue.removeFile(file.fileId)}
              className="text-slate-600 transition-colors hover:text-red-400"
              title="Eliminar archivo"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-border-dark px-4 pt-3 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => queue.setActiveTab(file.fileId, tab.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{tab.icon}</span>
            {tab.label}
            {tab.hasData && (
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-500/10 text-green-400">
                <span className="material-symbols-outlined text-[10px]">check</span>
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        {activeTab === 'original' && file.rawData && (
          <div className="animate-fade-in">
            <div className="mb-4">
              <h3 className="font-bold text-slate-100">Archivo original</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Vista sin modificar de los primeros {Math.min(50, file.rawData.length)} registros
              </p>
            </div>
            <InteractiveSheet data={file.rawData.slice(0, 50)} schema={file.schema ?? undefined} />
          </div>
        )}

        {activeTab === 'schema' && (
          <SchemaTab blueprint={file.approvedBlueprint ?? file.draftBlueprint} />
        )}

        {activeTab === 'normalization' && (
          <NormalizationTab
            rawData={file.rawData}
            cleanedData={file.normalizedData ?? file.cleanedData}
            reconciliationReport={file.reconciliationReport}
          />
        )}

        {activeTab === 'validation' && <ValidationTab validationReport={file.validationReport} />}

        {activeTab === 'dashboard' && file.sessionId && (
          <div className="animate-fade-in space-y-6">
            {!file.analysisApproved ? (
              <AnalysisPanel
                sessionId={file.sessionId}
                analysis={file.analysis}
                onAnalysisGenerated={(analysis) => queue.reviseAnalysis(file.fileId, analysis).catch(() => {})}
                onApproved={() => queue.approveAnalysis(file.fileId)}
              />
            ) : !file.reportConfig ? (
              <div>
                <VizProposalPanel
                  sessionId={file.sessionId}
                  proposals={file.vizProposals}
                  schema={file.schema}
                  onProposalsLoaded={() => {}}
                  onVizChosen={handleVizChosen}
                />
                {isDashboardLoading && (
                  <div className="mt-6 text-center">
                    <div className="inline-flex items-center gap-3 rounded-xl border border-border-dark bg-surface-dark/50 px-6 py-3">
                      <div className="size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                      <span className="text-sm text-slate-400">Generando dashboard con auditoría final...</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-6 flex items-end justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-100">Dashboard de negocio</h2>
                    <p className="text-sm text-slate-400">Generado sobre el dataset normalizado.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {file.auditPassed !== null && (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                          file.auditPassed
                            ? 'border border-green-500/30 bg-green-900/30 text-green-400'
                            : 'border border-yellow-500/30 bg-yellow-900/30 text-yellow-400'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {file.auditPassed ? 'verified' : 'warning'}
                        </span>
                        {file.auditPassed ? 'Auditoría pasada' : 'Discrepancias'}
                      </span>
                    )}
                    <button
                      onClick={() => queue.resetDashboard(file.fileId)}
                      className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                      Cambiar visualización
                    </button>
                  </div>
                </div>
                <div className="min-h-[500px]">
                  <Dashboard reportConfig={file.reportConfig} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

