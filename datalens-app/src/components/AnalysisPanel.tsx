'use client';
import { useState } from 'react';

interface AnalysisPanelProps {
    sessionId: string;
    analysis: string | null;
    onAnalysisGenerated: (analysis: string) => void;
    onApproved: () => void;
    onReset?: () => void; // M5: escalation option (c) — discard
}

const MAX_REJECTIONS = 3; // M5: límite de iteraciones

export default function AnalysisPanel({ sessionId, analysis, onAnalysisGenerated, onApproved, onReset }: AnalysisPanelProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isRevising, setIsRevising] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [showFeedbackForm, setShowFeedbackForm] = useState(false);
    const [currentAnalysis, setCurrentAnalysis] = useState(analysis);
    const [rejectionCount, setRejectionCount] = useState(0);
    const [feedbackHistory, setFeedbackHistory] = useState<string[]>([]);
    const [escalated, setEscalated] = useState(false);

    const generateAnalysis = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'generate_analysis', sessionId })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            setCurrentAnalysis(result.analysis);
            onAnalysisGenerated(result.analysis);
        } catch (err: any) {
            console.error(err);
            alert('Error generando el análisis.');
        } finally {
            setIsLoading(false);
        }
    };

    const reviseAnalysis = async () => {
        if (!feedback.trim()) return;
        setIsRevising(true);
        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'revise_analysis', sessionId, feedback })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            setCurrentAnalysis(result.analysis);
            onAnalysisGenerated(result.analysis);

            const newCount = rejectionCount + 1;
            setRejectionCount(newCount);
            setFeedbackHistory(prev => [...prev, feedback]);
            setFeedback('');
            setShowFeedbackForm(false);

            // M5: Si llegamos al límite, escalar
            if (newCount >= MAX_REJECTIONS) {
                setEscalated(true);
            }
        } catch (err: any) {
            console.error(err);
            alert('Error revisando el análisis.');
        } finally {
            setIsRevising(false);
        }
    };

    // Auto-generate on first render if no analysis exists
    if (!currentAnalysis && !isLoading) {
        generateAnalysis();
    }

    return (
        <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{
                fontSize: '20px',
                fontWeight: 600,
                marginBottom: '8px',
                color: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <span className="material-symbols-rounded" style={{ color: '#a78bfa' }}>analytics</span>
                Análisis Inteligente
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px' }}>
                El agente analista generó el siguiente análisis basado en los datos limpiados.
                {rejectionCount > 0 && !escalated && (
                    <span style={{ color: '#f59e0b' }}> (Intento {rejectionCount + 1}/{MAX_REJECTIONS + 1})</span>
                )}
            </p>

            {isLoading ? (
                <div style={{
                    background: 'rgba(99, 102, 241, 0.05)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    borderRadius: '12px',
                    padding: '40px',
                    textAlign: 'center',
                    color: '#94a3b8'
                }}>
                    <div style={{
                        width: '32px', height: '32px',
                        border: '3px solid rgba(99, 102, 241, 0.3)',
                        borderTop: '3px solid #6366f1',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 16px'
                    }} />
                    Generando análisis con IA...
                </div>
            ) : currentAnalysis ? (
                <>
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                        borderRadius: '12px',
                        padding: '24px',
                        marginBottom: '20px',
                        lineHeight: 1.7,
                        color: '#cbd5e1',
                        fontSize: '14px',
                        whiteSpace: 'pre-wrap'
                    }}>
                        {currentAnalysis}
                    </div>

                    {/* M5: Panel de escalamiento después de 3 rechazos */}
                    {escalated ? (
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.05)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '12px',
                            padding: '24px',
                            marginBottom: '16px'
                        }}>
                            <h3 style={{ color: '#f87171', fontSize: '16px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>warning</span>
                                Escalamiento — {MAX_REJECTIONS} rechazos consecutivos
                            </h3>
                            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px', lineHeight: 1.6 }}>
                                Se alcanzó el límite de iteraciones. A continuación los feedbacks anteriores:
                            </p>
                            <ul style={{ padding: '0 0 0 16px', marginBottom: '16px' }}>
                                {feedbackHistory.map((fb, i) => (
                                    <li key={i} style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                                        <strong style={{ color: '#fbbf24' }}>Intento {i + 1}:</strong> {fb}
                                    </li>
                                ))}
                            </ul>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <button
                                    onClick={onApproved}
                                    style={{
                                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                        color: 'white', border: 'none', borderRadius: '10px',
                                        padding: '12px 24px', fontSize: '14px', fontWeight: 600,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>check</span>
                                    (a) Aceptar con reservas
                                </button>
                                <button
                                    onClick={() => {
                                        // Export history as text for manual review
                                        const blob = new Blob([
                                            `Historial de análisis — ${MAX_REJECTIONS} intentos\n\n` +
                                            feedbackHistory.map((fb, i) => `Intento ${i + 1}: ${fb}`).join('\n') +
                                            `\n\nÚltimo análisis:\n${currentAnalysis}`
                                        ], { type: 'text/plain' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url; a.download = 'historial_analisis.txt'; a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                    style={{
                                        background: 'transparent', color: '#60a5fa',
                                        border: '1px solid rgba(96, 165, 250, 0.3)', borderRadius: '10px',
                                        padding: '12px 24px', fontSize: '14px', fontWeight: 600,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>download</span>
                                    (b) Descargar historial para revisión manual
                                </button>
                                {onReset && (
                                    <button
                                        onClick={onReset}
                                        style={{
                                            background: 'transparent', color: '#ef4444',
                                            border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px',
                                            padding: '12px 24px', fontSize: '14px', fontWeight: 600,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>delete_forever</span>
                                        (c) Descartar y empezar con otros datos
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : showFeedbackForm ? (
                        <div style={{
                            background: 'rgba(245, 158, 11, 0.05)',
                            border: '1px solid rgba(245, 158, 11, 0.2)',
                            borderRadius: '12px',
                            padding: '20px',
                            marginBottom: '16px'
                        }}>
                            <label style={{ color: '#fbbf24', fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                                ¿Qué es incorrecto o qué debe corregir? ({rejectionCount + 1}/{MAX_REJECTIONS})
                            </label>
                            <textarea
                                value={feedback}
                                onChange={e => setFeedback(e.target.value)}
                                rows={3}
                                style={{
                                    width: '100%',
                                    background: 'rgba(15, 23, 42, 0.6)',
                                    border: '1px solid rgba(148, 163, 184, 0.15)',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    color: '#e2e8f0',
                                    fontSize: '13px',
                                    resize: 'vertical',
                                    marginBottom: '12px'
                                }}
                                placeholder="Ej: Los totales de ventas parecen incorrectos, la tendencia debería ser descendente..."
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={reviseAnalysis}
                                    disabled={isRevising || !feedback.trim()}
                                    style={{
                                        background: '#f59e0b', color: '#0f172a',
                                        border: 'none', borderRadius: '8px',
                                        padding: '8px 20px', fontSize: '13px', fontWeight: 600,
                                        cursor: 'pointer',
                                        opacity: isRevising || !feedback.trim() ? 0.5 : 1
                                    }}
                                >
                                    {isRevising ? 'Revisando...' : 'Enviar Corrección'}
                                </button>
                                <button
                                    onClick={() => { setShowFeedbackForm(false); setFeedback(''); }}
                                    style={{
                                        background: 'transparent', color: '#94a3b8',
                                        border: '1px solid rgba(148, 163, 184, 0.2)',
                                        borderRadius: '8px', padding: '8px 16px',
                                        fontSize: '13px', cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={onApproved}
                                style={{
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: 'white', border: 'none', borderRadius: '10px',
                                    padding: '12px 28px', fontSize: '14px', fontWeight: 600,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>check_circle</span>
                                Aprobar Análisis
                            </button>
                            <button
                                onClick={() => setShowFeedbackForm(true)}
                                style={{
                                    background: 'transparent', color: '#f59e0b',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                    borderRadius: '10px', padding: '12px 28px',
                                    fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>edit_note</span>
                                Rechazar / Corregir
                            </button>
                        </div>
                    )}
                </>
            ) : null}
        </div>
    );
}
