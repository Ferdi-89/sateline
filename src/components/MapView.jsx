import { useEffect, useRef, useCallback } from 'react';
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
function project(lng, lat, mapW, mapH, offsetX = 0, offsetY = 0) {
  const x = ((lng + 180) / 360) * mapW + offsetX;
  const y = ((90 - lat) / 180) * mapH + offsetY;
  return [x, y];
}

/* ─── Draw spherical circle on Equirectangular projection ─── */
function drawGeodesicCircle(ctx, centerLng, centerLat, radiusKm, mapW, mapH, offsetX, offsetY) {
  const R_earth = 6371;
  const d_rad = radiusKm / R_earth;
  const lat_rad = centerLat * Math.PI / 180;
  const lng_rad = centerLng * Math.PI / 180;
  
  const points = [];
  for (let i = 0; i <= 64; i++) {
    const angle = (i * 2 * Math.PI) / 64;
    const pLat = Math.asin(
      Math.sin(lat_rad) * Math.cos(d_rad) +
      Math.cos(lat_rad) * Math.sin(d_rad) * Math.cos(angle)
    );
    const pLng = lng_rad + Math.atan2(
      Math.sin(angle) * Math.sin(d_rad) * Math.cos(lat_rad),
      Math.cos(d_rad) - Math.sin(lat_rad) * Math.sin(pLat)
    );
    
    const pLngDeg = (pLng * 180 / Math.PI + 180 + 360) % 360 - 180;
    const pLatDeg = pLat * 180 / Math.PI;
    points.push([pLngDeg, pLatDeg]);
  }
  
  const segments = splitRingAtAntimeridian(points);
  segments.forEach(seg => {
    ctx.beginPath();
    const first = project(seg[0][0], seg[0][1], mapW, mapH, offsetX, offsetY);
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < seg.length; i++) {
      const pt = project(seg[i][0], seg[i][1], mapW, mapH, offsetX, offsetY);
      ctx.lineTo(pt[0], pt[1]);
    }
    ctx.stroke();
  });
}

/* ─── Split a ring at antimeridian crossings ─────────────── */
function splitRingAtAntimeridian(ring) {
  if (ring.length < 2) return [ring];
  const segments = [[]];
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i];
    segments[segments.length - 1].push(cur);
    if (i < ring.length - 1) {
      const next = ring[i + 1];
      if (Math.abs(next[0] - cur[0]) > 180) {
        segments.push([]);
      }
    }
  }
  return segments.filter(s => s.length >= 2);
}

/* ─── Build canvas path array from topojson ─────────────── */
function buildCountrySegments(topoData, mapW, mapH, offsetX, offsetY) {
  const countries = feature(topoData, topoData.objects.countries);
  const allSegments = [];

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
          subRings.forEach(sr => {
            const projectedRing = sr.map(([lng, lat]) => 
              project(lng, lat, mapW, mapH, offsetX, offsetY)
            );
            allSegments.push(projectedRing);
          });
        });
      };

      if (geom.type === 'Polygon') {
        processPolygon(geom.coordinates);
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(poly => processPolygon(poly));
      }
    } catch {
      // Skip failed features
    }
  });

  return allSegments;
}

/* ─── Compute satellite lat/lng/xy at a given time ──────── */
function getSatPosition(satrec, time, gmst, mapW, mapH, offsetX, offsetY) {
  try {
    const pv = satellite.propagate(satrec, time);
    if (!pv || !pv.position) return null;
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
    const pos = getSatPosition(satrec, t, satellite.gstime(t), mapW, mapH, offsetX, offsetY);
    if (!pos) { 
      if (segments[segments.length-1].length) segments.push([]); 
      prevLng = null; 
      continue; 
    }
    if (prevLng !== null && Math.abs(pos.lng - prevLng) > 180) segments.push([]);
    segments[segments.length - 1].push(pos.xy);
    prevLng = pos.lng;
  }
  return segments.filter(s => s.length > 1);
}

/* ══════════════════════════════════════════════════════════
   MapView — Canvas-based, useRef loop, no setState in loop
   ══════════════════════════════════════════════════════════ */
