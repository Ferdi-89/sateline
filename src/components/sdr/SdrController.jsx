import { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, Maximize2, Minimize2 } from 'lucide-react';
import useSdrSettings from '../../hooks/useSdrSettings';
import useSdrAudio from '../../hooks/useSdrAudio';
import SdrDiagnostics from './SdrDiagnostics';
import SdrSMeter from './SdrSMeter';
import SdrWaterfall from './SdrWaterfall';
import SdrControls from './SdrControls';
import SdrSettings from './SdrSettings';
import SdrPresets, { getSatellitePresets } from './SdrPresets';
import SdrDecoderHud from './SdrDecoderHud';

const API_BASE = 'http://localhost:8055';

export default function SdrController({ satellite: sat, simTime, isFullscreen, setIsFullscreen }) {
  // ── Hooks ─────────────────────────────────────────────────
  const {
    serverStatus, setServerStatus,
    sdrState, setSdrState,
    sdrsharpActive, setSdrsharpActive,
    showTroubleshooting, setShowTroubleshooting,
    showSettings, setShowSettings,
    updateSetting,
  } = useSdrSettings();

  const [tuningFreq, setTuningFreq] = useState(sdrState.tuningFreqMHz || sdrState.frequency_hz / 1e6);
  const [decoderTab, setDecoderTab] = useState('standard');

  useSdrAudio({
    isReceiving: sdrState.is_receiving,
    mode: sdrState.mode,
    frequencyHz: sdrState.frequency_hz,
    volume: sdrState.volume,
    isMuted: sdrState.isMuted,
    decodingInfo: sdrState.decoding_info,
  });

  // ── Derived ────────────────────────────────────────────────
  const presets = getSatellitePresets(sat);
  const rssi = sdrState.decoding_info?.signal_strength_dbm ?? -110;

  // ── Sync MHz state ← backend ──────────────────────────────
  useEffect(() => {
    setTuningFreq(sdrState.frequency_hz / 1e6);
  }, [sdrState.frequency_hz]);

  // ── Backend polling ────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      if (res.ok) {
        const data = await res.json();
        setSdrState(prev => ({ ...prev, ...data }));
        setServerStatus('online');
      } else {
        setServerStatus('offline');
      }
    } catch {
      setServerStatus('offline');
    }
    try {
      const res = await fetch(`${API_BASE}/api/sdrsharp_check`);
      if (res.ok) {
        const d = await res.json();
        setSdrsharpActive(d.sdrsharp_active);
      }
    } catch {
      setSdrsharpActive(false);
    }
  }, [setSdrState, setServerStatus, setSdrsharpActive]);

  useEffect(() => {
    checkStatus();
    const id = setInterval(checkStatus, 3000);
    return () => clearInterval(id);
  }, [sat, checkStatus]);

  // ── Tune frequency ─────────────────────────────────────────
  const tuneFrequency = useCallback((freqMHz, targetMode) => {
    const hz = Math.round(freqMHz * 1e6);
    setTuningFreq(freqMHz);
    setSdrState(prev => ({
      ...prev,
      frequency_hz: hz,
      ...(targetMode ? { mode: targetMode } : {}),
    }));
    if (serverStatus === 'online') {
      fetch(`${API_BASE}/api/tune`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency: hz, ...(targetMode ? { mode: targetMode } : {}) }),
      }).catch(() => {});
    }
  }, [serverStatus, setSdrState]);

  // Auto-tune to first preset when sat changes
  useEffect(() => {
    if (presets.length > 0) tuneFrequency(presets[0].freq, presets[0].mode);
  }, [sat?.name]);

  // ── Actions ────────────────────────────────────────────────
  const toggleReceiver = useCallback(async () => {
    const next = !sdrState.is_receiving;
    setSdrState(prev => ({ ...prev, is_receiving: next }));
    if (serverStatus === 'online') {
      fetch(`${API_BASE}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: next ? 'start' : 'stop' }),
      }).catch(() => {});
    }
  }, [sdrState.is_receiving, serverStatus, setSdrState]);

  const adjustFreq = useCallback((deltaMHz) => {
    const next = Math.max(1, tuningFreq + deltaMHz);
    tuneFrequency(parseFloat(next.toFixed(6)));
  }, [tuningFreq, tuneFrequency]);

  // ── Troubleshooting guide ──────────────────────────────────
  const renderTroubleshooting = () => (
    showTroubleshooting && (
      <div className="trouble-guide-box">
        <div className="guide-header">
          <h4>RTL-SDR / AIRSPY SETUP GUIDE</h4>
          <button className="guide-close-btn" onClick={() => setShowTroubleshooting(false)}>Close</button>
        </div>
        <div className="guide-content">
          <h5>1. Start Python Backend</h5>
          <p>Run from project root:</p>
          <pre className="guide-code-block">python sdr_server.py</pre>
          <h5>2. Install WinUSB Driver</h5>
          <p>Use <strong>Zadig</strong> to install WinUSB for your RTL-SDR / Airspy device.</p>
          <h5>3. Check API</h5>
          <p>Verify the server is running at <span className="inline-code">{API_BASE}/api/status</span></p>
        </div>
      </div>
    )
  );

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className={`sdr-controller-box ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Header */}
      <div className="sdr-ctrl-header">
        <div className="sdr-header-title">
          <span className="sdr-pulse-icon" style={{ color: '#00e5ff', animation: 'pulse 2s infinite' }}>◉</span>
          <span>SDR CONSOLE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ServerBadge status={serverStatus} />
          {setIsFullscreen && (
            <button className="sdr-fullscreen-btn" onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
        </div>
      </div>

      {isFullscreen ? (
        <div className="sdr-fullscreen-layout">
          <div className="sdr-fs-controls-col">
            <SdrDiagnostics sdrState={sdrState} sdrsharpActive={sdrsharpActive} />
            <AlertBanner sdrState={sdrState} onOpenGuide={() => setShowTroubleshooting(true)} />
            {renderTroubleshooting()}
            <SdrControls
              isReceiving={sdrState.is_receiving}
              onToggle={toggleReceiver}
              recordingActive={sdrState.recording_active}
              onToggleRecording={() => updateSetting('recording_active', !sdrState.recording_active)}
              scannerActive={sdrState.scanner_active}
              onToggleScanner={() => updateSetting('scanner_active', !sdrState.scanner_active)}
              volume={sdrState.volume}
              onVolumeChange={(v) => {
                setSdrState(prev => ({ ...prev, volume: v }));
                if (sdrState.isMuted) setSdrState(prev => ({ ...prev, isMuted: false }));
              }}
              isMuted={sdrState.isMuted}
              onMuteToggle={() => setSdrState(prev => ({ ...prev, isMuted: !prev.isMuted }))}
              onAdjustFreq={adjustFreq}
              onToggleSettings={() => setShowSettings(s => !s)}
            />
            <SdrSettings sdrState={sdrState} onUpdate={updateSetting} showSettings={showSettings} />
            <SdrPresets presets={presets} tuningFreq={tuningFreq} sdrMode={sdrState.mode} onTune={tuneFrequency} />
          </div>
          <div className="sdr-fs-visuals-col">
            <SdrWaterfall
              frequencyHz={sdrState.frequency_hz}
              sampleRateHz={sdrState.sample_rate_hz}
              bandwidthHz={sdrState.bandwidth_hz}
              mode={sdrState.mode}
              isReceiving={sdrState.is_receiving}
              serverOnline={serverStatus === 'online'}
              waterfallScheme={sdrState.waterfall_scheme}
              isFullscreen={isFullscreen}
              tuningFreqMHz={tuningFreq}
            />
            <SdrSMeter dbm={rssi} />
            <SdrDecoderHud
              decoderTab={decoderTab}
              onTabChange={setDecoderTab}
              sdrState={sdrState}
              isFullscreen={isFullscreen}
            />
          </div>
        </div>
      ) : (
        <div className="sdr-standard-layout">
          <SdrDiagnostics sdrState={sdrState} sdrsharpActive={sdrsharpActive} />
          <AlertBanner sdrState={sdrState} onOpenGuide={() => setShowTroubleshooting(true)} />
          {renderTroubleshooting()}
          <SdrWaterfall
            frequencyHz={sdrState.frequency_hz}
            sampleRateHz={sdrState.sample_rate_hz}
            bandwidthHz={sdrState.bandwidth_hz}
            mode={sdrState.mode}
            isReceiving={sdrState.is_receiving}
            serverOnline={serverStatus === 'online'}
            waterfallScheme={sdrState.waterfall_scheme}
            isFullscreen={isFullscreen}
            tuningFreqMHz={tuningFreq}
          />
          <SdrSMeter dbm={rssi} />
          <SdrDecoderHud
            decoderTab={decoderTab}
            onTabChange={setDecoderTab}
            sdrState={sdrState}
            isFullscreen={isFullscreen}
          />
          <SdrControls
            isReceiving={sdrState.is_receiving}
            onToggle={toggleReceiver}
            recordingActive={sdrState.recording_active}
            onToggleRecording={() => updateSetting('recording_active', !sdrState.recording_active)}
            scannerActive={sdrState.scanner_active}
            onToggleScanner={() => updateSetting('scanner_active', !sdrState.scanner_active)}
            volume={sdrState.volume}
            onVolumeChange={(v) => {
              setSdrState(prev => ({ ...prev, volume: v }));
              if (sdrState.isMuted) setSdrState(prev => ({ ...prev, isMuted: false }));
            }}
            isMuted={sdrState.isMuted}
            onMuteToggle={() => setSdrState(prev => ({ ...prev, isMuted: !prev.isMuted }))}
            onAdjustFreq={adjustFreq}
            onToggleSettings={() => setShowSettings(s => !s)}
          />
          <SdrSettings sdrState={sdrState} onUpdate={updateSetting} showSettings={showSettings} />
          <SdrPresets presets={presets} tuningFreq={tuningFreq} sdrMode={sdrState.mode} onTune={tuneFrequency} />
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

function ServerBadge({ status }) {
  const label =
    status === 'checking' ? 'CHECKING API...' :
    status === 'online' ? 'SERVER: ONLINE' : 'SERVER: OFFLINE';
  return (
    <div className={`sdr-status-badge ${status}`}>
      <span className="sdr-status-dot"></span>
      <span>{label}</span>
    </div>
  );
}

function AlertBanner({ sdrState, onOpenGuide }) {
  const { connected, physical_usb_detected, device_type, device_name } = sdrState;

  if (connected) {
    return (
      <div className="sdr-alert-banner confirmed">
        <p className="alert-banner-text">
          🟢 <strong>{device_type.toUpperCase()} CONFIRMED:</strong> {device_name} detected. Spectrum stream active.
        </p>
      </div>
    );
  }
  if (physical_usb_detected) {
    return (
      <div className="sdr-alert-banner semi-confirmed">
        <p className="alert-banner-text">
          ⚠️ <strong>USB DETECTED:</strong> Hardware connected but driver cannot access it.
          <button className="banner-link-btn" onClick={onOpenGuide}>Open Driver Guide</button>
        </p>
      </div>
    );
  }
  return (
    <div className="sdr-alert-banner unconfirmed">
      <p className="alert-banner-text">
        🔴 <strong>SDR NOT FOUND:</strong> Connect RTL-SDR or Airspy to USB port.
        <button className="banner-link-btn" onClick={onOpenGuide}>Connection Help</button>
      </p>
    </div>
  );
}
