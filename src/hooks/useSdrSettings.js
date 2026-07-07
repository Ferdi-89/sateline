import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'sateline_sdr_settings';

const DEFAULTS = {
  connected: false,
  device_type: 'rtl-sdr',
  device_name: 'None',
  driver_status: 'Idle',
  frequency_hz: 435880000,
  sample_rate_hz: 2048000,
  gain_db: 'auto',
  mode: 'FM',
  squelch: -50,
  is_receiving: false,
  ppm_error: 0,
  physical_usb_detected: false,
  airspy_gain_lna: 8,
  airspy_gain_mix: 8,
  airspy_gain_vga: 8,
  airspy_bias_tee: false,
  satdump_pipeline: null,
  bandwidth_hz: 250000,
  agc_mode: 'auto',
  agc_gain: 32,
  recording_active: false,
  recording_seconds: 0,
  recording_size_bytes: 0,
  scanner_active: false,
  waterfall_scheme: 'Classic',
  tuningFreqMHz: 435.880,
  volume: 60,
  isMuted: false,
  decoderTab: 'standard',
  satdumpChannel: 'ChA',
  satdumpProjection: 'Raw',
  imageBrightness: 100,
  imageContrast: 100,
  imageGamma: 100,
};

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default function useSdrSettings() {
  const persisted = useRef(loadPersisted());

  const [serverStatus, setServerStatus] = useState('checking');
  const [sdrState, setSdrState] = useState(() => ({ ...DEFAULTS, ...persisted.current }));
  const [sdrsharpActive, setSdrsharpActive] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Persist all mutable settings except runtime-only fields
  useEffect(() => {
    const { recording_seconds, recording_size_bytes, is_receiving, connected, ...rest } = sdrState;
    const toPersist = {
      ...rest,
      tuningFreqMHz: sdrState.tuningFreqMHz || sdrState.frequency_hz / 1e6,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
  }, [sdrState]);

  const updateSetting = useCallback((key, val) => {
    setSdrState(prev => ({ ...prev, [key]: val }));
  }, []);

  const syncFromBackend = useCallback((data) => {
    setSdrState(prev => ({ ...prev, ...data }));
    setServerStatus('online');
  }, []);

  return {
    // State
    serverStatus, setServerStatus,
    sdrState, setSdrState,
    sdrsharpActive, setSdrsharpActive,
    showTroubleshooting, setShowTroubleshooting,
    showSettings, setShowSettings,
    // Actions
    updateSetting, syncFromBackend, loadPersisted,
  };
}
