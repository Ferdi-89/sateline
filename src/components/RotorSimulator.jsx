import { useMemo } from 'react';
import * as satellite from 'satellite.js';
import { Antenna, Target } from 'lucide-react';

export default function RotorSimulator({ sat, simTime, observerLocation }) {
  const lookAngles = useMemo(() => {
    if (!sat || !observerLocation) return null;
    try {
      const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
      const pv = satellite.propagate(satrec, simTime);
      if (!pv || !pv.position) return null;
      const gmst = satellite.gstime(simTime);
      const observerGeodetic = {
        latitude: observerLocation.lat * Math.PI / 180,
        longitude: observerLocation.lng * Math.PI / 180,
        height: 0.1,
      };
      const posEcf = satellite.eciToEcf(pv.position, gmst);
      const angles = satellite.ecfToLookAngles(observerGeodetic, posEcf);
      return {
        azimuth: angles.azimuth * (180 / Math.PI),
        elevation: angles.elevation * (180 / Math.PI),
        range: angles.rangeSat,
      };
    } catch {
      return null;
    }
  }, [sat, simTime, observerLocation]);

  const az = lookAngles ? lookAngles.azimuth : 0;
  const el = lookAngles ? Math.max(0, lookAngles.elevation) : 0;
  const isVisible = lookAngles && lookAngles.elevation >= 0;

  // SVG gauge helpers
  const azNeedleAngle = az - 90; // SVG 0° is right, compass 0° is top
  const elBarHeight = Math.min(90, Math.max(0, el)) / 90 * 100;

  return (
    <div className="rotor-panel">
      <div className="rotor-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Target size={13} className="rotor-icon-pulse" />
          <span className="rotor-title">ANTENNA ROTOR SIMULATOR</span>
        </div>
        <div className={`rotor-status-badge ${isVisible ? 'tracking' : 'idle'}`}>
          <span className="rotor-status-dot"></span>
          <span>{isVisible ? 'TRACKING' : 'IDLE'}</span>
        </div>
      </div>

      <div className="rotor-body">
        <div className="rotor-gauges">
          {/* Azimuth Compass Gauge */}
          <div className="rotor-gauge-container">
            <span className="rotor-gauge-label">AZIMUTH</span>
            <svg viewBox="0 0 120 120" className="rotor-compass-svg">
              {/* Background circle */}
              <circle cx="60" cy="60" r="50" className="rotor-compass-bg" />
              <circle cx="60" cy="60" r="50" className="rotor-compass-ring" />
              <circle cx="60" cy="60" r="35" className="rotor-compass-ring-inner" />

              {/* Tick marks */}
              {Array.from({ length: 36 }, (_, i) => {
                const angle = (i * 10 - 90) * Math.PI / 180;
                const isMajor = i % 9 === 0;
                const r1 = isMajor ? 42 : 45;
                const r2 = 50;
                return (
                  <line
                    key={i}
                    x1={60 + r1 * Math.cos(angle)}
                    y1={60 + r1 * Math.sin(angle)}
                    x2={60 + r2 * Math.cos(angle)}
                    y2={60 + r2 * Math.sin(angle)}
                    className={isMajor ? 'rotor-tick-major' : 'rotor-tick-minor'}
                  />
                );
              })}

              {/* Cardinal labels */}
              <text x="60" y="16" className="rotor-cardinal">N</text>
              <text x="104" y="63" className="rotor-cardinal">E</text>
              <text x="60" y="110" className="rotor-cardinal">S</text>
              <text x="16" y="63" className="rotor-cardinal">W</text>

              {/* Azimuth needle */}
              <line
                x1="60"
                y1="60"
                x2={60 + 40 * Math.cos(azNeedleAngle * Math.PI / 180)}
                y2={60 + 40 * Math.sin(azNeedleAngle * Math.PI / 180)}
                className={`rotor-needle ${isVisible ? 'active' : 'inactive'}`}
              />

              {/* Center dot */}
              <circle cx="60" cy="60" r="3" className="rotor-center-dot" />

              {/* Target dot at end of needle */}
              <circle
                cx={60 + 38 * Math.cos(azNeedleAngle * Math.PI / 180)}
                cy={60 + 38 * Math.sin(azNeedleAngle * Math.PI / 180)}
                r="4"
                className={`rotor-target-dot ${isVisible ? 'active' : 'inactive'}`}
              />
            </svg>
            <span className="rotor-gauge-value font-numeric">{az.toFixed(1)}°</span>
          </div>

          {/* Elevation Bar Gauge */}
          <div className="rotor-gauge-container">
            <span className="rotor-gauge-label">ELEVATION</span>
            <div className="rotor-elevation-gauge">
              <div className="rotor-el-bar-bg">
                <div
                  className={`rotor-el-bar-fill ${isVisible ? 'active' : 'inactive'}`}
                  style={{ height: `${elBarHeight}%` }}
                />
                {/* Tick marks */}
                {[0, 15, 30, 45, 60, 75, 90].map(deg => (
                  <div
                    key={deg}
                    className="rotor-el-tick"
                    style={{ bottom: `${(deg / 90) * 100}%` }}
                  >
                    <span className="rotor-el-tick-label font-numeric">{deg}°</span>
                  </div>
                ))}
              </div>
              {/* Current pointer */}
              <div
                className="rotor-el-pointer"
                style={{ bottom: `${elBarHeight}%` }}
              >
                <span className="rotor-el-pointer-value font-numeric">
                  {el.toFixed(1)}°
                </span>
              </div>
            </div>
            <span className={`rotor-gauge-value font-numeric ${isVisible ? 'visible' : 'below'}`}>
              {lookAngles ? lookAngles.elevation.toFixed(1) : '0.0'}°
            </span>
          </div>
        </div>

        {/* Status bar */}
        <div className="rotor-status-bar">
          <div className="rotor-status-item">
            <span className="rotor-status-lbl">RANGE</span>
            <span className="rotor-status-val font-numeric">
              {lookAngles ? Math.round(lookAngles.range).toLocaleString() + ' km' : '—'}
            </span>
          </div>
          <div className="rotor-status-item">
            <span className="rotor-status-lbl">STATUS</span>
            <span className={`rotor-status-val ${isVisible ? 'tracking' : 'stow'}`}>
              {isVisible ? 'AUTO-TRACK' : 'STOW / BELOW HORIZON'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
