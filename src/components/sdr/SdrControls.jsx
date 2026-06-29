import { Volume2, VolumeX, Power, Square, Radio } from 'lucide-react';

export default function SdrControls({
  isReceiving, onToggle,
  recordingActive, onToggleRecording,
  scannerActive, onToggleScanner,
  volume, onVolumeChange, isMuted, onMuteToggle,
  onAdjustFreq,
  onToggleSettings,
}) {
  return (
    <div className="sdr-receiver-controls">
      <div className="controls-row flex-wrap">
        {/* START/STOP RX */}
        <button
          className={`sdr-power-btn ${isReceiving ? 'active' : 'inactive'}`}
          onClick={onToggle}
          title={isReceiving ? 'Stop RF Stream' : 'Start RF Stream'}
        >
          <Power size={14} />
          <span>{isReceiving ? 'STOP' : 'START'}</span>
          {isReceiving && <span className="rx-blink-dot"></span>}
        </button>

        {isReceiving && (
          <>
            {/* RECORD */}
            <button
              className={`sdr-rec-btn ${recordingActive ? 'recording' : ''}`}
              onClick={onToggleRecording}
              title={recordingActive ? 'Stop Recording' : 'Start IQ Recording'}
            >
              <span className="rec-indicator-circle"></span>
              <span>{recordingActive ? 'STOP REC' : 'RECORD'}</span>
            </button>

            {/* SCAN */}
            <button
              className={`sdr-scan-btn ${scannerActive ? 'scanning' : ''}`}
              onClick={onToggleScanner}
              title={scannerActive ? 'Stop Scanner' : 'Auto Frequency Scanner'}
            >
              <span>{scannerActive ? 'STOP SCAN' : 'SCAN'}</span>
            </button>

            {/* AUDIO */}
            <div className="sdr-audio-controls">
              <button className={`sdr-mute-btn ${isMuted ? 'muted' : ''}`} onClick={onMuteToggle} title={isMuted ? 'Unmute' : 'Mute'}>
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <input
                type="range" min="0" max="100" value={volume}
                onChange={e => onVolumeChange(parseInt(e.target.value))}
                className="sdr-volume-slider" title={`Volume: ${volume}%`}
              />
            </div>
          </>
        )}

        {/* FREQ NUDGE */}
        <div className="freq-nudge-group">
          <button className="nudge-btn" onClick={() => onAdjustFreq(-1.0)} title="-1.0 MHz">-1M</button>
          <button className="nudge-btn" onClick={() => onAdjustFreq(-0.1)} title="-100 kHz">-100k</button>
          <button className="nudge-btn" onClick={() => onAdjustFreq(0.1)} title="+100 kHz">+100k</button>
          <button className="nudge-btn" onClick={() => onAdjustFreq(1.0)} title="+1.0 MHz">+1M</button>
        </div>

        {/* SETTINGS GEAR */}
        <button
          className={`sdr-settings-toggle-btn ${onToggleSettings ? 'active' : ''}`}
          onClick={onToggleSettings}
          title="SDR Settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </div>
  );
}
