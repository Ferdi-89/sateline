import { useState, useEffect, useRef, useCallback } from 'react';
import * as satellite from 'satellite.js';
import { X, Globe, Compass, Code, Activity, Target, Radio } from 'lucide-react';

const CATEGORY_COLORS = {
  station:  '#00e5ff',
  gps:      '#00c853',
  weather:  '#ff6d00',
  starlink: '#9ca3af',
  other:    '#5a7a9a',
};

const CATEGORY_LABELS = {
  station:  'SPACE STATION',
  gps:      'GPS SYSTEM',
  weather:  'WEATHER SATELLITE',
  starlink: 'STARLINK CONSTELLATION',
  other:    'GENERAL SATELLITE',
};

function parseTLEDetails(tle1, tle2) {
  try {
    const noradId = tle1.substring(2, 7).trim();
    const intDesg = tle1.substring(9, 17).trim();
    const inclination = parseFloat(tle2.substring(8, 16).trim());
    const raan = parseFloat(tle2.substring(17, 25).trim());
    
    const eccStr = tle2.substring(26, 33).trim();
    const eccentricity = parseFloat('0.' + eccStr);
    
    const argPerigee = parseFloat(tle2.substring(34, 42).trim());
    const meanAnomaly = parseFloat(tle2.substring(43, 51).trim());
    const meanMotion = parseFloat(tle2.substring(52, 63).trim());

    const periodMinutes = meanMotion > 0 ? (1440 / meanMotion) : 0;
    const periodStr = periodMinutes > 0 
      ? `${Math.floor(periodMinutes)}m ${Math.round((periodMinutes % 1) * 60)}s`
      : 'N/A';

    return {
      noradId,
      intDesg,
      inclination: inclination.toFixed(4) + '°',
      raan: raan.toFixed(4) + '°',
      eccentricity: eccentricity.toFixed(7),
      argPerigee: argPerigee.toFixed(4) + '°',
      meanAnomaly: meanAnomaly.toFixed(4) + '°',
      meanMotion: meanMotion.toFixed(8) + ' rev/day',
      periodStr,
    };
  } catch {
    return null;
  }
}

function parseLaunchInfo(intDesg) {
  if (!intDesg || intDesg.length < 5) return 'N/A';
  try {
    const yearStr = intDesg.substring(0, 2);
    const launchNum = parseInt(intDesg.substring(2, 5), 10);
    const piece = intDesg.substring(5).trim();
    
    const year = parseInt(yearStr, 10);
    const fullYear = year >= 57 ? 1900 + year : 2000 + year;
    
    return `${fullYear}, #${launchNum} [Piece ${piece}]`;
  } catch {
    return 'N/A';
  }
}

import { useMemo } from 'react';

function getCardinalDirection(azimuth) {
  const az = (azimuth + 360) % 360;
  const dirs = [
    { label: 'U / N', min: 337.5, max: 22.5 },
    { label: 'TL / NE', min: 22.5, max: 67.5 },
    { label: 'T / E', min: 67.5, max: 112.5 },
    { label: 'TG / SE', min: 112.5, max: 157.5 },
    { label: 'S / S', min: 157.5, max: 202.5 },
    { label: 'BD / SW', min: 202.5, max: 247.5 },
    { label: 'B / W', min: 247.5, max: 292.5 },
    { label: 'BL / NW', min: 292.5, max: 337.5 },
  ];
  
  for (const d of dirs) {
    if (d.min > d.max) {
      if (az >= d.min || az < d.max) return d.label;
    } else {
      if (az >= d.min && az < d.max) return d.label;
    }
  }
  return 'U / N';
}

function getElevationRating(elev) {
  if (elev >= 45) return { text: 'Tinggi / High', color: '#00e5ff' };
  if (elev >= 25) return { text: 'Sedang / Med', color: '#ffea00' };
  return { text: 'Rendah / Low', color: '#8fa0b5' };
}

