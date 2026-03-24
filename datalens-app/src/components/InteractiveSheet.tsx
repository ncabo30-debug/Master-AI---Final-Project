'use client';

import React, { useState, useCallback, useMemo } from 'react';
import type { SchemaMap, EnrichedSchemaField, DataAnomaly, IssueReport, DetectedIssue } from '@/lib/agents/types';

type SemanticRole = 'metric' | 'dimension' | 'timeline' | 'id';

interface InteractiveSheetProps {
    /** Raw (original) data to display. */
    data: Record<string, unknown>[];
    schema?: SchemaMap;
    /** Legacy anomaly support */
    anomalies?: DataAnomaly[];
    /** H-7: Structured issue report from detection phase. */
    issueReport?: IssueReport | null;
    onSchemaOverride?: (col: string, newRole: SemanticRole) => void;
    /** H-7: Callback to report which issues the user has approved. */
    onApprovedIssuesChange?: (approvedIds: string[]) => void;
    /** Controlled mode: use this Set instead of internal state. */
    controlledApprovedIds?: Set<string>;
    /** Controlled mode: called instead of internal toggle. */
    onToggleIssue?: (issueId: string) => void;
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

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    error:   { bg: 'bg-red-50 dark:bg-red-500/10',     text: 'text-red-700 dark:text-red-300',     border: 'border-red-200 dark:border-red-500/30' },
    warning: { bg: 'bg-amber-50 dark:bg-amber-500/10',  text: 'text-amber-700 dark:text-amber-300',  border: 'border-amber-200 dark:border-amber-500/30' },
    info:    { bg: 'bg-blue-50 dark:bg-blue-500/10',    text: 'text-blue-700 dark:text-blue-300',    border: 'border-blue-200 dark:border-blue-500/30' },
};

const ROLES: SemanticRole[] = ['metric', 'dimension', 'timeline', 'id'];

function buildCellAnomalyKey(rowIndex: number, column: string) {
    return `${rowIndex}:${column}`;
}

