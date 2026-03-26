import type { NormalizationBlueprint } from '@/lib/pipeline/types';

interface SchemaTabProps {
  blueprint: NormalizationBlueprint | null;
}

export default function SchemaTab({ blueprint }: SchemaTabProps) {
  if (!blueprint) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No hay blueprint disponible.
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-100">Normalization Blueprint</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Versión {blueprint.version} · {blueprint.columnPlan.length} columnas · {blueprint.structuralPlan.length} acciones estructurales
          </p>
        </div>
        <span className="text-xs font-semibold px-2 py-1 bg-primary/10 text-primary rounded-full">
          v{blueprint.version}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-dark">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-dark bg-slate-800/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Origen</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Destino</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Transformación</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo PG</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nullable</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Fuente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dark">
            {blueprint.columnPlan.map((column) => (
              <tr key={column.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-mono text-slate-200">{column.sourceColumn}</td>
                <td className="px-4 py-3 font-mono text-slate-400">{column.targetColumn}</td>
                <td className="px-4 py-3 text-slate-300">{column.transform}</td>
                <td className="px-4 py-3 text-slate-400">{column.postgresType}</td>
                <td className="px-4 py-3 text-slate-400">{column.nullable ? 'Sí' : 'No'}</td>
                <td className="px-4 py-3 text-slate-400">{column.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

