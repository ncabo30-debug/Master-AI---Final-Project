'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AnalysisPanelProps {
    sessionId: string;
    analysis: string | null;
    onAnalysisGenerated: (analysis: string) => void;
    onApproved: () => void;
    onReset?: () => void;
}

const MAX_REJECTIONS = 3;

export default function AnalysisPanel({ sessionId, analysis, onAnalysisGenerated, onApproved, onReset }: AnalysisPanelProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isRevising, setIsRevising] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [showFeedbackForm, setShowFeedbackForm] = useState(false);
    const [currentAnalysis, setCurrentAnalysis] = useState(analysis);
    const [rejectionCount, setRejectionCount] = useState(0);
    const [feedbackHistory, setFeedbackHistory] = useState<string[]>([]);
    const [escalated, setEscalated] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const autoRequestedSessionRef = useRef<string | null>(null);

    useEffect(() => {
        setCurrentAnalysis(analysis);
    }, [analysis]);

    const generateAnalysis = useCallback(async (isAuto = false) => {
        setIsLoading(true);
        setLoadError(null);

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
        } catch (err: unknown) {
            console.error(err);
            if (isAuto) {
                setLoadError('No se pudo generar el analisis automaticamente. Reintenta manualmente.');
            } else {
                alert('Error generando el analisis.');
            }
        } finally {
            setIsLoading(false);
        }
    }, [onAnalysisGenerated, sessionId]);

    useEffect(() => {
        if (!sessionId || currentAnalysis || autoRequestedSessionRef.current === sessionId) {
            return;
        }

        autoRequestedSessionRef.current = sessionId;
        void generateAnalysis(true);
    }, [currentAnalysis, generateAnalysis, sessionId]);

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
            setFeedbackHistory((prev) => [...prev, feedback]);
            setFeedback('');
            setShowFeedbackForm(false);

            if (newCount >= MAX_REJECTIONS) {
                setEscalated(true);
            }
        } catch (err: unknown) {
            console.error(err);
            alert('Error revisando el analisis.');
        } finally {
            setIsRevising(false);
        }
    };

    const handleRetry = async () => {
        autoRequestedSessionRef.current = sessionId;
        await generateAnalysis(false);
    };

    return (
        <div className="mx-auto max-w-4xl px-4 py-8">
            <div className="mb-6">
                <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    <span className="material-symbols-rounded text-primary">analytics</span>
                    Analisis Inteligente
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    El agente analista genero el siguiente analisis basado en los datos limpiados.
                    {rejectionCount > 0 && !escalated && (
                        <span className="text-amber-600 dark:text-amber-400"> (Intento {rejectionCount + 1}/{MAX_REJECTIONS + 1})</span>
                    )}
                </p>
            </div>

            {isLoading ? (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 px-6 py-10 text-center text-slate-600 dark:text-slate-400">
                    <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
                    Generando analisis con IA...
                </div>
            ) : currentAnalysis ? (
                <>
                    <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-border-dark dark:bg-surface-dark">
                        <div className="space-y-4 text-sm leading-7 text-slate-700 dark:text-slate-200">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    h1: ({ children }) => <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{children}</h1>,
                                    h2: ({ children }) => <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{children}</h2>,
                                    h3: ({ children }) => <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{children}</h3>,
                                    p: ({ children }) => <p>{children}</p>,
                                    ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
                                    ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
                                    li: ({ children }) => <li>{children}</li>,
                                    table: ({ children }) => (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full border-collapse overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                                                {children}
                                            </table>
                                        </div>
                                    ),
                                    thead: ({ children }) => <thead className="bg-slate-100 dark:bg-slate-800">{children}</thead>,
                                    th: ({ children }) => <th className="border border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide dark:border-slate-700">{children}</th>,
                                    td: ({ children }) => <td className="border border-slate-200 px-3 py-2 align-top dark:border-slate-700">{children}</td>,
                                    strong: ({ children }) => <strong className="font-semibold text-slate-900 dark:text-slate-100">{children}</strong>,
                                    code: ({ children }) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{children}</code>,
                                }}
                            >
                                {currentAnalysis}
                            </ReactMarkdown>
                        </div>
                    </div>

                    {escalated ? (
                        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-500/30 dark:bg-red-500/10">
                            <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-red-700 dark:text-red-300">
                                <span className="material-symbols-rounded text-lg">warning</span>
                                Escalamiento - {MAX_REJECTIONS} rechazos consecutivos
                            </h3>
                            <p className="mb-4 text-sm text-slate-700 dark:text-slate-300">
                                Se alcanzo el limite de iteraciones. A continuacion figuran los feedbacks anteriores:
                            </p>
                            <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
                                {feedbackHistory.map((fb, i) => (
                                    <li key={i}>
                                        <span className="font-semibold text-amber-700 dark:text-amber-400">Intento {i + 1}:</span> {fb}
                                    </li>
                                ))}
                            </ul>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={onApproved}
                                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-600"
                                >
                                    <span className="material-symbols-rounded text-lg">check</span>
                                    (a) Aceptar con reservas
                                </button>
                                <button
                                    onClick={() => {
                                        const blob = new Blob([
                                            `Historial de analisis - ${MAX_REJECTIONS} intentos\n\n`
                                            + feedbackHistory.map((fb, i) => `Intento ${i + 1}: ${fb}`).join('\n')
                                            + `\n\nUltimo analisis:\n${currentAnalysis}`
                                        ], { type: 'text/plain' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = 'historial_analisis.txt';
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                    className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/10"
                                >
                                    <span className="material-symbols-rounded text-lg">download</span>
                                    (b) Descargar historial para revision manual
                                </button>
                                {onReset && (
                                    <button
                                        onClick={onReset}
                                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                                    >
                                        <span className="material-symbols-rounded text-lg">delete_forever</span>
                                        (c) Descartar y empezar con otros datos
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : showFeedbackForm ? (
                        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
                            <label className="mb-2 block text-sm font-semibold text-amber-700 dark:text-amber-300">
                                Que es incorrecto o que debe corregir? ({rejectionCount + 1}/{MAX_REJECTIONS})
                            </label>
                            <textarea
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                rows={3}
                                className="mb-3 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                placeholder="Ej: Los totales de ventas parecen incorrectos, la tendencia deberia ser descendente..."
                            />
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={reviseAnalysis}
                                    disabled={isRevising || !feedback.trim()}
                                    className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isRevising ? 'Revisando...' : 'Enviar correccion'}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowFeedbackForm(false);
                                        setFeedback('');
                                    }}
                                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={onApproved}
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                            >
                                <span className="material-symbols-rounded text-lg">check_circle</span>
                                Aprobar analisis
                            </button>
                            <button
                                onClick={() => setShowFeedbackForm(true)}
                                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-5 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
                            >
                                <span className="material-symbols-rounded text-lg">edit_note</span>
                                Rechazar / Corregir
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-500/30 dark:bg-red-500/10">
                    <p className="text-sm text-red-700 dark:text-red-300">
                        {loadError || 'No se encontro un analisis generado para esta sesion.'}
                    </p>
                    <button
                        onClick={handleRetry}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-white dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                    >
                        <span className="material-symbols-rounded text-lg">refresh</span>
                        Reintentar generacion
                    </button>
                </div>
            )}
        </div>
    );
}
