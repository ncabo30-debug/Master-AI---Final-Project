import type { DataAnomaly, DataAnomalyKind } from '@/lib/agents/types';

interface ValidationTabProps {
  dataAnomalies: DataAnomaly[];
}

const KIND_LABELS: Record<DataAnomalyKind, string> = {
  outlier:    'Valores atípicos',
  duplicate:  'Duplicados',
  validation: 'Validación',
  integrity:  'Integridad',
};

const KIND_ICONS: Record<DataAnomalyKind, string> = {
  outlier:    'troubleshoot',
  duplicate:  'content_copy',
  validation: 'rule',
  integrity:  'verified_user',
};

export default function ValidationTab({ dataAnomalies }: ValidationTabProps) {
  const grouped = dataAnomalies.reduce<Record<DataAnomalyKind, DataAnomaly[]>>(
    (acc, a) => {
      if (!acc[a.kind]) acc[a.kind] = [];
      acc[a.kind].push(a);
      return acc;
    },
    {} as Record<DataAnomalyKind, DataAnomaly[]>
  );

  const passed = dataAnomalies.length === 0;
  const warningCount = dataAnomalies.filter((a) => a.severity === 'warning').length;
  const errorCount = dataAnomalies.filter((a) => a.severity === 'error').length;

  return (
    <div className="animate-fade-in space-y-4">
      {/* Scorecard */}
      <div className={`flex items-center gap-4 p-4 rounded-xl border ${passed ? 'bg-green-500/5 border-green-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
        <div className={`size-10 rounded-full flex items-center justify-center ${passed ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
          <span className="material-symbols-outlined">{passed ? 'verified' : 'warning'}</span>
        </div>
        <div className="flex-1">
          <p className={`font-semibold ${passed ? 'text-green-400' : 'text-amber-400'}`}>
            {passed ? 'Validación completada sin incidencias' : `${dataAnomalies.length} incidencia${dataAnomalies.length > 1 ? 's' : ''} detectada${dataAnomalies.length > 1 ? 's' : ''}`}
          </p>
          {!passed && (
            <p className="text-xs text-slate-500 mt-0.5">
              {errorCount > 0 && `${errorCount} error${errorCount > 1 ? 'es' : ''}`}
              {errorCount > 0 && warningCount > 0 && ' · '}
              {warningCount > 0 && `${warningCount} advertencia${warningCount > 1 ? 's' : ''}`}
            </p>
          )}
        </div>
      </div>

      {/* Anomaly groups */}
      {(Object.keys(grouped) as DataAnomalyKind[]).map((kind) => (
        <div key={kind} className="rounded-xl border border-border-dark overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-800/50 border-b border-border-dark">
            <span className="material-symbols-outlined text-sm text-slate-400">{KIND_ICONS[kind]}</span>
            <h4 className="text-sm font-semibold text-slate-300">{KIND_LABELS[kind]}</h4>
            <span className="ml-auto text-xs font-medium bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
              {grouped[kind].length}
            </span>
          </div>
          <div className="divide-y divide-border-dark">
            {grouped[kind].map((anomaly) => (
              <div key={anomaly.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={`shrink-0 mt-0.5 size-1.5 rounded-full ${anomaly.severity === 'error' ? 'bg-red-400' : 'bg-amber-400'}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300">{anomaly.message}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Columna: <span className="font-mono text-slate-400">{anomaly.column}</span>
                    {anomaly.rowIndex != null && ` · Fila ${anomaly.rowIndex + 1}`}
                    {anomaly.value != null && ` · Valor: ${anomaly.value}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${anomaly.severity === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}
                >
                  {anomaly.severity === 'error' ? 'Error' : 'Advertencia'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {passed && (
        <div className="text-center text-slate-500 text-sm py-4">
          No se detectaron anomalías en los datos.
        </div>
      )}
    </div>
  );
}
