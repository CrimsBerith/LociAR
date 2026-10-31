'use client';
import { useEffect, useRef, useState } from 'react';
import { metersPerPixel, project, TILE, unproject, type LatLng } from '../../../lib/map-tiles';
import { useT } from '../I18nProvider';

/**
 * Small OpenStreetMap picker without a map library: raster tiles (Web Mercator) plus an SVG
 * overlay. Click picks a coordinate; drag pans; the buttons, mouse wheel and +/- keys zoom.
 * Tiles come from tile.openstreetmap.org (allowed in the admin CSP img-src); light admin use only,
 * with the required attribution.
 */
export type { LatLng };
export type MapShape =
  | { id: string; kind: 'circle'; lat: number; lng: number; radius: number; color?: string; dashed?: boolean }
  | { id: string; kind: 'line'; points: LatLng[]; width: number; color?: string }
  | { id: string; kind: 'point'; lat: number; lng: number; color?: string };

const MIN_ZOOM = 3, MAX_ZOOM = 19;
const round = (v: number) => Math.round(v * 1e6) / 1e6;

export default function MapPicker({ center, zoom = 17, shapes = [], onPick, label, hint }: Readonly<{
  center: LatLng; zoom?: number; shapes?: MapShape[]; onPick: (point: LatLng) => void; label: string; hint?: string;
}>) {
  const t = useT();
  const [view, setView] = useState({ ...center, zoom });
  const [width, setWidth] = useState(640);
  const box = useRef<HTMLDivElement>(null), press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const height = 320;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, Math.round(entries[0].contentRect.width))));
    observer.observe(el);
    // Native listener: React's wheel handler is passive and cannot stop the page from scrolling.
    const wheel = (event: WheelEvent) => { event.preventDefault(); setView(v => ({ ...v, zoom: clampZoom(v.zoom + (event.deltaY < 0 ? 1 : -1)) })); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); el.removeEventListener('wheel', wheel); };
  }, []);

  // Follow coordinates typed into the form once they leave the visible area.
  useEffect(() => {
    if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng) || Math.abs(center.lat) > 85) return;
    setView(v => {
      const a = project(v.lat, v.lng, v.zoom), b = project(center.lat, center.lng, v.zoom);
      return Math.abs(a.x - b.x) > width / 2 - 20 || Math.abs(a.y - b.y) > height / 2 - 20 ? { ...v, lat: center.lat, lng: center.lng } : v;
    });
  }, [center.lat, center.lng, width]);

  const z = view.zoom, c = project(view.lat, view.lng, z), left = c.x - width / 2, top = c.y - height / 2, count = 2 ** z;
  const screen = (lat: number, lng: number) => { const p = project(lat, lng, z); return { x: p.x - left, y: p.y - top }; };
  const tiles: Array<{ key: string; src: string; x: number; y: number }> = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
    for (let ty = Math.max(0, Math.floor(top / TILE)); ty <= Math.min(count - 1, Math.floor((top + height) / TILE)); ty++) {
      const wx = ((tx % count) + count) % count;
      tiles.push({ key: `${z}/${tx}/${ty}`, src: `https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`, x: tx * TILE - left, y: ty * TILE - top });
    }
  }

  function pan(dx: number, dy: number) {
    setView(v => { const p = project(v.lat, v.lng, v.zoom); return { ...unproject(p.x - dx, p.y - dy, v.zoom), zoom: v.zoom }; });
  }
  function pointer(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.type === 'pointerdown') {
      press.current = { x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); return;
    }
    const p = press.current;
    if (!p) return;
    const dx = event.clientX - p.x, dy = event.clientY - p.y;
    if (event.type === 'pointermove') {
      if (p.moved || Math.hypot(dx, dy) > 4) { p.moved = true; pan(dx, dy); p.x = event.clientX; p.y = event.clientY; }
      return;
    }
    press.current = null;
    if (event.type === 'pointerup' && !p.moved) {
      const rect = event.currentTarget.getBoundingClientRect(), picked = unproject(left + event.clientX - rect.left, top + event.clientY - rect.top, z);
      onPick({ lat: round(picked.lat), lng: round(picked.lng) });
    }
  }
  function key(event: React.KeyboardEvent<HTMLButtonElement>) {
    const step = 60, moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) { event.preventDefault(); pan(...moves[event.key]); }
    else if (event.key === '+' || event.key === '=') setView(v => ({ ...v, zoom: clampZoom(v.zoom + 1) }));
    else if (event.key === '-') setView(v => ({ ...v, zoom: clampZoom(v.zoom - 1) }));
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPick({ lat: round(view.lat), lng: round(view.lng) });
    }
  }

  const mpp = metersPerPixel(view.lat, z);
  return <div className="mapPicker">
    <div ref={box} className="mapPickerCanvas" style={{ height }}>
      {tiles.map(t => <img key={t.key} src={t.src} alt="" draggable={false} referrerPolicy="strict-origin-when-cross-origin" style={{ left: t.x, top: t.y }}/>)}
      <svg width={width} height={height} aria-hidden="true">
        {shapes.map(s => {
          const color = s.color ?? '#0e7490';
          if (s.kind === 'circle') { const p = screen(s.lat, s.lng); return <g key={s.id}>
            <circle cx={p.x} cy={p.y} r={Math.max(2, s.radius / mpp)} fill={color} fillOpacity={s.dashed ? 0.05 : 0.18} stroke={color} strokeWidth={2} strokeDasharray={s.dashed ? '6 4' : undefined}/>
            <circle cx={p.x} cy={p.y} r={3} fill={color}/></g>; }
          if (s.kind === 'line') { const pts = s.points.map(p => ({ ...screen(p.lat, p.lng), key: `${p.lat}:${p.lng}` })), d = pts.map(p => `${p.x},${p.y}`).join(' ');
            const dots = [...new Map(pts.map(p => [p.key, p])).values()];
            return <g key={s.id}>
            <polyline points={d} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={Math.max(4, s.width / mpp)} strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points={d} fill="none" stroke={color} strokeWidth={2}/>
            {dots.map(p => <circle key={p.key} cx={p.x} cy={p.y} r={4} fill="white" stroke={color} strokeWidth={2}/>)}</g>; }
          const p = screen(s.lat, s.lng);
          return <circle key={s.id} cx={p.x} cy={p.y} r={6} fill={color} stroke="white" strokeWidth={2}/>;
        })}
        <path d={`M${width / 2 - 8} ${height / 2}h16M${width / 2} ${height / 2 - 8}v16`} stroke="#111" strokeOpacity={0.4} strokeWidth={1}/>
      </svg>
      <button type="button" className="mapPickerInteraction" aria-label={`${label}. ${t('Arrow keys pan, plus and minus zoom, Enter picks the map centre.')}`}
        onPointerDown={pointer} onPointerMove={pointer} onPointerUp={pointer} onPointerCancel={pointer} onKeyDown={key}/>
      <div className="mapPickerZoom">
        <button type="button" aria-label={t('Zoom in')} onClick={() => setView(v => ({ ...v, zoom: clampZoom(v.zoom + 1) }))}>+</button>
        <button type="button" aria-label={t('Zoom out')} onClick={() => setView(v => ({ ...v, zoom: clampZoom(v.zoom - 1) }))}>−</button>
      </div>
      <a className="mapPickerCredit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© {t('OpenStreetMap contributors')}</a>
    </div>
    {hint ? <p className="muted">{hint}</p> : null}
  </div>;
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
