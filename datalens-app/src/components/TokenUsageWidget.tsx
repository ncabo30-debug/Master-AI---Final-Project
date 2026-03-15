'use client';

import { useEffect, useState } from 'react';

interface TokenSummary {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCostUSD: number;
    callCount: number;
    byModel: Record<string, {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        costUSD: number;
        callCount: number;
    }>;
}

function formatNum(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
}

export default function TokenUsageWidget({ sessionId }: { sessionId?: string | null }) {
    const [summary, setSummary] = useState<TokenSummary | null>(null);

    useEffect(() => {
        if (!sessionId) return;

        const fetchUsage = async () => {
            try {
                const res = await fetch(`/api/admin/tokens?sessionId=${sessionId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.callCount > 0) setSummary(data);
                }
            } catch { /* silent */ }
        };

        fetchUsage();
        const interval = setInterval(fetchUsage, 5000);
        return () => clearInterval(interval);
    }, [sessionId]);

    if (!summary || summary.callCount === 0) return null;

    return (
        <div className="p-4 border-t border-slate-200 dark:border-border-dark">
            <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-sm text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>toll</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Consumo IA</span>
            </div>

            {/* Main stats */}
            <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Tokens totales</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{formatNum(summary.totalTokens)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Llamadas LLM</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{summary.callCount}</span>
                </div>
                <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Costo estimado</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        ${summary.totalCostUSD.toFixed(4)}
                    </span>
                </div>
            </div>

            {/* Per-model breakdown */}
            {Object.entries(summary.byModel).length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    {Object.entries(summary.byModel).map(([model, stats]) => {
                        const shortName = model.replace('gemini-', '');
                        return (
                            <div key={model} className="text-[11px]">
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-slate-400 font-medium">{shortName}</span>
                                    <span className="text-slate-500">{stats.callCount} calls</span>
                                </div>
                                <div className="flex gap-2 text-[10px]">
                                    <span className="text-blue-400">↑{formatNum(stats.inputTokens)}</span>
                                    <span className="text-purple-400">↓{formatNum(stats.outputTokens)}</span>
                                    <span className="text-emerald-400 ml-auto">${stats.costUSD.toFixed(4)}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
