'use client';

import { useState } from 'react';

/**
 * Layer toggle legend.
 * - overlay (default): floating card on the map
 * - sidebar: compact checklist for the left AppShell ribbon
 */
export default function MapLegend({ items, onToggle, variant = 'overlay', title = 'Legend' }) {
  const [open, setOpen] = useState(true);

  if (variant === 'sidebar') {
    return (
      <div className="mx-2 mb-3 border-t border-white/10 pt-3 select-none">
        <button
          type="button"
          className="w-full flex items-center justify-between px-1 py-1 text-xs font-semibold text-white/90"
          onClick={() => setOpen((v) => !v)}
        >
          <span>{title}</span>
          <span className="text-white/50">{open ? '▾' : '▸'}</span>
        </button>
        {open && (
          <div className="mt-1.5 space-y-1.5 px-1">
            {items.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-xs cursor-pointer text-white/85">
                <input
                  type="checkbox"
                  checked={!!item.checked}
                  onChange={() => onToggle(item.key)}
                  className="accent-[var(--kpr-gold)]"
                />
                {item.emoji ? <span aria-hidden="true">{item.emoji}</span> : null}
                <span className="leading-tight">{item.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="absolute top-3 left-3 z-[500] kpr-card overflow-hidden select-none" style={{ minWidth: 190 }}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-semibold"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <span className="text-portal-text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-2 border-t border-portal-border pt-2.5">
          {items.map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!item.checked} onChange={() => onToggle(item.key)} className="accent-kpr-green-light" />
              {item.emoji ? <span>{item.emoji}</span> : null}
              {item.color ? (
                <span className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-white/80 shadow-sm" style={{ background: item.color }} />
              ) : null}
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
