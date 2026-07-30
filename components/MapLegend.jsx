'use client';

import { useState } from 'react';

export default function MapLegend({ items, onToggle }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute top-3 left-3 z-[500] kpr-card overflow-hidden select-none" style={{ minWidth: 190 }}>
      <button
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-semibold"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Legend</span>
        <span className="text-portal-text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-2 border-t border-portal-border pt-2.5">
          {items.map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={item.checked} onChange={() => onToggle(item.key)} className="accent-kpr-green-light" />
              <span>{item.emoji}</span>
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
