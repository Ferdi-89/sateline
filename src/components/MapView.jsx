import React, { useEffect, useRef, useCallback } from 'react';
import { feature } from 'topojson-client';
import * as satellite from 'satellite.js';

/* ─── Constants ──────────────────────────────────────────── */
const CATEGORY_COLORS = {
  station:  '#00e5ff',
  gps:      '#00c853',
  weather:  '#ff6d00',
  starlink: '#9ca3af',
  other:    '#5a7a9a',
};
const DOT_RADIUS = { station: 5, gps: 4, weather: 4, starlink: 3, other: 3 };
const FPS        = 12;
const FRAME_MS   = 1000 / FPS;
const GEO_URL    = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

/* ─── Equirectangular projection ─────────────────────────── */
// lng ∈ [-180,180] → x ∈ [offsetX, offsetX + mapW]
// lat ∈ [-90,90]   → y ∈ [offsetY + mapH, offsetY]  (inverted: north is up)
function project(lng, lat, mapW, mapH, offsetX = 0, offsetY = 0) {
  const x = ((lng + 180) / 360) * mapW + offsetX;
  const y = ((90 - lat) / 180) * mapH + offsetY;
  return [x, y];
}

/* ─── Split a ring at antimeridian crossings ─────────────── */
// Returns array of sub-rings. Consecutive coords that differ by
// more than 180° in longitude indicate an antimeridian crossing.
function splitRingAtAntimeridian(ring) {
  if (ring.length < 2) return [ring];
  const segments = [[]];
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i];
    segments[segments.length - 1].push(cur);
    if (i < ring.length - 1) {
      const next = ring[i + 1];
      if (Math.abs(next[0] - cur[0]) > 180) {
        segments.push([]); // start new segment
      }
    }
  }
  return segments.filter(s => s.length >= 2);
}

/* ─── Build canvas path array from topojson ─────────────── */
function buildCountrySegments(topoData, mapW, mapH, offsetX, offsetY) {
  const countries = feature(topoData, topoData.objects.countries);
  const allSegments = []; // each entry = array of [x,y] points (one closed sub-polygon)

  countries.features.forEach(feat => {
    try {
      const geom = feat.geometry;
      const processPolygon = (coords) => {
        coords.forEach(ring => {
          const clampedRing = ring.map(([lng, lat]) => [
            Math.max(-180, Math.min(180, lng)),
            Math.max(-85,  Math.min(85,  lat)),
          ]);
          const subRings = splitRingAtAntimeridian(clampedRing);
          subRings.forEach(sub => {
            if (sub.length < 2) return;
            allSegments.push(sub.map(([lng, lat]) => project(lng, lat, mapW, mapH, offsetX, offsetY)));
          });
        });
      };
      if (geom.type === 'Polygon')      processPolygon(geom.coordinates);
      if (geom.type === 'MultiPolygon') geom.coordinates.forEach(processPolygon);
    } catch { /* skip */ }
  });

  return allSegments;
}

/* ─── Compute satellite lat/lng/xy at a given time ──────── */
function getSatPosition(satrec, time, mapW, mapH, offsetX, offsetY) {
  try {
    const pv = satellite.propagate(satrec, time);
    if (!pv || !pv.position) return null;
    const gmst = satellite.gstime(time);
    const gd   = satellite.eciToGeodetic(pv.position, gmst);
    const lng  = satellite.degreesLong(gd.longitude);
    const lat  = satellite.degreesLat(gd.latitude);
    if (isNaN(lng) || isNaN(lat)) return null;
    return { lng, lat, alt: gd.height, xy: project(lng, lat, mapW, mapH, offsetX, offsetY) };
  } catch { return null; }
}

