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
  } else if (name.includes('NOAA 15')) {
    list.push({ label: 'APT Downlink', freq: 137.620, mode: 'FM', desc: 'Weather Image Transmit (Real-time)' });
    list.push({ label: 'DSB Beacon', freq: 137.770, mode: 'FM', desc: 'Digital Space Beacon (Telemetry)' });
  } else if (name.includes('NOAA 18')) {
    list.push({ label: 'APT Downlink', freq: 137.9125, mode: 'FM', desc: 'Weather Image Transmit (Real-time)' });
    list.push({ label: 'DSB Beacon', freq: 137.350, mode: 'FM', desc: 'Digital Space Beacon (Telemetry)' });
  } else if (name.includes('NOAA 19')) {
    list.push({ label: 'APT Downlink', freq: 137.100, mode: 'FM', desc: 'Weather Image Transmit (Real-time)' });
    list.push({ label: 'DSB Beacon', freq: 137.890, mode: 'FM', desc: 'Digital Space Beacon (Telemetry)' });
  } else if (name.includes('METEOR-M') || name.includes('METEOR M')) {
    list.push({ label: 'LRPT Downlink', freq: 137.100, mode: 'FM', desc: 'Low Resolution Picture Transmission' });
    list.push({ label: 'LRPT Secondary', freq: 137.900, mode: 'FM', desc: 'Alternative Weather Picture Downlink' });
  } else if (name.includes('ISS') || name.includes('ARISS') || name.includes('ZARYA')) {
    list.push({ label: 'ISS Voice Downlink', freq: 437.800, mode: 'FM', desc: 'Crossband Repeater Downlink' });
    list.push({ label: 'ISS Packet Radio', freq: 145.825, mode: 'FM', desc: 'APRS 1200 Baud Simplex' });
    list.push({ label: 'ISS Voice Uplink', freq: 145.990, mode: 'FM', desc: 'Repeater Uplink (PL 67.0)' });
  } else if (name.includes('SO-50') || name.includes('SAUDISAT-1C')) {
    list.push({ label: 'SO-50 Downlink', freq: 436.795, mode: 'FM', desc: 'FM Voice Transponder' });
    list.push({ label: 'SO-50 Uplink', freq: 145.850, mode: 'FM', desc: 'Voice Uplink (PL 67.0)' });
  } else if (name.includes('AO-91') || name.includes('FOX-1B')) {
    list.push({ label: 'AO-91 Downlink', freq: 145.960, mode: 'FM', desc: 'Fox-1B Voice Repeater' });
    list.push({ label: 'AO-91 Uplink', freq: 435.250, mode: 'FM', desc: 'Voice Uplink (PL 67.0)' });
  } else if (name.includes('AO-92') || name.includes('FOX-1D')) {
    list.push({ label: 'AO-92 Downlink', freq: 145.880, mode: 'FM', desc: 'Fox-1D Voice Repeater' });
    list.push({ label: 'AO-92 Uplink U/V', freq: 435.350, mode: 'FM', desc: 'U/V FM Voice Uplink' });
    list.push({ label: 'AO-92 L-Band Up', freq: 1267.350, mode: 'FM', desc: 'L-Band FM Voice Uplink' });
  } else if (sat.category === 'gps') {
    if (name.includes('GLONASS')) {
      list.push({ label: 'GLONASS L1 Carrier', freq: 1602.000, mode: 'AM', desc: 'Ch 0 Primary L1 Carrier' });
      list.push({ label: 'GLONASS L2 Carrier', freq: 1246.000, mode: 'AM', desc: 'Ch 0 Secondary L2 Carrier' });
    } else if (name.includes('GALILEO')) {
      list.push({ label: 'Galileo E1 Carrier', freq: 1575.420, mode: 'AM', desc: 'E1 Open Service Signal' });
      list.push({ label: 'Galileo E5a Carrier', freq: 1176.450, mode: 'AM', desc: 'E5a Navigation Signal' });
      list.push({ label: 'Galileo E6 Signal', freq: 1278.750, mode: 'AM', desc: 'E6 High Accuracy Service' });
    } else if (name.includes('BEIDOU')) {
      list.push({ label: 'Beidou B1 Carrier', freq: 1561.098, mode: 'AM', desc: 'B1 Primary Signal' });
      list.push({ label: 'Beidou B2 Carrier', freq: 1207.140, mode: 'AM', desc: 'B2 Navigation Signal' });
    } else {
      list.push({ label: 'GPS L1 Carrier', freq: 1575.420, mode: 'AM', desc: 'GPS Primary Signal' });
      list.push({ label: 'GPS L2 Carrier', freq: 1227.600, mode: 'AM', desc: 'GPS Secondary Signal' });
    }
  } else if (sat.category === 'weather') {
    list.push({ label: 'NOAA APT Downlink', freq: 137.500, mode: 'FM', desc: 'Common APT Satellite Band' });
    list.push({ label: 'Meteor-M LRPT', freq: 137.100, mode: 'FM', desc: 'LRPT Digital Scan' });
  } else if (sat.category === 'starlink') {
    list.push({ label: 'Ku Beacon Downlink', freq: 1170.000, mode: 'FM', desc: 'Ku-Band Space Beacon' });
    list.push({ label: 'Ku Gateway Carrier', freq: 1220.000, mode: 'FM', desc: 'Ku-Band User Data Link' });
  } else if (name.includes('IRIDIUM')) {
    list.push({ label: 'Iridium Ring Alert', freq: 1626.270, mode: 'FM', desc: 'Simplex Ring Alert Broadcast' });
    list.push({ label: 'Iridium Data Link', freq: 1626.000, mode: 'FM', desc: 'Simplex Mobile Data Uplink/Down' });
  } else if (name.includes('ONEWEB')) {
    list.push({ label: 'Telemetry Beacon', freq: 1120.000, mode: 'FM', desc: 'OneWeb Space Telemetry Link' });
  } else {
    list.push({ label: 'Amateur CubeSat', freq: 437.500, mode: 'FM', desc: 'Common Downlink Beacon' });
    list.push({ label: 'Terrestrial VHF Test', freq: 145.825, mode: 'FM', desc: 'Common APRS Packet Frequency' });
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
