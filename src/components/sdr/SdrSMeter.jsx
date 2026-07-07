/**
 * Professional S-Meter analog display
 * Maps dBm → S-unit (0..9+) per ITU-R standard
 */

function dbmToSValue(dbm) {
  if (dbm == null || isNaN(dbm)) return { text: 'S0', pct: 0 };
  if (dbm <= -121) return { text: 'S0', pct: 0 };
  if (dbm >= -73) {
    const over = Math.max(0, dbm - (-73));
    return { text: `S9+${Math.round(over)}dB`, pct: Math.min(100, 70 + (over / 40) * 30) };
  }
  const sVal = Math.round((dbm - (-121)) / 6);
  return { text: `S${sVal}`, pct: (sVal / 9) * 70 };
}

export default function SdrSMeter({ dbm }) {
  const { text, pct } = dbmToSValue(dbm);
  return (
    <div className="sdr-smeter-container">
      <span className="sdr-smeter-lbl font-numeric">{text}</span>
      <div className="sdr-smeter-bar-bg">
        <div className="sdr-smeter-bar-fill" style={{ width: `${pct}%` }} />
        <div className="sdr-smeter-ticks">
          {[1, 3, 5, 7, 9].map(t => (
            <span key={t} style={{ left: `${(t / 9) * 70}%` }}>{t}</span>
          ))}
          <span style={{ left: '85%' }}>+20</span>
          <span style={{ left: '96%' }}>+40</span>
        </div>
      </div>
      <span className="sdr-smeter-dbm font-numeric">{dbm != null ? `${dbm} dBm` : '— dBm'}</span>
    </div>
  );
}