export default function MapView({ 
  satellites, 
  selectedSatellite, 
  onSelectSatellite,
  simTime,
  isPaused,
  timeMultiplier,
  observerLocation,
  onSetObserverLocation,
  isPinMode,
  onSetPinMode,
}) {
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

  // Refs for tracking observer location & pin mode
  const observerRef = useRef(observerLocation);
  const isPinModeRef = useRef(isPinMode);
  const onSetObserverLocationRef = useRef(onSetObserverLocation);
  const onSetPinModeRef = useRef(onSetPinMode);

  useEffect(() => { observerRef.current = observerLocation; }, [observerLocation]);
  useEffect(() => { isPinModeRef.current = isPinMode; }, [isPinMode]);
  useEffect(() => { onSetObserverLocationRef.current = onSetObserverLocation; }, [onSetObserverLocation]);
  useEffect(() => { onSetPinModeRef.current = onSetPinMode; }, [onSetPinMode]);

  // Refs for tracking simulation time
  const simTimeRef = useRef(simTime);
  const isPausedRef = useRef(isPaused);
  const timeMultiplierRef = useRef(timeMultiplier);
  const localSimTimeRef = useRef(new Date(simTime));

  // Zoom / pan transform
  const xfRef  = useRef({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef(null);
  const isDraggingRef = useRef(false);

  useEffect(() => { selectedRef.current = selectedSatellite; }, [selectedSatellite]);
  useEffect(() => { simTimeRef.current = simTime; }, [simTime]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { timeMultiplierRef.current = timeMultiplier; }, [timeMultiplier]);

  /* ── Helper: rebuild country segments for current canvas size ── */
  const rebuildSegments = useCallback(() => {
    const canvas = canvasRef.current;
    if (!topoDataRef.current || !canvas || canvas.width === 0) return;
    const { width: W, height: H } = canvas;
    
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
      orbitRef.current = computeOrbit(satrec, localSimTimeRef.current, mapW, mapH, offsetX, offsetY);
    }
  }, [selectedSatellite]);

  /* ── Main draw loop ─────────────────────────────────────── */
  const draw = useCallback(function drawFunc(ts) {
    rafRef.current = requestAnimationFrame(drawFunc);

    // Calculate time delta for simulated time
    const nowReal = performance.now();
    const lastRealTime = lastFrameRef.current || nowReal;
    const deltaReal = nowReal - lastRealTime;

    let localSimTime;
    if (isPausedRef.current) {
      localSimTime = new Date(simTimeRef.current);
    } else if (timeMultiplierRef.current === 1) {
      localSimTime = new Date();
    } else {
      localSimTime = new Date(localSimTimeRef.current.getTime() + deltaReal * timeMultiplierRef.current);
      const targetTime = simTimeRef.current;
      if (Math.abs(localSimTime.getTime() - targetTime.getTime()) > 5000 * timeMultiplierRef.current) {
        localSimTime = new Date(targetTime);
      }
    }
    localSimTimeRef.current = localSimTime;
    const gmst = satellite.gstime(localSimTime);

    // Frame rate check
    if (ts - lastFrameRef.current < FRAME_MS) return;
    lastFrameRef.current = ts;

    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx     = canvas.getContext('2d');
    const { W, H, mapW, mapH, offsetX, offsetY } = sizeRef.current;
    const sel     = selectedRef.current;
    const { scale, tx, ty } = xfRef.current;

    /* 1 — Clear */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#050e1a';
    ctx.fillRect(0, 0, W, H);

    /* Apply zoom/pan transform */
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

    /* 5 — Signal footprint (Coverage Cone) */
    if (sel) {
      const key = sel.tle1 + sel.tle2;
      const cache = satrecCache.current;
      const satrec = cache.get(key);
      if (satrec) {
        const pos = getSatPosition(satrec, localSimTime, gmst, mapW, mapH, offsetX, offsetY);
        if (pos) {
          const [cx, cy] = pos.xy;
          const R_earth = 6371; // Earth radius in km
          const theta = Math.acos(R_earth / (R_earth + pos.alt));
          const thetaDeg = theta * 180 / Math.PI;
          const footprintPx = (thetaDeg / 360) * mapW;

          const drawFootprintAt = (x) => {
            // Fill
            ctx.beginPath();
            ctx.arc(x, cy, footprintPx, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 229, 255, 0.04)';
            ctx.fill();

            // Outer outline
            ctx.beginPath();
            ctx.arc(x, cy, footprintPx, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
            ctx.lineWidth = 1.5 / scale;
            ctx.stroke();

            // Inner outline (50% radius)
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, cy, footprintPx * 0.5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
            ctx.lineWidth = 1.0 / scale;
            ctx.setLineDash([4 / scale, 4 / scale]);
            ctx.stroke();
            ctx.restore();

            // Center dot
            ctx.beginPath();
            ctx.arc(x, cy, 2 / scale, 0, Math.PI * 2);
            ctx.fillStyle = '#00e5ff';
            ctx.fill();
          };

          drawFootprintAt(cx);
          // Handle wrapping
          if (cx - footprintPx < offsetX) {
            drawFootprintAt(cx + mapW);
          }
          if (cx + footprintPx > offsetX + mapW) {
            drawFootprintAt(cx - mapW);
          }
        }
      }
    }

    /* 5b — Observer pin and horizon footprint circle */
    const obs = observerRef.current;
    if (obs) {
      const [ox, oy] = project(obs.lng, obs.lat, mapW, mapH, offsetX, offsetY);
      
      // Calculate horizon footprint radius
      let footprintRadius = 1800; // default LEO coverage ~1800km
      if (sel) {
        const key = sel.tle1 + sel.tle2;
        const satrec = satrecCache.current.get(key);
        if (satrec) {
          const pos = getSatPosition(satrec, localSimTime, gmst, mapW, mapH, offsetX, offsetY);
          if (pos) {
            const R_earth = 6371;
            const el = 10 * Math.PI / 180; // 10 degree elevation threshold
            const r = R_earth / (R_earth + pos.alt);
            const psi = Math.acos(r * Math.cos(el)) - el;
            footprintRadius = psi * R_earth;
          }
        }
      }
      
      // Draw Geodesic footprint circle around observer (red dashed)
      ctx.strokeStyle = 'rgba(255, 61, 0, 0.45)';
      ctx.lineWidth = 1.2 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      drawGeodesicCircle(ctx, obs.lng, obs.lat, footprintRadius, mapW, mapH, offsetX, offsetY);
      ctx.setLineDash([]);
      
      // Draw Observer Target Pin
      ctx.beginPath();
      ctx.arc(ox, oy, 6 / scale, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff3d00';
      ctx.lineWidth = 1.5 / scale;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(ox, oy, 1.5 / scale, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3d00';
      ctx.fill();
      
      // Label "OBSERVER"
      ctx.fillStyle = '#ff3d00';
      ctx.font = `${Math.max(8, Math.round(10 / scale))}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText("OBSERVER", ox, oy - 10 / scale);
    }

    /* 6 — Satellite dots */
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to screen space
    
    const sizeMul = Math.max(0.75, Math.min(3.5, Math.sqrt(scale)));
    
    satsRef.current.forEach(sat => {
      const pos = getSatPosition(sat.satrec, localSimTime, gmst, mapW, mapH, offsetX, offsetY);
      if (!pos) return;
      const [x, y] = pos.xy;
      
      const sx = x * scale + tx;
      const sy = y * scale + ty;

      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) return;

      const isSel  = sel && sel.name === sat.name && sel.tle1 === sat.tle1;
      const color  = CATEGORY_COLORS[sat.category] || CATEGORY_COLORS.other;
      const baseR  = (DOT_RADIUS[sat.category] || 3) + (isSel ? 2 : 0);
      const r      = baseR * sizeMul;

      if (isSel) {
        ctx.beginPath(); ctx.arc(sx, sy, r + 8 * sizeMul, 0, Math.PI * 2);
        ctx.strokeStyle = color + '30'; ctx.lineWidth = 1.5 * sizeMul; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, r + 4 * sizeMul, 0, Math.PI * 2);
        ctx.strokeStyle = color + '60'; ctx.lineWidth = 1 * sizeMul;   ctx.stroke();
      }

      if (sat.category === 'station' || isSel) {
        ctx.shadowColor = color;
        ctx.shadowBlur  = (isSel ? 14 : 7) * sizeMul;
      } else {
        ctx.shadowBlur  = 0;
      }

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
    onResize();
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
      xfRef.current = {
        scale: newScale,
        tx: mouseX - (mouseX - tx) * (newScale / scale),
        ty: mouseY - (mouseY - ty) * (newScale / scale),
      };
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  /* ── Pan & Zoom: mouse drag, touch drag & pinch ───────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mouse drag handlers
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      isDraggingRef.current = true;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: xfRef.current.tx,
        startTy: xfRef.current.ty,
      };
    };
    const onMouseMove = (e) => {
      if (!isDraggingRef.current || !dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      xfRef.current = {
        ...xfRef.current,
        tx: dragRef.current.startTx + dx,
        ty: dragRef.current.startTy + dy,
      };
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      dragRef.current = null;
    };

    // Touch handlers (Drag & Pinch zoom)
    let startTouchDist = null;
    let startScale = 1;

    const getTouchDistAndCenter = (touches) => {
      const t1 = touches[0];
      const t2 = touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const center = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
      return { dist, center };
    };

    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        // Single touch: start drag
        isDraggingRef.current = true;
        const touch = e.touches[0];
        dragRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          startTx: xfRef.current.tx,
          startTy: xfRef.current.ty,
        };
      } else if (e.touches.length === 2) {
        // Multi-touch: start pinch zoom
        isDraggingRef.current = false; // Disable dragging
        const { dist } = getTouchDistAndCenter(e.touches);
        startTouchDist = dist;
        startScale = xfRef.current.scale;
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 1 && isDraggingRef.current && dragRef.current) {
        // Single finger drag
        const touch = e.touches[0];
        const dx = touch.clientX - dragRef.current.startX;
        const dy = touch.clientY - dragRef.current.startY;
        xfRef.current = {
          ...xfRef.current,
          tx: dragRef.current.startTx + dx,
          ty: dragRef.current.startTy + dy,
        };
      } else if (e.touches.length === 2 && startTouchDist !== null) {
        // Two fingers pinch zoom
        const { dist, center } = getTouchDistAndCenter(e.touches);
        const ratio = dist / startTouchDist;
        const newScale = Math.min(20, Math.max(0.5, startScale * ratio));

        // Calculate center relative to canvas
        const rect = canvas.getBoundingClientRect();
        const canvasX = (center.x - rect.left) * (canvas.width / rect.width);
        const canvasY = (center.y - rect.top) * (canvas.height / rect.height);

        const oldScale = xfRef.current.scale;
        const tx = canvasX - (canvasX - xfRef.current.tx) * (newScale / oldScale);
        const ty = canvasY - (canvasY - xfRef.current.ty) * (newScale / oldScale);

        xfRef.current = {
          scale: newScale,
          tx,
          ty
        };
      }
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
      dragRef.current = null;
      startTouchDist = null;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  /* ── Click Picking: Select nearest satellite ────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onClick = (e) => {
      // Skip clicks that were actually drags
      if (Math.abs(xfRef.current.tx - (dragRef.current?.startTx ?? xfRef.current.tx)) > 2 ||
          Math.abs(xfRef.current.ty - (dragRef.current?.startTy ?? xfRef.current.ty)) > 2) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) * (canvas.width  / rect.width);
      const clickY = (e.clientY - rect.top)  * (canvas.height / rect.height);

      const { scale, tx, ty } = xfRef.current;
      const { mapW, mapH, offsetX, offsetY } = sizeRef.current;

      // Handle map pinning if pinMode is active
      if (isPinModeRef.current) {
        const mapX = (clickX - tx) / scale;
        const mapY = (clickY - ty) / scale;
        const lng = ((mapX - offsetX) / mapW) * 360 - 180;
        const lat = 90 - ((mapY - offsetY) / mapH) * 180;
        
        // Clamp values
        const clampedLat = Math.max(-85, Math.min(85, lat));
        const clampedLng = Math.max(-180, Math.min(180, lng));
        
        onSetObserverLocationRef.current({
          lat: clampedLat,
          lng: clampedLng,
          name: 'Dropped Pin',
        });
        onSetPinModeRef.current(false);
        return;
      }

      let nearestSat = null;
      let minDist = 15; // click range

      const clickGmst = satellite.gstime(localSimTimeRef.current);
      satsRef.current.forEach(sat => {
        const pos = getSatPosition(sat.satrec, localSimTimeRef.current, clickGmst, mapW, mapH, offsetX, offsetY);
        if (!pos) return;
        const [x, y] = pos.xy;
        const sx = x * scale + tx;
        const sy = y * scale + ty;
        const dist = Math.hypot(clickX - sx, clickY - sy);
        if (dist < minDist) {
          minDist = dist;
          nearestSat = sat;
        }
      });

      if (nearestSat) {
        onSelectSatellite({
          name: nearestSat.name,
          tle1: nearestSat.tle1,
          tle2: nearestSat.tle2,
          category: nearestSat.category,
        });
      } else {
        onSelectSatellite(null);
      }
    };

    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [onSelectSatellite]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: 'crosshair',
      }}
    />
  );
}
