'use client';

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface ReportDataPoint {
    name: string;
    value: number;
}

interface DashboardProps {
    reportConfig: {
        type?: string;
        title?: string;
        xAxis?: string;
        yAxis?: string;
        data: ReportDataPoint[];
        message?: string;
    };
}

function exportCSV(data: ReportDataPoint[], title: string) {
    const header = 'name,value\n';
    const rows = data.map(d => `"${d.name}",${d.value}`).join('\n');
    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function generateInsight(data: ReportDataPoint[], title: string): string {
    if (!data || data.length === 0) return 'No hay datos suficientes para generar un insight.';

    // Filter out malformed entries
    const validData = data.filter(d => d && typeof d.name === 'string' && typeof d.value === 'number');
    if (validData.length === 0) return 'Los datos no tienen el formato esperado para generar un insight.';

    const values = validData.map(d => d.value);
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const leader = validData.find(d => d.value === max);
    const trailer = validData.find(d => d.value === min);

    if (!leader || !trailer) return 'No se pudo determinar el líder y el último en los datos.';

    const concentration = (max / total * 100).toFixed(1);

    return `"${leader.name}" lidera con ${new Intl.NumberFormat('es').format(leader.value)} (${concentration}% del total). `
        + `El promedio es ${new Intl.NumberFormat('es').format(Math.round(avg))} y el valor más bajo corresponde a "${trailer.name}" con ${new Intl.NumberFormat('es').format(trailer.value)}. `
        + `La diferencia entre líder y último es de ${new Intl.NumberFormat('es').format(max - min)}.`;
}

export default function DashboardContent({ reportConfig }: DashboardProps) {
    if (!reportConfig) return null;

    // Sanitize data: ensure name is string and value is number
    const sanitizedData = useMemo(() => {
        if (!reportConfig.data || !Array.isArray(reportConfig.data)) return [];
        return reportConfig.data
            .map(d => {
                if (!d || typeof d !== 'object') return null;
                const name = typeof d.name === 'object' ? JSON.stringify(d.name) : String(d.name ?? '');
                const value = typeof d.value === 'object'
                    ? Object.values(d.value as Record<string, number>).reduce((a: number, b: unknown) => a + (Number(b) || 0), 0)
                    : Number(d.value) || 0;
                return { name, value };
            })
            .filter((d): d is ReportDataPoint => d !== null && d.name !== '');
    }, [reportConfig.data]);

    const insight = useMemo(
        () => generateInsight(sanitizedData, reportConfig.title || 'Reporte'),
        [sanitizedData, reportConfig.title]
    );

    // Custom tooltip formatter to avoid rendering objects
    const tooltipFormatter = (value: unknown) => {
        if (typeof value === 'object' && value !== null) {
            return [JSON.stringify(value), 'Valor'];
        }
        return [new Intl.NumberFormat('es').format(Number(value)), 'Valor'];
    };

    return (
        <div className="w-full animate-fade-in delay-200">
            {/* Cabecera del Reporte y Herramientas */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        {reportConfig.title || 'Métricas de Exploración'}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Análisis generado por DataLens Specialist Agent
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => exportCSV(sanitizedData, reportConfig.title || 'reporte')}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">download</span>
                        Exportar CSV
                    </button>
                </div>
            </div>

            {reportConfig.message ? (
                <div className="p-6 bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl text-slate-600 dark:text-slate-400 font-medium shadow-sm">
                    {reportConfig.message}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Gráfico Principal (ocupa 2 columnas) */}
                    <div className="lg:col-span-2 bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-sm overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 dark:text-slate-200">Comparativa Principal</h3>
                            <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><span className="material-symbols-outlined text-[18px]">more_vert</span></button>
                        </div>
                        <div className="p-6 flex-1 min-h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={sanitizedData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.5} />
                                    <XAxis
                                        dataKey="name"
                                        stroke="#94a3b8"
                                        tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                                        tickLine={false}
                                        axisLine={{ stroke: '#e2e8f0' }}
                                        dy={10}
                                    />
                                    <YAxis
                                        stroke="#94a3b8"
                                        tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                                        tickFormatter={(val) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(val)}
                                        tickLine={false}
                                        axisLine={false}
                                        dx={-10}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
                                        contentStyle={{
                                            backgroundColor: '#ffffff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            color: '#0f172a',
                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                            fontWeight: 500
                                        }}
                                        itemStyle={{ color: '#135bec', fontWeight: 600 }}
                                        formatter={tooltipFormatter}
                                    />
                                    <Bar
                                        dataKey="value"
                                        fill="#135bec"
                                        radius={[4, 4, 0, 0]}
                                        isAnimationActive={true}
                                        barSize={40}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Insights Generados o Info (ocupa 1 columna) */}
                    <div className="flex flex-col gap-6">
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 relative overflow-hidden flex flex-col justify-center h-full min-h-[200px]">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -translate-y-10 translate-x-10"></div>
                            <span className="material-symbols-outlined text-primary mb-3 text-3xl">lightbulb</span>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2 z-10">Insight Generado</h3>
                            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed z-10">
                                {insight}
                            </p>
                        </div>

                        {/* Summary Metric */}
                        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-xl p-6 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-slate-500 text-sm font-medium mb-1">Total Puntos</p>
                                <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{reportConfig.data?.length || 0}</h3>
                            </div>
                            <div className="size-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                <span className="material-symbols-outlined">data_exploration</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
