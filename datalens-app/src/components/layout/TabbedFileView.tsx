'use client';

import { useState } from 'react';
import type { FileRecord, ActiveTab } from '@/lib/fileQueue';
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
    { id: 'original',      label: 'Archivo original', icon: 'table_view',     hasData: !!file.rawData },
    { id: 'schema',        label: 'Esquema',           icon: 'schema',         hasData: !!file.schemaBlueprint },
    { id: 'normalization', label: 'Normalización',     icon: 'auto_fix_high',  hasData: !!file.cleanedData },
    { id: 'validation',    label: 'Validación',        icon: 'verified_user',  hasData: true },
    { id: 'dashboard',     label: 'Dashboard',         icon: 'dashboard',      hasData: !!file.analysis },
  ];

  const activeTab = file.activeTab ?? 'dashboard';

  const handleTabChange = (tab: ActiveTab) => {
    queue.setActiveTab(file.fileId, tab);
  };

  const handleVizChosen = async (viz: VizProposal) => {
    setIsDashboardLoading(true);
    try {
      await queue.generateDashboard(file.fileId, viz);
    } finally {
      setIsDashboardLoading(false);
    }
  };

  const rowCount = file.rawData?.length ?? 0;
  const colCount = file.rawData?.[0] ? Object.keys(file.rawData[0]).length : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* File metadata header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-dark shrink-0 bg-surface-dark/50">
        <div>
          <h2 className="text-sm font-bold text-slate-100">{file.fileName}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {rowCount.toLocaleString()} filas · {colCount} columnas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-900/30 text-green-400 border border-green-500/30">
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#4ade80', display: 'inline-block' }} />
            Listo
          </span>
          <button
            onClick={() => queue.removeFile(file.fileId)}
            className="text-slate-600 hover:text-red-400 transition-colors"
            title="Eliminar archivo"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-border-dark overflow-x-auto shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{tab.icon}</span>
            {tab.label}
            {tab.hasData && (
              <span className="inline-flex items-center justify-center rounded-full bg-green-500/10 text-green-400" style={{ width: 16, height: 16 }}>
                <span className="material-symbols-outlined text-[10px]">check</span>
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">

        {/* Archivo original */}
        {activeTab === 'original' && file.rawData && (
          <div className="animate-fade-in">
            <div className="mb-4">
              <h3 className="font-bold text-slate-100">Archivo Original</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Vista sin modificar de los primeros {Math.min(50, file.rawData.length)} registros
              </p>
            </div>
            <InteractiveSheet
              data={file.rawData.slice(0, 50)}
              schema={undefined}
              anomalies={[]}
            />
          </div>
        )}

        {/* Esquema */}
        {activeTab === 'schema' && (
          <SchemaTab schemaBlueprint={file.schemaBlueprint} />
        )}

        {/* Normalización */}
        {activeTab === 'normalization' && (
          <NormalizationTab rawData={file.rawData} cleanedData={file.cleanedData} />
        )}

        {/* Validación */}
        {activeTab === 'validation' && (
          <ValidationTab dataAnomalies={file.dataAnomalies} />
        )}

        {/* Dashboard: progressive disclosure */}
        {activeTab === 'dashboard' && file.sessionId && (
          <div className="animate-fade-in space-y-6">
            {/* Analysis gate */}
            {!file.analysisApproved ? (
              <AnalysisPanel
                sessionId={file.sessionId}
                analysis={file.analysis}
                onAnalysisGenerated={(a) => queue.reviseAnalysis(file.fileId, a).catch(() => {})}
                onApproved={() => queue.approveAnalysis(file.fileId)}
              />
            ) : !file.reportConfig ? (
              /* Viz proposals gate */
              <div>
                <VizProposalPanel
                  sessionId={file.sessionId}
                  proposals={file.vizProposals}
                  schema={file.schema}
                  onProposalsLoaded={(_p) => {
                    // Proposals are already pre-loaded in file.vizProposals by the pipeline.
                    // VizProposalPanel uses its own internal state, so this is a no-op.
                  }}
                  onVizChosen={handleVizChosen}
                />
                {isDashboardLoading && (
                  <div className="mt-6 text-center">
                    <div className="inline-flex items-center gap-3 bg-surface-dark/50 border border-border-dark rounded-xl px-6 py-3">
                      <div className="size-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <span className="text-sm text-slate-400">Generando dashboard con auditoría final...</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Final dashboard */
              <div>
                <div className="mb-6 flex justify-between items-end">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-100">Dashboard de Negocio</h2>
                    <p className="text-sm text-slate-400">Insights generados por Inteligencia Artificial</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {file.auditPassed !== null && (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${file.auditPassed ? 'bg-green-900/30 text-green-400 border border-green-500/30' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/30'}`}>
                        <span className="material-symbols-outlined text-sm">
                          {file.auditPassed ? 'verified' : 'warning'}
                        </span>
                        {file.auditPassed ? 'Auditoría Pasada' : 'Discrepancias'}
                      </span>
                    )}
                    <button
                      onClick={() => queue.resetDashboard(file.fileId)}
                      className="text-primary text-sm font-semibold hover:underline flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                      Cambiar Visualización
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
