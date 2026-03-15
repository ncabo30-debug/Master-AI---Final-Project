'use client';

import React, { useState } from 'react';
import type { SchemaMap, QuestionOption } from '@/lib/agents/types';

interface ComprehensionPanelProps {
    schema?: SchemaMap;
    questions: QuestionOption[];
    onSubmitAnswers: (answers: Record<string, string>) => void;
    onChatMessage: (message: string) => Promise<string>;
    isLoading: boolean;
}

export default function ComprehensionPanel({ schema, questions, onSubmitAnswers, onChatMessage, isLoading }: ComprehensionPanelProps) {
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [chatInput, setChatInput] = useState('');
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
    const [isChatting, setIsChatting] = useState(false);

    const getSchemaType = (key: string) => {
        const value = schema?.[key];
        if (typeof value === 'object' && value && 'type' in value) {
            return typeof value.type === 'string' ? value.type : '';
        }

        return typeof value === 'string' ? value : '';
    };

    const handleSelectOption = (questionId: string, option: string) => {
        setAnswers(prev => ({ ...prev, [questionId]: option }));
    };

    const handleSubmitAnswers = () => {
        if (Object.keys(answers).length === questions.length) {
            onSubmitAnswers(answers);
        }
    };

    const handleSendChat = async () => {
        if (!chatInput.trim() || isChatting) return;
        const msg = chatInput.trim();
        setChatInput('');
        setChatHistory(prev => [...prev, { role: 'user', content: msg }]);
        setIsChatting(true);

        try {
            const reply = await onChatMessage(msg);
            setChatHistory(prev => [...prev, { role: 'ai', content: reply }]);
        } catch {
            setChatHistory(prev => [...prev, { role: 'ai', content: "Hubo un error al procesar tu pregunta. Verifica si tu IA local está corriendo o reintenta." }]);
        } finally {
            setIsChatting(false);
        }
    };

    if (!questions || questions.length === 0) return null;

    // Calcular un resumen simple de las columnas (número y algunas categóricas/numéricas)
    const categoricals = schema ? Object.keys(schema).filter(k => {
        const val = getSchemaType(k);
        return val === 'categorical' || val === 'boolean' || val === 'string';
    }) : [];

    const numerics = schema ? Object.keys(schema).filter(k => {
        const val = getSchemaType(k);
        return val === 'number' || val === 'integer' || val === 'float';
    }) : [];

    return (
        <div className="flex flex-col gap-6 w-full animate-fade-in delay-200">
            {/* Cabecera Principal - Integrada tipo dashboard widget */}
            <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl p-6 shadow-sm flex items-start gap-4">
                <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined text-2xl">model_training</span>
                </div>
                <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        Asistente de Inteligencia Artificial
                        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Activo</span>
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                        He analizado la estructura de tu vector de datos. Detecté <strong className="text-slate-900 dark:text-white">{categoricals.length}</strong> dimensiones y <strong className="text-slate-900 dark:text-white">{numerics.length}</strong> medidas.
                        Por favor, confírmame los parámetros clave para poder generar tu Dashboard Automático.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Panel Izquierdo: Parámetros del Dashboard */}
                <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-sm flex flex-col">
                    <div className="p-4 border-b border-slate-200 dark:border-border-dark flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>tune</span>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100">Configuración Requerida</h4>
                    </div>

                    <div className="p-6 flex-1 flex flex-col gap-6 overflow-y-auto max-h-[500px]">
                        {questions.map((q) => (
                            <div key={q.id} className="flex flex-col gap-3">
                                <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">{q.text}</p>
                                <div className="flex flex-wrap gap-2">
                                    {q.options.map((opt: string) => (
                                        <button
                                            key={opt}
                                            onClick={() => handleSelectOption(q.id, opt)}
                                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${answers[q.id] === opt
                                                ? 'bg-primary text-white border-primary shadow-sm'
                                                : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 relative overflow-hidden'
                                                }`}
                                        >
                                            {answers[q.id] === opt && <span className="absolute inset-0 bg-white/20"></span>}
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 border-t border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-slate-800/30">
                        <button
                            onClick={handleSubmitAnswers}
                            disabled={Object.keys(answers).length < questions.length || isLoading}
                            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all shadow-sm ${Object.keys(answers).length === questions.length && !isLoading
                                ? 'bg-primary text-white hover:bg-primary/90'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                }`}
                        >
                            {isLoading ? (
                                <><div className="size-4 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div> Generando...</>
                            ) : (
                                <>Generar Dashboard <span className="material-symbols-outlined text-sm">arrow_forward</span></>
                            )}
                        </button>
                    </div>
                </div>

                {/* Panel Derecho: Chat Interactivo */}
                <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-sm flex flex-col h-[600px]">
                    <div className="p-4 border-b border-slate-200 dark:border-border-dark flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-500" style={{ fontVariationSettings: "'FILL' 1" }}>chat_bubble</span>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100">Consultas Adicionales</h4>
                    </div>

                    <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4 bg-slate-50 dark:bg-slate-900/50">
                        {chatHistory.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-center px-4">
                                <span className="material-symbols-outlined text-4xl mb-2 opacity-50 block">forum</span>
                                <p className="text-sm font-medium">¿Tienes dudas sobre los datos? Pregúntame sobre tendencias, valores atípicos o distribuciones.</p>
                            </div>
                        ) : (
                            chatHistory.map((msg, i) => (
                                <div key={i} className={`flex gap-3 text-sm animate-fade-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'ai' && (
                                        <div className="size-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex-shrink-0 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                            <span className="material-symbols-outlined text-sm">smart_toy</span>
                                        </div>
                                    )}
                                    <div className={`px-4 py-3 rounded-2xl max-w-[85%] leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-sm' : 'bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark text-slate-700 dark:text-slate-200 rounded-tl-sm'}`}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))
                        )}
                        {isChatting && (
                            <div className="flex gap-3 text-sm justify-start animate-fade-in">
                                <div className="size-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex-shrink-0 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                    <span className="material-symbols-outlined text-sm">smart_toy</span>
                                </div>
                                <div className="px-4 py-3 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-tl-sm shadow-sm flex items-center gap-1.5 h-[44px]">
                                    <div className="size-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce"></div>
                                    <div className="size-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="size-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark rounded-b-xl">
                        <div className="flex gap-2 relative">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                placeholder="Escribe tu consulta aquí..."
                                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-slate-400"
                                disabled={isChatting}
                            />
                            <button
                                onClick={handleSendChat}
                                disabled={!chatInput.trim() || isChatting}
                                className="bg-primary text-white w-12 rounded-xl font-bold flex flex-shrink-0 items-center justify-center disabled:opacity-50 hover:bg-primary/90 transition-all shadow-sm"
                            >
                                <span className="material-symbols-outlined text-lg">send</span>
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
