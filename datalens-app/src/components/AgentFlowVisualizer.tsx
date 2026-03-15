'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, Node, Edge, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import { AgentMessage } from '@/lib/agents/core/AgentBus';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function getPayloadDuration(payload: unknown): number | null {
    if (!isRecord(payload) || typeof payload.durationMs !== 'number') return null;
    return payload.durationMs;
}

function getPayloadMessage(payload: unknown): string | null {
    if (!isRecord(payload) || typeof payload.message !== 'string') return null;
    return payload.message;
}

function isLLMTracePayload(payload: unknown): payload is { prompt: string; response: string; durationMs?: number } {
    return isRecord(payload) && typeof payload.prompt === 'string' && typeof payload.response === 'string';
}

// ── Agent identity extraction ──────────────────────────
function getAgentType(agentId: string): string {
    const prefix = agentId.split('-')[0];
    const map: Record<string, string> = {
        'manager': 'Manager',
        'file': 'Inspector',
        'profiler': 'Profiler',
        'cleaner': 'Cleaner',
        'dup': 'Duplicados',
        'fmt': 'Validador',
        'outlier': 'Outliers',
        'int': 'Auditor',
        'schema': 'Schema IA',
        'comp': 'Comprensión',
        'analyst': 'Análisis',
        'viz': 'Viz Expert',
        'specialist': 'Specialist',
        'validator': 'Validador',
        'chat': 'Chat',
        'fallback': 'Fallback',
        'report': 'Report',
    };
    return map[prefix] || prefix;
}

// ── Friendly message type labels ──────────────────────
function getTypeLabel(type: string): string {
    const map: Record<string, string> = {
        'PIPELINE_STEP': '📋 Pipeline',
        'LLM_TRACE': '🤖 Llamada IA',
        'AGENT_ERROR': '❌ Error',
        'ANALYZE_SCHEMA': '🔍 Analizar Schema',
        'SCHEMA_ANALYZED': '✅ Schema Listo',
        'GENERATE_QUESTIONS': '❓ Generar Preguntas',
        'QUESTIONS_GENERATED': '✅ Preguntas Listas',
        'GENERATE_ANALYSIS': '📊 Generar Análisis',
        'ANALYSIS_GENERATED': '✅ Análisis Listo',
        'EXECUTION_LOG': '⚙️ Ejecución',
    };
    return map[type] || type;
}

// ── Which message types involve AI ──────────────────
const AI_TYPES = new Set(['LLM_TRACE']);
const AI_ACTIONS = new Set([
    'ANALYZE_SCHEMA', 'GENERATE_QUESTIONS', 'GENERATE_ANALYSIS',
]);

function involvesAI(log: AgentMessage): boolean {
    if (AI_TYPES.has(log.type)) return true;
    if (AI_ACTIONS.has(log.type)) return true;
    // Check agent prefix for known AI agents
    const prefix = log.from.split('-')[0];
    return ['schema', 'comp', 'analyst', 'viz', 'specialist', 'chat'].includes(prefix) && log.type !== 'PIPELINE_STEP';
}

// ── Swim lane columns ──────────────────────────────
const LANES: Record<string, number> = {
    'system': 0,
    'manager': 1,
    'file': 2,
    'profiler': 2,
    'cleaner': 3,
    'dup': 4,
    'fmt': 4,
    'outlier': 5,
    'int': 5,
    'schema': 3,
    'comp': 4,
    'analyst': 3,
    'viz': 3,
    'specialist': 3,
    'chat': 3,
    'validator': 4,
    'fallback': 4,
    'report': 4,
};

const LANE_WIDTH = 220;
const ROW_HEIGHT = 90;
const NODE_W = 180;

