import { useEffect, useRef, useCallback } from 'react';

const NUM_BINS = 256;

// Color schemes for waterfall row rendering
const SCHEMES = {
  Classic: (n) => {                              // 0..1
    if (n < 0.33) return [3, n * 3 * 229 | 0, 16 + n * 3 * 239 | 0];
    if (n < 0.66) return [(n - 0.33) * 3 * 255 | 0, 229, 255 - (n - 0.33) * 3 * 255 | 0];
    return [255, 229 - (n - 0.66) * 3 * 229 | 0, 0];
  },
  Thermal: (n) => {
    if (n < 0.33) return [n * 3 * 255 | 0, 0, 0];
    if (n < 0.66) return [255, (n - 0.33) * 3 * 165 | 0, 0];
    if (n < 0.9)  return [255, 165 + (n - 0.66) * 4.16 * 90 | 0, 0];
    return [255, 255, (n - 0.9) * 10 * 255 | 0];
  },
  'Green Phosphor': (n) => [n * 0.1 * 255 | 0, n * 255 | 0, n * 0.15 * 255 | 0],
  'Blue Ice': (n) => [n * n * 255 | 0, n * 220 | 0, 80 + n * 175 | 0],
};

function colourise(db, isReceiving, scheme) {
  if (!isReceiving) {
    const n = Math.max(0, Math.min(1, (db + 90) / 40));
    return [3 + n * 10 | 0, 8 + n * 20 | 0, 16 + n * 30 | 0];
  }
  const n = Math.max(0, Math.min(1, (db - (-85)) / 50));
  return (SCHEMES[scheme] || SCHEMES.Classic)(n);
}

export default function SdrWaterfall({
  frequencyHz,
  sampleRateHz,
  bandwidthHz,
  mode,
  isReceiving,
  serverOnline,
  waterfallScheme,
  isFullscreen,
  tuningFreqMHz,
  simFreq,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const fftRef = useRef([]);

  const W = isFullscreen ? 800 : 255;
  const SPECTRUM_H = isFullscreen ? 60 : 45;
  const WATERFALL_H = (isFullscreen ? 320 : 120) - SPECTRUM_H;

  const generateFFT = useCallback((bins) => {
    const t = Date.now() / 1000;
    const fft = [];
    for (let i = 0; i < bins; i++) {
      let v = -80 + Math.random() * 4 - 2;
      const sigIdx = Math.round((tuningFreqMHz - (simFreq ?? 435.880)) / (bandwidthHz / 1e6) * bins + bins / 2);
      if (sigIdx >= 0 && sigIdx < bins) {
        const d = Math.abs(i - sigIdx);
        if (d === 0) v = Math.max(v, -35 + Math.sin(t * 3) * 6);
        else if (d <= 3) v = Math.max(v, -35 + Math.sin(t * 3) * 6 - d * 12 + Math.sin(t * 10) * 3);
      }
      // local birdie oscillator
      const birdie = Math.round(bins * 0.22);
      if (Math.abs(i - birdie) < 2) v = Math.max(v, -45 - Math.abs(i - birdie) * 15 + Math.random() * 2);
      fft.push(v);
    }
    return fft;
  }, [tuningFreqMHz, simFreq, bandwidthHz]);

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const H = canvas.height;

    // initial clear
    ctx.fillStyle = '#030810';
    ctx.fillRect(0, 0, W, H);

    let cancelled = false;

    const draw = () => {
      if (cancelled) return;

      // fetch or simulate FFT
      let fft;
      if (isReceiving) {
        fft = generateFFT(NUM_BINS);
      } else {
        fft = Array.from({ length: NUM_BINS }, () => -90 + Math.random() * 2);
      }
      fftRef.current = fft;

      /* ---- Spectrum Analyzer ---- */
      ctx.fillStyle = '#050e1a';
      ctx.fillRect(0, 0, W, SPECTRUM_H);

      // grid
      ctx.strokeStyle = 'rgba(90, 122, 154, 0.1)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += isFullscreen ? 80 : 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SPECTRUM_H); ctx.stroke();
      }
      for (let y = 0; y < SPECTRUM_H; y += 15) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // trace
      ctx.beginPath();
      ctx.lineWidth = isFullscreen ? 1.8 : 1.2;
      ctx.strokeStyle = isReceiving ? '#00e5ff' : '#5a7a9a';
      for (let i = 0; i < fft.length; i++) {
        const x = (i / (fft.length - 1)) * W;
        const v = Math.max(-100, Math.min(-20, fft[i]));
        const pct = (v - (-100)) / 80;
        const y = SPECTRUM_H - 4 - pct * (SPECTRUM_H - 8);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      /* ---- Waterfall Shift ---- */
      const wfData = ctx.getImageData(0, SPECTRUM_H + 1, W, WATERFALL_H - 1);
      ctx.putImageData(wfData, 0, SPECTRUM_H + 2);

      /* ---- New row ---- */
      const row = ctx.createImageData(W, 1);
      const bpp = fft.length / W;
      for (let x = 0; x < W; x++) {
        const db = fft[Math.floor(x * bpp)] ?? -90;
        const [r, g, b] = colourise(db, isReceiving, waterfallScheme);
        const i = x * 4;
        row.data[i] = r; row.data[i+1] = g; row.data[i+2] = b; row.data[i+3] = 255;
      }
      ctx.putImageData(row, 0, SPECTRUM_H + 1);

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current); };
  }, [isReceiving, waterfallScheme, isFullscreen, W, SPECTRUM_H, WATERFALL_H, generateFFT]);

  const formatFreq = (hz) => (hz / 1e6).toFixed(6) + ' MHz';

  return (
    <div className="waterfall-canvas-container" style={{ position: 'relative' }}>
      {/* HUD overlay */}
      <div className="waterfall-hud-overlay">
        <div className="hud-metric">
          <span className="hud-lbl">Tuned</span>
          <span className="hud-val font-numeric" style={{ color: '#00e5ff' }}>{formatFreq(frequencyHz)}</span>
        </div>
        <div className="hud-metric">
          <span className="hud-lbl">Sample Rate</span>
          <span className="hud-val font-numeric">{(sampleRateHz / 1e6).toFixed(3)} MSPS</span>
        </div>
        <div className="hud-metric">
          <span className="hud-lbl">Filter BW</span>
          <span className="hud-val font-numeric" style={{ color: '#ff6d00' }}>{(bandwidthHz / 1e3).toFixed(1)} kHz</span>
        </div>
        <div className="hud-metric">
          <span className="hud-lbl">Mode</span>
          <span className="hud-val font-numeric" style={{ color: '#ffea00' }}>{mode}</span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={SPECTRUM_H + WATERFALL_H}
        className={`sdr-waterfall-canvas ${isFullscreen ? 'fullscreen' : ''}`}
        style={{ display: 'block' }}
      />
    </div>
  );
}
