export default function StatusLegend() {
  const items = [
    { label: 'Listo', dotClass: 'dot-ready' },
    { label: 'Procesando', dotClass: 'dot-processing' },
    { label: 'Requiere atención', dotClass: 'dot-awaiting' },
    { label: 'En cola', dotClass: 'dot-queued' },
  ];

  return (
    <div className="px-4 py-3 border-t border-border-dark">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Estado</p>
      <div className="space-y-1">
        {items.map(({ label, dotClass }) => (
          <div key={label} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full shrink-0 inline-block ${dotClass}`} />
            <span className="text-xs text-slate-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
