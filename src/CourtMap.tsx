import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Court } from './lib/types';

type Props = {
  courts: Court[];
  activity: Record<string, number>;
  focusId?: string;
  height?: number;
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function prefersDark(): boolean {
  // The app is light only for now, so the map stays light too.
  return false;
}

/** Map of courts. Each pin shows how many people are checked in. Tapping a pin opens the court. */
export default function CourtMap({ courts, activity, focusId, height = 260 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = L.map(box.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
    }).setView([32.228, -110.94], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    // OpenStreetMap's free tiles. Fine for a small app; switch to a paid tile provider if traffic grows.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: prefersDark() ? 'tiles-dark' : 'tiles-light',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    const placed = courts.filter((c) => c.lat != null && c.lng != null);
    for (const court of placed) {
      const count = activity[court.id] ?? 0;
      const icon = L.divIcon({
        className: 'pin-wrap',
        html: `<span class="pin ${count > 0 ? 'pin-live' : ''} ${court.id === focusId ? 'pin-focus' : ''}">${count}</span><span class="pin-name">${escapeHtml(court.name)}</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      L.marker([court.lat!, court.lng!], { icon, title: `${court.name}: ${count} here`, keyboard: true })
        .on('click', () => navigate(`/court/${court.slug}`))
        .addTo(group);
    }
    const focus = placed.find((c) => c.id === focusId);
    if (focus) {
      m.setView([focus.lat!, focus.lng!], 15);
    } else if (placed.length > 1) {
      // Extra room on the right for the court name labels.
      m.fitBounds(L.latLngBounds(placed.map((c) => [c.lat!, c.lng!] as [number, number])), {
        paddingTopLeft: [40, 40],
        paddingBottomRight: [110, 40],
      });
    }
  }, [courts, activity, focusId, navigate]);

  return <div ref={box} className="map" style={{ height }} role="region" aria-label="Map of courts" />;
}
