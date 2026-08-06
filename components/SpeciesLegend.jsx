'use client';

import { useState } from 'react';

/** Dynamic colour key for species currently visible on the concession map. */
export default function SpeciesLegend({ items }) {
  const [open, setOpen] = useState(false);

  if (!items?.length) return null;

  return (
    <div className="absolute top-3 left-3 z-[500] kpr-card overflow-hidden select-none" style={{ minWidth: 180, maxWidth: 240 }}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-semibold"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Species</span>
        <span className="text-portal-text-muted text-xs font-normal flex items-center gap-1.5">
          {items.length}
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-1.5 border-t border-portal-border pt-2.5 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-white shadow-sm"
                style={{ background: item.color }}
              />
              <span className="truncate">{item.label}</span>
              {item.count != null && (
                <span className="ml-auto text-xs text-portal-text-muted tabular-nums">{item.count}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
