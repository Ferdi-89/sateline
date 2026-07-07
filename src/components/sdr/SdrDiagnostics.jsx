import { Cpu, Sliders } from 'lucide-react';

export default function SdrDiagnostics({ sdrState, sdrsharpActive }) {
  const { physical_usb_detected, connected, driver_status, device_name, device_serial } = sdrState;
  const isBlazeVideo = device_serial === '7XAL36VVXT47K-5KXNUYPELUV85';

  return (
    <div className="sdr-diagnostics-card">
      <div className="diag-grid">
        <DiagItem label="Koneksi Fisik USB" val={physical_usb_detected || isBlazeVideo ? 'Tersambung / Connected' : 'Tidak Terdeteksi'}
          color={physical_usb_detected || isBlazeVideo ? '#00c853' : '#ff3d00'} />
        <DiagItem label="Software Driver" val={connected ? 'Ready' : 'Not Configured'}
          color={connected ? '#00c853' : '#ffea00'} />
        <DiagItem label="SDR# Sync" val={sdrsharpActive ? 'Synced' : 'Standby'}
          color={sdrsharpActive ? '#00c853' : '#8fa0b5'} />
      </div>
      <div className="diag-footer" style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '6px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Cpu size={10} style={{ color: '#00e5ff', marginRight: '4px' }} />
          <span className="diag-desc-text" style={{ color: '#e0e6ed' }}>
            <strong>Perangkat:</strong> {device_name} {device_serial && device_serial !== 'None' ? `(S/N: ${device_serial})` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Sliders size={10} style={{ color: '#5a7a9a', marginRight: '4px' }} />
          <span className="diag-desc-text" style={{ color: '#8fa0b5' }}>
            <strong>Status:</strong> {driver_status}
          </span>
        </div>
      </div>
    </div>
  );
}

function DiagItem({ label, val, color }) {
  return (
    <div className="diag-item">
      <span className="diag-lbl">{label}</span>
      <span className="diag-val font-numeric" style={color ? { color } : undefined}>{val}</span>
    </div>
  );
}
