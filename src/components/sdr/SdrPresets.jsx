/**
 * Satellite-specific & terrestrial RX presets.
 * Each returns { label, freq (MHz), mode, desc }.
 */

export function getSatellitePresets(sat) {
  if (!sat) return [];
  const list = [];
  const name = sat.name.toUpperCase();

  if (name.includes('LAPAN-A2') || name.includes('IO-86')) {
    list.push(
      { label: 'Downlink FM Voice', freq: 435.880, mode: 'FM', desc: 'Repeter Suara / Voice Repeater' },
      { label: 'APRS Telemetry',    freq: 145.825, mode: 'FM', desc: 'Disaster APRS Packet 1200bd' },
      { label: 'Uplink FM Voice',   freq: 145.880, mode: 'FM', desc: 'Voice Uplink (PL 88.5 Hz)' },
    );
  } else if (name.includes('TELKOM-4') || name.includes('MERAH PUTI')) {
    list.push(
      { label: 'C-Band Beacon (RF)', freq: 4199.000, mode: 'FM',  desc: 'Telemetry Beacon Carrier' },
      { label: 'C-Band LNB IF',      freq: 951.000,  mode: 'WFM', desc: 'LNB IF (LO: 5150 MHz)' },
      { label: 'DTH Transponder',    freq: 3800.000,  mode: 'DVB-T', desc: 'Satellite TV Mux' },
    );
  } else if (name.includes('BRISAT')) {
    list.push(
      { label: 'C-Band Beacon (RF)', freq: 4185.000, mode: 'FM',  desc: 'Telemetry Beacon' },
      { label: 'C-Band LNB IF',      freq: 965.000,  mode: 'FM',  desc: 'LNB IF (LO: 5150 MHz)' },
      { label: 'Ku-Band Downlink',   freq: 12200.000, mode: 'DVB-T', desc: 'Ku-Band DTH Mux' },
    );
  } else if (name.includes('SATRIA-1') || name.includes('NUSANTARA')) {
    list.push(
      { label: 'Ka-Band Beacon (RF)', freq: 20200.000, mode: 'FM',  desc: 'HTS Telemetry Beacon' },
      { label: 'Ka-Band LNB IF',      freq: 950.000,   mode: 'FM',  desc: 'LNB IF (LO: 19.25 GHz)' },
      { label: 'Broadband Data',      freq: 19950.000,  mode: 'DAB', desc: 'Ka-Band VSAT Stream' },
    );
  } else if (sat.category === 'weather') {
    if (name.includes('NOAA 15')) list.push({ label: 'APT Downlink', freq: 137.620, mode: 'FM', desc: 'NOAA 15 APT 137.62 MHz' });
    else if (name.includes('NOAA 18')) list.push({ label: 'APT Downlink', freq: 137.9125, mode: 'FM', desc: 'NOAA 18 APT 137.9125 MHz' });
    else if (name.includes('NOAA 19')) list.push({ label: 'APT Downlink', freq: 137.100, mode: 'FM', desc: 'NOAA 19 APT 137.1 MHz' });
    else list.push({ label: 'NOAA APT Band', freq: 137.500, mode: 'FM', desc: 'APT Weather Satellite Band' });
    list.push({ label: 'HRPT Downlink', freq: 1698.000, mode: 'FM', desc: 'High Rate Picture Transmit' });
  } else if (sat.category === 'gps') {
    list.push(
      { label: 'L1 C/A',    freq: 1575.420, mode: 'AM', desc: 'GPS L1 Coarse Acquisition' },
      { label: 'L2 P(Y)',   freq: 1227.600, mode: 'AM', desc: 'GPS L2 Encrypted P(Y) Code' },
    );
  } else if (name.includes('ISS')) {
    list.push(
      { label: 'ISS FM Voice',    freq: 437.800, mode: 'FM', desc: 'NA1SS Crossband Repeater' },
      { label: 'ISS APRS Packet', freq: 145.825, mode: 'FM', desc: 'RS0ISS APRS Digipeater' },
    );
  } else {
    list.push(
      { label: 'Amateur Beacon', freq: 437.500, mode: 'FM', desc: 'Generic CubeSat Beacon' },
      { label: 'Weather Sat',    freq: 137.100, mode: 'FM', desc: 'NOAA APT Downlink' },
    );
  }
  return list;
}

export const TERRESTRIAL_PRESETS = [
  { label: 'Prambors FM (Jakarta)',   freq: 97.4,   mode: 'FM',   desc: 'Radio Musik Terestrial Analog' },
  { label: 'MUX DAB+ (Digital)',      freq: 229.072, mode: 'DAB',  desc: 'Digital Audio Broadcasting Band III' },
  { label: 'TVRI Digital (DVB-T2)',   freq: 578.0,   mode: 'DVB-T', desc: 'Digital Video Broadcast - Terrestrial' },
  { label: 'Airband Tower (ATC)',     freq: 118.500, mode: 'AM',   desc: 'VHF Airband Bandar Udara' },
  { label: 'Marine VHF Ch. 16',       freq: 156.800, mode: 'FM',   desc: 'Marine International Distress' },
  { label: 'CB Radio (AM)',           freq: 27.185,  mode: 'AM',   desc: 'Citizens Band Channel 19' },
];

export default function SdrPresets({ presets, tuningFreq, sdrMode, onTune }) {
  return (
    <div className="sdr-presets-section">
      {/* Satellite presets */}
      {presets.length > 0 && (
        <div className="preset-section-container">
          <span className="presets-section-title">SATELLITE TRACKING PRESETS</span>
          <div className="presets-grid">
            {presets.map((p, i) => {
              const active = Math.abs(tuningFreq - p.freq) < 0.0001 && sdrMode === p.mode;
              return (
                <button key={i} className={`preset-pill-btn ${active ? 'active' : ''}`}
                  onClick={() => onTune(p.freq, p.mode)}>
                  <div className="preset-pill-top">
                    <span className="preset-pill-name">{p.label}</span>
                    <span className="preset-pill-freq font-numeric">{p.freq.toFixed(3)} MHz</span>
                  </div>
                  <span className="preset-pill-desc">{p.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Terrestrial presets */}
      <div className="preset-section-container" style={{ marginTop: presets.length > 0 ? 6 : 0 }}>
        <span className="presets-section-title">TERRESTRIAL & TEST PRESETS</span>
        <div className="presets-grid">
          {TERRESTRIAL_PRESETS.map((p, i) => {
            const active = Math.abs(tuningFreq - p.freq) < 0.0001 && sdrMode === p.mode;
            return (
              <button key={i} className={`preset-pill-btn ${active ? 'active' : ''}`}
                onClick={() => onTune(p.freq, p.mode)}>
                <div className="preset-pill-top">
                  <span className="preset-pill-name">{p.label}</span>
                  <span className="preset-pill-freq font-numeric">{p.freq.toFixed(3)} MHz</span>
                </div>
                <span className="preset-pill-desc">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