export default function AgentFlowVisualizer({ sessionId }: { sessionId?: string | null }) {
    const [logs, setLogs] = useState<AgentMessage[]>([]);
    const [selectedPayload, setSelectedPayload] = useState<AgentMessage | null>(null);

    const fetchLogs = useCallback(async () => {
        try {
            const url = sessionId ? `/api/admin/logs?sessionId=${sessionId}` : '/api/admin/logs';
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs);
            }
        } catch (error) {
            console.error('Failed to fetch admin logs', error);
        }
    }, [sessionId]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            void fetchLogs();
        }, 0);
        const interval = setInterval(fetchLogs, 3000);
        return () => {
            clearTimeout(timeoutId);
            clearInterval(interval);
        };
    }, [fetchLogs]);

    const { nodes, edges } = useMemo(() => {
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // Track y-position per lane to detect parallel placement
        const laneY: Record<number, number> = {};
        // Track last node per lane for connecting edges
        const laneLastNode: Record<number, string> = {};
        // Track last timestamp per lane to detect parallelism
        const laneLastTs: Record<number, number> = {};
        // Global y for sequential fallback
        let globalY = 80;

        // Detect active lanes for lane headers
        const activeLanes = new Set<number>();

        logs.forEach((log) => {
            const prefix = log.from.split('-')[0];
            const lane = LANES[prefix] ?? 2;
            activeLanes.add(lane);

            const isAI = involvesAI(log);
            const isError = log.type === 'AGENT_ERROR';

            // Parallel detection: if this log's timestamp is close to a log in another lane, keep same Y
            const PARALLEL_WINDOW_MS = 500;
            const isParallel = Object.entries(laneLastTs).some(
                ([l, ts]) => Number(l) !== lane && Math.abs(log.timestamp - ts) < PARALLEL_WINDOW_MS
            );

            // Calculate Y position
            let yPos: number;
            if (isParallel && laneY[lane] !== undefined) {
                // Keep same Y as the last global position (parallel)
                yPos = Math.max(laneY[lane] + ROW_HEIGHT, globalY);
            } else {
                globalY += ROW_HEIGHT;
                yPos = globalY;
            }
            laneY[lane] = yPos;
            if (yPos >= globalY) globalY = yPos;
            laneLastTs[lane] = log.timestamp;

            const xPos = 40 + lane * LANE_WIDTH;
            const nodeId = 'msg-' + log.id;

            // Build label
            const agentName = getAgentType(log.from);
            const typeLabel = getTypeLabel(log.type);
            let detail = '';
            const durationMs = getPayloadDuration(log.payload);
            const payloadMessage = getPayloadMessage(log.payload);
            if (log.type === 'LLM_TRACE' && durationMs !== null) {
                detail = `\n⏱ ${durationMs}ms`;
            } else if (log.type === 'PIPELINE_STEP' && payloadMessage) {
                detail = '\n' + (payloadMessage.length > 40 ? payloadMessage.substring(0, 40) + '…' : payloadMessage);
            }

            // Colors
            let bgColor: string, borderColor: string, textColor: string;
            if (isError) {
                bgColor = '#450a0a'; borderColor = '#ef4444'; textColor = '#fca5a5';
            } else if (isAI) {
                bgColor = '#1e1b4b'; borderColor = '#818cf8'; textColor = '#c7d2fe';
            } else {
                bgColor = '#0f172a'; borderColor = '#475569'; textColor = '#cbd5e1';
            }

            newNodes.push({
                id: nodeId,
                position: { x: xPos, y: yPos },
                data: {
                    label: (
                        <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
                            <div style={{ fontSize: 9, opacity: 0.6, marginBottom: 2 }}>{agentName}</div>
                            <div style={{ fontSize: 11, fontWeight: 700 }}>{typeLabel}</div>
                            {detail && <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2, whiteSpace: 'pre-wrap' }}>{detail}</div>}
                        </div>
                    )
                },
                style: {
                    background: bgColor,
                    color: textColor,
                    border: `2px solid ${borderColor}`,
                    borderRadius: '10px',
                    fontSize: '10px',
                    padding: '8px 6px',
                    width: `${NODE_W}px`,
                    cursor: 'pointer',
                    boxShadow: isAI ? '0 0 12px rgba(129, 140, 248, 0.3)' : 'none',
                }
            });

            // Edge from previous node in same lane OR from the "from" agent message
            // Try to connect to the source agent (message-passing)
            if (log.from && log.to && log.from !== 'system' && log.to !== 'system') {
                // Find most recent node from the "from" agent
                const fromPrefix = log.from.split('-')[0];
                const fromLane = LANES[fromPrefix] ?? 2;
                if (laneLastNode[fromLane] && laneLastNode[fromLane] !== nodeId) {
                    newEdges.push({
                        id: `e-${laneLastNode[fromLane]}-${nodeId}`,
                        source: laneLastNode[fromLane],
                        target: nodeId,
                        animated: isAI,
                        style: { stroke: isAI ? '#818cf8' : '#475569', strokeWidth: isAI ? 2 : 1 },
                        markerEnd: { type: MarkerType.ArrowClosed, color: isAI ? '#818cf8' : '#475569' }
                    });
                }
            } else if (laneLastNode[lane]) {
                // Sequential within same lane
                newEdges.push({
                    id: `e-${laneLastNode[lane]}-${nodeId}`,
                    source: laneLastNode[lane],
                    target: nodeId,
                    animated: false,
                    style: { stroke: '#334155', strokeWidth: 1 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#334155' }
                });
            }

            laneLastNode[lane] = nodeId;
        });

        // Lane header labels
        const laneNames: Record<number, string> = {
            0: 'Sistema',
            1: 'Orquestador',
            2: 'Inspección',
            3: 'Procesamiento',
            4: 'Validación',
            5: 'Detección',
        };

        const labelNodes: Node[] = [];
        activeLanes.forEach(lane => {
            labelNodes.push({
                id: `lane-label-${lane}`,
                position: { x: 40 + lane * LANE_WIDTH, y: 10 },
                data: { label: laneNames[lane] || `Lane ${lane}` },
                draggable: false,
                selectable: false,
                style: {
                    background: 'transparent',
                    color: '#64748b',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: '800',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '1px',
                    width: `${NODE_W}px`,
                    textAlign: 'center' as const,
                    pointerEvents: 'none' as const,
                }
            });
        });

        return {
            nodes: [...labelNodes, ...newNodes],
            edges: newEdges,
        };
    }, [logs]);

    const onNodeClick = (_: React.MouseEvent, node: Node) => {
        if (node.id.startsWith('lane-')) return;
        const log = logs.find(l => ('msg-' + l.id) === node.id);
        if (log) setSelectedPayload(log);
    };

    return (
        <div className="flex h-full w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-sm">
            <div className="flex-1 relative">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodeClick={onNodeClick}
                    fitView
                    attributionPosition="bottom-left"
                    minZoom={0.3}
                    maxZoom={2}
                >
                    <Background color="#1e293b" gap={20} />
                    <Controls />
                </ReactFlow>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 z-10 flex gap-3 bg-slate-900/90 backdrop-blur px-4 py-2 rounded-lg border border-slate-700">
                    <div className="flex items-center gap-1.5 text-[10px]">
                        <div className="w-3 h-3 rounded-sm border-2 border-indigo-400 bg-indigo-950"></div>
                        <span className="text-indigo-300 font-bold">IA involucrada</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                        <div className="w-3 h-3 rounded-sm border-2 border-slate-500 bg-slate-900"></div>
                        <span className="text-slate-400 font-bold">Sin IA</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                        <div className="w-3 h-3 rounded-sm border-2 border-red-500 bg-red-950"></div>
                        <span className="text-red-400 font-bold">Error</span>
                    </div>
                </div>

                <button
                    onClick={() => {
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
                        const a = document.createElement('a');
                        a.href = dataStr;
                        a.download = "datalens_agent_logs_" + Date.now() + ".json";
                        a.click();
                    }}
                    className="absolute top-4 right-4 z-10 bg-slate-800/90 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-md shadow-md flex items-center gap-2 text-xs font-bold transition-colors border border-slate-700"
                >
                    <span className="material-symbols-outlined text-sm">download</span> Descargar Log
                </button>
            </div>

            {/* Inspector Pane */}
            {selectedPayload && (
                <div className="w-1/3 min-w-[300px] border-l border-slate-800 bg-slate-950 flex flex-col p-4 overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-100 uppercase tracking-wider text-sm">Inspector</h3>
                        <button onClick={() => setSelectedPayload(null)} className="text-slate-400 hover:text-slate-200">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>

                    <div className="mb-4 text-xs space-y-2 text-slate-400">
                        <p><strong className="text-slate-300">Tipo:</strong> {getTypeLabel(selectedPayload.type)}</p>
                        <p><strong className="text-slate-300">Agente:</strong> {getAgentType(selectedPayload.from)} <span className="text-slate-600">({selectedPayload.from})</span></p>
                        <p><strong className="text-slate-300">Destino:</strong> {getAgentType(selectedPayload.to)} <span className="text-slate-600">({selectedPayload.to})</span></p>
                        <p><strong className="text-slate-300">Hora:</strong> {new Date(selectedPayload.timestamp).toLocaleTimeString()}</p>
                        {involvesAI(selectedPayload) && (
                            <p><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">🤖 IA INVOLUCRADA</span></p>
                        )}
                    </div>

                    <div className="flex-1 font-mono text-[11px]">
                        {selectedPayload.type === 'LLM_TRACE' && isLLMTracePayload(selectedPayload.payload) ? (
                            <div className="space-y-4">
                                <div>
                                    <p className="font-bold text-indigo-300 mb-1 uppercase text-[10px]">Prompt</p>
                                    <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 whitespace-pre-wrap text-green-400 overflow-x-auto shadow-inner leading-relaxed max-h-[300px] overflow-y-auto">
                                        {selectedPayload.payload.prompt}
                                    </pre>
                                </div>
                                <div>
                                    <p className="font-bold text-indigo-300 mb-1 uppercase text-[10px]">Respuesta ({selectedPayload.payload.durationMs ?? 0}ms)</p>
                                    <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 whitespace-pre-wrap text-blue-400 overflow-x-auto shadow-inner leading-relaxed max-h-[300px] overflow-y-auto">
                                        {selectedPayload.payload.response}
                                    </pre>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <p className="font-bold text-slate-300 mb-2 uppercase text-[10px]">Data Payload</p>
                                <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 whitespace-pre-wrap text-purple-400 overflow-x-auto shadow-inner max-h-[400px] overflow-y-auto">
                                    {JSON.stringify(selectedPayload.payload, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
