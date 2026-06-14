import React, { useState, useEffect } from 'react';
import * as satellite from 'satellite.js';
import { X, Globe, Compass, Code, Info, Navigation, Radio } from 'lucide-react';

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

// Helper to parse Keplerian details from TLE lines
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

    // Period: 1440 minutes / mean motion
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

// Helper to parse Launch info from International Designator
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

export default function SelectedSatellitePanel({ satellite: sat, onClose }) {
  const [liveProps, setLiveProps] = useState(null);
  const [showTle, setShowTle] = useState(false);

  useEffect(() => {
    if (!sat) return;
    
    let active = true;
    let satrec;
    try {
      satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
    } catch {
      return;
    }

    const updateLiveMetrics = () => {
      if (!active) return;
      const now = new Date();
      try {
        const pv = satellite.propagate(satrec, now);
        if (pv && pv.position && pv.velocity) {
          const gmst = satellite.gstime(now);
          const gd   = satellite.eciToGeodetic(pv.position, gmst);
          
          const lat = satellite.degreesLat(gd.longitude);
          const lng = satellite.degreesLong(gd.latitude);
          const alt = gd.height; // in km
          
          const speedKmS = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
          const speedKmH = speedKmS * 3600;
          
          setLiveProps({
            lat: lat.toFixed(5) + '°',
            lng: lng.toFixed(5) + '°',
            alt: alt.toFixed(2) + ' km',
            speed: speedKmH.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + ' km/h',
            speedSec: speedKmS.toFixed(3) + ' km/s',
          });
        }
      } catch (err) {
        // Fallback or ignore
      }
      // Update at 5Hz for smooth real-time telemetry feel
      setTimeout(updateLiveMetrics, 200);
    };

    updateLiveMetrics();
    return () => { active = false; };
  }, [sat]);

  if (!sat) return null;

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
        ) : (
          <p className="metric-loading">Recalculating orbital coordinates...</p>
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
