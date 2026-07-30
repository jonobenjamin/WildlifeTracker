'use client';

import { useEffect, useRef } from 'react';

export default function ChartCanvas({ type, data, options, height = 260 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { Chart, registerables } = await import('chart.js');
      Chart.register(...registerables);
      if (cancelled || !canvasRef.current) return;
      chartRef.current = new Chart(canvasRef.current.getContext('2d'), { type, data, options });
    })();
    return () => {
      cancelled = true;
      chartRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), type]);

  return (
    <div style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
