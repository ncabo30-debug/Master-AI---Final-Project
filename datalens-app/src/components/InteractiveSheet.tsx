'use client';

import React, { useState, useCallback, useMemo } from 'react';
import type { SchemaMap, EnrichedSchemaField, DataAnomaly } from '@/lib/agents/types';

type SemanticRole = 'metric' | 'dimension' | 'timeline' | 'id';

interface InteractiveSheetProps {
    data: Record<string, unknown>[];
    schema?: SchemaMap;
    anomalies?: DataAnomaly[];
    onSchemaOverride?: (col: string, newRole: SemanticRole) => void;
}

const ROLE_COLORS: Record<string, string> = {
    metric: 'rgb(16 185 129)',     // emerald-500
    dimension: 'rgb(245 158 11)',  // amber-500
    timeline: 'rgb(59 130 246)',   // blue-500
    id: 'rgb(100 116 139)',        // slate-500
    number: 'rgb(16 185 129)',
    date: 'rgb(59 130 246)',
    string: 'rgb(245 158 11)',
};

const ROLES: SemanticRole[] = ['metric', 'dimension', 'timeline', 'id'];

function buildCellAnomalyKey(rowIndex: number, column: string) {
    return `${rowIndex}:${column}`;
}

export default function InteractiveSheet({ data, schema, anomalies = [], onSchemaOverride }: InteractiveSheetProps) {
    const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
    const [editingCol, setEditingCol] = useState<string | null>(null);
    const [overrides, setOverrides] = useState<Record<string, SemanticRole>>({});

    const getEffectiveRole = (col: string): string => {
        if (overrides[col]) return overrides[col];
        if (!schema) return 'string';
        const colDef = schema[col];
        return typeof colDef === 'object' ? (colDef as EnrichedSchemaField).semantic_role : (colDef as string);
    };

    const getColumnColor = (col: string) => {
        const role = getEffectiveRole(col);
        return ROLE_COLORS[role] || 'rgb(100 116 139)';
    };

    const getInterpretation = (col: string) => {
        if (!schema) return null;
        return typeof schema[col] === 'object' ? (schema[col] as EnrichedSchemaField) : null;
    };

    const handleConfirm = useCallback((col: string) => {
        setConfirmed(prev => ({ ...prev, [col]: !prev[col] }));
    }, []);

    const handleRoleChange = useCallback((col: string, newRole: SemanticRole) => {
        setOverrides(prev => ({ ...prev, [col]: newRole }));
        setEditingCol(null);
        onSchemaOverride?.(col, newRole);
    }, [onSchemaOverride]);

    const anomalyIndex = useMemo(() => {
        const byCell = new Map<string, DataAnomaly[]>();
        const byColumn = new Map<string, DataAnomaly[]>();

        anomalies.forEach((anomaly) => {
            const columnAnomalies = byColumn.get(anomaly.column) || [];
            columnAnomalies.push(anomaly);
            byColumn.set(anomaly.column, columnAnomalies);

            if (typeof anomaly.rowIndex === 'number') {
                const key = buildCellAnomalyKey(anomaly.rowIndex, anomaly.column);
                const cellAnomalies = byCell.get(key) || [];
                cellAnomalies.push(anomaly);
                byCell.set(key, cellAnomalies);
            }
        });

        return { byCell, byColumn };
    }, [anomalies]);

    if (!data || data.length === 0) return null;

    const columns = Object.keys(data[0]);

    return (
        <div className="flex flex-col gap-3 h-full animate-fade-in delay-100 relative">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Vista Previa de Datos</h3>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">Memoria Local</span>
                </div>

                <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Métricas</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Fechas</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Dimensiones</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-500"></div> IDs</span>
                    {anomalies.length > 0 && <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-300"><div className="w-2 h-2 rounded-full bg-amber-400"></div> Anomalías</span>}
                </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex flex-col">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto no-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
                            <tr>
                                {columns.map((col, i) => {
                                    const colColor = getColumnColor(col);
                                    const aiDef = getInterpretation(col);
                                    const isConfirmed = confirmed[col];
                                    const effectiveRole = getEffectiveRole(col);
                                    const columnAnomalies = anomalyIndex.byColumn.get(col) || [];

                                    return (
                                        <th key={col + i} className="px-4 py-3 border-r justify-between items-start border-slate-100 dark:border-slate-800/50 last:border-r-0 min-w-[200px]"
                                            style={{ borderTop: `3px solid ${colColor}` }}>
                                            <div className="flex flex-col gap-1 w-full">
                                                <div className="flex justify-between items-center w-full">
                                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 truncate" title={col}>{col}</span>
                                                    {aiDef && (
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => handleConfirm(col)}
                                                                className={`p-1 rounded-full transition ${isConfirmed ? 'bg-emerald-500 text-white' : 'text-emerald-500 hover:bg-emerald-500/20'}`}
                                                                title={isConfirmed ? 'Confirmado' : 'Confirmar'}
                                                            >
                                                                <span className="material-symbols-outlined text-[14px]">check</span>
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingCol(editingCol === col ? null : col)}
                                                                className={`p-1 rounded-full transition ${editingCol === col ? 'bg-amber-500 text-white' : 'text-amber-500 hover:bg-amber-500/20'}`}
                                                                title="Corregir rol"
                                                            >
                                                                <span className="material-symbols-outlined text-[14px]">edit</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Role correction dropdown */}
                                                {editingCol === col && (
                                                    <div className="flex gap-1 mt-1 flex-wrap">
                                                        {ROLES.map(role => (
                                                            <button
                                                                key={role}
                                                                onClick={() => handleRoleChange(col, role)}
                                                                className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded transition ${effectiveRole === role
                                                                    ? 'text-white shadow-sm'
                                                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                                                    }`}
                                                                style={effectiveRole === role ? { backgroundColor: ROLE_COLORS[role] } : undefined}
                                                            >
                                                                {role}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                {aiDef && editingCol !== col ? (
                                                    <div className="flex flex-col gap-0.5 mt-1">
                                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-sm w-max bg-opacity-20 capitalize" style={{ backgroundColor: `${colColor}20`, color: colColor }}>
                                                            {overrides[col] || aiDef.semantic_role}
                                                        </span>
                                                        <span className="text-[9px] text-slate-500 dark:text-slate-400 truncate" title={aiDef.domain}>{aiDef.domain}</span>
                                                    </div>
                                                ) : schema && editingCol !== col ? (
                                                    <span className="opacity-60 font-mono lowercase text-[9px]">{typeof schema[col] === 'string' ? (schema[col] as string) : 'unknown'}</span>
                                                ) : null}
                                                {columnAnomalies.length > 0 && (
                                                    <span
                                                        className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 mt-1"
                                                        title={columnAnomalies[0]?.message}
                                                    >
                                                        <span className="material-symbols-outlined text-[11px]">warning</span>
                                                        {columnAnomalies.length} alerta{columnAnomalies.length > 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {data.slice(0, 50).map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                    {columns.map((col, j) => {
                                        const cellAnomalies = anomalyIndex.byCell.get(buildCellAnomalyKey(i, col)) || [];
                                        const hasAnomaly = cellAnomalies.length > 0;
                                        const anomalyMessage = hasAnomaly ? cellAnomalies.map(a => a.message).join(' | ') : '';

                                        return (
                                            <td
                                                key={j}
                                                className={`px-4 py-2 text-xs border-r border-slate-100 dark:border-slate-800/50 last:border-r-0 text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap max-w-[200px] truncate ${hasAnomaly ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-100 shadow-inner' : ''}`}
                                                title={hasAnomaly ? `${String(row[col] ?? '')}\n${anomalyMessage}` : String(row[col] ?? '')}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {hasAnomaly && (
                                                        <span className="material-symbols-outlined text-[12px] text-amber-600 dark:text-amber-300 shrink-0">warning</span>
                                                    )}
                                                    <span className="truncate">{String(row[col] ?? '')}</span>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/30 p-3 flex justify-center border-t border-slate-200 dark:border-slate-800">
                    <span className="text-xs text-slate-500 italic">Mostrando {Math.min(50, data.length)} filas de {data.length} procesadas{anomalies.length > 0 ? ` · ${anomalies.length} anomalías locales detectadas` : ''}</span>
                </div>
            </div>
        </div>
    );
}
