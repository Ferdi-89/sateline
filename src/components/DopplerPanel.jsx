import { useState, useEffect, useRef, useMemo } from 'react';
import * as satellite from 'satellite.js';
import { Radio, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

const SPEED_OF_LIGHT = 299792.458; // km/s

export default function DopplerPanel({ sat, simTime, observerLocation }) {
  const [nominalFreqMHz, setNominalFreqMHz] = useState(435.880);
  const [isExpanded, setIsExpanded] = useState(true);
  const canvasRef = useRef(null);
  const historyRef = useRef([]); // { time, shift }

  // Compute Doppler shift
  const doppler = useMemo(() => {
    if (!sat || !observerLocation) return null;
    try {
      const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
      const pv = satellite.propagate(satrec, simTime);
      if (!pv || !pv.position || !pv.velocity) return null;

      const gmst = satellite.gstime(simTime);
      const observerGeodetic = {
        latitude: observerLocation.lat * Math.PI / 180,
        longitude: observerLocation.lng * Math.PI / 180,
        height: 0.1,
      };

      const posEcf = satellite.eciToEcf(pv.position, gmst);
      const lookAngles = satellite.ecfToLookAngles(observerGeodetic, posEcf);
      const range = lookAngles.rangeSat; // km

      // Compute range rate (radial velocity) using finite difference
      const dt = 0.5; // seconds
      const t2 = new Date(simTime.getTime() + dt * 1000);
      const pv2 = satellite.propagate(satrec, t2);
      if (!pv2 || !pv2.position) return null;

      const gmst2 = satellite.gstime(t2);
      const posEcf2 = satellite.eciToEcf(pv2.position, gmst2);
      const lookAngles2 = satellite.ecfToLookAngles(observerGeodetic, posEcf2);
      const range2 = lookAngles2.rangeSat;

      const rangeRate = (range2 - range) / dt; // km/s (positive = moving away)

      const nominalHz = nominalFreqMHz * 1e6;
      const dopplerShift = -nominalHz * (rangeRate / SPEED_OF_LIGHT);
      const correctedFreq = nominalHz + dopplerShift;

      return {
        rangeRate: rangeRate * 1000, // m/s
        dopplerShiftHz: dopplerShift,
        correctedFreqMHz: correctedFreq / 1e6,
        elevation: lookAngles.elevation * 180 / Math.PI,
        range,
      };
    } catch {
      return null;
    }
  }, [sat, simTime, observerLocation, nominalFreqMHz]);

  // Record history for sparkline
  useEffect(() => {
    if (!doppler) return;
    const h = historyRef.current;
    h.push(doppler.dopplerShiftHz);
    if (h.length > 60) h.shift();
  }, [doppler]);

  // Draw Doppler graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const history = historyRef.current;

    ctx.fillStyle = '#050e1a';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(90, 122, 154, 0.1)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    // Zero line
    ctx.strokeStyle = 'rgba(255, 234, 0, 0.3)';
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

    if (history.length < 2) return;

    const maxAbs = Math.max(1000, ...history.map(Math.abs));
    const getX = (i) => (i / (history.length - 1)) * W;
    const getY = (v) => H / 2 - (v / maxAbs) * (H / 2 - 4);

    // Area gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0.15)');
    grad.addColorStop(0.5, 'rgba(0, 229, 255, 0.0)');
    grad.addColorStop(1, 'rgba(255, 61, 0, 0.15)');
    ctx.beginPath();
    ctx.moveTo(getX(0), H / 2);
    for (let i = 0; i < history.length; i++) ctx.lineTo(getX(i), getY(history[i]));
    ctx.lineTo(getX(history.length - 1), H / 2);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(history[0]));
    for (let i = 1; i < history.length; i++) ctx.lineTo(getX(i), getY(history[i]));
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Current dot
    const lastX = getX(history.length - 1);
    const lastY = getY(history[history.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Labels
    ctx.fillStyle = '#5a7a9a';
    ctx.font = '8px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`+${(maxAbs / 1000).toFixed(1)} kHz`, 3, 10);
    ctx.fillText(`-${(maxAbs / 1000).toFixed(1)} kHz`, 3, H - 3);
    ctx.fillStyle = 'rgba(255,234,0,0.5)';
    ctx.fillText('0 Hz', 3, H / 2 - 3);
  }, [doppler]);

  const formatShift = (hz) => {
    if (Math.abs(hz) >= 1000) return (hz / 1000).toFixed(3) + ' kHz';
    return hz.toFixed(1) + ' Hz';
  };

  return (
    <div className="doppler-panel">
      <div className="doppler-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TrendingUp size={13} className="doppler-icon-pulse" />
          <span className="doppler-title">DOPPLER SHIFT CALCULATOR</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {doppler && (
            <span className={`doppler-live-badge ${doppler.dopplerShiftHz > 0 ? 'positive' : 'negative'}`}>
              {doppler.dopplerShiftHz > 0 ? '+' : ''}{formatShift(doppler.dopplerShiftHz)}
            </span>
          )}
          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
      </div>

      {isExpanded && (
        <div className="doppler-body">
          {/* Nominal freq input */}
          <div className="doppler-freq-input-row">
            <label className="doppler-input-label">NOMINAL DOWNLINK FREQ</label>
            <div className="doppler-freq-input-group">
              <input
                type="number"
                step="0.001"
                min="1"
                max="30000"
                value={nominalFreqMHz}
                onChange={(e) => setNominalFreqMHz(parseFloat(e.target.value) || 435.880)}
                className="doppler-freq-input font-numeric"
              />
              <span className="doppler-freq-unit">MHz</span>
            </div>
          </div>

          {doppler ? (
            <>
              {/* Metrics */}
              <div className="doppler-metrics-grid">
                <div className="doppler-metric-box">
                  <span className="doppler-metric-label">CORRECTED FREQ</span>
                  <span className="doppler-metric-value font-numeric" style={{ color: '#00e5ff' }}>
                    {doppler.correctedFreqMHz.toFixed(6)}
                  </span>
                  <span className="doppler-metric-unit">MHz</span>
                </div>
                <div className="doppler-metric-box">
                  <span className="doppler-metric-label">DOPPLER SHIFT</span>
                  <span className={`doppler-metric-value font-numeric ${doppler.dopplerShiftHz > 0 ? 'positive' : 'negative'}`}>
                    {doppler.dopplerShiftHz > 0 ? '+' : ''}{formatShift(doppler.dopplerShiftHz)}
                  </span>
                </div>
                <div className="doppler-metric-box">
                  <span className="doppler-metric-label">RADIAL VEL</span>
                  <span className="doppler-metric-value font-numeric">
                    {doppler.rangeRate > 0 ? '+' : ''}{doppler.rangeRate.toFixed(1)}
                  </span>
                  <span className="doppler-metric-unit">m/s</span>
                </div>
                <div className="doppler-metric-box">
                  <span className="doppler-metric-label">ELEVATION</span>
                  <span className="doppler-metric-value font-numeric" style={{ color: doppler.elevation >= 0 ? '#00c853' : '#ff3d00' }}>
                    {doppler.elevation.toFixed(1)}°
                  </span>
                </div>
              </div>

              {/* Doppler graph */}
              <div className="doppler-graph-container">
                <span className="doppler-graph-label">DOPPLER SHIFT vs TIME</span>
                <canvas ref={canvasRef} width={280} height={80} className="doppler-graph-canvas" />
              </div>
            </>
          ) : (
            <p className="doppler-no-data">
              {!sat ? 'Pilih satelit untuk melihat Doppler shift.' : 'Tentukan lokasi observer untuk menghitung Doppler.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
