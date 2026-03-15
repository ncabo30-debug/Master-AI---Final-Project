'use client';

import { useState } from 'react';
import AgentTerminal from '@/components/AgentTerminal';
import AgentFlowVisualizer from '@/components/AgentFlowVisualizer';

interface AdminViewProps {
  sessionId: string | null;
  onBack: () => void;
}

export default function AdminView({ sessionId, onBack }: AdminViewProps) {
  const [adminView, setAdminView] = useState<'terminal' | 'flow'>('flow');

  return (
    <div className="flex h-screen w-full bg-background-dark font-display text-slate-100 overflow-hidden">
      {/* Sidebar back button */}
      <aside className="w-64 flex-col border-r border-border-dark bg-surface-dark hidden md:flex">
        <div className="p-6 flex items-center gap-3">
          <div className="size-8 bg-primary rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-primary">DataLens AI</h1>
        </div>
        <nav className="flex-1 px-4">
          <button
            onClick={onBack}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="font-medium">Volver</span>
          </button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">Live Agent Tracker</h2>
            <p className="text-slate-500 text-sm">Auditoría completa de comunicaciones y llamadas a LLM.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setAdminView('flow')}
                className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-colors ${adminView === 'flow' ? 'bg-primary text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <span className="material-symbols-outlined text-sm">account_tree</span> N8N Flow
              </button>
              <button
                onClick={() => setAdminView('terminal')}
                className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-colors ${adminView === 'terminal' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <span className="material-symbols-outlined text-sm">terminal</span> Raw Terminal
              </button>
            </div>
            <button
              onClick={onBack}
              className="md:hidden flex items-center gap-1 px-3 py-2 text-slate-400 hover:text-slate-200 text-sm"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Volver
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          {adminView === 'terminal' ? (
            <AgentTerminal sessionId={sessionId} />
          ) : (
            <AgentFlowVisualizer sessionId={sessionId} />
          )}
        </div>
      </main>
    </div>
  );
}