function getPassDateLabel(riseTime, simTime) {
  const simDate = new Date(simTime);
  const passDate = new Date(riseTime);
  
  const simDay = new Date(simDate.getFullYear(), simDate.getMonth(), simDate.getDate());
  const passDay = new Date(passDate.getFullYear(), passDate.getMonth(), passDate.getDate());
  
  const diffTime = passDay.getTime() - simDay.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Hari ini / Today';
  if (diffDays === 1) return 'Besok / Tomorrow';
  return passDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getPassStatus(riseTime, setTime, simTime) {
  const nowMs = simTime.getTime();
  const riseMs = riseTime.getTime();
  const setMs = setTime.getTime();
  
  if (nowMs >= riseMs && nowMs <= setMs) {
    return {
      text: 'LIVE / ACTIVE NOW',
      color: '#00c853',
      isActive: true,
    };
  }
  
  const diffMs = riseMs - nowMs;
  if (diffMs < 0) {
    return {
      text: 'Sudah lewat / Passed',
      color: '#5a7a9a',
      isPassed: true,
    };
  }
  
  const totalMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  
  if (hours > 0) {
    return {
      text: `Dalam ${hours}j ${mins}m / In ${hours}h ${mins}m`,
      color: '#8fa0b5',
      isActive: false,
    };
  } else {
    const secs = Math.round((diffMs % 60000) / 1000);
    return {
      text: `Dalam ${mins}m ${secs}d / In ${mins}m ${secs}s`,
      color: '#00e5ff',
      isActive: false,
    };
  }
}

function getUpcomingPasses(tle1, tle2, observerLocation, simTime) {
  if (!observerLocation) return [];
  try {
    const satrec = satellite.twoline2satrec(tle1, tle2);
    const observerGeodetic = {
      latitude: observerLocation.lat * Math.PI / 180,
      longitude: observerLocation.lng * Math.PI / 180,
      height: 0.1, // assumed observer height in km (100m)
    };

    const passes = [];
    let inPass = false;
    let currentPass = null;

    // Scan 24 hours in steps of 120 seconds (720 steps instead of 2880)
    // This is 4x faster and more than enough to capture LEO passes
    const stepSeconds = 120;
    const totalSteps = (24 * 3600) / stepSeconds;

    const time = new Date(simTime);
    const simTimeMs = simTime.getTime();

    for (let step = 0; step < totalSteps; step++) {
      time.setTime(simTimeMs + step * stepSeconds * 1000);
      const positionAndVelocity = satellite.propagate(satrec, time);
      if (!positionAndVelocity.position) continue;

      const gmst = satellite.gstime(time);
      const positionEcf = satellite.eciToEcf(positionAndVelocity.position, gmst);
      const lookAngles = satellite.ecfToLookAngles(observerGeodetic, positionEcf);

      const elevation = lookAngles.elevation * (180 / Math.PI); // in degrees

      if (elevation >= 10) { // 10 degree elevation threshold
        if (!inPass) {
          inPass = true;
          // Refine rise time using a fine linear search (backwards up to 120s in 15s steps)
          let refinedRiseTime = new Date(time);
          const tempTime = new Date(time);
          for (let offsetSec = 15; offsetSec < 120; offsetSec += 15) {
            tempTime.setTime(time.getTime() - offsetSec * 1000);
            const pv = satellite.propagate(satrec, tempTime);
            if (pv.position) {
              const g = satellite.gstime(tempTime);
              const pe = satellite.eciToEcf(pv.position, g);
              const la = satellite.ecfToLookAngles(observerGeodetic, pe);
              const el = la.elevation * (180 / Math.PI);
              if (el >= 10) {
                refinedRiseTime.setTime(tempTime.getTime());
              } else {
                break; // found the edge
              }
            }
          }

          currentPass = {
            riseTime: refinedRiseTime,
            maxElevation: elevation,
            maxElevationTime: new Date(time),
            setTime: null,
          };
        } else {
          if (elevation > currentPass.maxElevation) {
            currentPass.maxElevation = elevation;
            currentPass.maxElevationTime = new Date(time);
          }
        }
      } else {
        if (inPass) {
          inPass = false;
          
          // Refine set time using a fine linear search (backwards up to 120s in 15s steps)
          let refinedSetTime = new Date(time.getTime() - 120 * 1000); // start from last known in-pass time
          const tempTime = new Date(time);
          for (let offsetSec = 105; offsetSec >= 0; offsetSec -= 15) {
            tempTime.setTime(time.getTime() - offsetSec * 1000);
            const pv = satellite.propagate(satrec, tempTime);
            if (pv.position) {
              const g = satellite.gstime(tempTime);
              const pe = satellite.eciToEcf(pv.position, g);
              const la = satellite.ecfToLookAngles(observerGeodetic, pe);
              const el = la.elevation * (180 / Math.PI);
              if (el >= 10) {
                refinedSetTime.setTime(tempTime.getTime());
              } else {
                break; // crossed out of pass
              }
            }
          }

          currentPass.setTime = refinedSetTime;
          passes.push(currentPass);
          currentPass = null;
          if (passes.length >= 5) break;
        }
      }
    }
    
    if (inPass && currentPass && passes.length < 5) {
      currentPass.setTime = new Date(simTime.getTime() + 24 * 3600 * 1000);
      passes.push(currentPass);
    }
    return passes;
  } catch (err) {
    console.error('Failed to calculate passes:', err);
    return [];
  }
}

export default function SelectedSatellitePanel({ 
  satellite: sat, 
  onClose, 
  simTime,
  viewMode,
  isCameraLocked,
  setIsCameraLocked,
  observerLocation,
}) {
  const [showTle, setShowTle] = useState(false);
  const canvasRef = useRef(null);
  const historyRef = useRef([]); // holds { time, alt }


  // Round simulation time to 5-minute increments for pass prediction performance
  const roundedSimTime = Math.floor(simTime.getTime() / (5 * 60 * 1000));
  const passes = useMemo(() => {
    if (!observerLocation || !sat) return [];
    return getUpcomingPasses(sat.tle1, sat.tle2, observerLocation, new Date(roundedSimTime * 5 * 60 * 1000));
  }, [sat, observerLocation, roundedSimTime]);

  // Calculate live telemetry metrics using current simulated time
  let liveProps = null;
  let rawAlt = 0;

  try {
    const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
    const pv = satellite.propagate(satrec, simTime);
    if (pv && pv.position && pv.velocity) {
      const gmst = satellite.gstime(simTime);
      const gd   = satellite.eciToGeodetic(pv.position, gmst);
      
      const lat = satellite.degreesLat(gd.latitude);
      const lng = satellite.degreesLong(gd.longitude);
      rawAlt = gd.height; // in km
      
      const speedKmS = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
      const speedKmH = speedKmS * 3600;
      
      liveProps = {
        lat: lat.toFixed(5) + '°',
        lng: lng.toFixed(5) + '°',
        alt: rawAlt.toFixed(2) + ' km',
        speed: speedKmH.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + ' km/h',
        speedSec: speedKmS.toFixed(3) + ' km/s',
      };
    }
  } catch {
    // Ignore propagation errors
  }

  // Draw the telemetry sparkline graph
  const drawSparkline = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const history = historyRef.current;
    if (history.length < 2) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(90, 122, 154, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 15) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Min and Max values for scale
    const minVal = Math.min(...history);
    const maxVal = Math.max(...history);
    const range = maxVal - minVal || 10;
    const pad = range * 0.1; // 10% padding top/bottom

    const getX = (index) => (index / (history.length - 1)) * W;
    const getY = (val) => H - 4 - ((val - (minVal - pad)) / (range + 2 * pad)) * (H - 8);

    // Accent color from category
    const accentColor = CATEGORY_COLORS[sat.category] || CATEGORY_COLORS.other;

    // Draw area gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, accentColor + '30');
    grad.addColorStop(1, accentColor + '00');

    ctx.beginPath();
    ctx.moveTo(getX(0), H);
    for (let i = 0; i < history.length; i++) {
      ctx.lineTo(getX(i), getY(history[i]));
    }
    ctx.lineTo(getX(history.length - 1), H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(history[0]));
    for (let i = 1; i < history.length; i++) {
      ctx.lineTo(getX(i), getY(history[i]));
    }
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw dynamic pulse dot at the latest point
    const lastIdx = history.length - 1;
    const dotX = getX(lastIdx);
    const dotY = getY(history[lastIdx]);

    ctx.beginPath();
    ctx.arc(dotX, dotY, 3, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(dotX, dotY, 6, 0, 2 * Math.PI);
    ctx.strokeStyle = accentColor + '88';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [sat]);

  const lastSatRef = useRef(sat);

  // Record history point for sparkline
  useEffect(() => {
    if (lastSatRef.current !== sat) {
      historyRef.current = [];
      lastSatRef.current = sat;
    }

    if (liveProps && rawAlt > 0) {
      const history = historyRef.current;
      history.push(rawAlt);
      if (history.length > 40) {
        history.shift();
      }
      drawSparkline();
    }
  }, [simTime, sat, liveProps, rawAlt, drawSparkline]);

  const color = CATEGORY_COLORS[sat.category] || CATEGORY_COLORS.other;
  const kep = parseTLEDetails(sat.tle1, sat.tle2);
  const launchInfo = kep ? parseLaunchInfo(kep.intDesg) : 'N/A';

  // Calculate real-time look angles from observer to satellite
  let lookAngles = null;
  if (observerLocation) {
    try {
      const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
      const pv = satellite.propagate(satrec, simTime);
      if (pv && pv.position) {
        const observerGeodetic = {
          latitude: observerLocation.lat * Math.PI / 180,
          longitude: observerLocation.lng * Math.PI / 180,
          height: 0.1, // km (100m)
        };
        const gmst = satellite.gstime(simTime);
        const positionEcf = satellite.eciToEcf(pv.position, gmst);
        const angles = satellite.ecfToLookAngles(observerGeodetic, positionEcf);
        
        const az = angles.azimuth * (180 / Math.PI);
        const el = angles.elevation * (180 / Math.PI);
        const range = angles.rangeSat;
        
        lookAngles = {
          azimuth: az,
          elevation: el,
          range: range,
        };
      }
    } catch {
      // Ignore propagation errors
    }
  }

  return (
    <div className="details-panel" style={{ '--accent-color': color }}>
      {/* Detail Header */}
      <div className="details-header">
        <div className="details-title-area">
          <span className="details-subtitle" style={{ color: color }}>
            {CATEGORY_LABELS[sat.category] || 'SATELLITE'}
          </span>
          <h2 className="details-title" title={sat.name}>{sat.name}</h2>
          {viewMode === '3d' && (
            <button
              className={`camera-lock-btn ${isCameraLocked ? 'active' : ''}`}
              onClick={() => setIsCameraLocked(!isCameraLocked)}
              title={isCameraLocked ? 'Release camera tracking lock' : 'Lock camera onto satellite'}
            >
              <Target size={11} />
              <span>{isCameraLocked ? 'CAMERA: LOCKED' : 'LOCK CAMERA'}</span>
            </button>
          )}
        </div>
        <button className="details-close-btn" onClick={onClose} title="Deselect satellite">
          <X size={16} />
        </button>
      </div>

      <div className="details-divider"></div>

      {/* Real-time Telemetry */}
      <div className="details-section">
        <h3 className="section-title">
          <Globe size={12} className="section-icon" />
          REAL-TIME TELEMETRY
        </h3>
        {liveProps ? (
          <>
            <div className="metrics-grid">
              <div className="metric-box">
                <span className="metric-label">LATITUDE</span>
                <span className="metric-value font-numeric">{liveProps.lat}</span>
              </div>
              <div className="metric-box">
                <span className="metric-label">LONGITUDE</span>
                <span className="metric-value font-numeric">{liveProps.lng}</span>
              </div>
              <div className="metric-box">
                <span className="metric-label">ALTITUDE</span>
                <span className="metric-value font-numeric">{liveProps.alt}</span>
              </div>
              <div className="metric-box">
                <span className="metric-label">VELOCITY</span>
                <span className="metric-value font-numeric">{liveProps.speed}</span>
                <span className="metric-subval">{liveProps.speedSec}</span>
              </div>
            </div>

            {/* Canvas Sparkline */}
            <div className="telemetry-sparkline-container">
              <div className="sparkline-header">
                <Activity size={10} style={{ color: color }} />
                <span>ALTITUDE HISTORY WAVE</span>
                <span className="sparkline-stats font-numeric">
                  {rawAlt.toFixed(1)} km
                </span>
              </div>
              <canvas 
                ref={canvasRef} 
                width={250} 
                height={50} 
                className="sparkline-canvas"
              />
            </div>
          </>
        ) : (
          <p className="metric-loading">Recalculating orbital coordinates...</p>
        )}
      </div>

      {/* Sky Pointing Guide Panel */}
      <div className="details-divider"></div>
      <div className="details-section">
        <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Compass size={12} className="section-icon" />
          ARAH POINTING LANGIT / SKY RADAR
        </h3>
        {observerLocation ? (
          lookAngles ? (
            <div className="sky-radar-container">
              {/* Status Banner */}
              <div className={`sky-radar-status-banner ${lookAngles.elevation >= 0 ? 'visible' : 'below'}`}>
                {lookAngles.elevation >= 0 ? (
                  <>
                    <span className="live-dot-green"></span>
                    <span>SATELLITE VISIBLE / TERLIHAT</span>
                  </>
                ) : (
                  <span>BELOW HORIZON / DI BAWAH UFUK</span>
                )}
              </div>

              {/* Centered SVG Radar */}
              <svg className="sky-radar-svg" viewBox="0 0 100 100">
                {/* Compass Dial */}
                <circle cx="50" cy="50" r="36" className="radar-ring horizon" />
                <circle cx="50" cy="50" r="24" className="radar-ring mid-el" />
                <circle cx="50" cy="50" r="12" className="radar-ring high-el" />
                
                {/* Crosshairs */}
                <line x1="50" y1="14" x2="50" y2="86" className="radar-axis" />
                <line x1="14" y1="50" x2="86" y2="50" className="radar-axis" />
                
                {/* Cardinal Directions (positioned fully outside the 36-radius circle) */}
                <text x="50" y="9" className="radar-cardinal">U</text>
                <text x="94" y="53" className="radar-cardinal">T</text>
                <text x="50" y="97" className="radar-cardinal">S</text>
                <text x="6" y="53" className="radar-cardinal">B</text>
                
                {/* Heading Line */}
                {(() => {
                  const azRad = (lookAngles.azimuth * Math.PI) / 180;
                  const x2 = 50 + 36 * Math.sin(azRad);
                  const y2 = 50 - 36 * Math.cos(azRad);
                  return (
                    <line 
                      x1="50" 
                      y1="50" 
                      x2={x2} 
                      y2={y2} 
                      className={`radar-heading-line ${lookAngles.elevation >= 0 ? 'visible' : 'below-horizon'}`} 
                    />
                  );
                })()}

                {/* Satellite Dot */}
                {(() => {
                  const el = lookAngles.elevation;
                  const r = el >= 0 
                    ? ((90 - el) / 90) * 36 
                    : 36; // Lock to horizon if below
                  const azRad = ((lookAngles.azimuth - 90) * Math.PI) / 180;
                  const cx = 50 + r * Math.cos(azRad);
                  const cy = 50 + r * Math.sin(azRad);
                  return (
                    <circle 
                      cx={cx} 
                      cy={cy} 
                      r={el >= 0 ? 3.5 : 3} 
                      className={`radar-sat-marker ${el >= 0 ? 'visible' : 'below-horizon'}`} 
                    />
                  );
                })()}
              </svg>

              {/* Telemetry Metrics Grid */}
              <div className="radar-metrics-grid">
                <div className="radar-metric-box">
                  <span className="radar-metric-box-label">AZIMUTH</span>
                  <span className="radar-metric-box-val font-numeric">
                    {Math.round(lookAngles.azimuth)}°
                  </span>
                  <span className="radar-cardinal-sub">{getCardinalDirection(lookAngles.azimuth)}</span>
                </div>
                
                <div className="radar-metric-box">
                  <span className="radar-metric-box-label">ELEVASI / ELEV</span>
                  <span className="radar-metric-box-val font-numeric" style={{ color: lookAngles.elevation >= 0 ? '#00c853' : '#ff3d00' }}>
                    {Math.round(lookAngles.elevation)}°
                  </span>
                  <span className="radar-cardinal-sub" style={{ color: lookAngles.elevation >= 0 ? '#00c853' : '#ff3d00', fontSize: '8px' }}>
                    {lookAngles.elevation >= 0 ? 'VISIBLE' : 'LOS'}
                  </span>
                </div>
                
                <div className="radar-metric-box">
                  <span className="radar-metric-box-label">JARAK / RANGE</span>
                  <span className="radar-metric-box-val font-numeric">
                    {Math.round(lookAngles.range).toLocaleString()}
                  </span>
                  <span className="radar-cardinal-sub">km</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="metric-loading">Menghitung arah satelit...</p>
          )
        ) : (
          <p className="metric-loading" style={{ fontSize: '11px', color: '#5a7a9a', margin: 0 }}>
            Tentukan lokasi pengamat untuk mengaktifkan radar arah langit.<br/>
            Set observer location to activate sky pointing guide.
          </p>
        )}
      </div>

      {/* Observer & Pass Predictions */}
      <div className="details-divider"></div>
      <div className="details-section">
        <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Compass size={12} className="section-icon" />
          PREDIKSI LINTASAN / PASS PREDICTIONS (24H)
        </h3>
        {observerLocation ? (
          <div>
            <div className="observer-info-box">
              <span className="observer-label-icon">📍</span>
              <div className="observer-text-group">
                <span className="observer-name">{observerLocation.name === 'Dropped Pin' ? 'Pin Peta / Dropped Pin' : 'Lokasi GPS / GPS Location'}</span>
                <span className="observer-coords-sub font-numeric">
                  {Math.abs(observerLocation.lat).toFixed(4)}°{observerLocation.lat >= 0 ? 'N' : 'S'}, {Math.abs(observerLocation.lng).toFixed(4)}°{observerLocation.lng >= 0 ? 'E' : 'W'}
                </span>
              </div>
            </div>

            {passes && passes.length > 0 ? (
              <div className="pass-card-list">
                {passes.map((pass, index) => {
                  const durationMs = pass.setTime.getTime() - pass.riseTime.getTime();
                  const durMins = Math.floor(durationMs / 60000);
                  const durSecs = Math.round((durationMs % 60000) / 1000);
                  
                  const rating = getElevationRating(pass.maxElevation);
                  const dayLabel = getPassDateLabel(pass.riseTime, simTime);
                  const status = getPassStatus(pass.riseTime, pass.setTime, simTime);
                  
                  const timeStr = pass.riseTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

                  return (
                    <div 
                      key={index} 
                      className={`pass-card ${status.isActive ? 'active-pulse' : ''}`}
                      style={{ borderLeft: `3px solid ${rating.color}` }}
                    >
                      <div className="pass-card-row">
                        <div className="pass-card-col">
                          <span className="pass-label">MUNCUL / RISE</span>
                          <span className="pass-value-time font-numeric">{timeStr}</span>
                          <span className="pass-sublabel">{dayLabel}</span>
                        </div>
                        <div className="pass-card-col" style={{ alignItems: 'center' }}>
                          <span className="pass-label">ELEVASI / ELEV</span>
                          <span className="pass-value-elev font-numeric" style={{ color: rating.color }}>{Math.round(pass.maxElevation)}°</span>
                          <span className="pass-sublabel" style={{ color: rating.color }}>{rating.text}</span>
                        </div>
                        <div className="pass-card-col" style={{ alignItems: 'flex-end' }}>
                          <span className="pass-label">DURASI / DURATION</span>
                          <span className="pass-value-duration font-numeric">{durMins}m {durSecs}s</span>
                          <span className="pass-sublabel-status" style={{ color: status.color }}>
                            {status.isActive && <span className="live-dot-green"></span>}
                            {status.text}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="metric-loading" style={{ fontSize: '11px', color: '#5a7a9a', margin: '8px 0 0 0' }}>
                Tidak ada lintasan terlihat dalam 24 jam ke depan.<br/>
                No passes visible in the next 24 hours.
              </p>
            )}
          </div>
        ) : (
          <p className="metric-loading" style={{ fontSize: '11px', color: '#5a7a9a', margin: '8px 0 0 0' }}>
            Tentukan lokasi pengamat di panel peta untuk menghitung lintasan satelit.<br/>
            Set observer location in map panel to calculate pass predictions.
          </p>
        )}
      </div>

      <div className="details-divider"></div>

      {/* Keplerian Elements & Designators */}
      <div className="details-section">
        <h3 className="section-title">
          <Compass size={12} className="section-icon" />
          ORBITAL PARAMETERS
        </h3>
        {kep ? (
          <table className="details-table">
            <tbody>
              <tr>
                <td>NORAD ID</td>
                <td className="font-numeric value-highlight">{kep.noradId}</td>
              </tr>
              <tr>
                <td>INT DESIGNATOR</td>
                <td className="font-numeric">{kep.intDesg}</td>
              </tr>
              <tr>
                <td>LAUNCH DATE</td>
                <td>{launchInfo}</td>
              </tr>
              <tr>
                <td>INCLINATION</td>
                <td className="font-numeric">{kep.inclination}</td>
              </tr>
              <tr>
                <td>ORBITAL PERIOD</td>
                <td className="font-numeric value-highlight">{kep.periodStr}</td>
              </tr>
              <tr>
                <td>ECCENTRICITY</td>
                <td className="font-numeric">{kep.eccentricity}</td>
              </tr>
              <tr>
                <td>MEAN MOTION</td>
                <td className="font-numeric">{kep.meanMotion}</td>
              </tr>
              <tr>
                <td>RAAN</td>
                <td className="font-numeric">{kep.raan}</td>
              </tr>
              <tr>
                <td>ARG OF PERIGEE</td>
                <td className="font-numeric">{kep.argPerigee}</td>
              </tr>
              <tr>
                <td>MEAN ANOMALY</td>
                <td className="font-numeric">{kep.meanAnomaly}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="metric-loading">No orbital data available.</p>
        )}
      </div>

      {/* Radio & Mission Info for LAPAN-A2 (IO-86) */}
      {(sat.name.includes('LAPAN-A2') || (kep && kep.noradId === '40931')) && (
        <>
          <div className="details-divider"></div>
          <div className="details-section">
            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Radio size={12} className="section-icon" style={{ color: color }} />
              LAPAN-A2 (IO-86) RADIO CHANNELS
            </h3>
            <table className="details-table">
              <tbody>
                <tr>
                  <td>Voice Repeater (FM)</td>
                  <td>
                    <strong>Uplink:</strong> 145.880 MHz (PL 88.5 Hz)<br />
                    <strong>Downlink:</strong> 435.880 MHz
                  </td>
                </tr>
                <tr>
                  <td>APRS / Telemetry (simplex)</td>
                  <td>
                    <strong>Freq:</strong> 145.825 MHz (1200 bps AFSK)
                  </td>
                </tr>
                <tr>
                  <td>Operator / Country</td>
                  <td>LAPAN & ORARI / Indonesia 🇮🇩</td>
                </tr>
                <tr>
                  <td>Primary Mission</td>
                  <td>AIS Ship tracking, Disaster APRS, FM Voice Repeater</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="details-divider"></div>

      {/* Raw TLE Data */}
      <div className="details-section">
        <button 
          className="tle-toggle-btn" 
          onClick={() => setShowTle(!showTle)}
        >
          <Code size={12} className="section-icon" />
          <span>{showTle ? 'HIDE RAW TLE' : 'SHOW RAW TLE'}</span>
        </button>
        {showTle && (
          <div className="tle-raw-block">
            <pre className="tle-raw-text">{sat.name}</pre>
            <pre className="tle-raw-text">{sat.tle1}</pre>
            <pre className="tle-raw-text">{sat.tle2}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
