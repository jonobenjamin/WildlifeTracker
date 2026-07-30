'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

const LOCATION_NAMES = { tuludi: 'Tuludi', 'sable-alley': 'Sable Alley', 'little-sable': 'Little Sable' };

const SERIES = [
  ['cond', 'Conductivity (µS/cm)', '#ff6384', 'y'],
  ['tds', 'TDS (ppm)', '#36a2eb', 'y'],
  ['na', 'Sodium (ppm)', '#8a6d3b', 'y'],
  ['as', 'Arsenic (ppm)', '#cc65fe', 'y1'],
  ['cr', 'Chromium (ppm)', '#ff9f40', 'y1'],
  ['cu', 'Copper (ppm)', '#ffcd56', 'y1'],
  ['mn', 'Manganese (ppm)', '#4bc0c0', 'y1'],
  ['pb', 'Lead (ppm)', '#526b38', 'y1'],
];

export default function WaterTrendsModal({ locationKey, onClose }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/api/water-monitoring?location=${encodeURIComponent(locationKey)}`)
      .then((res) => {
        if (!cancelled) setData(res.data || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationKey]);

  useEffect(() => {
    if (loading || error || data.length === 0 || !canvasRef.current) return undefined;
    let destroyed = false;

    (async () => {
      const { Chart, registerables } = await import('chart.js');
      if (destroyed) return;
      Chart.register(...registerables);

      const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
      const datasets = SERIES.map(([key, label, color, axis]) => ({
        label,
        data: sorted.map((d) => (d[key] === undefined || d[key] === null ? null : Number(d[key]))),
        borderColor: color,
        backgroundColor: `${color}22`,
        yAxisID: axis,
        spanGaps: true,
        tension: 0.25,
      }));

      chartRef.current = new Chart(canvasRef.current, {
        type: 'line',
        data: { labels: sorted.map((d) => new Date(d.date).toLocaleDateString()), datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { type: 'linear', position: 'left', title: { display: true, text: 'Cond / TDS / Na' } },
            y1: {
              type: 'linear',
              position: 'right',
              title: { display: true, text: 'Heavy metals (ppm)' },
              grid: { drawOnChartArea: false },
            },
          },
          plugins: { legend: { position: 'bottom' } },
        },
      });
    })();

    return () => {
      destroyed = true;
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [loading, error, data]);

  return (
    <div className="fixed inset-0 bg-black/40 z-[1000] grid place-items-center p-4" onClick={onClose}>
      <div className="kpr-card w-full max-w-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Water Quality Trends — {LOCATION_NAMES[locationKey] || locationKey}</h3>
          <button className="text-portal-text-muted hover:text-portal-text text-xl leading-none" onClick={onClose}>
            &times;
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-portal-text-muted">Loading…</p>
        ) : error ? (
          <p className="text-sm text-portal-danger">{error}</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-portal-text-muted">No water monitoring data recorded for this location yet.</p>
        ) : (
          <div style={{ height: 380 }}>
            <canvas ref={canvasRef} />
          </div>
        )}
      </div>
    </div>
  );
}
