'use client';
import { useState } from 'react';
import type { VizProposal } from '@/lib/agents/types';

interface VizProposalPanelProps {
    sessionId: string;
    proposals: VizProposal[] | null;
    schema: any;
    onProposalsLoaded: (proposals: VizProposal[]) => void;
    onVizChosen: (viz: VizProposal) => void;
}

const MAX_FEASIBILITY_RETRIES = 2; // M6: límite de intentos de factibilidad

const CHART_ICONS: Record<string, string> = {
    bar: 'bar_chart', line: 'show_chart', scatter: 'scatter_plot',
    pie: 'pie_chart', area: 'area_chart', heatmap: 'grid_on',
};
const CHART_COLORS: Record<string, string> = {
    bar: '#6366f1', line: '#10b981', scatter: '#f59e0b',
    pie: '#ec4899', area: '#3b82f6', heatmap: '#ef4444',
};

export default function VizProposalPanel({ sessionId, proposals, schema, onProposalsLoaded, onVizChosen }: VizProposalPanelProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [currentProposals, setCurrentProposals] = useState<VizProposal[] | null>(proposals);
    const [feasibilityIssues, setFeasibilityIssues] = useState<string[]>([]);
    const [feasibilityRetries, setFeasibilityRetries] = useState(0);

    const loadProposals = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'propose_visualizations', sessionId })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            setCurrentProposals(result.proposals);
            onProposalsLoaded(result.proposals);
        } catch (err: any) {
            console.error(err);
            alert('Error generando propuestas de visualización.');
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-load proposals
    if (!currentProposals && !isLoading) {
        loadProposals();
    }

    const handleSelect = async (viz: VizProposal) => {
        setSelectedId(viz.id);
        setFeasibilityIssues([]);
        setIsValidating(true);

        try {
            // M6: Validate feasibility before proceeding
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'validate_viz', sessionId, viz })
            });
            const result = await res.json();

            if (result.feasible) {
                // Factible → proceder al dashboard
                onVizChosen(viz);
            } else {
                // No factible → mostrar issues
                const retryCount = feasibilityRetries + 1;
                setFeasibilityRetries(retryCount);
                setFeasibilityIssues(result.issues || ['Visualización no factible.']);

                // M6: Si se supera el límite de reintentos, proceder de todas formas
                if (retryCount >= MAX_FEASIBILITY_RETRIES) {
                    setFeasibilityIssues(prev => [...prev, '⚠️ Máximo de reintentos alcanzado. Puedes proceder de todas formas.']);
                }
            }
        } catch (err: any) {
            console.error(err);
            // Si falla la validación, proceder de todas formas
            onVizChosen(viz);
        } finally {
            setIsValidating(false);
        }
    };

    const forceSelect = () => {
        const viz = currentProposals?.find(p => p.id === selectedId);
        if (viz) onVizChosen(viz);
    };

    return (
        <div style={{ padding: '32px', maxWidth: '900px', margin: '0 auto' }}>
            <h2 style={{
                fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: '#e2e8f0',
                display: 'flex', alignItems: 'center', gap: '8px'
            }}>
                <span className="material-symbols-rounded" style={{ color: '#3b82f6' }}>dashboard_customize</span>
                Propuestas de Visualización
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px' }}>
                El experto en visualización propone 3 combinaciones. Elige la que mejor represente tus datos.
            </p>

            {isLoading ? (
                <div style={{
                    background: 'rgba(59, 130, 246, 0.05)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    borderRadius: '12px',
                    padding: '40px', textAlign: 'center', color: '#94a3b8'
                }}>
                    <div style={{
                        width: '32px', height: '32px',
                        border: '3px solid rgba(59, 130, 246, 0.3)',
                        borderTop: '3px solid #3b82f6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 16px'
                    }} />
                    Analizando las mejores visualizaciones...
                </div>
            ) : currentProposals ? (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
                        {currentProposals.map(viz => {
                            const isSelected = selectedId === viz.id;
                            const color = CHART_COLORS[viz.chartType] || '#6366f1';
                            return (
                                <button
                                    key={viz.id}
                                    onClick={() => handleSelect(viz)}
                                    disabled={isValidating}
                                    style={{
                                        background: isSelected
                                            ? `linear-gradient(135deg, ${color}15, ${color}08)`
                                            : 'rgba(30, 41, 59, 0.6)',
                                        border: isSelected
                                            ? `2px solid ${color}`
                                            : '1px solid rgba(148, 163, 184, 0.1)',
                                        borderRadius: '14px',
                                        padding: '24px', textAlign: 'left',
                                        cursor: isValidating ? 'wait' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        opacity: isValidating && !isSelected ? 0.5 : 1
                                    }}
                                >
                                    <div style={{
                                        width: '44px', height: '44px', borderRadius: '12px',
                                        background: `${color}20`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        marginBottom: '14px'
                                    }}>
                                        <span className="material-symbols-rounded" style={{ color, fontSize: '24px' }}>
                                            {CHART_ICONS[viz.chartType] || 'bar_chart'}
                                        </span>
                                    </div>
                                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
                                        {viz.title}
                                    </h3>
                                    <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '12px' }}>
                                        {viz.description}
                                    </p>
                                    <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span>📊 {viz.chartType.toUpperCase()}</span>
                                        <span>X: {viz.xAxis} → Y: {viz.yAxis}</span>
                                        {viz.groupBy && <span>Agrupar: {viz.groupBy}</span>}
                                        {viz.filters && viz.filters.length > 0 && <span>Filtros: {viz.filters.join(', ')}</span>}
                                    </div>
                                    {isSelected && isValidating && (
                                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '12px' }}>
                                            <div style={{ width: '14px', height: '14px', border: '2px solid', borderTop: `2px solid ${color}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                            Validando factibilidad...
                                        </div>
                                    )}
                                    {isSelected && !isValidating && feasibilityIssues.length === 0 && (
                                        <div style={{ marginTop: '12px', background: color, color: 'white', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, textAlign: 'center' }}>
                                            ✓ Seleccionado
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* M6: Issues de factibilidad */}
                    {feasibilityIssues.length > 0 && (
                        <div style={{
                            marginTop: '16px',
                            background: 'rgba(245, 158, 11, 0.05)',
                            border: '1px solid rgba(245, 158, 11, 0.2)',
                            borderRadius: '12px',
                            padding: '20px'
                        }}>
                            <h4 style={{ color: '#fbbf24', fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>warning</span>
                                Visualización no factible ({feasibilityRetries}/{MAX_FEASIBILITY_RETRIES})
                            </h4>
                            <ul style={{ padding: '0 0 0 16px', marginBottom: '12px' }}>
                                {feasibilityIssues.map((issue, i) => (
                                    <li key={i} style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '4px' }}>{issue}</li>
                                ))}
                            </ul>
                            <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>
                                Elige otra visualización o procede con la actual.
                            </p>

                            {feasibilityRetries >= MAX_FEASIBILITY_RETRIES && (
                                <button
                                    onClick={forceSelect}
                                    style={{
                                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                        color: 'white', border: 'none', borderRadius: '8px',
                                        padding: '8px 20px', fontSize: '13px', fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Proceder de todas formas →
                                </button>
                            )}
                        </div>
                    )}
                </>
            ) : null}
        </div>
    );
}
