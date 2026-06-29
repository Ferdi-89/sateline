const BANDWIDTHS = [
  { label: '500 Hz (CW)', val: 500 },
  { label: '3 kHz (SSB)', val: 3000 },
  { label: '6 kHz (AM)', val: 6000 },
  { label: '12 kHz (NFM)', val: 12000 },
  { label: '25 kHz (NFM)', val: 25000 },
  { label: '150 kHz (WFM)', val: 150000 },
  { label: '250 kHz (WFM)', val: 250000 },
];

const MODES = ['FM', 'AM', 'USB', 'LSB', 'DAB', 'DVB-T', 'CW', 'WFM', 'RAW'];
const SCHEMES = ['Classic', 'Thermal', 'Green Phosphor', 'Blue Ice'];
const RTL_SRS = [1024000, 2048000, 2400000, 3200000];
const AIRSPY_SRS = [2500000, 10000000];
const RTL_GAINS = ['auto', '20.7', '32.8', '49.6'];

export default function SdrSettings({
  sdrState, onUpdate,
  showSettings,
}) {
  if (!showSettings) return null;

  const isAirspy = sdrState.device_type === 'airspy';

  return (
    <div className="sdr-settings-panel" style={{ marginTop: 8 }}>
      {/* Device */}
      <SettingRow label="Hardware Device">
        <SettingGrid cols={2}>
          {['rtl-sdr', 'airspy'].map(d => (
            <SettingBtn key={d} active={sdrState.device_type === d} onClick={() => onUpdate('device_type', d)}>
              {d === 'rtl-sdr' ? 'RTL-SDR Dongle' : 'Airspy SDR'}
            </SettingBtn>
          ))}
        </SettingGrid>
      </SettingRow>

      {/* Mode */}
      <SettingRow label="Demodulation Mode">
        <SettingGrid cols={3}>
          {MODES.map(m => (
            <SettingBtn key={m} active={sdrState.mode === m} onClick={() => onUpdate('mode', m)}>{m}</SettingBtn>
          ))}
        </SettingGrid>
      </SettingRow>

      {/* Bandwidth */}
      <SettingRow label="Bandwidth Filter">
        <SettingGrid cols={4}>
          {BANDWIDTHS.map(b => (
            <SettingBtn key={b.val} active={sdrState.bandwidth_hz === b.val} onClick={() => onUpdate('bandwidth_hz', b.val)} title={b.label}>
              {b.val >= 1000 ? `${b.val / 1000} kHz` : `${b.val} Hz`}
            </SettingBtn>
          ))}
        </SettingGrid>
      </SettingRow>

      {/* Waterfall Theme */}
      <SettingRow label="Waterfall Theme">
        <SettingGrid cols={4}>
          {SCHEMES.map(s => (
            <SettingBtn key={s} active={sdrState.waterfall_scheme === s} onClick={() => onUpdate('waterfall_scheme', s)}>{s}</SettingBtn>
          ))}
        </SettingGrid>
      </SettingRow>

      {/* Sample Rate */}
      <SettingRow label={isAirspy ? 'Airspy Sample Rate' : 'RTL-SDR Sample Rate'}>
        <SettingGrid cols={2}>
          {(isAirspy ? AIRSPY_SRS : RTL_SRS).map(sr => (
            <SettingBtn key={sr} active={sdrState.sample_rate_hz === sr} onClick={() => onUpdate('sample_rate_hz', sr)}>
              {(sr / 1e6).toFixed(isAirspy ? 1 : 3)} MSPS
            </SettingBtn>
          ))}
        </SettingGrid>
      </SettingRow>

      {/* Gain */}
      {isAirspy ? (
        <>
          {['airspy_gain_lna', 'airspy_gain_mix', 'airspy_gain_vga'].map(k => (
            <SettingRow key={k} label={`${k.replace('airspy_gain_', '').toUpperCase()} Gain: ${sdrState[k]}`}>
              <input type="range" min="0" max="15" value={sdrState[k]}
                onChange={e => onUpdate(k, parseInt(e.target.value))}
                className="setting-slider" />
            </SettingRow>
          ))}
          <SettingRow label="Bias-Tee">
            <button
              className={`setting-btn ${sdrState.airspy_bias_tee ? 'active' : ''}`}
              onClick={() => onUpdate('airspy_bias_tee', !sdrState.airspy_bias_tee)}
              style={{ width: '100%', padding: 5 }}>
              {sdrState.airspy_bias_tee ? 'ON (12V/4.5V)' : 'OFF'}
            </button>
          </SettingRow>
        </>
      ) : (
        <SettingRow label="RTL-SDR Gain">
          <SettingGrid cols={4}>
            {RTL_GAINS.map(g => (
              <SettingBtn key={g} active={sdrState.gain_db === g} onClick={() => onUpdate('gain_db', g)}>
                {g === 'auto' ? 'AGC' : g + 'dB'}
              </SettingBtn>
            ))}
          </SettingGrid>
        </SettingRow>
      )}

      {/* Squelch */}
      <SettingRow label={`Squelch: ${sdrState.squelch} dB`}>
        <div className="slider-container">
          <input type="range" min="-100" max="0" value={sdrState.squelch}
            onChange={e => onUpdate('squelch', parseInt(e.target.value))}
            className="setting-slider" />
          <span className="slider-val font-numeric">{sdrState.squelch} dB</span>
        </div>
      </SettingRow>
    </div>
  );
}

function SettingRow({ label, children }) {
  return (
    <div className="setting-control-row">
      <span className="setting-label">{label}</span>
      {children}
    </div>
  );
}
function SettingGrid({ cols, children }) {
  return <div className="setting-btn-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>{children}</div>;
}
function SettingBtn({ active, onClick, children, ...rest }) {
  return (
    <button className={`setting-btn ${active ? 'active' : ''}`} onClick={onClick} {...rest}>
      {children}
    </button>
  );
}
