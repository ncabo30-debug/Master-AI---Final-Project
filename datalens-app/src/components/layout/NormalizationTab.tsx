interface NormalizationTabProps {
  rawData: Record<string, unknown>[] | null;
  cleanedData: Record<string, unknown>[] | null;
}

function diffCells(
  rawData: Record<string, unknown>[],
  cleanedData: Record<string, unknown>[]
): { column: string; corrected: number; clean: number; total: number }[] {
  if (rawData.length === 0) return [];

  const columns = Object.keys(rawData[0]);
  const maxRows = Math.min(rawData.length, cleanedData.length);

  return columns.map((col) => {
    let corrected = 0;
    for (let i = 0; i < maxRows; i++) {
      const rawVal = String(rawData[i][col] ?? '').trim();
      const cleanVal = String(cleanedData[i][col] ?? '').trim();
      if (rawVal !== cleanVal) corrected++;
    }
    return {
      column: col,
      corrected,
      clean: maxRows - corrected,
      total: maxRows,
    };
  });
}

export default function NormalizationTab({ rawData, cleanedData }: NormalizationTabProps) {
  if (!rawData || !cleanedData) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No hay datos de normalización disponibles.
      </div>
    );
  }

  const diffs = diffCells(rawData, cleanedData);
  const totalCorrected = diffs.reduce((s, d) => s + d.corrected, 0);
  const affectedColumns = diffs.filter((d) => d.corrected > 0).length;

  return (
    <div className="animate-fade-in space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-border-dark text-center">
          <p className="text-2xl font-bold text-amber-400">{totalCorrected}</p>
          <p className="text-xs text-slate-500 mt-1">Celdas corregidas</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-border-dark text-center">
          <p className="text-2xl font-bold text-blue-400">{affectedColumns}</p>
          <p className="text-xs text-slate-500 mt-1">Columnas afectadas</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-border-dark text-center">
          <p className="text-2xl font-bold text-green-400">{rawData.length}</p>
          <p className="text-xs text-slate-500 mt-1">Filas procesadas</p>
        </div>
      </div>

      {/* Column breakdown */}
      <div className="overflow-x-auto rounded-xl border border-border-dark">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-dark bg-slate-800/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Columna</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Corregidas</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Limpias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dark">
            {diffs.map(({ column, corrected, clean }) => (
              <tr key={column} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-mono text-slate-200 font-medium">{column}</td>
                <td className="px-4 py-3">
                  {corrected > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <span className="material-symbols-outlined text-xs">auto_fix_high</span>
                      Corregido
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                      <span className="material-symbols-outlined text-xs">check_circle</span>
                      Limpio
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {corrected > 0 ? (
                    <span className="text-amber-400 font-medium">{corrected}</span>
                  ) : (
                    <span className="text-slate-600">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-green-400 font-medium">{clean}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
