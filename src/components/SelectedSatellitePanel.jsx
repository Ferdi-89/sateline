import React, { useState, useEffect, useRef } from 'react';
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
  } catch (e) {
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

    // Scan 24 hours in steps of 30 seconds
    const stepSeconds = 30;
    const totalSteps = (24 * 3600) / stepSeconds;

    for (let step = 0; step < totalSteps; step++) {
      const time = new Date(simTime.getTime() + step * stepSeconds * 1000);
      const positionAndVelocity = satellite.propagate(satrec, time);
      if (!positionAndVelocity.position) continue;

      const gmst = satellite.gstime(time);
      const positionEcf = satellite.eciToEcf(positionAndVelocity.position, gmst);
      const lookAngles = satellite.ecfToLookAngles(observerGeodetic, positionEcf);

      const elevation = lookAngles.elevation * (180 / Math.PI); // in degrees

      if (elevation >= 10) { // 10 degree elevation threshold
        if (!inPass) {
          inPass = true;
          currentPass = {
            riseTime: time,
            maxElevation: elevation,
            maxElevationTime: time,
            setTime: null,
          };
        } else {
          if (elevation > currentPass.maxElevation) {
            currentPass.maxElevation = elevation;
            currentPass.maxElevationTime = time;
          }
        }
      } else {
        if (inPass) {
          inPass = false;
          currentPass.setTime = time;
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
  const prevSatRef = useRef(null);

  // Round simulation time to 5-minute increments for pass prediction performance
  const roundedSimTime = Math.floor(simTime.getTime() / (5 * 60 * 1000));
  const passes = useMemo(() => {
    if (!observerLocation || !sat) return [];
    return getUpcomingPasses(sat.tle1, sat.tle2, observerLocation, new Date(roundedSimTime * 5 * 60 * 1000));
  }, [sat, observerLocation, roundedSimTime]);

  // Reset history if satellite changes
  if (prevSatRef.current !== sat) {
    historyRef.current = [];
    prevSatRef.current = sat;
  }

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
  } catch (err) {
    // Ignore propagation errors
  }

  // Record history point for sparkline
  useEffect(() => {
    if (liveProps && rawAlt > 0) {
      const history = historyRef.current;
      history.push(rawAlt);
      if (history.length > 40) {
        history.shift();
      }
      drawSparkline();
    }
  }, [simTime, sat]);

  // Draw the telemetry sparkline graph
  const drawSparkline = () => {
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
  };

  const color = CATEGORY_COLORS[sat.category] || CATEGORY_COLORS.other;
  const kep = parseTLEDetails(sat.tle1, sat.tle2);
  const launchInfo = kep ? parseLaunchInfo(kep.intDesg) : 'N/A';

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

      {/* Observer & Pass Predictions */}
      <div className="details-divider"></div>
      <div className="details-section">
        <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Compass size={12} className="section-icon" />
          UPCOMING PASSES (24H)
        </h3>
        {observerLocation ? (
          <div>
            <div className="observer-info-box" style={{ fontSize: '11px', color: '#8fa0b5', marginBottom: '8px', background: 'rgba(26,48,80,0.2)', padding: '6px', borderRadius: '4px' }}>
              Observer: <strong>{observerLocation.name}</strong> ({observerLocation.lat.toFixed(4)}°, {observerLocation.lng.toFixed(4)}°)
            </div>
            {passes && passes.length > 0 ? (
              <table className="details-table passes-table" style={{ width: '100%' }}>
                <thead>
                  <tr style={{ color: '#8fa0b5', fontSize: '9px' }}>
                    <th style={{ textAlign: 'left', paddingBottom: '4px' }}>RISE TIME (LOCAL)</th>
                    <th style={{ textAlign: 'center', paddingBottom: '4px' }}>MAX ELEV</th>
                    <th style={{ textAlign: 'right', paddingBottom: '4px' }}>DURATION</th>
                  </tr>
                </thead>
                <tbody>
                  {passes.map((pass, index) => {
                    const durationMs = pass.setTime.getTime() - pass.riseTime.getTime();
                    const durMins = Math.floor(durationMs / 60000);
                    const durSecs = Math.round((durationMs % 60000) / 1000);
                    return (
                      <tr key={index}>
                        <td style={{ fontSize: '11px', padding: '3px 0' }}>
                          {pass.riseTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: '600', color: pass.maxElevation > 45 ? '#00c853' : pass.maxElevation > 25 ? '#e0e6ed' : '#5a7a9a', padding: '3px 0' }}>
                          {Math.round(pass.maxElevation)}°
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '11px', padding: '3px 0' }} className="font-numeric">
                          {durMins}m {durSecs}s
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="metric-loading" style={{ fontSize: '11px', color: '#5a7a9a', margin: 0 }}>
                No passes visible in the next 24 hours.
              </p>
            )}
          </div>
        ) : (
          <p className="metric-loading" style={{ fontSize: '11px', color: '#5a7a9a', margin: 0 }}>
            Set observer location in the sidebar to calculate pass predictions.
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
