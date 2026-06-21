import { useEffect, useRef } from 'react';
import {
  Viewer,
  Ion,
  Color,
  Cartesian3,
  PointPrimitiveCollection,
  PolylineCollection,
  Material,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  UrlTemplateImageryProvider,
  CallbackProperty,
  JulianDate,
  ColorMaterialProperty,
  Cartographic,
  Math as CesiumMath,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import * as satellite from 'satellite.js';

/* ─── Constants ──────────────────────────────────────────── */
const CATEGORY_COLORS = {
  station:  Color.fromCssColorString('#00e5ff'),
  gps:      Color.fromCssColorString('#00c853'),
  weather:  Color.fromCssColorString('#ff6d00'),
  starlink: Color.fromCssColorString('#9ca3af'),
  other:    Color.fromCssColorString('#5a7a9a'),
};

const DOT_SIZE = { station: 8, gps: 6, weather: 6, starlink: 4, other: 4 };
const R_EARTH = 6378137; // Earth radius in meters

/* ─── Satellite position helper ─────────────────────────── */
function getSatPositionECF(satrec, time, gmst) {
  try {
    const pv = satellite.propagate(satrec, time);
    if (!pv || !pv.position) return null;
    const gd = satellite.eciToGeodetic(pv.position, gmst);
    const lng = satellite.degreesLong(gd.longitude);
    const lat = satellite.degreesLat(gd.latitude);
    const alt = gd.height * 1000; // km → meters
    if (isNaN(lng) || isNaN(lat)) return null;
    return { lng, lat, alt };
  } catch {
    return null;
  }
}

/* ─── Compute footprint radius in meters ────────────────── */
function getFootprintRadius(altMeters) {
  const safeAlt = Math.max(10000, altMeters);
  const ratio = R_EARTH / (R_EARTH + safeAlt);
  if (ratio >= 1.0) return 100000;
  const theta = Math.acos(ratio);
  return Math.min(R_EARTH * theta, 4000000);
}

/* ─── Compute orbit ground track positions ──────────────── */
function computeOrbitPositions(satrec, now) {
  let prevLng = null;
  const segments = [[]];

  for (let m = -90; m <= 90; m += 0.5) {
    const t = new Date(now.getTime() + m * 60_000);
    const pos = getSatPositionECF(satrec, t, satellite.gstime(t));
    if (!pos) {
      if (segments[segments.length - 1].length) segments.push([]);
      prevLng = null;
      continue;
    }
    if (prevLng !== null && Math.abs(pos.lng - prevLng) > 180) {
      segments.push([]);
    }
    segments[segments.length - 1].push(
      Cartesian3.fromDegrees(pos.lng, pos.lat, pos.alt + 1000)
    );
    prevLng = pos.lng;
  }

  return segments.filter(s => s.length > 1);
}

/* ══════════════════════════════════════════════════════════
   CesiumMapView — 3D Globe with Cesium Ion
   ══════════════════════════════════════════════════════════ */
export default function CesiumMapView({ 
  satellites, 
  selectedSatellite, 
  onSelectSatellite,
  simTime,
  isPaused,
  timeMultiplier,
  isCameraLocked,
  observerLocation,
  onSetObserverLocation,
  isPinMode,
  onSetPinMode,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const pointsRef = useRef(null);
  const orbitsRef = useRef(null);
  const satrecCacheRef = useRef(new Map());
  const handlerRef = useRef(null);
  const zoomMultiplierRef = useRef(1.0);
  const satsSnapshotRef = useRef([]); // frozen copy for animation loop

  // Refs for values read inside Cesium's render loop (no React re-renders)
  const selectedRef = useRef(null);
  const onSelectRef = useRef(onSelectSatellite);
  const isCameraLockedRef = useRef(isCameraLocked);
  
  // Refs for tracking observer location & pin mode
  const observerLocationRef = useRef(observerLocation);
  const isPinModeRef = useRef(isPinMode);
  const onSetObserverLocationRef = useRef(onSetObserverLocation);
  const onSetPinModeRef = useRef(onSetPinMode);

  useEffect(() => { selectedRef.current = selectedSatellite; }, [selectedSatellite]);
  useEffect(() => { onSelectRef.current = onSelectSatellite; }, [onSelectSatellite]);
  useEffect(() => { isCameraLockedRef.current = isCameraLocked; }, [isCameraLocked]);
  useEffect(() => { observerLocationRef.current = observerLocation; }, [observerLocation]);
  useEffect(() => { isPinModeRef.current = isPinMode; }, [isPinMode]);
  useEffect(() => { onSetObserverLocationRef.current = onSetObserverLocation; }, [onSetObserverLocation]);
  useEffect(() => { onSetPinModeRef.current = onSetPinMode; }, [onSetPinMode]);

  // Keep a frozen snapshot of the satellites array for the render loop
  useEffect(() => { satsSnapshotRef.current = satellites; }, [satellites]);

  // Reset zoom multiplier when selected satellite or camera lock changes
  useEffect(() => {
    zoomMultiplierRef.current = 1.0;
  }, [selectedSatellite, isCameraLocked]);

  // Refs for tracking simulation time
  const simTimeRef = useRef(simTime);
  const isPausedRef = useRef(isPaused);
  const timeMultiplierRef = useRef(timeMultiplier);
  const localSimTimeRef = useRef(new Date(simTime));
  const lastFrameRef = useRef(0);

  useEffect(() => { simTimeRef.current = simTime; }, [simTime]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { timeMultiplierRef.current = timeMultiplier; }, [timeMultiplier]);

  /* ── Initialize Cesium Viewer ─────────────────────────── */
  useEffect(() => {
    if (!containerRef.current) return;

    Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN || '';

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      vrButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      creditContainer: document.createElement('div'),
      skyBox: false,
      skyAtmosphere: false,
      contextOptions: {
        webgl: { alpha: false },
      },
    });

    viewer.clock.shouldAnimate = false;
    viewer.scene.fog.enabled = false;
    viewer.scene.backgroundColor = Color.fromCssColorString('#050e1a');

    // Allow the camera to rotate freely in any direction over the poles (trackball rotation)
    viewer.camera.constrainedAxis = undefined;

    // Remove default imagery and use CartoDB Dark Matter
    viewer.imageryLayers.removeAll();
    try {
      const darkImageryProvider = new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        credit: '© OpenStreetMap contributors, © CARTO'
      });
      const layer = viewer.imageryLayers.addImageryProvider(darkImageryProvider);
      layer.brightness = 1.6;
      layer.contrast = 1.3;
    } catch (err) {
      console.warn('Failed to load CartoDB Dark Matter imagery:', err);
    }

    // Globe styling
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.baseColor = Color.fromCssColorString('#050e1a');
    viewer.scene.globe.showGroundAtmosphere = false;

    // Set initial camera view
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(110, 0, 20_000_000),
    });

    // Create point primitive collection for satellite dots
    const points = viewer.scene.primitives.add(new PointPrimitiveCollection());
    pointsRef.current = points;

    // Create polyline collection for orbit tracks
    const orbits = viewer.scene.primitives.add(new PolylineCollection());
    orbitsRef.current = orbits;

    viewerRef.current = viewer;

    // Click handler for picking satellites or pinning map
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      if (isPinModeRef.current) {
        const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
        if (defined(cartesian)) {
          const cartographic = Cartographic.fromCartesian(cartesian);
          const lng = CesiumMath.toDegrees(cartographic.longitude);
          const lat = CesiumMath.toDegrees(cartographic.latitude);
          onSetObserverLocationRef.current({
            lat: Math.max(-85, Math.min(85, lat)),
            lng: Math.max(-180, Math.min(180, lng)),
            name: 'Dropped Pin',
          });
          onSetPinModeRef.current(false);
        }
        return;
      }
      const pickedObject = viewer.scene.pick(click.position);
      if (defined(pickedObject) && pickedObject.primitive && pickedObject.primitive.id) {
        onSelectRef.current(pickedObject.primitive.id);
        return;
      }
      onSelectRef.current(null);
    }, ScreenSpaceEventType.LEFT_CLICK);
    handlerRef.current = handler;

    /* ── Satellite position update — driven by Cesium's own render loop ── */
    const onPostUpdate = () => {
      if (viewer.isDestroyed()) return;

      // Calculate time delta for simulated time
      const nowReal = performance.now();
      const lastRealTime = lastFrameRef.current || nowReal;
      const deltaReal = nowReal - lastRealTime;
      lastFrameRef.current = nowReal;

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

      // Update Cesium clock so callback properties get the identical time
      viewer.clock.currentTime = JulianDate.fromDate(localSimTime);

      const sats = satsSnapshotRef.current;
      const cache = satrecCacheRef.current;
      const simDate = localSimTime;
      const sel = selectedRef.current;
      const gmst = satellite.gstime(simDate);

      // Self-healing: rebuild points if count mismatch
      if (points.length !== sats.length) {
        points.removeAll();
        for (let i = 0; i < sats.length; i++) {
          const sat = sats[i];
          const color = CATEGORY_COLORS[sat.category] || CATEGORY_COLORS.other;
          const size = DOT_SIZE[sat.category] || 4;
          points.add({
            pixelSize: size,
            color: color,
            outlineColor: Color.TRANSPARENT,
            outlineWidth: 0,
            eyeOffset: new Cartesian3(0.0, 0.0, -10000.0),
            id: sat,
          });
        }
      }

      // Update positions in-place — runs at Cesium's native frame rate
      const count = Math.min(sats.length, points.length);
      for (let i = 0; i < count; i++) {
        const sat = sats[i];
        const pt = points.get(i);
        if (!pt) continue;

        const key = sat.tle1 + sat.tle2;
        const satrec = cache.get(key);
        if (!satrec) { pt.show = false; continue; }

        const pos = getSatPositionECF(satrec, simDate, gmst);
        if (!pos) { pt.show = false; continue; }

        pt.show = true;
        pt.position = Cartesian3.fromDegrees(pos.lng, pos.lat, pos.alt);

        const isSel = sel && sel.name === sat.name && sel.tle1 === sat.tle1;
        const color = CATEGORY_COLORS[sat.category] || CATEGORY_COLORS.other;
        pt.pixelSize = (DOT_SIZE[sat.category] || 4) + (isSel ? 4 : 0);
        pt.color = isSel ? Color.WHITE : color;
        pt.outlineColor = isSel ? color : Color.TRANSPARENT;
        pt.outlineWidth = isSel ? 2 : 0;
      }
    };

    viewer.scene.postUpdate.addEventListener(onPostUpdate);

    // Camera tracking via preRender event
    const onPreRender = () => {
      if (viewer.isDestroyed()) return;
      if (!isCameraLockedRef.current || !selectedRef.current) return;

      const sat = selectedRef.current;
      const cache = satrecCacheRef.current;
      const key = sat.tle1 + sat.tle2;
      const satrec = cache.get(key);
      if (!satrec) return;

      const date = localSimTimeRef.current;
      const pos = getSatPositionECF(satrec, date, satellite.gstime(date));
      if (!pos) return;

      const satPos = Cartesian3.fromDegrees(pos.lng, pos.lat, pos.alt);
      const norm = Cartesian3.normalize(satPos, new Cartesian3());
      
      const baseOffset = Math.max(1200000.0, pos.alt * 0.5);
      const offsetDist = baseOffset * zoomMultiplierRef.current;
      const camPos = Cartesian3.add(satPos, Cartesian3.multiplyByScalar(norm, offsetDist, new Cartesian3()), new Cartesian3());
      
      const zAxis = new Cartesian3(0.0, 0.0, 1.0);
      const dot = Cartesian3.dot(zAxis, norm);
      const proj = Cartesian3.multiplyByScalar(norm, dot, new Cartesian3());
      const north = Cartesian3.subtract(zAxis, proj, new Cartesian3());
      
      const upVec = Cartesian3.magnitudeSquared(north) < 1e-6
        ? new Cartesian3(0.0, 1.0, 0.0)
        : Cartesian3.normalize(north, new Cartesian3());

      viewer.camera.setView({
        destination: camPos,
        orientation: {
          direction: Cartesian3.negate(norm, new Cartesian3()),
          up: upVec,
        },
      });
    };

    viewer.scene.preRender.addEventListener(onPreRender);

    // Scroll wheel zoom handler when camera is locked
    const handleWheel = (e) => {
      if (isCameraLockedRef.current && selectedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        const zoomSpeed = 0.08;
        let mult = zoomMultiplierRef.current;
        mult = e.deltaY < 0
          ? Math.max(0.15, mult - zoomSpeed)
          : Math.min(8.0, mult + zoomSpeed);
        zoomMultiplierRef.current = mult;
      }
    };

    const canvas = viewer.scene.canvas;
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      if (canvas) canvas.removeEventListener('wheel', handleWheel);
      if (handlerRef.current) handlerRef.current.destroy();
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.scene.postUpdate.removeEventListener(onPostUpdate);
        viewerRef.current.scene.preRender.removeEventListener(onPreRender);
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
  }, []);

  /* ── Build satrec cache when satellites change ────────── */
  useEffect(() => {
    const cache = satrecCacheRef.current;
    satellites.forEach(sat => {
      const key = sat.tle1 + sat.tle2;
      if (!cache.has(key)) {
        try {
          cache.set(key, satellite.twoline2satrec(sat.tle1, sat.tle2));
        } catch {
          cache.set(key, null);
        }
      }
    });
  }, [satellites]);

  /* ── Track Selected Satellite (Ground Footprint) ────────── */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Clear all previous selection entities
    ['selected-sat-footprint', 'selected-sat-tether',
     'selected-sat-footprint-fill', 'selected-sat-footprint-outline',
     'selected-sat-footprint-inner', 'selected-sat-tracker'].forEach(id => {
      viewer.entities.removeById(id);
    });
    viewer.trackedEntity = undefined;

    if (!selectedSatellite) return;

    const cache = satrecCacheRef.current;
    const key = selectedSatellite.tle1 + selectedSatellite.tle2;
    const satrec = cache.get(key);
    if (!satrec) return;

    // Simple footprint circle — flat ellipse at height 100m (no terrain clamping)
    viewer.entities.add({
      id: 'selected-sat-footprint',
      position: new CallbackProperty((time, result) => {
        const date = JulianDate.toDate(time);
        const pos = getSatPositionECF(satrec, date, satellite.gstime(date));
        if (!pos) return result;
        return Cartesian3.fromDegrees(pos.lng, pos.lat, 100.0, undefined, result);
      }, false),
      ellipse: {
        semiMajorAxis: new CallbackProperty((time) => {
          const date = JulianDate.toDate(time);
          const pos = getSatPositionECF(satrec, date, satellite.gstime(date));
          if (!pos) return 100000;
          return getFootprintRadius(pos.alt);
        }, false),
        semiMinorAxis: new CallbackProperty((time) => {
          const date = JulianDate.toDate(time);
          const pos = getSatPositionECF(satrec, date, satellite.gstime(date));
          if (!pos) return 100000;
          return getFootprintRadius(pos.alt);
        }, false),
        material: new ColorMaterialProperty(
          Color.fromCssColorString('#00e5ff').withAlpha(0.10)
        ),
        outline: true,
        outlineColor: Color.fromCssColorString('#00e5ff').withAlpha(0.8),
        outlineWidth: 2.0,
        height: 100.0,
        granularity: 0.005,
      },
    });

    // Vertical tether line
    viewer.entities.add({
      id: 'selected-sat-tether',
      polyline: {
        positions: new CallbackProperty((time) => {
          const date = JulianDate.toDate(time);
          const pos = getSatPositionECF(satrec, date, satellite.gstime(date));
          if (!pos) return [];
          return [
            Cartesian3.fromDegrees(pos.lng, pos.lat, pos.alt),
            Cartesian3.fromDegrees(pos.lng, pos.lat, 0.0),
          ];
        }, false),
        width: 1.5,
        material: Color.fromCssColorString('#00e5ff').withAlpha(0.35),
      },
    });

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.entities.removeById('selected-sat-footprint');
        viewerRef.current.entities.removeById('selected-sat-tether');
        viewerRef.current.trackedEntity = undefined;
      }
    };
  }, [selectedSatellite]);

  /* ── Track Observer Pin & Footprint ─────────────────────── */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.removeById('observer-pin');
    viewer.entities.removeById('observer-horizon');

    if (!observerLocation) return;

    // Add observer pin
    viewer.entities.add({
      id: 'observer-pin',
      position: Cartesian3.fromDegrees(observerLocation.lng, observerLocation.lat, 200.0),
      point: {
        pixelSize: 8,
        color: Color.RED,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: observerLocation.name || 'OBSERVER',
        font: '10px Inter, sans-serif',
        fillColor: Color.RED,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: 2, // Fill and Outline
        verticalOrigin: 1, // Bottom
        pixelOffset: new Cartesian3(0.0, -12.0, 0.0),
      }
    });

    // Calculate footprint radius in meters
    let footprintRadius = 1800000; // in meters (default LEO ~1800km)
    if (selectedSatellite) {
      const cache = satrecCacheRef.current;
      const key = selectedSatellite.tle1 + selectedSatellite.tle2;
      const satrec = cache.get(key);
      if (satrec) {
          const pos = getSatPositionECF(satrec, localSimTimeRef.current, satellite.gstime(localSimTimeRef.current));
        if (pos) {
          const R_earth = 6378137;
          const el = 10 * Math.PI / 180;
          const r = R_earth / (R_earth + pos.alt);
          const psi = Math.acos(r * Math.cos(el)) - el;
          footprintRadius = psi * R_earth;
        }
      }
    }

    // Add observer horizon footprint
    viewer.entities.add({
      id: 'observer-horizon',
      position: Cartesian3.fromDegrees(observerLocation.lng, observerLocation.lat, 10.0),
      ellipse: {
        semiMajorAxis: footprintRadius,
        semiMinorAxis: footprintRadius,
        material: Color.fromCssColorString('#ff3d00').withAlpha(0.06),
        outline: true,
        outlineColor: Color.fromCssColorString('#ff3d00').withAlpha(0.55),
        outlineWidth: 1.5,
        height: 100.0,
        granularity: 0.005,
      }
    });

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.entities.removeById('observer-pin');
        viewerRef.current.entities.removeById('observer-horizon');
      }
    };
  }, [observerLocation, selectedSatellite]);

  /* ── Render Orbit Polyline ────────────────────────────────── */
  useEffect(() => {
    const orbits = orbitsRef.current;
    if (!orbits) return;

    orbits.removeAll();

    if (!selectedSatellite) return;

    const cache = satrecCacheRef.current;
    const key = selectedSatellite.tle1 + selectedSatellite.tle2;
    const satrec = cache.get(key);
    if (!satrec) return;

    const color = CATEGORY_COLORS[selectedSatellite.category] || CATEGORY_COLORS.other;
    const simDate = localSimTimeRef.current;
    const segments = computeOrbitPositions(satrec, simDate);

    segments.forEach((positions, idx) => {
      const half = Math.floor(segments.length / 2);
      const isPast = idx < half;

      orbits.add({
        positions,
        width: isPast ? 1.5 : 3.0,
        material: Material.fromType('Color', {
          color: isPast
            ? color.withAlpha(0.3)
            : color.withAlpha(0.85),
        }),
      });
    });
  }, [selectedSatellite]);

  return (
    <div
      ref={containerRef}
      className="cesium-map-area"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  );
}