export default function InteractiveSheet({
    data,
    schema,
    anomalies = [],
    issueReport,
    onSchemaOverride,
    onApprovedIssuesChange,
    controlledApprovedIds,
    onToggleIssue,
}: InteractiveSheetProps) {
    const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
    const [editingCol, setEditingCol] = useState<string | null>(null);
    const [overrides, setOverrides] = useState<Record<string, SemanticRole>>({});

    // H-7: Track approved issue IDs (all approved by default)
    const allIssueIds = useMemo(() => issueReport?.issues.map(i => i.id) ?? [], [issueReport]);
    const [approvedIssueIds, setApprovedIssueIds] = useState<Set<string>>(new Set(allIssueIds));

    // Sync approved set when issue report changes
    useMemo(() => {
        setApprovedIssueIds(new Set(allIssueIds));
    }, [allIssueIds]);

    const toggleIssue = useCallback((issueId: string) => {
        setApprovedIssueIds(prev => {
            const next = new Set(prev);
            if (next.has(issueId)) {
                next.delete(issueId);
            } else {
                next.add(issueId);
            }
            onApprovedIssuesChange?.(Array.from(next));
            return next;
        });
    }, [onApprovedIssuesChange]);

    // Controlled mode: if parent passes its own Set + toggle handler, use those
    const effectiveApprovedIds = controlledApprovedIds ?? approvedIssueIds;
    const handleToggle = useCallback((issueId: string) => {
        if (onToggleIssue) {
            onToggleIssue(issueId);
        } else {
            toggleIssue(issueId);
        }
    }, [onToggleIssue, toggleIssue]);

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

    // H-7: Build issue index by cell + column
    const issueIndex = useMemo(() => {
        const byCell = new Map<string, DetectedIssue[]>();
        const byColumn = new Map<string, DetectedIssue[]>();

        if (issueReport) {
            for (const issue of issueReport.issues) {
                // By column
                const colIssues = byColumn.get(issue.column) || [];
                colIssues.push(issue);
                byColumn.set(issue.column, colIssues);

                // By cell (if row-specific)
                if (typeof issue.rowIndex === 'number') {
                    const key = buildCellAnomalyKey(issue.rowIndex, issue.column);
                    const cellIssues = byCell.get(key) || [];
                    cellIssues.push(issue);
                    byCell.set(key, cellIssues);
                }
            }
        }

        return { byCell, byColumn };
    }, [issueReport]);

    // Legacy anomaly index (backward compat)
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
    const hasIssues = issueReport && issueReport.totalIssues > 0;
    const hasLegacyAnomalies = anomalies.length > 0;

    return (
        <div className="flex flex-col gap-3 h-full animate-fade-in delay-100 relative">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Vista Previa de Datos</h3>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                        {hasIssues ? 'Datos Originales' : 'Memoria Local'}
                    </span>
                </div>

                <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Métricas</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Fechas</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Dimensiones</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-500"></div> IDs</span>
                    {(hasIssues || hasLegacyAnomalies) && (
                        <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-300">
                            <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                            {hasIssues ? `${issueReport!.totalIssues} Issues` : `${anomalies.length} Anomalías`}
                        </span>
                    )}
                </div>
            </div>

            {/* H-7: Issue summary banner */}
            {hasIssues && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <span className="material-symbols-outlined text-amber-400 text-[18px]">report</span>
                    <span className="text-sm text-slate-300">
                        <strong className="text-amber-200">{issueReport!.totalIssues}</strong> problemas detectados
                        {issueReport!.criticalCount > 0 && (
                            <> · <strong className="text-red-300">{issueReport!.criticalCount}</strong> críticos</>
                        )}
                        {issueReport!.warningCount > 0 && (
                            <> · <strong className="text-amber-300">{issueReport!.warningCount}</strong> warnings</>
                        )}
                        <span className="text-slate-500 ml-2">
                            ({effectiveApprovedIds.size} se corregirán, {allIssueIds.length - effectiveApprovedIds.size} se ignorarán)
                        </span>
                    </span>
                </div>
            )}

            {/* Global issues (column: '*') — not tied to a specific column */}
            {(() => {
                const globalIssues = issueReport?.issuesByColumn['*'] ?? [];
                if (globalIssues.length === 0) return null;
                return (
                    <div className="flex flex-col gap-1.5 px-4 py-3 rounded-lg bg-slate-800/50 border border-slate-700">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Avisos generales</p>
                        {globalIssues.map((gi) => (
                            <div key={gi.id} className="flex items-start gap-2">
                                <span className={`material-symbols-outlined text-[14px] shrink-0 mt-0.5 ${gi.severity === 'error' ? 'text-red-400' : gi.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>
                                    {gi.severity === 'error' ? 'error' : gi.severity === 'warning' ? 'warning' : 'info'}
                                </span>
                                <span className="text-xs text-slate-400">{gi.suggestion}</span>
                            </div>
                        ))}
                    </div>
                );
            })()}

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

                                    // H-7: Issue-based badges
                                    const colIssues = issueIndex.byColumn.get(col) || [];
                                    // Legacy anomalies
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

                                                {/* H-7: Issue badge per column */}
                                                {colIssues.length > 0 && (
                                                    <span
                                                        className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide mt-1 ${
                                                            colIssues.some(i => i.severity === 'error') ? 'text-red-600 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
                                                        }`}
                                                        title={colIssues.map(i => i.suggestion).join('\n')}
                                                    >
                                                        <span className="material-symbols-outlined text-[11px]">
                                                            {colIssues.some(i => i.severity === 'error') ? 'error' : 'warning'}
                                                        </span>
                                                        {colIssues.length} issue{colIssues.length > 1 ? 's' : ''}
                                                    </span>
                                                )}

                                                {/* Legacy anomaly badge */}
                                                {colIssues.length === 0 && columnAnomalies.length > 0 && (
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
                                        // H-7: Issue-based highlighting
                                        const cellIssues = issueIndex.byCell.get(buildCellAnomalyKey(i, col)) || [];
                                        const hasIssue = cellIssues.length > 0;
                                        const topSeverity = hasIssue
                                            ? (cellIssues.some(ci => ci.severity === 'error') ? 'error' : cellIssues.some(ci => ci.severity === 'warning') ? 'warning' : 'info')
                                            : '';
                                        const sevStyle = hasIssue ? SEVERITY_COLORS[topSeverity] : null;
                                        const issueTooltip = hasIssue ? cellIssues.map(ci => `${ci.suggestion}${ci.example ? ` (ej: ${ci.example})` : ''}`).join('\n') : '';

                                        // Legacy anomalies
                                        const cellAnomalies = anomalyIndex.byCell.get(buildCellAnomalyKey(i, col)) || [];
                                        const hasLegacy = !hasIssue && cellAnomalies.length > 0;
                                        const anomalyMessage = hasLegacy ? cellAnomalies.map(a => a.message).join(' | ') : '';

                                        return (
                                            <td
                                                key={j}
                                                className={`px-4 py-2 text-xs border-r border-slate-100 dark:border-slate-800/50 last:border-r-0 text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap max-w-[200px] truncate ${
                                                    hasIssue ? `${sevStyle!.bg} ${sevStyle!.text} shadow-inner` :
                                                    hasLegacy ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-100 shadow-inner' : ''
                                                }`}
                                                title={hasIssue ? `${String(row[col] ?? '')}\n${issueTooltip}` : hasLegacy ? `${String(row[col] ?? '')}\n${anomalyMessage}` : String(row[col] ?? '')}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {hasIssue && (
                                                        <>
                                                            <input
                                                                type="checkbox"
                                                                checked={cellIssues.every(ci => effectiveApprovedIds.has(ci.id))}
                                                                onChange={() => cellIssues.forEach(ci => handleToggle(ci.id))}
                                                                className="w-3 h-3 rounded border-slate-300 text-primary focus:ring-primary/50 shrink-0"
                                                                title="Aprobar corrección"
                                                            />
                                                            <span className={`material-symbols-outlined text-[12px] shrink-0 ${
                                                                topSeverity === 'error' ? 'text-red-500' : topSeverity === 'warning' ? 'text-amber-500' : 'text-blue-500'
                                                            }`}>
                                                                {topSeverity === 'error' ? 'error' : 'warning'}
                                                            </span>
                                                        </>
                                                    )}
                                                    {hasLegacy && (
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
                    <span className="text-xs text-slate-500 italic">
                        Mostrando {Math.min(50, data.length)} filas de {data.length}
                        {hasIssues
                            ? ` · ${effectiveApprovedIds.size}/${issueReport!.totalIssues} correcciones aprobadas`
                            : hasLegacyAnomalies
                            ? ` · ${anomalies.length} anomalías locales detectadas`
                            : ' procesadas'}
                    </span>
                </div>
            </div>
        </div>
    );
}
