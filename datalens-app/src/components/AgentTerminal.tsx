'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AgentMessage } from '@/lib/agents/core/AgentBus';

export default function AgentTerminal({ sessionId }: { sessionId?: string | null }) {
    const [logs, setLogs] = useState<AgentMessage[]>([]);
    const [autoScroll, setAutoScroll] = useState(true);
    const endOfLogsRef = useRef<HTMLDivElement>(null);

    const fetchLogs = useCallback(async () => {
        try {
            const url = sessionId ? `/api/admin/logs?sessionId=${sessionId}` : '/api/admin/logs';
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs);
            }
        } catch (e) {
            console.error('Failed to fetch admin logs', e);
        }
    }, [sessionId]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            void fetchLogs();
        }, 0);
        const interval = setInterval(fetchLogs, 2000);
        return () => {
            clearTimeout(timeoutId);
            clearInterval(interval);
        };
    }, [fetchLogs]);

    useEffect(() => {
        if (autoScroll && endOfLogsRef.current) {
            endOfLogsRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, autoScroll]);

    const clearLogs = async () => {
        const url = sessionId ? `/api/admin/logs?sessionId=${sessionId}` : '/api/admin/logs';
        await fetch(url, { method: 'DELETE' });
        setLogs([]);
    };

    const getAgentColor = (agentId: string) => {
        if (agentId.includes('schema')) return 'text-blue-400';
        if (agentId.includes('comp')) return 'text-green-400';
        if (agentId.includes('report')) return 'text-purple-400';
        if (agentId.includes('manager')) return 'text-yellow-400';
        return 'text-slate-400';
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a] rounded-xl border border-slate-800 shadow-2xl overflow-hidden font-mono text-sm relative">
            <div className="bg-[#1a1a1a] p-3 border-b border-slate-800 flex items-center justify-between z-10">
                <div className="flex items-center gap-2 text-slate-300">
                    <span className="material-symbols-outlined text-green-500 text-lg">terminal</span>
                    <span className="font-bold tracking-wider">AGENT_BUS_MONITOR</span>
                    <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full animate-pulse">LIVESTREAM</span>
                </div>
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-slate-400 text-xs cursor-pointer hover:text-white transition-colors">
                        <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-green-500" />
                        Auto-Scroll
                    </label>
                    <button onClick={() => {
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
                        const downloadAnchorNode = document.createElement('a');
                        downloadAnchorNode.setAttribute("href", dataStr);
                        downloadAnchorNode.setAttribute("download", "datalens_agent_logs_" + Date.now() + ".json");
                        document.body.appendChild(downloadAnchorNode);
                        downloadAnchorNode.click();
                        downloadAnchorNode.remove();
                    }} className="text-slate-400 hover:text-blue-400 text-xs transition-colors flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">download</span> Export
                    </button>
                    <button onClick={clearLogs} className="text-slate-400 hover:text-red-400 text-xs transition-colors flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">delete</span> Clear
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {logs.length === 0 ? (
                    <div className="text-slate-600 italic">Waiting for agent activity...</div>
                ) : (
                    logs.map((log) => (
                        <div key={log.id} className="bg-black/50 p-3 rounded border border-slate-800 hover:border-slate-700 transition-colors">
                            <div className="flex items-center gap-2 mb-2 text-xs">
                                <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                <span className={`font-bold ${getAgentColor(log.from)}`}>[{log.from}]</span>
                                <span className="text-slate-400 material-symbols-outlined text-xs">arrow_forward</span>
                                <span className={`font-bold ${getAgentColor(log.to)}`}>[{log.to}]</span>
                                <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded ml-2 uppercase font-semibold text-[10px] tracking-wide">
                                    {log.type}
                                </span>
                            </div>
                            <details className="text-slate-300">
                                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300 mb-1 select-none">View Payload</summary>
                                <pre className="text-[11px] bg-[#111] p-2 rounded text-green-300 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto border border-green-900/30">
                                    {JSON.stringify(log.payload, null, 2)}
                                </pre>
                            </details>
                        </div>
                    ))
                )}
                <div ref={endOfLogsRef} />
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: #333;
                    border-radius: 10px;
                }
            `}</style>
        </div>
    );
}
