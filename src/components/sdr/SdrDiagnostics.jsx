import { Cpu } from 'lucide-react';

export default function SdrDiagnostics({ sdrState, sdrsharpActive }) {
  const { physical_usb_detected, connected, driver_status, device_type, device_name } = sdrState;

  return (
    <div className="sdr-diagnostics-card">
      <div className="diag-grid">
        <DiagItem label="USB Connection" val={physical_usb_detected ? 'Connected' : 'Not Detected'}
          color={physical_usb_detected ? '#00c853' : '#ff3d00'} />
        <DiagItem label="Software Driver" val={connected ? 'Ready' : 'Not Configured'}
          color={connected ? '#00c853' : '#ffea00'} />
        <DiagItem label="SDR# Sync" val={sdrsharpActive ? 'Synced' : 'Standby'}
          color={sdrsharpActive ? '#00c853' : '#8fa0b5'} />
      </div>
      <div className="diag-footer">
        <Cpu size={10} style={{ color: '#5a7a9a', marginRight: 4 }} />
        <span className="diag-desc-text"><strong>Driver:</strong> {driver_status}</span>
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
