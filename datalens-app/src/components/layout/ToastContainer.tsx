'use client';

import { useToast, type ToastType } from '@/lib/toast';

const ICONS: Record<ToastType, string> = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

const STYLES: Record<ToastType, { wrapper: string; icon: string; title: string }> = {
  success: {
    wrapper: 'border-emerald-500/30 bg-emerald-900/40',
    icon: 'text-emerald-400',
    title: 'text-emerald-200',
  },
  error: {
    wrapper: 'border-red-500/30 bg-red-900/40',
    icon: 'text-red-400',
    title: 'text-red-200',
  },
  warning: {
    wrapper: 'border-amber-500/30 bg-amber-900/40',
    icon: 'text-amber-400',
    title: 'text-amber-200',
  },
  info: {
    wrapper: 'border-primary/30 bg-primary/10',
    icon: 'text-primary',
    title: 'text-slate-100',
  },
};

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const s = STYLES[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm animate-fade-in max-w-sm ${s.wrapper}`}
          >
            <span className={`material-symbols-outlined text-[20px] shrink-0 mt-0.5 ${s.icon}`}
              style={{ fontVariationSettings: "'FILL' 1" }}>
              {ICONS[t.type]}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${s.title}`}>{t.title}</p>
              {t.description && (
                <p className="text-xs text-slate-400 mt-0.5">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
