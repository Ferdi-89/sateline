import { useState, useEffect, useRef } from 'react';
import { Radio, Power, RefreshCw, Cpu, Database, Settings, HelpCircle, Sliders, ChevronDown, ChevronUp } from 'lucide-react';

export default function SdrController({ satellite: sat, simTime }) {
  const [serverStatus, setServerStatus] = useState('checking'); // 'checking' | 'online' | 'offline'
  const [sdrState, setSdrState] = useState({
    connected: false,
    device_name: 'None',
    driver_status: 'Checking...',
    frequency_hz: 435880000,
    sample_rate_hz: 2048000,
    gain_db: 'auto',
    mode: 'FM',
    squelch: -50,
    is_receiving: false,
    ppm_error: 0,
    physical_usb_detected: false
  });
  
  const [sdrsharpActive, setSdrsharpActive] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tuningFreq, setTuningFreq] = useState(435.880); // in MHz
  
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const waterfallHistoryRef = useRef([]); // holds historical FFT arrays
  const statusIntervalRef = useRef(null);
  const waterfallIntervalRef = useRef(null);
  
  const API_BASE = 'http://localhost:8055';

  // Format frequency to MHz string
  const formatFreq = (hz) => {
    return (hz / 1000000).toFixed(6) + ' MHz';
  };

  // Determine presets based on satellite name or category
  const presets = (() => {
    const list = [];
    if (!sat) return list;
    
    const name = sat.name.toUpperCase();
    if (name.includes('LAPAN-A2') || name.includes('IO-86') || name.includes('40931')) {
      list.push({ label: 'Downlink FM Voice', freq: 435.880, mode: 'FM', desc: 'Repeter Suara / Voice Repeater' });
      list.push({ label: 'APRS Telemetry', freq: 145.825, mode: 'FM', desc: 'Disaster APRS Packet' });
      list.push({ label: 'Uplink FM Voice', freq: 145.880, mode: 'FM', desc: 'Voice Repeater Uplink (PL 88.5)' });
    } else if (sat.category === 'weather') {
      if (name.includes('NOAA 15')) {
        list.push({ label: 'APT Downlink', freq: 137.620, mode: 'FM', desc: 'Weather Image Transmit' });
      } else if (name.includes('NOAA 18')) {
        list.push({ label: 'APT Downlink', freq: 137.9125, mode: 'FM', desc: 'Weather Image Transmit' });
      } else if (name.includes('NOAA 19')) {
        list.push({ label: 'APT Downlink', freq: 137.100, mode: 'FM', desc: 'Weather Image Transmit' });
      } else {
        list.push({ label: 'NOAA APT Band', freq: 137.500, mode: 'FM', desc: 'APT Satellite Preset' });
      }
    } else if (sat.category === 'gps') {
      list.push({ label: 'L1 Band Carrier', freq: 1575.420, mode: 'AM', desc: 'GPS Primary Signal' });
      list.push({ label: 'L2 Band Carrier', freq: 1227.600, mode: 'AM', desc: 'GPS Secondary Signal' });
    } else if (name.includes('ISS') || name.includes('STATIONS')) {
      list.push({ label: 'ISS FM Downlink', freq: 437.800, mode: 'FM', desc: 'Crossband Repeater' });
      list.push({ label: 'ISS Packet Radio', freq: 145.825, mode: 'FM', desc: 'APRS Simplex Packet' });
    } else {
      // Default general presets
      list.push({ label: 'Amateur CubeSat', freq: 437.500, mode: 'FM', desc: 'Common Downlink Beacon' });
      list.push({ label: 'Weather Satellite', freq: 137.100, mode: 'FM', desc: 'NOAA APT Downlink' });
    }
    return list;
  })();

  // Synchronize internal MHz state when backend frequency changes
  useEffect(() => {
    setTuningFreq(sdrState.frequency_hz / 1000000);
  }, [sdrState.frequency_hz]);

  // Main status polling loop
  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      if (res.ok) {
        const data = await res.json();
        setSdrState(data);
        setServerStatus('online');
      } else {
        setServerStatus('offline');
      }
    } catch (err) {
      setServerStatus('offline');
    }

    // Check SDR# connection
    try {
      const resSdr = await fetch(`${API_BASE}/api/sdrsharp_check`);
      if (resSdr.ok) {
        const dataSdr = await resSdr.json();
        setSdrsharpActive(dataSdr.sdrsharp_active);
      }
    } catch {
      setSdrsharpActive(false);
    }
  };

  // Poll status on mount and when sat changes
  useEffect(() => {
    checkStatus();
    statusIntervalRef.current = setInterval(checkStatus, 3000);
    
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [sat]);

  // Handle tuning
  const tuneFrequency = async (freqMHz, targetMode = null) => {
    const hz = Math.round(freqMHz * 1000000);
    setTuningFreq(freqMHz);
    
    // Optimistic UI update
    setSdrState(prev => ({
      ...prev,
      frequency_hz: hz,
      ...(targetMode ? { mode: targetMode } : {})
    }));

    if (serverStatus === 'online') {
      try {
        const payload = { frequency: hz };
        if (targetMode) payload.mode = targetMode;
        
        await fetch(`${API_BASE}/api/tune`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error('Failed to send tune command to Python server:', err);
      }
    }
  };

  // Automatically tune to satellite default frequency on selection if server is online
  useEffect(() => {
    if (presets.length > 0) {
      tuneFrequency(presets[0].freq, presets[0].mode);
    }
  }, [sat]);

  // Toggle receiver state (Start/Stop)
  const toggleReceiver = async () => {
    const nextState = !sdrState.is_receiving;
    setSdrState(prev => ({ ...prev, is_receiving: nextState }));
    
    if (serverStatus === 'online') {
      try {
        await fetch(`${API_BASE}/api/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: nextState ? 'start' : 'stop' })
        });
      } catch (err) {
        console.error('Failed to toggle receiver:', err);
      }
    }
  };

  // Modify local state settings (Gain, Mode, Squelch) and send to backend
  const updateSetting = async (key, val) => {
    setSdrState(prev => ({ ...prev, [key]: val }));
    if (serverStatus === 'online') {
      try {
        await fetch(`${API_BASE}/api/tune`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: val })
        });
      } catch (err) {
        console.error('Failed to update setting:', err);
      }
    }
  };

  // Waterfall and Spectrum rendering engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    
    const SPECTRUM_HEIGHT = 45;
    const WATERFALL_HEIGHT = H - SPECTRUM_HEIGHT;
    
    // Initialize waterfall background
    ctx.fillStyle = '#030810';
    ctx.fillRect(0, 0, W, H);
    
    let localFFT = [];
    const numBins = 128;

    // Fetch waterfall FFT data
    const fetchWaterfall = async () => {
      if (serverStatus === 'online' && sdrState.is_receiving) {
        try {
          const res = await fetch(`${API_BASE}/api/waterfall?bins=${numBins}`);
          if (res.ok) {
            const data = await res.json();
            localFFT = data.fft;
            return;
          }
        } catch (e) {
          // Fallback to simulation
        }
      }

      // Simulation mode fallback (if receiving is active but server is offline/simulated)
      if (sdrState.is_receiving) {
        // Generate simulated FFT noise floor + peaks
        const simFFT = [];
        const t = Date.now() / 1000;
        const targetFreq = 435.880;
        const currentFreq = tuningFreq;
        const bandwidth = 2.0; // MHz
        const freqDiff = Math.abs(currentFreq - targetFreq);
        
        // Base noise floor
        for (let i = 0; i < numBins; i++) {
          simFFT.push(-80 + Math.random() * 4 - 2);
        }
        
        // Add satellite carrier signal if tuned near LAPAN-A2 (or ISS/Weather presets)
        const isNearCarrier = freqDiff < (bandwidth / 2);
        if (isNearCarrier) {
          const doppler = 0.005 * Math.sin(t / 15); // simulated doppler shift
          const signalOffset = (targetFreq + doppler) - currentFreq;
          const binPos = Math.round(((signalOffset / bandwidth) + 0.5) * numBins);
          
          if (binPos >= 0 && binPos < numBins) {
            // Strong peak
            const peakVal = -35 + Math.sin(t * 3) * 6;
            for (let i = 0; i < numBins; i++) {
              const dist = Math.abs(i - binPos);
              if (dist === 0) {
                simFFT[i] = Math.max(simFFT[i], peakVal);
              } else if (dist <= 3) {
                simFFT[i] = Math.max(simFFT[i], peakVal - (dist * 12) + Math.sin(t * 10) * 3);
              }
            }
          }
        }
        
        // Add constant interference (birdie) at 20% mark
        const birdieBin = Math.round(numBins * 0.22);
        for (let i = 0; i < numBins; i++) {
          const dist = Math.abs(i - birdieBin);
          if (dist < 2) {
            simFFT[i] = Math.max(simFFT[i], -45 - (dist * 15) + Math.random() * 2);
          }
        }
        
        localFFT = simFFT;
      } else {
        // Flat noise floor (receiver off)
        localFFT = Array(numBins).fill(-90).map(v => v + Math.random() * 2);
      }
    };

    // Main draw loop (runs via requestAnimationFrame)
    const draw = async () => {
      await fetchWaterfall();
      
      if (localFFT.length === 0) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      // 1. Draw Spectrum (Top part)
      // Clear spectrum area
      ctx.fillStyle = '#050e1a';
      ctx.fillRect(0, 0, W, SPECTRUM_HEIGHT);
      
      // Draw grid lines
      ctx.strokeStyle = 'rgba(90, 122, 154, 0.1)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, SPECTRUM_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < SPECTRUM_HEIGHT; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Plot spectrum line
      ctx.beginPath();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = sdrState.is_receiving ? '#00e5ff' : '#5a7a9a';
      
      const getX = (i) => (i / (localFFT.length - 1)) * W;
      // Map dB values (-100 to 0) to spectrum height (SPECTRUM_HEIGHT-4 to 4)
      const getY = (db) => {
        const val = Math.max(-100, Math.min(-20, db));
        const pct = (val - (-100)) / 80; // range of 80 dB
        return SPECTRUM_HEIGHT - 4 - pct * (SPECTRUM_HEIGHT - 8);
      };

      ctx.moveTo(getX(0), getY(localFFT[0]));
      for (let i = 1; i < localFFT.length; i++) {
        ctx.lineTo(getX(i), getY(localFFT[i]));
      }
      ctx.stroke();

      // Draw horizontal divider
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, SPECTRUM_HEIGHT);
      ctx.lineTo(W, SPECTRUM_HEIGHT);
      ctx.stroke();

      // 2. Shift Waterfall Down
      // Capture the current waterfall area
      const waterfallData = ctx.getImageData(0, SPECTRUM_HEIGHT + 1, W, WATERFALL_HEIGHT - 1);
      // Draw it shifted down by 1 pixel
      ctx.putImageData(waterfallData, 0, SPECTRUM_HEIGHT + 2);

      // 3. Render New Waterfall Row at the top of the waterfall area (y = SPECTRUM_HEIGHT + 1)
      const newRow = ctx.createImageData(W, 1);
      const binsPerPixel = localFFT.length / W;

      for (let x = 0; x < W; x++) {
        const binIndex = Math.floor(x * binsPerPixel);
        const db = localFFT[binIndex] || -90;
        
        // Color mapping based on dB (-90 dB is dark blue, -30 dB is bright red)
        const normalized = Math.max(0, Math.min(1, (db - (-85)) / 50)); // Range of 50dB
        
        let r = 0, g = 0, b = 0;
        if (sdrState.is_receiving) {
          if (normalized < 0.33) {
            // Blue to Cyan
            r = 3;
            g = Math.round(normalized * 3 * 229);
            b = Math.round(16 + normalized * 3 * 239);
          } else if (normalized < 0.66) {
            // Cyan to Yellow
            r = Math.round((normalized - 0.33) * 3 * 255);
            g = 229;
            b = Math.round(255 - (normalized - 0.33) * 3 * 255);
          } else {
            // Yellow to Red
            r = 255;
            g = Math.round(229 - (normalized - 0.66) * 3 * 229);
            b = 0;
          }
        } else {
          // Deep static gray/blue when off
          r = Math.round(3 + normalized * 10);
          g = Math.round(8 + normalized * 20);
          b = Math.round(16 + normalized * 30);
        }

        const pixelIndex = x * 4;
        newRow.data[pixelIndex] = r;     // R
        newRow.data[pixelIndex + 1] = g; // G
        newRow.data[pixelIndex + 2] = b; // B
        newRow.data[pixelIndex + 3] = 255; // A
      }
      ctx.putImageData(newRow, 0, SPECTRUM_HEIGHT + 1);

      animationRef.current = requestAnimationFrame(draw);
    };

    // Start drawing
    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [serverStatus, sdrState.is_receiving, tuningFreq]);

  // Adjust frequency by steps
  const adjustFreq = (deltaMHz) => {
    const next = Math.max(1.0, tuningFreq + deltaMHz);
    tuneFrequency(parseFloat(next.toFixed(6)));
  };

  return (
    <div className="sdr-controller-box">
      {/* Header & Status Indicator */}
      <div className="sdr-ctrl-header">
        <div className="sdr-header-title">
          <Radio size={13} className="sdr-pulse-icon" />
          <span>KONTROL SDR & KONFIRMASI ALAT</span>
        </div>
        
        {/* Python server status badge */}
        <div className={`sdr-status-badge ${serverStatus}`}>
          <span className="sdr-status-dot"></span>
          <span className="sdr-status-label">
            {serverStatus === 'checking' && 'MEMERIKSA API...'}
            {serverStatus === 'online' && 'SERVER: ONLINE'}
            {serverStatus === 'offline' && 'SERVER: OFFLINE'}
          </span>
        </div>
      </div>

      {/* Main Connection Diagnostics Card */}
      <div className="sdr-diagnostics-card">
        <div className="diag-grid">
          <div className="diag-item">
            <span className="diag-lbl">Koneksi Fisik USB</span>
            <span className={`diag-val font-numeric ${sdrState.physical_usb_detected ? 'ok' : 'err'}`}>
              {sdrState.physical_usb_detected ? 'Tersambung / Connected' : 'Tidak Terdeteksi'}
            </span>
          </div>
          <div className="diag-item">
            <span className="diag-lbl">Software Driver</span>
            <span className={`diag-val font-numeric ${sdrState.connected ? 'ok' : 'warn'}`}>
              {sdrState.connected ? 'Siap / Ready' : 'Belum Dikonfigurasi'}
            </span>
          </div>
          <div className="diag-item">
            <span className="diag-lbl">SDR# Sync (NetRemote)</span>
            <span className={`diag-val font-numeric ${sdrsharpActive ? 'ok' : 'idle'}`}>
              {sdrsharpActive ? 'Sinkron Aktif / Synced' : 'Ready / Menunggu'}
            </span>
          </div>
        </div>
        
        {/* Detailed status description */}
        <div className="diag-footer">
          <Cpu size={10} style={{ color: '#5a7a9a', marginRight: '4px' }} />
          <span className="diag-desc-text">
            <strong>Driver:</strong> {sdrState.driver_status}
          </span>
        </div>
      </div>

      {/* Connection Confirmation Alert Banner */}
      <div className={`sdr-alert-banner ${sdrState.connected ? 'confirmed' : sdrState.physical_usb_detected ? 'semi-confirmed' : 'unconfirmed'}`}>
        {sdrState.connected ? (
          <p className="alert-banner-text">
            🟢 <strong>RTL-SDR CONFIRMED:</strong> Perangkat {sdrState.device_name} terdeteksi dan terintegrasi dengan Python Server. Aliran spektrum RF aktif!
          </p>
        ) : sdrState.physical_usb_detected ? (
          <p className="alert-banner-text">
            ⚠️ <strong>USB TERDETEKSI:</strong> RTL-SDR terhubung secara fisik, namun driver software (pyrtlsdr/librtlsdr) tidak dapat mengaksesnya.
            <button className="banner-link-btn" onClick={() => setShowTroubleshooting(true)}>Buka Panduan Driver</button>
          </p>
        ) : (
          <p className="alert-banner-text">
            🔴 <strong>RTL-SDR NOT FOUND:</strong> Pasang alat dongle RTL-SDR ke port USB untuk melakukan pelacakan sinyal satelit secara real-time.
            <button className="banner-link-btn" onClick={() => setShowTroubleshooting(true)}>Bantuan Koneksi</button>
          </p>
        )}
      </div>

      {/* Troubleshooting and guide panel */}
      {showTroubleshooting && (
        <div className="trouble-guide-box">
          <div className="guide-header">
            <h4>PANDUAN INTEGRASI RTL-SDR & PYTHON</h4>
            <button className="guide-close-btn" onClick={() => setShowTroubleshooting(false)}>Tutup</button>
          </div>
          <div className="guide-content">
            <h5>1. Jalankan Python Server Lokal</h5>
            <p>Untuk menjembatani React Frontend dengan alat RTL-SDR, jalankan script Python yang disediakan di root proyek:</p>
            <pre className="guide-code-block">python3 sdr_server.py</pre>
            
            <h5>2. Instalasi Driver RTL-SDR</h5>
            <ul>
              <li><strong>Linux (Debian/Ubuntu):</strong><br />
                <code className="inline-code">sudo apt update && sudo apt install rtl-sdr python3-pip</code><br />
                Instal library Python: <code className="inline-code">pip install pyrtlsdr</code>
              </li>
              <li><strong>Windows:</strong><br />
                Gunakan software <strong>Zadig</strong> untuk mengganti driver default Realtek dengan driver <strong>WinUSB</strong> pada RTL2832U.
              </li>
              <li><strong>SDR# (SDR Sharp) Sync:</strong><br />
                Saat server Python berjalan, frekuensi yang Anda tune di Sateline akan secara otomatis disinkronkan ke SDR# melalui plugin NetRemote (port 8181).
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Spectral Waterfall Canvas HUD */}
      <div className="waterfall-canvas-container">
        <div className="waterfall-hud-overlay">
          <div className="hud-metric">
            <span className="hud-lbl">Tuned</span>
            <span className="hud-val font-numeric" style={{ color: '#00e5ff' }}>{formatFreq(sdrState.frequency_hz)}</span>
          </div>
          <div className="hud-metric">
            <span className="hud-lbl">Bandwidth</span>
            <span className="hud-val font-numeric">2.048 MHz</span>
          </div>
          <div className="hud-metric">
            <span className="hud-lbl">Mode</span>
            <span className="hud-val font-numeric" style={{ color: '#ffea00' }}>{sdrState.mode}</span>
          </div>
        </div>
        <canvas ref={canvasRef} width={255} height={120} className="sdr-waterfall-canvas" />
      </div>

      {/* Receiver Controls Section */}
      <div className="sdr-receiver-controls">
        <div className="controls-row">
          {/* Power Toggle Button */}
          <button 
            className={`sdr-power-btn ${sdrState.is_receiving ? 'active' : 'inactive'}`} 
            onClick={toggleReceiver}
            title={sdrState.is_receiving ? "Matikan Aliran RF / Stop Receiver" : "Nyalakan Aliran RF / Start Receiver"}
          >
            <Power size={14} />
            <span>{sdrState.is_receiving ? 'STOP RX' : 'START RX'}</span>
          </button>

          {/* Quick Tune Step Buttons */}
          <div className="freq-nudge-group">
            <button className="nudge-btn" onClick={() => adjustFreq(-1.0)} title="-1.0 MHz">-1M</button>
            <button className="nudge-btn" onClick={() => adjustFreq(-0.1)} title="-100 kHz">-100k</button>
            <button className="nudge-btn" onClick={() => adjustFreq(0.1)} title="+100 kHz">+100k</button>
            <button className="nudge-btn" onClick={() => adjustFreq(1.0)} title="+1.0 MHz">+1M</button>
          </div>
          
          {/* Settings Toggle */}
          <button 
            className={`sdr-settings-toggle-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title="SDR Settings"
          >
            <Settings size={14} />
          </button>
        </div>

        {/* Detailed Settings Sub-panel */}
        {showSettings && (
          <div className="sdr-settings-panel">
            <div className="setting-control-row">
              <span className="setting-label">Mode Demodulasi</span>
              <div className="setting-btn-grid">
                {['FM', 'AM', 'USB', 'LSB'].map(m => (
                  <button 
                    key={m} 
                    className={`setting-btn ${sdrState.mode === m ? 'active' : ''}`}
                    onClick={() => updateSetting('mode', m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-control-row">
              <span className="setting-label">SDR Gain</span>
              <div className="setting-btn-grid select">
                {['auto', '20.7', '32.8', '49.6'].map(g => (
                  <button 
                    key={g} 
                    className={`setting-btn ${sdrState.gain_db === g ? 'active' : ''}`}
                    onClick={() => updateSetting('gain_db', g)}
                  >
                    {g === 'auto' ? 'AGC' : g + 'dB'}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-control-row">
              <span className="setting-label">Squelch Threshold</span>
              <div className="slider-container">
                <input 
                  type="range" 
                  min="-100" 
                  max="0" 
                  value={sdrState.squelch} 
                  onChange={(e) => updateSetting('squelch', parseInt(e.target.value))}
                  className="setting-slider"
                />
                <span className="slider-val font-numeric">{sdrState.squelch} dB</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preset Frequencies Section */}
      <div className="sdr-presets-section">
        <span className="presets-section-title">PRESET FREKUENSI TERBANDING</span>
        {presets.length > 0 ? (
          <div className="presets-grid">
            {presets.map((preset, idx) => {
              const isActive = Math.abs(tuningFreq - preset.freq) < 0.0001;
              return (
                <button
                  key={idx}
                  className={`preset-pill-btn ${isActive ? 'active' : ''}`}
                  onClick={() => tuneFrequency(preset.freq, preset.mode)}
                >
                  <div className="preset-pill-top">
                    <span className="preset-pill-name">{preset.label}</span>
                    <span className="preset-pill-freq font-numeric">{preset.freq.toFixed(3)} MHz</span>
                  </div>
                  <span className="preset-pill-desc">{preset.desc}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="presets-empty-text">Pilih satelit di peta untuk memuat preset frekuensi radio.</p>
        )}
      </div>
    </div>
  );
}