/* ─── Compute orbit ground track (±90 minutes, 30s steps) ── */
function computeOrbit(satrec, now, mapW, mapH, offsetX, offsetY) {
  const segments = [[]];
  let prevLng = null;
  for (let m = -90; m <= 90; m += 0.5) {
    const t = new Date(now.getTime() + m * 60_000);
    const pos = getSatPosition(satrec, t, mapW, mapH, offsetX, offsetY);
    if (!pos) { if (segments[segments.length-1].length) segments.push([]); prevLng = null; continue; }
    if (prevLng !== null && Math.abs(pos.lng - prevLng) > 180) segments.push([]);
    segments[segments.length - 1].push(pos.xy);
    prevLng = pos.lng;
  }
  return segments.filter(s => s.length > 1);
}

/* ══════════════════════════════════════════════════════════
   MapView — Canvas-based, useRef loop, no setState in loop
   ══════════════════════════════════════════════════════════ */
export default function MapView({ satellites, selectedSatellite, onSelectSatellite }) {
  const canvasRef      = useRef(null);
  const topoDataRef    = useRef(null);
  const segmentsRef    = useRef([]);
  const satsRef        = useRef([]);
  const selectedRef    = useRef(null);
  const orbitRef       = useRef(null);
  const rafRef         = useRef(null);
  const lastFrameRef   = useRef(0);
  const satrecCache    = useRef(new Map());
  const sizeRef        = useRef({ W: 0, H: 0, mapW: 0, mapH: 0, offsetX: 0, offsetY: 0 });

  // Zoom / pan transform — stored in ref so RAF loop never re-triggers
  const xfRef  = useRef({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef(null); // { startX, startY, startTx, startTy }
  const isDraggingRef = useRef(false);

  /* ── Helper: rebuild country segments for current canvas size ── */
  const rebuildSegments = useCallback(() => {
    const canvas = canvasRef.current;
    if (!topoDataRef.current || !canvas || canvas.width === 0) return;
    const { width: W, height: H } = canvas;
    
    // Maintain strict 2:1 aspect ratio centered in canvas to prevent deformation
    let mapW = W;
    let mapH = W / 2;
    let offsetX = 0;
    let offsetY = (H - mapH) / 2;

    if (W / H > 2) {
      mapH = H;
      mapW = H * 2;
      offsetX = (W - mapW) / 2;
      offsetY = 0;
    }

    sizeRef.current = { W, H, mapW, mapH, offsetX, offsetY };
    segmentsRef.current = buildCountrySegments(topoDataRef.current, mapW, mapH, offsetX, offsetY);
  }, []);

  /* ── Load world TopoJSON ────────────────────────────────── */
  useEffect(() => {
    fetch(GEO_URL)
      .then(r => r.json())
      .then(data => {
        topoDataRef.current = data;
        rebuildSegments();
      })
      .catch(console.error);
  }, [rebuildSegments]);

  /* ── Sync satellites → satsRef (with satrec cache) ───────── */
  useEffect(() => {
    const cache = satrecCache.current;
    satsRef.current = satellites.flatMap(sat => {
      const key = sat.tle1 + sat.tle2;
      if (!cache.has(key)) {
        try { cache.set(key, satellite.twoline2satrec(sat.tle1, sat.tle2)); }
        catch { cache.set(key, null); }
      }
      const satrec = cache.get(key);
      return satrec ? [{ ...sat, satrec }] : [];
    });
  }, [satellites]);

  /* ── Sync selectedSatellite → ref + orbit track ─────────── */
  useEffect(() => {
    selectedRef.current = selectedSatellite;
    orbitRef.current = null;
    if (!selectedSatellite) return;
    const cache  = satrecCache.current;
    const key    = selectedSatellite.tle1 + selectedSatellite.tle2;
    const satrec = cache.get(key);
    const canvas = canvasRef.current;
    if (satrec && canvas) {
      const { mapW, mapH, offsetX, offsetY } = sizeRef.current;
      orbitRef.current = computeOrbit(satrec, new Date(), mapW, mapH, offsetX, offsetY);
    }
  }, [selectedSatellite]);

  /* ── Main draw loop ─────────────────────────────────────── */
  const draw = useCallback((ts) => {
    rafRef.current = requestAnimationFrame(draw);
    if (ts - lastFrameRef.current < FRAME_MS) return;
    lastFrameRef.current = ts;

    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx     = canvas.getContext('2d');
    const { W, H, mapW, mapH, offsetX, offsetY } = sizeRef.current;
    const now     = new Date();
    const sel     = selectedRef.current;
    const { scale, tx, ty } = xfRef.current;

    /* 1 — Clear (reset transform first) */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#050e1a';
    ctx.fillRect(0, 0, W, H);

    /* Apply zoom/pan transform for all world drawing */
    ctx.setTransform(scale, 0, 0, scale, tx, ty);

    /* 2 — Grid lines & Border */
    ctx.strokeStyle = 'rgba(26,48,80,0.45)';
    ctx.lineWidth   = 0.5;
    [-60, -30, 0, 30, 60].forEach(lat => {
      const [, y] = project(0, lat, mapW, mapH, offsetX, offsetY);
      ctx.beginPath(); 
      ctx.moveTo(offsetX, y); 
      ctx.lineTo(offsetX + mapW, y); 
      ctx.stroke();
    });
    [-150,-120,-90,-60,-30, 0, 30, 60, 90,120,150].forEach(lng => {
      const [x]   = project(lng, 0, mapW, mapH, offsetX, offsetY);
      ctx.beginPath(); 
      ctx.moveTo(x, offsetY); 
      ctx.lineTo(x, offsetY + mapH); 
      ctx.stroke();
    });

    // Subtle tactical border around the map boundaries
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(offsetX, offsetY, mapW, mapH);

    /* 3 — Country fills */
    ctx.fillStyle   = '#0a1628';
    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth   = 0.6;
    segmentsRef.current.forEach(seg => {
      if (seg.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(seg[0][0], seg[0][1]);
      for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i][0], seg[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    /* 4 — Orbit track */
    if (orbitRef.current && sel) {
      const color = CATEGORY_COLORS[sel.category] || CATEGORY_COLORS.other;
      const segments = orbitRef.current;
      const half = Math.floor(segments.length / 2);

      segments.forEach((seg, segIdx) => {
        if (seg.length < 2) return;
        // Past orbit = dimmer, Future orbit = brighter
        const isPast = segIdx < half;
        ctx.beginPath();
        ctx.moveTo(seg[0][0], seg[0][1]);
        for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i][0], seg[i][1]);
        ctx.strokeStyle = isPast ? color + '55' : color + 'cc';
        ctx.lineWidth   = isPast ? 1.5 : 2.5;
        ctx.shadowColor = isPast ? 'transparent' : color;
        ctx.shadowBlur  = isPast ? 0 : 8;
        ctx.setLineDash(isPast ? [4, 6] : []);
        ctx.stroke();
      });

      ctx.setLineDash([]);
      ctx.shadowBlur  = 0;
      ctx.shadowColor = 'transparent';
    }

    /* 5 — Satellite dots */
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to screen space
    
    // Scale multiplier: scales sub-linearly with zoom level so dots grow when zoomed in,
    // but don't overwhelm the map. Clamped between 0.75x and 3.5x.
    const sizeMul = Math.max(0.75, Math.min(3.5, Math.sqrt(scale)));
    
    satsRef.current.forEach(sat => {
      const pos = getSatPosition(sat.satrec, now, mapW, mapH, offsetX, offsetY);
      if (!pos) return;
      const [x, y] = pos.xy;
      
      // Calculate screen position
      const sx = x * scale + tx;
      const sy = y * scale + ty;

      // Filter by screen bounds (with padding)
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) return;

      const isSel  = sel && sel.name === sat.name && sel.tle1 === sat.tle1;
      const color  = CATEGORY_COLORS[sat.category] || CATEGORY_COLORS.other;
      const baseR  = (DOT_RADIUS[sat.category] || 3) + (isSel ? 2 : 0);
      const r      = baseR * sizeMul;

      /* selected rings */
      if (isSel) {
        ctx.beginPath(); ctx.arc(sx, sy, r + 8 * sizeMul, 0, Math.PI * 2);
        ctx.strokeStyle = color + '30'; ctx.lineWidth = 1.5 * sizeMul; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, r + 4 * sizeMul, 0, Math.PI * 2);
        ctx.strokeStyle = color + '60'; ctx.lineWidth = 1 * sizeMul;   ctx.stroke();
      }

      /* glow */
      if (sat.category === 'station' || isSel) {
        ctx.shadowColor = color;
        ctx.shadowBlur  = (isSel ? 14 : 7) * sizeMul;
      } else {
        ctx.shadowBlur  = 0;
      }

      /* dot */
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle   = color;
      ctx.globalAlpha = isSel ? 1 : 0.85;
      ctx.fill();
    });
    ctx.restore();
  }, []);

  /* ── Start / stop RAF ───────────────────────────────────── */
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) { cancelAnimationFrame(rafRef.current); }
      else { rafRef.current = requestAnimationFrame(draw); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  /* ── Resize: sync canvas resolution ─────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onResize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      rebuildSegments();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    onResize(); // immediate initial size
    return () => ro.disconnect();
  }, [rebuildSegments]);

  /* ── Zoom: scroll wheel ─────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect   = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) * (canvas.width  / rect.width);
      const mouseY = (e.clientY - rect.top)  * (canvas.height / rect.height);
      const { scale, tx, ty } = xfRef.current;
      const factor  = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newScale = Math.min(20, Math.max(0.5, scale * factor));
      // Zoom centered on cursor position
      xfRef.current = {
        scale: newScale,
        tx: mouseX - (mouseX - tx) * (newScale / scale),
        ty: mouseY - (mouseY - ty) * (newScale / scale),
      };
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  /* ── Pan: mouse drag ────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      isDraggingRef.current = false;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: xfRef.current.tx,
        startTy: xfRef.current.ty,
      };
    };
    const onMouseMove = (e) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.hypot(dx, dy) > 3) isDraggingRef.current = true;
      if (!isDraggingRef.current) return;
      xfRef.current = {
        ...xfRef.current,
        tx: dragRef.current.startTx + dx,
        ty: dragRef.current.startTy + dy,
      };
    };
    const onMouseUp = () => { dragRef.current = null; };
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  /* ── Double-click: reset zoom ───────────────────────────── */
  const handleDblClick = useCallback(() => {
    xfRef.current = { scale: 1, tx: 0, ty: 0 };
  }, []);

  /* ── Click: pick nearest satellite ─────────────────────── */
  const handleClick = useCallback(e => {
    // Ignore clicks that were actually drags
    if (isDraggingRef.current) { isDraggingRef.current = false; return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    // Screen → canvas pixels
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top)  * scaleY;
    // Canvas pixels → world coords (inverse transform)
    const { scale, tx, ty } = xfRef.current;
    const wx = (cx - tx) / scale;
    const wy = (cy - ty) / scale;
    const { mapW, mapH, offsetX, offsetY } = sizeRef.current;
    const now = new Date();

    let closest = null, minDist = 20 / scale; // threshold scales with zoom
    satsRef.current.forEach(sat => {
      const pos = getSatPosition(sat.satrec, now, mapW, mapH, offsetX, offsetY);
      if (!pos) return;
      const d = Math.hypot(wx - pos.xy[0], wy - pos.xy[1]);
      if (d < minDist) { minDist = d; closest = sat; }
    });
    onSelectSatellite(closest ?? null);
  }, [onSelectSatellite]);

  return (
    <canvas
      ref={canvasRef}
      className="map-area"
      onClick={handleClick}
      onDoubleClick={handleDblClick}
      style={{
        cursor: dragRef.current ? 'grabbing' : 'crosshair',
        display: 'block',
      }}
    />
  );
}
