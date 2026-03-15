import type { SchemaBlueprint, SchemaBlueprintColumn } from '@/lib/agents/types';

interface SchemaTabProps {
  schemaBlueprint: SchemaBlueprint | null;
}

const ROLE_COLORS: Record<string, string> = {
  metric:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  dimension: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  timeline:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
  id:        'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const SOURCE_LABELS: Record<string, string> = {
  ai:            'IA',
  user_override: 'Usuario',
};

export default function SchemaTab({ schemaBlueprint }: SchemaTabProps) {
  if (!schemaBlueprint) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No hay información de esquema disponible.
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-slate-100">Schema Blueprint</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Versión {schemaBlueprint.version} · {schemaBlueprint.columns.length} columnas detectadas
          </p>
        </div>
        <span className="text-xs font-semibold px-2 py-1 bg-primary/10 text-primary rounded-full">
          v{schemaBlueprint.version}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-dark">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-dark bg-slate-800/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Columna</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rol Semántico</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dominio</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Fuente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dark">
            {schemaBlueprint.columns.map((col: SchemaBlueprintColumn) => (
              <tr key={col.name} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-mono text-slate-200 font-medium">{col.name}</td>
                <td className="px-4 py-3 text-slate-400">{col.type}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[col.semantic_role] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}
                  >
                    {col.semantic_role}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">{col.domain || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${col.source === 'user_override' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                    {SOURCE_LABELS[col.source] ?? col.source}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
