'use client';

import { useState } from 'react';
import FileUploader from '@/components/FileUploader';
import InteractiveSheet from '@/components/InteractiveSheet';
import Dashboard from '@/components/Dashboard';
import ComprehensionPanel from '@/components/ComprehensionPanel';
import AnalysisPanel from '@/components/AnalysisPanel';
import VizProposalPanel from '@/components/VizProposalPanel';
import AgentTerminal from '@/components/AgentTerminal';
import AgentFlowVisualizer from '@/components/AgentFlowVisualizer';
import TokenUsageWidget from '@/components/TokenUsageWidget';
import type { SchemaMap, QuestionOption, ReportConfig, VizProposal } from '@/lib/agents/types';

export default function Home() {
  const [currentStep, setCurrentStep] = useState(1);
  const [adminView, setAdminView] = useState<'terminal' | 'flow'>('flow');
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [schema, setSchema] = useState<SchemaMap | null>(null);
  const [questions, setQuestions] = useState<QuestionOption[] | null>(null);
  const [reportConfig, setReportConfig] = useState<ReportConfig | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Phase 2-3 state
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisApproved, setAnalysisApproved] = useState(false);
  const [vizProposals, setVizProposals] = useState<VizProposal[] | null>(null);
  const [auditPassed, setAuditPassed] = useState<boolean | null>(null);
  const [auditDiscrepancies, setAuditDiscrepancies] = useState<string[]>([]);

  const handleDataLoaded = async (parsedData: Record<string, unknown>[]) => {
    setIsAnalyzing(true);
    setData(parsedData);
    setSchema(null);
    setQuestions(null);
    setReportConfig(null);
    setSessionId(null);
    setAnalysis(null);
    setAnalysisApproved(false);
    setVizProposals(null);
    setAuditPassed(null);
    setCurrentStep(2);

    try {
      await fetch('/api/admin/logs', { method: 'DELETE' });
    } catch (e) {
      console.error("Failed to clear logs", e);
    }

    try {
      // Phase 1: Clean data
      const cleanRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clean_data', data: parsedData })
      });
      const cleanResult = await cleanRes.json();
      if (!cleanRes.ok) throw new Error(cleanResult.error);

      const sid = cleanResult.sessionId;
      setSessionId(sid);

      // Phase 1b: Analyze schema
      const schemaRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze_schema', sessionId: sid })
      });
      const schemaResult = await schemaRes.json();
      if (!schemaRes.ok) throw new Error(schemaResult.error);

      setSchema(schemaResult.schema);
      setQuestions(schemaResult.questions);
      setCompletedSteps(prev => prev.includes(1) ? prev : [...prev, 1]);
    } catch (err: any) {
      console.error(err);
      const suggestion = err?.suggestion || 'Verificá que el archivo sea un CSV válido e intentá de nuevo.';
      alert(`Hubo un error al procesar el archivo.\n\n💡 ${suggestion}`);
      setCurrentStep(1);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnswersSubmitted = async (answers: Record<string, string>) => {
    setIsAnalyzing(true);
    try {
      // Instead of generating the report immediately, move to Phase 2 (Analysis)
      setCompletedSteps(prev => prev.includes(2) ? prev : [...prev, 2]);
      setCurrentStep(3); // Go to Analysis step
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalysisApproved = () => {
    setAnalysisApproved(true);
    setCompletedSteps(prev => prev.includes(3) ? prev : [...prev, 3]);
    setCurrentStep(4); // Go to Viz Proposals
  };

  const handleVizChosen = async (viz: VizProposal) => {
    setIsAnalyzing(true);
    try {
      // Build answers from the viz choice
      const vizAnswers = {
        x_axis: viz.xAxis,
        y_axis: viz.yAxis,
        chart_type: viz.chartType,
        ...(viz.groupBy && { group_by: viz.groupBy })
      };

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_dashboard',
          sessionId,
          answers: vizAnswers
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      setReportConfig(result.report);
      setAuditPassed(result.auditPassed);
      setAuditDiscrepancies(result.discrepancies || []);

      setCompletedSteps(prev => prev.includes(4) ? prev : [...prev, 4]);
      setCurrentStep(5); // Go to Dashboard
    } catch (err: any) {
      console.error(err);
      const suggestion = err?.suggestion || 'Intentá seleccionar otra visualización.';
      alert(`Hubo un error al generar el dashboard.\n\n💡 ${suggestion}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleChatMessage = async (message: string) => {
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', sessionId, question: message })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      return result.answer; // ComprehensionPanel expects a string
    } catch (err) {
      console.error("Chat error:", err);
      throw err;
    }
  };

  const handleReset = async () => {
    setCurrentStep(1);
    setCompletedSteps([]);
    setData(null);
    setSchema(null);
    setQuestions(null);
    setReportConfig(null);
    setSessionId(null);
    setAnalysis(null);
    setAnalysisApproved(false);
    setVizProposals(null);
    setAuditPassed(null);
    setAuditDiscrepancies([]);

    try {
      await fetch('/api/admin/logs', { method: 'DELETE' });
    } catch (e) {
      console.error("Failed to clear logs", e);
    }
  };

  const handleTabChange = (step: number) => {
    // Steps 4 and 5 require analysis to be approved first
    if ((step === 4 || step === 5) && !analysisApproved) {
      return; // Block navigation
    }
    if (step === 1 || completedSteps.includes(step - 1) || completedSteps.includes(step)) {
      setCurrentStep(step);
    }
  };

  return (
    <div className="relative flex h-screen w-full bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 overflow-hidden">

      {/* Sidebar Navigation */}
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark">
        <div className="p-6 flex items-center gap-3">
          <div className="size-8 bg-primary rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-primary">DataLens AI</h1>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <button onClick={() => setCurrentStep(1)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${currentStep === 1 ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: currentStep === 1 ? "'FILL' 1" : "'FILL' 0" }}>database</span>
            <span className="font-medium">Mis Datos</span>
          </button>

          <button onClick={() => setCurrentStep(2)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${currentStep === 2 ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: currentStep === 2 ? "'FILL' 1" : "'FILL' 0" }}>auto_awesome</span>
            <span className="font-medium">Schema IA</span>
            {isAnalyzing && currentStep !== 2 && <span className="size-2 rounded-full bg-primary animate-pulse ml-auto" />}
          </button>

          <button onClick={() => setCurrentStep(3)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${currentStep === 3 ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: currentStep === 3 ? "'FILL' 1" : "'FILL' 0" }}>psychology</span>
            <span className="font-medium">Análisis</span>
          </button>

          <button onClick={() => handleTabChange(4)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${!analysisApproved ? 'opacity-40 cursor-not-allowed' : ''} ${currentStep === 4 ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`} disabled={!analysisApproved}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: currentStep === 4 ? "'FILL' 1" : "'FILL' 0" }}>dashboard_customize</span>
            <span className="font-medium">Visualización</span>
            {!analysisApproved && <span className="material-symbols-outlined text-xs ml-auto text-slate-400">lock</span>}
          </button>

          <button onClick={() => handleTabChange(5)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${!analysisApproved ? 'opacity-40 cursor-not-allowed' : ''} ${currentStep === 5 ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`} disabled={!analysisApproved}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: currentStep === 5 ? "'FILL' 1" : "'FILL' 0" }}>dashboard</span>
            <span className="font-medium">Dashboard</span>
            {!analysisApproved && <span className="material-symbols-outlined text-xs ml-auto text-slate-400">lock</span>}
          </button>

          <button onClick={() => setCurrentStep(6)} className={`w-full flex items-center gap-3 px-3 py-2 mt-4 rounded-lg transition-colors ${currentStep === 6 ? 'bg-slate-800 text-green-400 border border-green-500/30' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: currentStep === 6 ? "'FILL' 1" : "'FILL' 0" }}>terminal</span>
            <span className="font-medium">Admin / Logs</span>
          </button>
        </nav>

        <TokenUsageWidget sessionId={sessionId} />

        {data && (
          <div className="p-4 border-t border-slate-200 dark:border-border-dark">
            <button onClick={handleReset} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors text-sm font-medium">
              <span className="material-symbols-outlined text-sm">delete</span>
              Limpiar Workspace
            </button>
          </div>
        )}

      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto w-full relative">
        {/* Mobile Header */}
        <header className="flex items-center justify-between p-4 bg-white dark:bg-surface-dark border-b border-slate-200 dark:border-border-dark sticky top-0 z-10 md:hidden">
          <span className="material-symbols-outlined text-slate-600 dark:text-slate-400 cursor-pointer">menu</span>
          <h2 className="text-lg font-bold">DataLens AI</h2>
          <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">account_circle</span>
        </header>

        {/* View Routing */}
        <div className="w-full h-full p-4 md:p-8">

          {/* STEP 1: DATA MANAGEMENT */}
          {currentStep === 1 && (
            <div className="space-y-8 max-w-7xl mx-auto w-full animate-fade-in">
              <section>
                <div className="mb-4">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Gestión de Datos</h2>
                  <p className="text-slate-500 text-sm">Sube y gestiona tus archivos para análisis de IA.</p>
                </div>

                {!data ? (
                  <FileUploader onDataLoaded={handleDataLoaded} isLoading={isAnalyzing} />
                ) : (
                  <div className="p-6 bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="size-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                          <span className="material-symbols-outlined">check_circle</span>
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-slate-100">Dataset Activo</h3>
                          <p className="text-sm text-slate-500">{data.length} registros cargados exitosamente.</p>
                        </div>
                      </div>
                      <button onClick={() => setCurrentStep(2)} className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors shadow-sm text-sm">
                        Iniciar Análisis IA
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* STEP 2: AI COMPREHENSION */}
          {currentStep === 2 && data && !schema && isAnalyzing && (
            <div className="max-w-5xl mx-auto w-full h-full flex flex-col items-center justify-center animate-fade-in pb-20">
              <div className="size-16 border-4 border-slate-200 dark:border-slate-800 border-t-primary rounded-full animate-spin mb-6"></div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Limpiando y Analizando Datos</h3>
              <p className="text-slate-500 max-w-md text-center">
                Pipeline de 7 agentes: FileInspector → Profiler → Cleaner → DuplicateDetector → [FormatValidator + OutlierDetector + IntegrityAuditor]. Luego analizando estructura semántica...
              </p>
            </div>
          )}

          {currentStep === 2 && data && schema && (
            <div className="max-w-5xl mx-auto w-full h-full flex flex-col animate-fade-in pb-20">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-slate-900 dark:text-slate-100 text-xl font-bold">Interacción y Validación</h3>
                <span className="text-xs font-semibold px-2 py-1 bg-primary/10 text-primary rounded-full uppercase">Sincronizado</span>
              </div>

              <InteractiveSheet data={data} schema={schema} />

              <div className="mt-6">
                <ComprehensionPanel
                  schema={schema}
                  questions={questions || []}
                  onSubmitAnswers={handleAnswersSubmitted}
                  onChatMessage={handleChatMessage}
                  isLoading={isAnalyzing}
                />
              </div>
            </div>
          )}

          {/* STEP 3: AI ANALYSIS (Phase 2) */}
          {currentStep === 3 && sessionId && (
            <div className="max-w-5xl mx-auto w-full animate-fade-in pb-20">
              <AnalysisPanel
                sessionId={sessionId}
                analysis={analysis}
                onAnalysisGenerated={(a) => setAnalysis(a)}
                onApproved={handleAnalysisApproved}
                onReset={handleReset}
              />
            </div>
          )}

          {/* STEP 4: VISUALIZATION PROPOSALS (Phase 3) */}
          {currentStep === 4 && sessionId && (
            <div className="max-w-5xl mx-auto w-full animate-fade-in pb-20">
              <VizProposalPanel
                sessionId={sessionId}
                proposals={vizProposals}
                schema={schema}
                onProposalsLoaded={(p) => setVizProposals(p)}
                onVizChosen={handleVizChosen}
              />
              {isAnalyzing && (
                <div className="mt-6 text-center">
                  <div className="inline-flex items-center gap-3 bg-surface-dark/50 border border-border-dark rounded-xl px-6 py-3">
                    <div className="size-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="text-sm text-slate-400">Generando dashboard con auditoría final...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: REPORTS DASHBOARD */}
          {currentStep === 5 && reportConfig && (
            <div className="max-w-7xl mx-auto w-full animate-fade-in">
              <div className="mb-6 flex justify-between items-end">
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard de Negocio</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Insights generados por Inteligencia Artificial</p>
                </div>
                <div className="flex items-center gap-3">
                  {auditPassed !== null && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${auditPassed ? 'bg-green-900/30 text-green-400 border border-green-500/30' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/30'}`}>
                      <span className="material-symbols-outlined text-sm">{auditPassed ? 'verified' : 'warning'}</span>
                      {auditPassed ? 'Auditoría Pasada' : 'Discrepancias'}
                    </span>
                  )}
                  <button onClick={() => setCurrentStep(4)} className="text-primary text-sm font-semibold hover:underline flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Cambiar Visualización
                  </button>
                </div>
              </div>

              <Dashboard reportConfig={reportConfig} />
            </div>
          )}

          {/* STEP 6: ADMIN TERMINAL & FLOW */}
          {currentStep === 6 && (
            <div className="max-w-7xl mx-auto w-full h-[calc(100vh-8rem)] animate-fade-in flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Live Agent Tracker</h2>
                  <p className="text-slate-500 text-sm">Auditoría completa de comunicaciones y llamadas a LLM.</p>
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                  <button
                    onClick={() => setAdminView('flow')}
                    className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-colors ${adminView === 'flow' ? 'bg-primary text-white shadow' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    <span className="material-symbols-outlined text-sm">account_tree</span> N8N Flow
                  </button>
                  <button
                    onClick={() => setAdminView('terminal')}
                    className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-colors ${adminView === 'terminal' ? 'bg-slate-900 dark:bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    <span className="material-symbols-outlined text-sm">terminal</span> Raw Terminal
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                {adminView === 'terminal' ? <AgentTerminal sessionId={sessionId} /> : <AgentFlowVisualizer sessionId={sessionId} />}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
