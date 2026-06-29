import { useEffect, useRef, useCallback } from 'react';

export default function SdrDecoderHud({
  decoderTab, onTabChange,
  sdrState,
  isFullscreen,
  simFreq,
}) {
  const { is_receiving, decoding_info, mode, frequency_hz, satdump_pipeline, satdumpChannel, satdumpProjection } = sdrState;

  if (!is_receiving || !decoding_info) return null;

  if (decoderTab === 'satdump') {
    return <SatDumpView sdrState={sdrState} isFullscreen={isFullscreen} onTabChange={onTabChange} />;
  }

  return <StandardView sdrState={sdrState} isFullscreen={isFullscreen} onTabChange={onTabChange} />;
}

/* ── Standard Decoder Tab ──────────────────────────────────── */
function StandardView({ sdrState, isFullscreen, onTabChange }) {
  const { mode, decoding_info, is_receiving } = sdrState;
  const videoCanvasRef = useRef(null);
  const rafRef = useRef(null);

  // Audio wave visualiser + NOAA APT/image decoder
  useEffect(() => {
    if (!is_receiving || !decoding_info) return;
    const canvas = videoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let stop = false;

    const draw = () => {
      if (stop) return;
      ctx.fillStyle = '#020710';
      ctx.fillRect(0, 0, W, H);

      const t = Date.now() / 1000;
      const mhz = sdrState.frequency_hz / 1e6;
      const isNoaa = mode === 'FM' && [137.100, 137.620, 137.9125].some(f => Math.abs(mhz - f) < 0.01);

      if (isNoaa) {
        drawNoaaApt(ctx, W, H, t, decoding_info, isFullscreen);
      } else if (mode === 'FM') {
        drawFmWave(ctx, W, H, t, isFullscreen);
      } else if (mode === 'DAB') {
        drawDabSlideshow(ctx, W, H, t, decoding_info, isFullscreen);
      } else if (mode === 'DVB-T') {
        drawDvbT(ctx, W, H, t, isFullscreen);
      } else {
        drawGenericScope(ctx, W, H, isFullscreen);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { stop = true; cancelAnimationFrame(rafRef.current); };
  }, [is_receiving, decoding_info, mode, sdrState.frequency_hz, isFullscreen]);

  const info = decoding_info;

  return (
    <div className="sdr-decoder-hud">
      <div className="decoder-hud-title">
        <div className="sdr-tab-group">
          <button className="decoder-tab-btn active" onClick={() => onTabChange('standard')}>STANDARD</button>
          <button className="decoder-tab-btn" onClick={() => onTabChange('satdump')}>SATDUMP</button>
        </div>
        <span className="decoder-hud-badge">{mode} DECODER</span>
      </div>

      <div className="decoder-hud-body">
        <div className="decoder-hud-details">
          <MetricRow label="Signal Strength" val={`${info.signal_strength_dbm} dBm`}
            color={info.signal_strength_dbm > -50 ? '#00c853' : '#ffea00'} />
          <MetricRow label="Signal SNR" val={`${info.snr_db} dB`} color="#00c853" />

          {mode === 'FM' && (
            info.satellite ? (
              <>
                <MetricRow label="Satellite" val={info.satellite} color="#00c853" />
                <MetricRow label="Subcarrier 2.4k" val={info.subcarrier_locked ? 'LOCKED' : 'UNLOCKED'}
                  color={info.subcarrier_locked ? '#00c853' : '#ffea00'} />
                <MetricRow label="Sync Status" val={info.sync_status} color={info.subcarrier_locked ? '#00c853' : '#ffea00'} />
                <MetricRow label="Scan Rate" val={`${info.scan_rate_lpm} LPM`} />
              </>
            ) : (
              <>
                <MetricRow label="Stereo Pilot" val="LOCKED" color="#00c853" />
                <MetricRow label="Audio Peak" val={`${info.audio_freq_hz} Hz`} />
              </>
            )
          )}

          {mode === 'DAB' && (
            <>
              <MetricRow label="Ensemble" val={info.ensemble} />
              <MetricRow label="Bit Error Rate" val={info.ber} color="#ffea00" />
              <MetricRow label="Audio Codec" val={`${info.codec} (${info.bitrate_kbps}k)`} />
            </>
          )}

          {mode === 'DVB-T' && (
            <>
              <MetricRow label="Carrier Status" val="LOCKED (64-QAM)" color="#00c853" />
              <MetricRow label="Resolution" val={info.resolution} />
              <MetricRow label="Bit Error Rate" val={info.ber} color="#00c853" />
            </>
          )}
        </div>

        <div className="decoder-hud-visuals">
          {['DAB', 'DVB-T'].includes(mode) && <ScopeCanvas size={isFullscreen ? 150 : 65} label="IQ DIAGRAM" />}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <canvas ref={videoCanvasRef} width={isFullscreen ? 260 : 110} height={isFullscreen ? 150 : 65} className={`sdr-video-canvas ${isFullscreen ? 'fullscreen' : ''}`} />
            <span style={{ fontSize: '0.45rem', color: '#5a7a9a', fontWeight: 'bold' }}>{mode === 'DAB' ? 'SLIDE SHOW' : 'AUDIO WAVE'}</span>
          </div>
        </div>
      </div>

      {/* RDS / Info marquee */}
      {mode === 'FM' && info.rds && (
        <div className="rds-marquee-container">
          <div className="rds-station-name">{info.rds.station}</div>
          <div className="rds-text-scroll">{info.rds.text}</div>
        </div>
      )}
      {mode === 'DAB' && (
        <div className="rds-marquee-container">
          <div className="rds-station-name" style={{ color: '#00ff88', borderColor: 'rgba(0,255,136,0.3)' }}>SERVICE</div>
          <div style={{ color: '#e0e6ed', fontSize: '0.55rem', fontWeight: 'bold' }}>{info.service}</div>
        </div>
      )}
    </div>
  );
}

/* ── SatDump Tab ───────────────────────────────────────────── */
function SatDumpView({ sdrState, isFullscreen, onTabChange }) {
  const pipeline = sdrState.satdump_pipeline || {};
  const isNoaa = pipeline.pipeline_name?.includes('NOAA');
  const isMeteor = pipeline.pipeline_name?.includes('Meteor');

  return (
    <div className="sdr-decoder-hud">
      <div className="decoder-hud-title">
        <div className="sdr-tab-group">
          <button className="decoder-tab-btn" onClick={() => onTabChange('standard')}>STANDARD</button>
          <button className="decoder-tab-btn active" onClick={() => onTabChange('satdump')}>SATDUMP</button>
        </div>
        <span className="decoder-hud-badge">SATDUMP LIVE</span>
      </div>

      <div className="decoder-hud-body satdump-enhanced-body">
        <div className="decoder-hud-details">
          <MetricRow label="Pipeline Name" val={pipeline.pipeline_name || '—'} color="#00c853" />
          <MetricRow label="Demodulator" val={pipeline.demodulator || '—'} />
          <MetricRow label="Viterbi BER" val={pipeline.viterbi_ber?.toExponential(4) || '—'}
            color={pipeline.viterbi_ber < 0.01 ? '#00c853' : '#ffea00'} />
          <MetricRow label="Sync Tracking" val={pipeline.sync_locked ? 'SYNC LOCKED' : 'SEARCHING SYNC'}
            color={pipeline.sync_locked ? '#00c853' : '#ff3d00'} />

          {/* Channel selector */}
          {(isNoaa || isMeteor) && (
            <div className="satdump-ch-selector-row">
              <span className="decoder-metric-lbl">Active Channel</span>
              <div className="satdump-ch-buttons">
                {isNoaa && ['ChA', 'ChB'].map(ch => (
                  <button key={ch} className={`satdump-ch-btn ${sdrState.satdumpChannel === ch ? 'active' : ''}`}
                    onClick={() => {}}>
                    {ch === 'ChA' ? 'Channel A (Vis/IR)' : 'Channel B (IR)'}
                  </button>
                ))}
                {isMeteor && ['RGB', 'IR'].map(ch => (
                  <button key={ch} className={`satdump-ch-btn ${sdrState.satdumpChannel === ch ? 'active' : ''}`}
                    onClick={() => {}}>
                    {ch === 'RGB' ? 'RGB False Color' : 'Thermal IR'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sync quality blocks */}
          {pipeline.sync_locked && (
            <div style={{ marginTop: 6 }}>
              <span className="decoder-metric-lbl">Frame Quality Sync</span>
              <div className="satdump-sync-blocks" style={{ marginTop: 2 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className={`satdump-sync-block ${i < 6 ? 'active' : 'inactive'}`} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="decoder-hud-visuals satdump-enhanced-visuals">
          <div className="satdump-enhancements-sliders">
            <SliderItem label="BRIGHTNESS" val={sdrState.imageBrightness} />
            <SliderItem label="CONTRAST" val={sdrState.imageContrast} />
            <SliderItem label="GAMMA" val={`${(sdrState.imageGamma / 100).toFixed(1)}`} />
          </div>
          <div className="satdump-canvases-row">
            <ScopeCanvas size={isFullscreen ? 150 : 65} label="CONSTELLATION IQ" />
            <div>
              <div className="satdump-image-viewer-wrapper" style={{ filter: `brightness(${sdrState.imageBrightness}%) contrast(${sdrState.imageContrast}%) saturate(${sdrState.imageGamma}%)` }}>
                <canvas width={isFullscreen ? 260 : 110} height={isFullscreen ? 150 : 65} className={`sdr-video-canvas ${isFullscreen ? 'fullscreen' : ''}`} />
              </div>
              <span style={{ fontSize: '0.45rem', color: '#5a7a9a', fontWeight: 'bold' }}>IMAGE/DATA PIPELINE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Drawing helpers ───────────────────────────────────────── */
function drawNoaaApt(ctx, W, H, t, info, fs) {
  const sweepY = H * ((t % 18) / 18);
  ctx.fillStyle = '#020710';
  ctx.fillRect(0, 0, W, H);
  // Simulated earth curvature with cloud bands
  ctx.fillStyle = 'rgba(0,40,80,0.3)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.7, W * 0.4, H * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,200,200,0.15)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(W * (0.2 + i * 0.15), H * 0.5 + Math.sin(i) * 10, 20, 8, i * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Scan line
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = fs ? 2 : 1;
  ctx.beginPath();
  ctx.moveTo(0, sweepY);
  ctx.lineTo(W, sweepY);
  ctx.stroke();
  ctx.fillStyle = '#00ff88';
  ctx.font = fs ? '10px Courier New' : '6px Courier New';
  const msg = info?.subcarrier_locked ? 'APT LOCK OK' : 'APT SYNC SEARCHING';
  ctx.fillText(msg, 6, fs ? 14 : 10);
}

function drawFmWave(ctx, W, H, t, fs) {
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = fs ? 2.5 : 1.5;
  ctx.beginPath();
  const amp = (14 + 2 * Math.sin(t * 0.5)) * (H / 65);
  ctx.moveTo(0, H / 2);
  for (let x = 0; x < W; x++) {
    const angle = x * (fs ? 0.04 : 0.08) + t * 4.5 + 3.5 * Math.sin(x * 0.02 + t * 1.5);
    const y = H / 2 + amp * Math.sin(angle);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,229,255,0.9)';
  ctx.font = fs ? '9px monospace' : '7px monospace';
  ctx.fillText('FM AUDIO ANALYZER', 6, fs ? 14 : 10);
}

function drawDabSlideshow(ctx, W, H, t, info, fs) {
  ctx.strokeStyle = 'rgba(0,229,255,0.3)';
  ctx.strokeRect(3, 3, W - 6, H - 6);
  // Simulated DAB slideshow — orbit graphic
  const s = W / 110;
  ctx.strokeStyle = '#00e5ff';
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, 35 * s, 12 * s, Math.PI / 6, 0, Math.PI * 2);
  ctx.stroke();
  const satX = W / 2 + 35 * s * Math.cos(t * 0.7) * Math.cos(Math.PI / 6) - 12 * s * Math.sin(t * 0.7) * Math.sin(Math.PI / 6);
  const satY = H / 2 + 35 * s * Math.cos(t * 0.7) * Math.sin(Math.PI / 6) + 12 * s * Math.sin(t * 0.7) * Math.cos(Math.PI / 6);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(satX, satY, 2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8fa0b5';
  ctx.font = fs ? '9px sans-serif' : '6px sans-serif';
  ctx.fillText('SLIDE: ORBIT VIEW', 8, fs ? 16 : 12);
}

function drawDvbT(ctx, W, H, t, fs) {
  const s = W / 110;
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = fs ? 2 : 1;
  ctx.beginPath();
  ctx.arc(W / 2, H + 35 * s, 75 * s, Math.PI, 0);
  ctx.stroke();
  const satX = W / 2 + 65 * s * Math.cos(t * 0.4);
  const satY = H + 35 * s + 65 * s * Math.sin(t * 0.4);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(satX, satY, fs ? 4 : 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#00ff88';
  ctx.font = fs ? '9px monospace' : '6px monospace';
  ctx.fillText('REC ●', 6, fs ? 15 : 11);
}

function drawGenericScope(ctx, W, H, fs) {
  ctx.strokeStyle = 'rgba(90,122,154,0.08)';
  ctx.strokeRect(3, 3, W - 6, H - 6);
  ctx.strokeStyle = '#8fa0b5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  for (let x = 0; x < W; x++) ctx.lineTo(x, H / 2 + (Math.random() - 0.5) * (fs ? 40 : 16));
  ctx.stroke();
  ctx.fillStyle = '#8fa0b5';
  ctx.font = fs ? '9px monospace' : '7px monospace';
  ctx.fillText('SSB/AM DETECTOR', 6, fs ? 15 : 10);
}

function ScopeCanvas({ size, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <canvas width={size} height={size} className="sdr-constellation-canvas" />
      <span style={{ fontSize: '0.45rem', color: '#5a7a9a', fontWeight: 'bold' }}>{label}</span>
    </div>
  );
}

function MetricRow({ label, val, color }) {
  return (
    <div className="decoder-metric-row">
      <span className="decoder-metric-lbl">{label}</span>
      <span className="decoder-metric-val font-numeric" style={color ? { color } : undefined}>{val}</span>
    </div>
  );
}

function SliderItem({ label, val }) {
  return (
    <div className="satdump-slider-item">
      <span>{label}: {val}</span>
      <input type="range" min="50" max="150" value={parseInt(val)} readOnly />
    </div>
  );
}
