import { useState, useEffect, useRef } from 'react';
import { 
  Radio, Power, RefreshCw, Cpu, Database, Settings, HelpCircle, 
  Sliders, ChevronDown, ChevronUp, Maximize2, Minimize2, Volume2, VolumeX 
} from 'lucide-react';

export default function SdrController({ satellite: sat, simTime, isFullscreen, setIsFullscreen }) {
  const [serverStatus, setServerStatus] = useState('checking'); // 'checking' | 'online' | 'offline'
  const [sdrState, setSdrState] = useState({
    connected: false,
    device_type: 'rtl-sdr', // 'rtl-sdr' | 'airspy'
    device_name: 'None',
    driver_status: 'Checking...',
    frequency_hz: 435880000,
    sample_rate_hz: 2048000,
    gain_db: 'auto',
    mode: 'FM',
    squelch: -50,
    is_receiving: false,
    ppm_error: 0,
    physical_usb_detected: false,
    
    // Airspy
    airspy_gain_lna: 8,
    airspy_gain_mix: 8,
    airspy_gain_vga: 8,
    airspy_bias_tee: false,

    // SatDump
    satdump_pipeline: null,

    // SDR# / SatDump Enhancements
    bandwidth_hz: 250000,
    agc_mode: 'auto',
    agc_gain: 32,
    recording_active: false,
    recording_seconds: 0,
    recording_size_bytes: 0,
    scanner_active: false,
    waterfall_scheme: 'Classic'
  });
  
  const [sdrsharpActive, setSdrsharpActive] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tuningFreq, setTuningFreq] = useState(435.880); // in MHz
  
  // SatDump image compositor and enhancements
  const [satdumpChannel, setSatdumpChannel] = useState('ChA'); // 'ChA' | 'ChB' | 'RGB' | 'IR'
  const [satdumpProjection, setSatdumpProjection] = useState('Raw'); // 'Raw' | 'Equirectangular' | 'Mercator'
  const [imageBrightness, setImageBrightness] = useState(100);
  const [imageContrast, setImageContrast] = useState(100);
  const [imageGamma, setImageGamma] = useState(100);
  
  // Audio state
  const [volume, setVolume] = useState(60);
  const [isMuted, setIsMuted] = useState(false);

  // Tab state for Decoder HUD ('standard' | 'satdump')
  const [decoderTab, setDecoderTab] = useState('standard');

  // Audio refs
  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const noiseSourceRef = useRef(null);
  const noiseGainRef = useRef(null);
  const staticFilterRef = useRef(null);
  const signalOscRef = useRef(null);
  const signalGainRef = useRef(null);
  const aptCarrierRef = useRef(null);
  const aptLfoRef = useRef(null);
  const aptLfoGainRef = useRef(null);
  const aptGainRef = useRef(null);

  const canvasRef = useRef(null);
  const constellationCanvasRef = useRef(null);
  const videoCanvasRef = useRef(null);
  const noaaImagesRef = useRef({ noaa15: null, noaa18: null, noaa19: null });
  const animationRef = useRef(null);
  const statusIntervalRef = useRef(null);

  // Canvas dynamic dimensions
  const wfWidth = isFullscreen ? 800 : 255;
  const wfHeight = isFullscreen ? 320 : 120;
  const constSize = isFullscreen ? 150 : 65;
  const vidWidth = isFullscreen ? 260 : 110;
  const vidHeight = isFullscreen ? 150 : 65;
  
  const terrestrialPresets = [
    { label: 'Prambors FM (Jakarta)', freq: 97.4, mode: 'FM', desc: 'Siaran Radio Musik Terestrial Analok' },
    { label: 'MUX DAB+ (Digital Radio)', freq: 229.072, mode: 'DAB', desc: 'Digital Audio Broadcasting Band III' },
    { label: 'TVRI Digital MUX (DVB-T)', freq: 578.0, mode: 'DVB-T', desc: 'Digital Video Broadcast - Terrestrial' }
  ];
  
  const API_BASE = 'http://localhost:8055';

  // Preload NOAA weather satellite images
  useEffect(() => {
    const img15 = new Image();
    img15.src = '/assets/noaa15.jpg';
    img15.onload = () => { noaaImagesRef.current.noaa15 = img15; };

    const img18 = new Image();
    img18.src = '/assets/noaa18.jpg';
    img18.onload = () => { noaaImagesRef.current.noaa18 = img18; };

    const img19 = new Image();
    img19.src = '/assets/noaa19.jpg';
    img19.onload = () => { noaaImagesRef.current.noaa19 = img19; };
  }, []);

  // Audio Synthesizer Initialization
  const initAudio = () => {
    if (audioCtxRef.current) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    
    try {
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;
      
      // Master Gain Node
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(isMuted ? 0 : volume / 100, ctx.currentTime);
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;
      
      // --- 1. Noise Path (Static) ---
      const bufferSize = 2 * ctx.sampleRate;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;
      
      // Bandpass filter to make static sound more realistic
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, ctx.currentTime);
      filter.Q.setValueAtTime(1.2, ctx.currentTime);
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0, ctx.currentTime); // start silent
      
      noiseSource.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(masterGain);
      
      noiseSource.start();
      noiseSourceRef.current = noiseSource;
      noiseGainRef.current = noiseGain;
      staticFilterRef.current = filter;
      
      // --- 2. Modulated Tone Path (FM / AM / SSB) ---
      const sigOsc = ctx.createOscillator();
      sigOsc.type = 'sine';
      sigOsc.frequency.setValueAtTime(800, ctx.currentTime);
      
      const sigGain = ctx.createGain();
      sigGain.gain.setValueAtTime(0, ctx.currentTime);
      
      sigOsc.connect(sigGain);
      sigGain.connect(masterGain);
      sigOsc.start();
      
      signalOscRef.current = sigOsc;
      signalGainRef.current = sigGain;
      
      // --- 3. NOAA APT Ticking Sound Path ---
      const aptCarrier = ctx.createOscillator();
      aptCarrier.type = 'sine';
      aptCarrier.frequency.setValueAtTime(2400, ctx.currentTime);
      
      const aptGain = ctx.createGain();
      aptGain.gain.setValueAtTime(0, ctx.currentTime);
      
      const aptMod = ctx.createGain();
      aptMod.gain.setValueAtTime(0.5, ctx.currentTime);
      
      const aptLfo = ctx.createOscillator();
      aptLfo.type = 'sawtooth';
      aptLfo.frequency.setValueAtTime(2, ctx.currentTime); // 2Hz ticker
      
      aptLfo.connect(aptMod.gain);
      aptCarrier.connect(aptMod);
      aptMod.connect(aptGain);
      aptGain.connect(masterGain);
      
      aptLfo.start();
      aptCarrier.start();
      
      aptCarrierRef.current = aptCarrier;
      aptLfoRef.current = aptLfo;
      aptLfoGainRef.current = aptMod;
      aptGainRef.current = aptGain;
    } catch (e) {
      console.error('Failed to initialize audio context:', e);
    }
  };

  // Close audio on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch (e) {
          console.error(e);
        }
        audioCtxRef.current = null;
      }
    };
  }, []);

  // Sync volume state to gain node
  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      const targetGain = (isMuted || !sdrState.is_receiving) ? 0 : volume / 100;
      masterGainRef.current.gain.setTargetAtTime(targetGain, audioCtxRef.current.currentTime, 0.02);
    }
  }, [volume, isMuted, sdrState.is_receiving]);

  // Dynamic audio adjustment based on SDR receiver state
  useEffect(() => {
    if (!sdrState.is_receiving) {
      if (noiseGainRef.current && audioCtxRef.current) {
        noiseGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
      }
      if (signalGainRef.current && audioCtxRef.current) {
        signalGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
      }
      if (aptGainRef.current && audioCtxRef.current) {
        aptGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
      }
      return;
    }

    if (!audioCtxRef.current) {
      initAudio();
    }

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const info = sdrState.decoding_info;
    const mode = sdrState.mode;
    
    let snr = 0;
    if (info) {
      snr = info.snr_db || 0;
    }

    let targetStaticGain = 0;
    let targetSignalGain = 0;
    let targetAptGain = 0;

    const mhz = sdrState.frequency_hz / 1000000;
    const isNoaa = mode === 'FM' && (Math.abs(mhz - 137.620) < 0.01 || Math.abs(mhz - 137.9125) < 0.01 || Math.abs(mhz - 137.100) < 0.01);

    if (isNoaa) {
      const subcarrierLocked = info?.subcarrier_locked;
      if (subcarrierLocked) {
        targetStaticGain = 0.02; // soft static
        targetAptGain = 0.20;    // locked APT ticker
      } else {
        targetStaticGain = 0.35; // pure static noise
        targetAptGain = 0.0;
      }
    } else if (mode === 'FM') {
      if (snr > 12) {
        targetStaticGain = 0.01;
        targetSignalGain = 0.15;
        if (signalOscRef.current) {
          signalOscRef.current.type = 'sine';
          const freq = info?.audio_freq_hz || 600;
          signalOscRef.current.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
        }
      } else {
        targetStaticGain = 0.35;
        targetSignalGain = 0.0;
      }
    } else if (mode === 'AM' || mode === 'USB' || mode === 'LSB') {
      targetStaticGain = 0.22;
      if (snr > 8) {
        targetSignalGain = 0.06;
        const pitch = 500 + Math.abs((sdrState.frequency_hz) % 1600 - 800);
        if (signalOscRef.current) {
          signalOscRef.current.type = 'sine';
          signalOscRef.current.frequency.setTargetAtTime(pitch, ctx.currentTime, 0.05);
        }
      } else {
        targetSignalGain = 0.0;
      }
    } else if (mode === 'DAB' || mode === 'DVB-T') {
      if (snr > 10) {
        targetStaticGain = 0.01;
        targetSignalGain = 0.10;
        if (signalOscRef.current) {
          signalOscRef.current.type = 'triangle';
          signalOscRef.current.frequency.setTargetAtTime(70, ctx.currentTime, 0.1);
        }
      } else {
        targetStaticGain = 0.25;
        targetSignalGain = 0.0;
      }
    }

    if (noiseGainRef.current) {
      noiseGainRef.current.gain.setTargetAtTime(targetStaticGain, ctx.currentTime, 0.08);
    }
    if (signalGainRef.current) {
      signalGainRef.current.gain.setTargetAtTime(targetSignalGain, ctx.currentTime, 0.08);
    }
    if (aptGainRef.current) {
      aptGainRef.current.gain.setTargetAtTime(targetAptGain, ctx.currentTime, 0.08);
    }
  }, [sdrState.is_receiving, sdrState.mode, sdrState.frequency_hz, sdrState.decoding_info]);

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
    } else if (name.includes('TELKOM-4') || name.includes('MERAH PUTI') || name.includes('43587')) {
      list.push({ label: 'C-Band Beacon (RF)', freq: 4199.000, mode: 'FM', desc: 'Telemetry Beacon Carrier' });
      list.push({ label: 'C-Band LNB IF', freq: 951.000, mode: 'FM', desc: 'Intermediate Freq (LO: 5150)' });
      list.push({ label: 'C-Band TV Mux (DVB-T/S)', freq: 951.000, mode: 'DVB-T', desc: 'Simulated Digital TV Stream' });
    } else if (name.includes('BRISAT') || name.includes('41591')) {
      list.push({ label: 'C-Band Beacon (RF)', freq: 4185.000, mode: 'FM', desc: 'Telemetry Beacon Carrier' });
      list.push({ label: 'C-Band LNB IF', freq: 965.000, mode: 'FM', desc: 'Intermediate Freq (LO: 5150)' });
      list.push({ label: 'Banking Data Stream', freq: 965.000, mode: 'DAB', desc: 'Simulated Encrypted DAB Stream' });
    } else if (name.includes('SATRIA-1') || name.includes('NUSANTARA') || name.includes('57045')) {
      list.push({ label: 'Ka-Band Beacon (RF)', freq: 20200.000, mode: 'FM', desc: 'HTS Telemetry Beacon Carrier' });
      list.push({ label: 'Ka-Band LNB IF', freq: 950.000, mode: 'FM', desc: 'Intermediate Freq (LO: 19.25G)' });
      list.push({ label: 'Broadband Data Stream', freq: 950.000, mode: 'DAB', desc: 'Simulated High-Speed DAB Stream' });
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
      list.push({ label: 'Amateur CubeSat', freq: 437.500, mode: 'FM', desc: 'Downlink Beacon' });
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
        console.error('Failed to send tune command:', err);
      }
    }
  };

  // Automatically tune to satellite default frequency on selection
  useEffect(() => {
    if (presets.length > 0) {
      tuneFrequency(presets[0].freq, presets[0].mode);
    }
  }, [sat]);

  // Toggle receiver state
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

  // Modify settings
  const updateSetting = async (key, val) => {
    setSdrState(prev => ({ ...prev, [key]: val }));
    if (serverStatus === 'online') {
      try {
        let payloadKey = key;
        if (key === 'bandwidth_hz') payloadKey = 'bandwidth';
        if (key === 'sample_rate_hz') payloadKey = 'sample_rate';
        await fetch(`${API_BASE}/api/tune`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [payloadKey]: val })
        });
      } catch (err) {
        console.error('Failed to update setting:', err);
      }
    }
  };

  // Adjust frequency by step
  const adjustFreq = (deltaMHz) => {
    const next = Math.max(1.0, tuningFreq + deltaMHz);
    tuneFrequency(parseFloat(next.toFixed(6)));
  };

  // Waterfall Rendering Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    
    const SPECTRUM_HEIGHT = isFullscreen ? 60 : 45;
    const WATERFALL_HEIGHT = H - SPECTRUM_HEIGHT;
    
    ctx.fillStyle = '#030810';
    ctx.fillRect(0, 0, W, H);
    
    let localFFT = [];
    const numBins = isFullscreen ? 256 : 128;

    const fetchWaterfall = async () => {
      if (serverStatus === 'online' && sdrState.is_receiving) {
        try {
          const res = await fetch(`${API_BASE}/api/waterfall?bins=${numBins}`);
          if (res.ok) {
            const data = await res.json();
            localFFT = data.fft;
            return;
          }
        } catch (e) {}
      }

      if (sdrState.is_receiving) {
        const simFFT = [];
        const t = Date.now() / 1000;
        const targetFreq = 435.880;
        const currentFreq = tuningFreq;
        const bandwidth = 2.0;
        const freqDiff = Math.abs(currentFreq - targetFreq);
        
        for (let i = 0; i < numBins; i++) {
          simFFT.push(-80 + Math.random() * 4 - 2);
        }
        
        const isNearCarrier = freqDiff < (bandwidth / 2);
        if (isNearCarrier) {
          const doppler = 0.005 * Math.sin(t / 15);
          const signalOffset = (targetFreq + doppler) - currentFreq;
          const binPos = Math.round(((signalOffset / bandwidth) + 0.5) * numBins);
          
          if (binPos >= 0 && binPos < numBins) {
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
        
        const birdieBin = Math.round(numBins * 0.22);
        for (let i = 0; i < numBins; i++) {
          const dist = Math.abs(i - birdieBin);
          if (dist < 2) {
            simFFT[i] = Math.max(simFFT[i], -45 - (dist * 15) + Math.random() * 2);
          }
        }
        
        localFFT = simFFT;
      } else {
        localFFT = Array(numBins).fill(-90).map(v => v + Math.random() * 2);
      }
    };

    const draw = async () => {
      await fetchWaterfall();
      
      if (localFFT.length === 0) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      // 1. Draw Spectrum
      ctx.fillStyle = '#050e1a';
      ctx.fillRect(0, 0, W, SPECTRUM_HEIGHT);
      
      ctx.strokeStyle = 'rgba(90, 122, 154, 0.1)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += (isFullscreen ? 80 : 40)) {
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

      ctx.beginPath();
      ctx.lineWidth = isFullscreen ? 1.8 : 1.2;
      ctx.strokeStyle = sdrState.is_receiving ? '#00e5ff' : '#5a7a9a';
      
      const getX = (i) => (i / (localFFT.length - 1)) * W;
      const getY = (db) => {
        const val = Math.max(-100, Math.min(-20, db));
        const pct = (val - (-100)) / 80;
        return SPECTRUM_HEIGHT - 4 - pct * (SPECTRUM_HEIGHT - 8);
      };

      ctx.moveTo(getX(0), getY(localFFT[0]));
      for (let i = 1; i < localFFT.length; i++) {
        ctx.lineTo(getX(i), getY(localFFT[i]));
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, SPECTRUM_HEIGHT);
      ctx.lineTo(W, SPECTRUM_HEIGHT);
      ctx.stroke();

      // 2. Shift Waterfall Down
      const waterfallData = ctx.getImageData(0, SPECTRUM_HEIGHT + 1, W, WATERFALL_HEIGHT - 1);
      ctx.putImageData(waterfallData, 0, SPECTRUM_HEIGHT + 2);

      // 3. Render New Waterfall Row
      const newRow = ctx.createImageData(W, 1);
      const binsPerPixel = localFFT.length / W;

      for (let x = 0; x < W; x++) {
        const binIndex = Math.floor(x * binsPerPixel);
        const db = localFFT[binIndex] || -90;
        const normalized = Math.max(0, Math.min(1, (db - (-85)) / 50));
        
        let r = 0, g = 0, b = 0;
        if (sdrState.is_receiving) {
          const scheme = sdrState.waterfall_scheme || 'Classic';
          if (scheme === 'Classic') {
            if (normalized < 0.33) {
              r = 3;
              g = Math.round(normalized * 3 * 229);
              b = Math.round(16 + normalized * 3 * 239);
            } else if (normalized < 0.66) {
              r = Math.round((normalized - 0.33) * 3 * 255);
              g = 229;
              b = Math.round(255 - (normalized - 0.33) * 3 * 255);
            } else {
              r = 255;
              g = Math.round(229 - (normalized - 0.66) * 3 * 229);
              b = 0;
            }
          } else if (scheme === 'Thermal') {
            if (normalized < 0.33) {
              r = Math.round(normalized * 3 * 255);
              g = 0;
              b = 0;
            } else if (normalized < 0.66) {
              r = 255;
              g = Math.round((normalized - 0.33) * 3 * 165);
              b = 0;
            } else if (normalized < 0.9) {
              r = 255;
              g = 165 + Math.round((normalized - 0.66) * 4.16 * 90);
              b = 0;
            } else {
              r = 255;
              g = 255;
              b = Math.round((normalized - 0.9) * 10 * 255);
            }
          } else if (scheme === 'Green Phosphor') {
            r = Math.round(normalized * 0.1 * 255);
            g = Math.round(normalized * 255);
            b = Math.round(normalized * 0.15 * 255);
          } else if (scheme === 'Blue Ice') {
            r = Math.round(normalized * normalized * 255);
            g = Math.round(normalized * 220);
            b = Math.round(80 + normalized * 175);
          }
        } else {
          r = Math.round(3 + normalized * 10);
          g = Math.round(8 + normalized * 20);
          b = Math.round(16 + normalized * 30);
        }

        const pixelIndex = x * 4;
        newRow.data[pixelIndex] = r;
        newRow.data[pixelIndex + 1] = g;
        newRow.data[pixelIndex + 2] = b;
        newRow.data[pixelIndex + 3] = 255;
      }
      ctx.putImageData(newRow, 0, SPECTRUM_HEIGHT + 1);

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [serverStatus, sdrState.is_receiving, tuningFreq, isFullscreen]);

  // Constellation & Decoder Visuals Loop
  useEffect(() => {
    if (!sdrState.is_receiving || !sdrState.decoding_info) return;

    let animId;
    const drawDecoders = () => {
      const cCanvas = constellationCanvasRef.current;
      if (cCanvas) {
        const ctx = cCanvas.getContext('2d');
        const W = cCanvas.width;
        const H = cCanvas.height;
        ctx.fillStyle = '#020710';
        ctx.fillRect(0, 0, W, H);
        
        ctx.strokeStyle = 'rgba(90, 122, 154, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
        ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
        ctx.stroke();
        
        const mode = sdrState.mode;
        // SatDump mode can use constellation as well if enabled
        const isMeteor = Math.abs(sdrState.frequency_hz / 1e6 - 137.9) < 0.05;
        
        if (mode === 'DAB' || (decoderTab === 'satdump' && !isMeteor)) {
          const points = [
            { x: W * 0.28, y: H * 0.28 },
            { x: W * 0.72, y: H * 0.28 },
            { x: W * 0.28, y: H * 0.72 },
            { x: W * 0.72, y: H * 0.72 }
          ];
          for (let p of points) {
            ctx.fillStyle = 'rgba(0, 229, 255, 0.75)';
            for (let i = 0; i < 6; i++) {
              const dx = (Math.random() - 0.5) * (isFullscreen ? 10 : 5);
              const dy = (Math.random() - 0.5) * (isFullscreen ? 10 : 5);
              ctx.beginPath();
              ctx.arc(p.x + dx, p.y + dy, isFullscreen ? 2.0 : 1.2, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, isFullscreen ? 3.5 : 2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (mode === 'DVB-T') {
          ctx.fillStyle = 'rgba(0, 255, 136, 0.7)';
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const px = W * 0.13 + c * (W * 0.106);
              const py = H * 0.13 + r * (H * 0.106);
              for (let i = 0; i < 2; i++) {
                const dx = (Math.random() - 0.5) * (isFullscreen ? 5 : 2.5);
                const dy = (Math.random() - 0.5) * (isFullscreen ? 5 : 2.5);
                ctx.beginPath();
                ctx.arc(px + dx, py + dy, isFullscreen ? 1.5 : 0.9, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        } else if (decoderTab === 'satdump' && isMeteor) {
          // QPSK / Costas Loop lock constellation
          const points = [
            { x: W * 0.28, y: H * 0.28 },
            { x: W * 0.72, y: H * 0.28 },
            { x: W * 0.28, y: H * 0.72 },
            { x: W * 0.72, y: H * 0.72 }
          ];
          // Scatter more noise if SNR is lower
          const snr = sdrState.decoding_info?.snr_db || 12;
          const spread = Math.max(3, 20 - snr);
          for (let p of points) {
            ctx.fillStyle = '#00ff88';
            for (let i = 0; i < 8; i++) {
              const dx = (Math.random() - 0.5) * spread * (W / 110);
              const dy = (Math.random() - 0.5) * spread * (H / 65);
              ctx.beginPath();
              ctx.arc(p.x + dx, p.y + dy, isFullscreen ? 1.8 : 1.0, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      const vCanvas = videoCanvasRef.current;
      if (vCanvas) {
        const ctx = vCanvas.getContext('2d');
        const W = vCanvas.width;
        const H = vCanvas.height;
        ctx.fillStyle = '#020710';
        ctx.fillRect(0, 0, W, H);
        
        const mode = sdrState.mode;
        const info = sdrState.decoding_info;
        const t = Date.now() / 1000;
        
        const mhz = sdrState.frequency_hz / 1000000;
        const isNoaa = mode === 'FM' && (Math.abs(mhz - 137.620) < 0.01 || Math.abs(mhz - 137.9125) < 0.01 || Math.abs(mhz - 137.100) < 0.01);
        const isMeteor = Math.abs(mhz - 137.9) < 0.05;
        
        if (isNoaa || (decoderTab === 'satdump' && isNoaa)) {
          const isSignalOk = info && info.signal_strength_dbm > -95;
          
          if (isSignalOk) {
            let noaaImg = null;
            if (Math.abs(mhz - 137.620) < 0.01) noaaImg = noaaImagesRef.current.noaa15;
            else if (Math.abs(mhz - 137.9125) < 0.01) noaaImg = noaaImagesRef.current.noaa18;
            else if (Math.abs(mhz - 137.100) < 0.01) noaaImg = noaaImagesRef.current.noaa19;
            
            const sweepDuration = 18;
            const sweepY = H * ((t % sweepDuration) / sweepDuration);
            
            if (noaaImg) {
              ctx.drawImage(noaaImg, 0, 0, W, sweepY, 0, 0, W, sweepY);
              
              const staticData = ctx.createImageData(W, Math.ceil(H - sweepY));
              for (let i = 0; i < staticData.data.length; i += 4) {
                const val = Math.floor(Math.random() * 60 + 35);
                staticData.data[i] = val;
                staticData.data[i+1] = val;
                staticData.data[i+2] = val;
                staticData.data[i+3] = 255;
              }
              ctx.putImageData(staticData, 0, Math.ceil(sweepY));
              
              ctx.strokeStyle = '#00ff88';
              ctx.lineWidth = isFullscreen ? 2 : 1;
              ctx.beginPath();
              ctx.moveTo(0, sweepY);
              ctx.lineTo(W, sweepY);
              ctx.stroke();
              
              ctx.fillStyle = '#00ff88';
              ctx.font = isFullscreen ? '10px Courier New' : '6px Courier New';
              ctx.fillText("APT LOCK OK", 6, isFullscreen ? 14 : 10);
            } else {
              ctx.fillStyle = '#020710';
              ctx.fillRect(0, 0, W, H);
              ctx.fillStyle = '#8fa0b5';
              ctx.font = isFullscreen ? '11px sans-serif' : '6px sans-serif';
              ctx.fillText("DECODING NOAA PICTURE...", 12, H/2);
            }
          } else {
            const staticData = ctx.createImageData(W, H);
            for (let i = 0; i < staticData.data.length; i += 4) {
              const val = Math.floor(Math.random() * 110 + 20);
              staticData.data[i] = val;
              staticData.data[i+1] = val;
              staticData.data[i+2] = val;
              staticData.data[i+3] = 255;
            }
            ctx.putImageData(staticData, 0, 0);
            
            ctx.fillStyle = '#ff0055';
            ctx.font = isFullscreen ? '10px Courier New' : '6px Courier New';
            ctx.fillText("APT SYNC LOST", 6, isFullscreen ? 14 : 10);
          }
        } else if (decoderTab === 'satdump' && isMeteor) {
          // SatDump Meteor LRPT image simulation
          const isSignalOk = info && info.signal_strength_dbm > -95;
          if (isSignalOk) {
            // Draw a green/blue false-color satellite image scanning line
            const scaleY = H / 65;
            const sweepY = H * ((t % 25) / 25);
            ctx.fillStyle = '#001830';
            ctx.fillRect(0, 0, W, H);
            
            // Draw simulated green earth land shape
            ctx.fillStyle = '#105a30';
            ctx.beginPath();
            ctx.arc(W/2 + 20 * Math.sin(t*0.05), H + 40 * scaleY, 70 * scaleY, Math.PI, 0);
            ctx.fill();
            
            // Draw cloud cover overlay (white transparent)
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.arc(W/3, H/2 - 10, 20, 0, Math.PI*2);
            ctx.arc(W * 0.7, H/2 + 10, 15, 0, Math.PI*2);
            ctx.fill();
            
            // Static noise below scan line
            const staticData = ctx.createImageData(W, Math.ceil(H - sweepY));
            for (let i = 0; i < staticData.data.length; i += 4) {
              const val = Math.floor(Math.random() * 40 + 15);
              staticData.data[i] = val;
              staticData.data[i+1] = val + 10;
              staticData.data[i+2] = val + 25;
              staticData.data[i+3] = 255;
            }
            ctx.putImageData(staticData, 0, Math.ceil(sweepY));

            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = isFullscreen ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(0, sweepY);
            ctx.lineTo(W, sweepY);
            ctx.stroke();

            ctx.fillStyle = '#00ff88';
            ctx.font = isFullscreen ? '9px monospace' : '6px monospace';
            ctx.fillText("LRPT LOCK (QPSK)", 6, isFullscreen ? 14 : 10);
          } else {
            // Blue static
            const staticData = ctx.createImageData(W, H);
            for (let i = 0; i < staticData.data.length; i += 4) {
              const val = Math.floor(Math.random() * 110 + 20);
              staticData.data[i] = 10;
              staticData.data[i+1] = val / 2;
              staticData.data[i+2] = val;
              staticData.data[i+3] = 255;
            }
            ctx.putImageData(staticData, 0, 0);
            ctx.fillStyle = '#ff0055';
            ctx.font = isFullscreen ? '9px monospace' : '6px monospace';
            ctx.fillText("LRPT SYNC SEARCHING", 6, isFullscreen ? 14 : 10);
          }
        } else if (mode === 'FM') {
          ctx.strokeStyle = 'rgba(90, 122, 154, 0.08)';
          ctx.lineWidth = 1;
          for (let x = 0; x < W; x += 15) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
          }
          for (let y = 0; y < H; y += 12) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
          }
          
          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = isFullscreen ? 2.5 : 1.5;
          ctx.beginPath();
          const amp = (14 + 2 * Math.sin(t * 0.5)) * (H / 65);
          ctx.moveTo(0, H/2);
          for (let x = 0; x < W; x++) {
            const angle = x * (isFullscreen ? 0.04 : 0.08) + t * 4.5 + 3.5 * Math.sin(x * 0.02 + t * 1.5);
            const y = H/2 + amp * Math.sin(angle);
            ctx.lineTo(x, y);
          }
          ctx.stroke();
          
          ctx.fillStyle = 'rgba(0, 229, 255, 0.9)';
          ctx.font = isFullscreen ? '9px monospace' : '7px monospace';
          ctx.fillText("FM AUDIO ANALYZER", 6, isFullscreen ? 14 : 10);
        } else if (mode === 'DAB' && info.slideshow_id) {
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
          ctx.strokeRect(3, 3, W-6, H-6);
          const scaleX = W / 110;
          const scaleY = H / 65;
          
          if (info.slideshow_id === 'orbit_tracking') {
            ctx.strokeStyle = '#00e5ff';
            ctx.beginPath();
            ctx.ellipse(W/2, H/2 + 2 * scaleY, 35 * scaleX, 12 * scaleY, Math.PI/6, 0, Math.PI*2);
            ctx.stroke();
            
            ctx.fillStyle = '#0f3860';
            ctx.beginPath();
            ctx.arc(W/2, H/2 + 2 * scaleY, 8 * scaleY, 0, Math.PI*2);
            ctx.fill();
            
            const sx = W/2 + 35 * scaleX * Math.cos(t * 0.7) * Math.cos(Math.PI/6) - 12 * scaleY * Math.sin(t * 0.7) * Math.sin(Math.PI/6);
            const sy = H/2 + 2 * scaleY + 35 * scaleX * Math.cos(t * 0.7) * Math.sin(Math.PI/6) + 12 * scaleY * Math.sin(t * 0.7) * Math.cos(Math.PI/6);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(sx, sy, 2 * scaleY, 0, Math.PI*2);
            ctx.fill();
            
            ctx.fillStyle = '#8fa0b5';
            ctx.font = isFullscreen ? '9px sans-serif' : '6px sans-serif';
            ctx.fillText("SLIDE: ORBIT VIEW", 8, isFullscreen ? 16 : 12);
          } else if (info.slideshow_id === 'lapan_satellite') {
            ctx.strokeStyle = '#ffea00';
            ctx.strokeRect(W/2 - 8 * scaleX, H/2 - 8 * scaleY, 16 * scaleX, 16 * scaleY);
            ctx.strokeRect(W/2 - 28 * scaleX, H/2 - 3 * scaleY, 20 * scaleX, 6 * scaleY);
            ctx.strokeRect(W/2 + 8 * scaleX, H/2 - 3 * scaleY, 20 * scaleX, 6 * scaleY);
            ctx.beginPath();
            ctx.moveTo(W/2, H/2 + 8 * scaleY);
            ctx.lineTo(W/2, H/2 + 16 * scaleY);
            ctx.stroke();
            
            ctx.fillStyle = '#8fa0b5';
            ctx.font = isFullscreen ? '9px sans-serif' : '6px sans-serif';
            ctx.fillText("SLIDE: LAPAN A2", 8, isFullscreen ? 16 : 12);
          } else if (info.slideshow_id === 'spectrogram_pattern') {
            const numBars = 7;
            ctx.fillStyle = '#00e5ff';
            for (let i = 0; i < numBars; i++) {
              const h = Math.max(4 * scaleY, (20 + 16 * Math.sin(t * 5 + i * 1.5)) * scaleY);
              ctx.fillRect(22 * scaleX + i * 10 * scaleX, H - h - 10 * scaleY, 6 * scaleX, h);
            }
            ctx.fillStyle = '#8fa0b5';
            ctx.font = isFullscreen ? '9px sans-serif' : '6px sans-serif';
            ctx.fillText("SLIDE: TRANSMIT EQ", 8, isFullscreen ? 16 : 12);
          } else {
            ctx.strokeStyle = '#00ff88';
            ctx.beginPath();
            ctx.arc(W/2, H/2, 18 * scaleY, 0, Math.PI*2);
            ctx.stroke();
            const sx = W/2 + 18 * scaleY * Math.cos(t * 1.2);
            const sy = H/2 + 18 * scaleY * Math.sin(t * 1.2);
            ctx.beginPath();
            ctx.moveTo(W/2, H/2);
            ctx.lineTo(sx, sy);
            ctx.stroke();
            
            ctx.fillStyle = '#8fa0b5';
            ctx.font = isFullscreen ? '9px sans-serif' : '6px sans-serif';
            ctx.fillText("SLIDE: RADAR INDO", 8, isFullscreen ? 16 : 12);
          }
        } else if (mode === 'DVB-T') {
          const scaleX = W / 110;
          const scaleY = H / 65;
          ctx.strokeStyle = '#00ff88';
          ctx.lineWidth = isFullscreen ? 2 : 1;
          ctx.beginPath();
          ctx.arc(W/2, H + 35 * scaleY, 75 * scaleY, Math.PI, 0);
          ctx.stroke();
          
          ctx.strokeStyle = 'rgba(0, 255, 136, 0.25)';
          ctx.beginPath();
          ctx.arc(W/2, H + 35 * scaleY, 55 * scaleY, Math.PI, 0);
          ctx.stroke();
          
          const satX = W/2 + 65 * scaleX * Math.cos(t * 0.4);
          const satY = H + 35 * scaleY + 65 * scaleY * Math.sin(t * 0.4);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(satX, satY, isFullscreen ? 4 : 2.5, 0, Math.PI*2);
          ctx.fill();
          
          ctx.strokeStyle = 'rgba(0, 255, 136, 0.4)';
          ctx.beginPath();
          ctx.moveTo(satX, satY);
          ctx.lineTo(W/2, H - 20 * scaleY);
          ctx.stroke();
          
          ctx.fillStyle = 'rgba(0, 255, 136, 0.08)';
          ctx.fillRect(0, Math.floor(t * 22 * scaleY) % H, W, isFullscreen ? 4 : 2);
          
          ctx.fillStyle = '#00ff88';
          ctx.font = isFullscreen ? '9px monospace' : '6px monospace';
          ctx.fillText("REC ●", 6, isFullscreen ? 15 : 11);
          ctx.fillText("SAT_CAM_A2", 6, H - 6);
          ctx.fillText(`AZ:${(115 + 15 * Math.sin(t)).toFixed(1)}°`, W - (isFullscreen ? 65 : 44), isFullscreen ? 15 : 11);
          ctx.fillText(`EL:${(40 + 8 * Math.cos(t)).toFixed(1)}°`, W - (isFullscreen ? 65 : 44), isFullscreen ? 25 : 19);
        } else {
          ctx.strokeStyle = 'rgba(90, 122, 154, 0.08)';
          ctx.strokeRect(3, 3, W-6, H-6);
          ctx.strokeStyle = '#8fa0b5';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, H/2);
          for (let x = 0; x < W; x++) {
            const y = H/2 + (Math.random() - 0.5) * (isFullscreen ? 40 : 16);
            ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.fillStyle = '#8fa0b5';
          ctx.font = isFullscreen ? '9px monospace' : '7px monospace';
          ctx.fillText("SSB/AM DETECTOR", 6, isFullscreen ? 15 : 10);
        }
      }
      animId = requestAnimationFrame(drawDecoders);
    };

    animId = requestAnimationFrame(drawDecoders);
    return () => cancelAnimationFrame(animId);
  }, [sdrState.is_receiving, sdrState.mode, sdrState.decoding_info, isFullscreen, decoderTab]);

  // Sub-renderer helpers
  const renderDiagnosticsCard = () => (
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
      <div className="diag-footer">
        <Cpu size={10} style={{ color: '#5a7a9a', marginRight: '4px' }} />
        <span className="diag-desc-text">
          <strong>Driver:</strong> {sdrState.driver_status}
        </span>
      </div>
    </div>
  );

  const renderAlertBanner = () => (
    <div className={`sdr-alert-banner ${sdrState.connected ? 'confirmed' : sdrState.physical_usb_detected ? 'semi-confirmed' : 'unconfirmed'}`}>
      {sdrState.connected ? (
        <p className="alert-banner-text">
          🟢 <strong>{sdrState.device_type.toUpperCase()} CONFIRMED:</strong> Perangkat {sdrState.device_name} terdeteksi. Aliran Spektrum Spektral aktif!
        </p>
      ) : sdrState.physical_usb_detected ? (
        <p className="alert-banner-text">
          ⚠️ <strong>USB TERDETEKSI:</strong> {sdrState.device_type.toUpperCase()} terhubung secara fisik, namun driver software tidak dapat mengaksesnya.
          <button className="banner-link-btn" onClick={() => setShowTroubleshooting(true)}>Buka Panduan Driver</button>
        </p>
      ) : (
        <p className="alert-banner-text">
          🔴 <strong>SDR NOT FOUND:</strong> Pasangkan dongle RTL-SDR atau Airspy ke port USB untuk pelacakan sinyal satelit real-time.
          <button className="banner-link-btn" onClick={() => setShowTroubleshooting(true)}>Bantuan Koneksi</button>
        </p>
      )}
    </div>
  );

  const renderTroubleshooting = () => (
    showTroubleshooting && (
      <div className="trouble-guide-box">
        <div className="guide-header">
          <h4>PANDUAN INTEGRASI RTL-SDR / AIRSPY</h4>
          <button className="guide-close-btn" onClick={() => setShowTroubleshooting(false)}>Tutup</button>
        </div>
        <div className="guide-content">
          <h5>1. Jalankan Python Server Lokal</h5>
          <p>Jalankan script Python di root proyek:</p>
          <pre className="guide-code-block">python sdr_server.py</pre>
          
          <h5>2. Driver WinUSB (Windows)</h5>
          <p>Gunakan <strong>Zadig</strong> untuk menginstal driver WinUSB untuk RTL-SDR atau Airspy.</p>
        </div>
      </div>
    )
  );

  const getSValue = (dbm) => {
    if (!dbm) return { text: 'S0', pct: 0 };
    if (dbm <= -121) return { text: 'S0', pct: 0 };
    if (dbm >= -73) {
      const over = Math.max(0, dbm - (-73));
      const pct = 70 + (over / 40) * 30;
      return { text: `S9+${Math.round(over)}dB`, pct: Math.min(100, pct) };
    }
    const s = Math.round((dbm - (-121)) / 6);
    return { text: `S${s}`, pct: (s / 9) * 70 };
  };

  const formatSize = (bytes) => {
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
    return bytes + ' B';
  };

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const renderWaterfall = () => {
    const rssi = sdrState.decoding_info?.signal_strength_dbm || -110;
    const sVal = getSValue(rssi);

    return (
      <div className="waterfall-canvas-container">
        <div className="waterfall-hud-overlay">
          <div className="hud-metric">
            <span className="hud-lbl">Tuned</span>
            <span className="hud-val font-numeric" style={{ color: '#00e5ff' }}>{formatFreq(sdrState.frequency_hz)}</span>
          </div>
          <div className="hud-metric">
            <span className="hud-lbl">Sample Rate</span>
            <span className="hud-val font-numeric">{(sdrState.sample_rate_hz / 1e6).toFixed(3)} MSPS</span>
          </div>
          <div className="hud-metric">
            <span className="hud-lbl">Filter BW</span>
            <span className="hud-val font-numeric" style={{ color: '#ff6d00' }}>{(sdrState.bandwidth_hz / 1e3).toFixed(1)} kHz</span>
          </div>
          <div className="hud-metric">
            <span className="hud-lbl">Mode</span>
            <span className="hud-val font-numeric" style={{ color: '#ffea00' }}>{sdrState.mode}</span>
          </div>
        </div>

        {/* S-Meter Bar Overlaid on top of waterfall */}
        <div className="sdr-smeter-container">
          <span className="sdr-smeter-lbl font-numeric">{sVal.text}</span>
          <div className="sdr-smeter-bar-bg">
            <div className="sdr-smeter-bar-fill" style={{ width: `${sVal.pct}%` }} />
            {/* S-Meter calibration markings */}
            <div className="sdr-smeter-ticks">
              {[1, 3, 5, 7, 9].map(tick => (
                <span key={tick} style={{ left: `${(tick / 9) * 70}%` }}>{tick}</span>
              ))}
              <span style={{ left: '85%' }}>+20</span>
              <span style={{ left: '96%' }}>+40</span>
            </div>
          </div>
          <span className="sdr-smeter-dbm font-numeric">{rssi} dBm</span>
        </div>

        {/* Recording / Scanning Status Indicators */}
        {sdrState.recording_active && (
          <div className="sdr-recording-badge">
            <span className="sdr-rec-dot"></span>
            <span className="font-numeric">REC {formatDuration(sdrState.recording_seconds)} ({formatSize(sdrState.recording_size_bytes)})</span>
          </div>
        )}

        {sdrState.scanner_active && (
          <div className="sdr-scanning-badge">
            <span className="sdr-scan-text">SCANNING BAND...</span>
          </div>
        )}

        <canvas ref={canvasRef} width={wfWidth} height={wfHeight} className={`sdr-waterfall-canvas ${isFullscreen ? 'fullscreen' : ''}`} />
      </div>
    );
  };

  // Dynamic decoder display standard standard standard
  const renderDecoderHud = () => {
    if (!sdrState.is_receiving || !sdrState.decoding_info) return null;

    if (decoderTab === 'satdump') {
      const pipeline = sdrState.satdump_pipeline;
      const isNoaa = pipeline.pipeline_name.includes("NOAA");
      const isMeteor = pipeline.pipeline_name.includes("Meteor");

      return (
        <div className="sdr-decoder-hud">
          <div className="decoder-hud-title">
            <div className="sdr-tab-group">
              <button className="decoder-tab-btn" onClick={() => setDecoderTab('standard')}>STANDARD</button>
              <button className="decoder-tab-btn active" onClick={() => setDecoderTab('satdump')}>SATDUMP</button>
            </div>
            <span className="decoder-hud-badge">SATDUMP LIVE</span>
          </div>

          <div className="decoder-hud-body satdump-enhanced-body">
            <div className="decoder-hud-details">
              <div className="decoder-metric-row">
                <span className="decoder-metric-lbl">Pipeline Name</span>
                <span className="decoder-metric-val green">{pipeline.pipeline_name}</span>
              </div>
              <div className="decoder-metric-row">
                <span className="decoder-metric-lbl">Demodulator</span>
                <span className="decoder-metric-val font-numeric">{pipeline.demodulator}</span>
              </div>
              <div className="decoder-metric-row">
                <span className="decoder-metric-lbl">Viterbi BER</span>
                <span className={`decoder-metric-val font-numeric ${pipeline.viterbi_ber < 0.01 ? 'green' : 'yellow'}`}>
                  {pipeline.viterbi_ber.toExponential(4)}
                </span>
              </div>
              <div className="decoder-metric-row">
                <span className="decoder-metric-lbl">Sync Tracking</span>
                <span className={`decoder-metric-val ${pipeline.sync_locked ? 'green' : 'err'}`}>
                  {pipeline.sync_locked ? 'SYNC LOCKED' : 'SEARCHING SYNC'}
                </span>
              </div>

              {/* Multi-channel selector */}
              {(isNoaa || isMeteor) && (
                <div className="satdump-ch-selector-row">
                  <span className="decoder-metric-lbl">Active Channel</span>
                  <div className="satdump-ch-buttons">
                    {isNoaa && ['ChA', 'ChB'].map(ch => (
                      <button
                        key={ch}
                        className={`satdump-ch-btn ${satdumpChannel === ch ? 'active' : ''}`}
                        onClick={() => setSatdumpChannel(ch)}
                      >
                        {ch === 'ChA' ? 'Channel A (Vis/IR)' : 'Channel B (IR)'}
                      </button>
                    ))}
                    {isMeteor && ['RGB', 'IR'].map(ch => (
                      <button
                        key={ch}
                        className={`satdump-ch-btn ${satdumpChannel === ch ? 'active' : ''}`}
                        onClick={() => setSatdumpChannel(ch)}
                      >
                        {ch === 'RGB' ? 'RGB False Color' : 'Thermal IR'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Map Projection selection */}
              <div className="satdump-projection-row">
                <span className="decoder-metric-lbl">Map Projection</span>
                <select
                  value={satdumpProjection}
                  onChange={(e) => setSatdumpProjection(e.target.value)}
                  className="satdump-projection-select"
                >
                  <option value="Raw">Raw Satellite swath (Unprojected)</option>
                  <option value="Equirectangular">Equirectangular cylindrical</option>
                  <option value="Mercator">Mercator projection mapping</option>
                </select>
              </div>

              {/* Progress Bar for Image Decode */}
              {pipeline.image_decoding_percent > 0 && (
                <div style={{ marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.45rem', color: '#5a7a9a', marginBottom: '2px' }}>
                    <span>IMAGE RECONSTRUCTION PROGRESS</span>
                    <span>{pipeline.image_decoding_percent}%</span>
                  </div>
                  <div style={{ width: '100%', height: '3px', background: 'rgba(90, 122, 154, 0.2)', borderRadius: '1.5px', overflow: 'hidden' }}>
                    <div style={{ width: `${pipeline.image_decoding_percent}%`, height: '100%', background: '#00ff88', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}

              {/* Frame Sync Status Bar */}
              <div className="satdump-sync-quality-container">
                <span className="decoder-metric-lbl">Frame Quality Sync</span>
                <div className="satdump-sync-blocks">
                  {Array.from({ length: 8 }).map((_, idx) => {
                    const active = pipeline.sync_locked && (idx < 6 || Math.random() > 0.15);
                    return (
                      <div
                        key={idx}
                        className={`satdump-sync-block ${active ? 'active' : 'inactive'}`}
                        title={active ? 'Frame decoded correctly' : 'Frame dropped / corrupted'}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Image Enhancements & Canvas View */}
            <div className="decoder-hud-visuals satdump-enhanced-visuals">
              <div className="satdump-enhancements-sliders">
                <div className="satdump-slider-item">
                  <span>BRIGHTNESS: {imageBrightness}%</span>
                  <input
                    type="range" min="50" max="150" value={imageBrightness}
                    onChange={(e) => setImageBrightness(parseInt(e.target.value))}
                  />
                </div>
                <div className="satdump-slider-item">
                  <span>CONTRAST: {imageContrast}%</span>
                  <input
                    type="range" min="50" max="150" value={imageContrast}
                    onChange={(e) => setImageContrast(parseInt(e.target.value))}
                  />
                </div>
                <div className="satdump-slider-item">
                  <span>GAMMA: {(imageGamma / 100).toFixed(1)}</span>
                  <input
                    type="range" min="50" max="150" value={imageGamma}
                    onChange={(e) => setImageGamma(parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div className="satdump-canvases-row">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <canvas ref={constellationCanvasRef} width={constSize} height={constSize} className={`sdr-constellation-canvas ${isFullscreen ? 'fullscreen' : ''}`} />
                  <span style={{ fontSize: '0.45rem', color: '#5a7a9a', fontWeight: 'bold' }}>CONSTELLATION IQ</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <div className="satdump-image-viewer-wrapper" style={{
                    filter: `brightness(${imageBrightness}%) contrast(${imageContrast}%) saturate(${imageGamma}%)`
                  }}>
                    <canvas ref={videoCanvasRef} width={vidWidth} height={vidHeight} className={`sdr-video-canvas ${isFullscreen ? 'fullscreen' : ''}`} />
                  </div>
                  <span style={{ fontSize: '0.45rem', color: '#5a7a9a', fontWeight: 'bold' }}>IMAGE/DATA PIPELINE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Standard conventional tab
    return (
      <div className="sdr-decoder-hud">
        <div className="decoder-hud-title">
          <div className="sdr-tab-group">
            <button className="decoder-tab-btn active" onClick={() => setDecoderTab('standard')}>STANDARD</button>
            <button className="decoder-tab-btn" onClick={() => setDecoderTab('satdump')}>SATDUMP</button>
          </div>
          <span className="decoder-hud-badge">{sdrState.mode} DECODER</span>
        </div>
        
        <div className="decoder-hud-body">
          <div className="decoder-hud-details">
            <div className="decoder-metric-row">
              <span className="decoder-metric-lbl">Signal Strength</span>
              <span className={`decoder-metric-val font-numeric ${sdrState.decoding_info.signal_strength_dbm > -50 ? 'green' : 'yellow'}`}>
                {sdrState.decoding_info.signal_strength_dbm} dBm
              </span>
            </div>
            <div className="decoder-metric-row">
              <span className="decoder-metric-lbl">Signal SNR</span>
              <span className="decoder-metric-val font-numeric green">
                {sdrState.decoding_info.snr_db} dB
              </span>
            </div>

            {sdrState.mode === 'FM' && (
              <>
                {sdrState.decoding_info.satellite ? (
                  <>
                    <div className="decoder-metric-row">
                      <span className="decoder-metric-lbl">Satellite</span>
                      <span className="decoder-metric-val green">{sdrState.decoding_info.satellite}</span>
                    </div>
                    <div className="decoder-metric-row">
                      <span className="decoder-metric-lbl">Subcarrier 2.4k</span>
                      <span className={`decoder-metric-val ${sdrState.decoding_info.subcarrier_locked ? 'green' : 'yellow'}`}>
                        {sdrState.decoding_info.subcarrier_locked ? 'LOCKED' : 'UNLOCKED'}
                      </span>
                    </div>
                    <div className="decoder-metric-row">
                      <span className="decoder-metric-lbl">Sync Status</span>
                      <span className={`decoder-metric-val ${sdrState.decoding_info.subcarrier_locked ? 'green' : 'warn'}`}>{sdrState.decoding_info.sync_status}</span>
                    </div>
                    <div className="decoder-metric-row">
                      <span className="decoder-metric-lbl">Scan Rate</span>
                      <span className="decoder-metric-val font-numeric">{sdrState.decoding_info.scan_rate_lpm} LPM</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="decoder-metric-row">
                      <span className="decoder-metric-lbl">Stereo Pilot</span>
                      <span className="decoder-metric-val green">LOCKED</span>
                    </div>
                    <div className="decoder-metric-row">
                      <span className="decoder-metric-lbl">Audio Peak</span>
                      <span className="decoder-metric-val font-numeric">
                        {sdrState.decoding_info.audio_freq_hz} Hz
                      </span>
                    </div>
                  </>
                )}
              </>
            )}

            {sdrState.mode === 'DAB' && (
              <>
                <div className="decoder-metric-row">
                  <span className="decoder-metric-lbl">Ensemble</span>
                  <span className="decoder-metric-val">{sdrState.decoding_info.ensemble}</span>
                </div>
                <div className="decoder-metric-row">
                  <span className="decoder-metric-lbl">Bit Error Rate</span>
                  <span className="decoder-metric-val font-numeric yellow">
                    {sdrState.decoding_info.ber}
                  </span>
                </div>
                <div className="decoder-metric-row">
                  <span className="decoder-metric-lbl">Audio Codec</span>
                  <span className="decoder-metric-val">{sdrState.decoding_info.codec} ({sdrState.decoding_info.bitrate_kbps}k)</span>
                </div>
              </>
            )}

            {sdrState.mode === 'DVB-T' && (
              <>
                <div className="decoder-metric-row">
                  <span className="decoder-metric-lbl">Carrier Status</span>
                  <span className="decoder-metric-val green">LOCKED (64-QAM)</span>
                </div>
                <div className="decoder-metric-row">
                  <span className="decoder-metric-lbl">Resolution</span>
                  <span className="decoder-metric-val font-numeric">{sdrState.decoding_info.resolution}</span>
                </div>
                <div className="decoder-metric-row">
                  <span className="decoder-metric-lbl">Bit Error Rate</span>
                  <span className="decoder-metric-val font-numeric green">
                    {sdrState.decoding_info.ber}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="decoder-hud-visuals">
            {(sdrState.mode === 'DAB' || sdrState.mode === 'DVB-T') && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <canvas ref={constellationCanvasRef} width={constSize} height={constSize} className={`sdr-constellation-canvas ${isFullscreen ? 'fullscreen' : ''}`} />
                <span style={{ fontSize: '0.45rem', color: '#5a7a9a', fontWeight: 'bold' }}>IQ DIAGRAM</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <canvas ref={videoCanvasRef} width={vidWidth} height={vidHeight} className={`sdr-video-canvas ${isFullscreen ? 'fullscreen' : ''}`} />
              <span style={{ fontSize: '0.45rem', color: '#5a7a9a', fontWeight: 'bold' }}>AUDIO WAVE</span>
            </div>
          </div>
        </div>

        {sdrState.mode === 'FM' && (
          sdrState.decoding_info.rds ? (
            <div className="rds-marquee-container">
              <div className="rds-station-name">{sdrState.decoding_info.rds.station}</div>
              <div className="rds-text-scroll">{sdrState.decoding_info.rds.text}</div>
            </div>
          ) : sdrState.decoding_info.satellite ? (
            <div className="rds-marquee-container">
              <div className="rds-station-name" style={{ color: '#00ff88', borderColor: 'rgba(0,255,136,0.3)' }}>DECODER</div>
              <div style={{ color: '#e0e6ed', fontSize: '0.55rem', fontWeight: 'bold' }}>
                {sdrState.decoding_info.audio_state}
              </div>
            </div>
          ) : null
        )}

        {sdrState.mode === 'DAB' && (
          <div className="rds-marquee-container">
            <div className="rds-station-name" style={{ color: '#00ff88', borderColor: 'rgba(0,255,136,0.3)' }}>SERVICE</div>
            <div style={{ color: '#e0e6ed', fontSize: '0.55rem', fontWeight: 'bold' }}>{sdrState.decoding_info.service}</div>
          </div>
        )}

        {sdrState.mode === 'DVB-T' && (
          <div className="rds-marquee-container">
            <div className="rds-station-name" style={{ color: '#ffea00', borderColor: 'rgba(255,234,0,0.3)' }}>CHANNEL</div>
            <div style={{ color: '#e0e6ed', fontSize: '0.55rem', fontWeight: 'bold' }}>{sdrState.decoding_info.channel}</div>
          </div>
        )}
      </div>
    );
  };

  const renderReceiverControls = () => (
    <div className="sdr-receiver-controls">
      <div className="controls-row flex-wrap">
        <button 
          className={`sdr-power-btn ${sdrState.is_receiving ? 'active' : 'inactive'}`} 
          onClick={toggleReceiver}
          title={sdrState.is_receiving ? "Matikan Aliran RF / Stop Receiver" : "Nyalakan Aliran RF / Start Receiver"}
        >
          <Power size={14} />
          <span>{sdrState.is_receiving ? 'STOP RX' : 'START RX'}</span>
        </button>

        {sdrState.is_receiving && (
          <>
            <button
              className={`sdr-rec-btn ${sdrState.recording_active ? 'recording' : ''}`}
              onClick={() => updateSetting('recording_active', !sdrState.recording_active)}
              title={sdrState.recording_active ? "Stop Recording IQ Data" : "Start Recording IQ Data (SDR# Sim)"}
            >
              <span className="rec-indicator-circle"></span>
              <span>{sdrState.recording_active ? 'STOP REC' : 'RECORD'}</span>
            </button>

            <button
              className={`sdr-scan-btn ${sdrState.scanner_active ? 'scanning' : ''}`}
              onClick={() => updateSetting('scanner_active', !sdrState.scanner_active)}
              title={sdrState.scanner_active ? "Stop Auto Frequency Scanner" : "Start Auto Frequency Scanner (SDR# Sim)"}
            >
              <span>{sdrState.scanner_active ? 'STOP SCAN' : 'SCAN'}</span>
            </button>

            <div className="sdr-audio-controls">
              <button 
                className={`sdr-mute-btn ${isMuted ? 'muted' : ''}`}
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
                    audioCtxRef.current.resume().catch(() => {});
                  }
                }}
                title={isMuted ? "Unmute Audio" : "Mute Audio"}
              >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <input 
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => {
                  setVolume(parseInt(e.target.value));
                  if (isMuted) setIsMuted(false);
                  if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
                    audioCtxRef.current.resume().catch(() => {});
                  }
                }}
                className="sdr-volume-slider"
                title={`Volume: ${volume}%`}
              />
            </div>
          </>
        )}

        <div className="freq-nudge-group">
          <button className="nudge-btn" onClick={() => adjustFreq(-1.0)} title="-1.0 MHz">-1M</button>
          <button className="nudge-btn" onClick={() => adjustFreq(-0.1)} title="-100 kHz">-100k</button>
          <button className="nudge-btn" onClick={() => adjustFreq(0.1)} title="+100 kHz">+100k</button>
          <button className="nudge-btn" onClick={() => adjustFreq(1.0)} title="+1.0 MHz">+1M</button>
        </div>
        
        <button 
          className={`sdr-settings-toggle-btn ${showSettings ? 'active' : ''}`}
          onClick={() => setShowSettings(!showSettings)}
          title="SDR Settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {showSettings && (
        <div className="sdr-settings-panel">
          {/* Hardware Device Selection */}
          <div className="setting-control-row">
            <span className="setting-label">Hardware Device</span>
            <div className="setting-btn-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {['rtl-sdr', 'airspy'].map(d => (
                <button 
                  key={d} 
                  className={`setting-btn ${sdrState.device_type === d ? 'active' : ''}`}
                  onClick={() => updateSetting('device_type', d)}
                >
                  {d === 'rtl-sdr' ? 'RTL-SDR Dongle' : 'Airspy SDR'}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-control-row">
            <span className="setting-label">Mode Demodulasi</span>
            <div className="setting-btn-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {['FM', 'AM', 'USB', 'LSB', 'DAB', 'DVB-T', 'CW', 'WFM', 'RAW'].map(m => (
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

          {/* Bandwidth selector */}
          <div className="setting-control-row">
            <span className="setting-label">Bandwidth Filter</span>
            <div className="setting-btn-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {[
                { label: '500 Hz (CW)', val: 500 },
                { label: '3 kHz (SSB)', val: 3000 },
                { label: '6 kHz (AM)', val: 6000 },
                { label: '12 kHz (NFM)', val: 12000 },
                { label: '25 kHz (NFM)', val: 25000 },
                { label: '150 kHz (WFM)', val: 150000 },
                { label: '250 kHz (WFM)', val: 250000 }
              ].map(b => (
                <button
                  key={b.val}
                  className={`setting-btn ${sdrState.bandwidth_hz === b.val ? 'active' : ''}`}
                  onClick={() => updateSetting('bandwidth_hz', b.val)}
                  title={b.label}
                  style={{ fontSize: '0.45rem', padding: '3px 1px' }}
                >
                  {b.val >= 1000 ? `${b.val/1000} kHz` : `${b.val} Hz`}
                </button>
              ))}
            </div>
          </div>

          {/* Waterfall Color Scheme selection */}
          <div className="setting-control-row">
            <span className="setting-label">Waterfall Theme</span>
            <div className="setting-btn-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {['Classic', 'Thermal', 'Green Phosphor', 'Blue Ice'].map(scheme => (
                <button
                  key={scheme}
                  className={`setting-btn ${sdrState.waterfall_scheme === scheme ? 'active' : ''}`}
                  onClick={() => updateSetting('waterfall_scheme', scheme)}
                  style={{ fontSize: '0.48rem' }}
                >
                  {scheme}
                </button>
              ))}
            </div>
          </div>

          {/* Sample Rate selection based on device type */}
          {sdrState.device_type === 'airspy' ? (
            <div className="setting-control-row">
              <span className="setting-label">Airspy Sample Rate</span>
              <div className="setting-btn-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {[2500000, 10000000].map(sr => (
                  <button 
                    key={sr} 
                    className={`setting-btn ${sdrState.sample_rate_hz === sr ? 'active' : ''}`}
                    onClick={() => updateSetting('sample_rate_hz', sr)}
                  >
                    {(sr / 1e6).toFixed(1)} MSPS
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="setting-control-row">
              <span className="setting-label">RTL-SDR Sample Rate</span>
              <div className="setting-btn-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {[1024000, 2048000, 2400000, 3200000].map(sr => (
                  <button 
                    key={sr} 
                    className={`setting-btn ${sdrState.sample_rate_hz === sr ? 'active' : ''}`}
                    onClick={() => updateSetting('sample_rate_hz', sr)}
                  >
                    {(sr / 1e6).toFixed(3)} MSPS
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Gain Controls (AGC or Airspy LNA/MIX/VGA sliders) */}
          {sdrState.device_type === 'airspy' ? (
            <div className="airspy-gain-sliders-container">
              <div className="setting-control-row">
                <span className="setting-label">LNA Gain: {sdrState.airspy_gain_lna}</span>
                <div className="slider-container">
                  <input 
                    type="range" min="0" max="15" 
                    value={sdrState.airspy_gain_lna} 
                    onChange={(e) => updateSetting('airspy_gain_lna', parseInt(e.target.value))}
                    className="setting-slider"
                  />
                </div>
              </div>
              <div className="setting-control-row" style={{ marginTop: '4px' }}>
                <span className="setting-label">Mixer Gain: {sdrState.airspy_gain_mix}</span>
                <div className="slider-container">
                  <input 
                    type="range" min="0" max="15" 
                    value={sdrState.airspy_gain_mix} 
                    onChange={(e) => updateSetting('airspy_gain_mix', parseInt(e.target.value))}
                    className="setting-slider"
                  />
                </div>
              </div>
              <div className="setting-control-row" style={{ marginTop: '4px' }}>
                <span className="setting-label">VGA Gain: {sdrState.airspy_gain_vga}</span>
                <div className="slider-container">
                  <input 
                    type="range" min="0" max="15" 
                    value={sdrState.airspy_gain_vga} 
                    onChange={(e) => updateSetting('airspy_gain_vga', parseInt(e.target.value))}
                    className="setting-slider"
                  />
                </div>
              </div>
              <div className="setting-control-row" style={{ marginTop: '6px' }}>
                <button 
                  className={`setting-btn ${sdrState.airspy_bias_tee ? 'active' : ''}`}
                  onClick={() => updateSetting('airspy_bias_tee', !sdrState.airspy_bias_tee)}
                  style={{ width: '100%', padding: '5px' }}
                >
                  Bias-Tee: {sdrState.airspy_bias_tee ? 'ON (12V/4.5V)' : 'OFF'}
                </button>
              </div>
            </div>
          ) : (
            <div className="setting-control-row">
              <span className="setting-label">RTL-SDR Gain</span>
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
          )}

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
  );

  const renderPresets = () => (
    <div className="sdr-presets-section">
      {presets.length > 0 && (
        <div className="preset-section-container">
          <span className="presets-section-title">PRESET PELACAKAN SATELIT</span>
          <div className="presets-grid">
            {presets.map((preset, idx) => {
              const isActive = Math.abs(tuningFreq - preset.freq) < 0.0001 && sdrState.mode === preset.mode;
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
        </div>
      )}

      <div className="preset-section-container" style={{ marginTop: presets.length > 0 ? '6px' : '0' }}>
        <span className="presets-section-title">PRESET TERESTRIAL & ALAT UJI</span>
        <div className="presets-grid">
          {terrestrialPresets.map((preset, idx) => {
            const isActive = Math.abs(tuningFreq - preset.freq) < 0.0001 && sdrState.mode === preset.mode;
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
      </div>
    </div>
  );

  return (
    <div className={`sdr-controller-box ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Header & Status Indicator */}
      <div className="sdr-ctrl-header">
        <div className="sdr-header-title">
          <Radio size={13} className="sdr-pulse-icon" />
          <span>KONTROL SDR & KONFIRMASI ALAT</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className={`sdr-status-badge ${serverStatus}`}>
            <span className="sdr-status-dot"></span>
            <span className="sdr-status-label">
              {serverStatus === 'checking' && 'MEMERIKSA API...'}
              {serverStatus === 'online' && 'SERVER: ONLINE'}
              {serverStatus === 'offline' && 'SERVER: OFFLINE'}
            </span>
          </div>

          {/* Fullscreen Button */}
          {setIsFullscreen && (
            <button 
              className="sdr-fullscreen-btn" 
              onClick={() => setIsFullscreen(!isFullscreen)} 
              title={isFullscreen ? "Exit Fullscreen" : "Maximize SDR Screen"}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
        </div>
      </div>

      {isFullscreen ? (
        <div className="sdr-fullscreen-layout">
          <div className="sdr-fs-controls-col">
            {renderDiagnosticsCard()}
            {renderAlertBanner()}
            {renderReceiverControls()}
            {renderPresets()}
            {renderTroubleshooting()}
          </div>
          <div className="sdr-fs-visuals-col">
            {renderWaterfall()}
            {renderDecoderHud()}
          </div>
        </div>
      ) : (
        <div className="sdr-standard-layout">
          {renderDiagnosticsCard()}
          {renderAlertBanner()}
          {renderTroubleshooting()}
          {renderWaterfall()}
          {renderDecoderHud()}
          {renderReceiverControls()}
          {renderPresets()}
        </div>
      )}
    </div>
  );
}
