'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

/**
 * Thin wrapper around vanilla Leaflet (no react-leaflet dependency, mirrors the
 * imperative style the original map.html/map-users.html already used).
 * Calls onReady(map, L) once, after which the caller manages its own layers.
 */
export default function LeafletMap({ onReady, className, center = [-19.15, 23.55], zoom = 12 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let map;
    let cancelled = false;

    (async () => {
      const Lmod = await import('leaflet');
      const L = Lmod.default || Lmod;
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center,
        zoom,
        zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      }).addTo(map);

      onReady && onReady(map, L);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className || 'w-full h-full'} />;
}
