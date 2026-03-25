import type { ValidationReport } from '@/lib/pipeline/types';

interface ValidationTabProps {
  validationReport: ValidationReport | null;
}

export default function ValidationTab({ validationReport }: ValidationTabProps) {
  if (!validationReport) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No hay resultados de validación disponibles.
      </div>
    );
  }

  const blockingIssues = validationReport.issues.filter((issue) => issue.severity === 'error').length;

  return (
    <div className="animate-fade-in space-y-4">
      <div
        className={`flex items-center gap-4 rounded-xl border p-4 ${
          validationReport.valid ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'
        }`}
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            validationReport.valid ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          <span className="material-symbols-outlined">{validationReport.valid ? 'verified' : 'error'}</span>
        </div>
        <div>
          <p className={`font-semibold ${validationReport.valid ? 'text-green-400' : 'text-red-400'}`}>
            {validationReport.valid
              ? 'Validación SQL completada sin bloqueantes'
              : `${blockingIssues} validación${blockingIssues === 1 ? '' : 'es'} bloqueante${blockingIssues === 1 ? '' : 's'}`}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Ejecutada el {new Date(validationReport.executedAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-dark">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-dark bg-slate-800/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Regla</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Severidad</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dark">
            {validationReport.issues.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-sm text-slate-500" colSpan={3}>
                  No se detectaron observaciones.
                </td>
              </tr>
            )}
            {validationReport.issues.map((issue) => (
              <tr key={issue.ruleId} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-200">{issue.ruleName}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      issue.severity === 'error'
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {issue.severity}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400">{issue.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

