import React from 'react';
import { Navigation, MapPin, Trash2, Compass, Radio, AlertCircle } from 'lucide-react';

function ObserverPanel({
  observerLocation,
  onSetObserverLocation,
  isPinMode,
  onSetPinMode,
  isSidebarOpen = true,
}) {
  const handleGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onSetObserverLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            name: 'Lokasi GPS Saya / My GPS Location',
          });
        },
        (err) => {
          alert('Gagal mendapatkan lokasi GPS: ' + err.message);
        }
      );
    } else {
      alert('Geolokasi tidak didukung oleh browser Anda.');
    }
  };

  return (
    <div className={`observer-panel-floating ${isSidebarOpen ? '' : 'sidebar-collapsed'}`}>
      {/* Top Header Card */}
      <div className="observer-header">
        <span className="observer-title">
          <Compass size={13} className="observer-icon-spin" />
          OBSERVER STATION
        </span>
        {observerLocation ? (
          <div className="observer-status-badge locked">
            <span className="status-dot-blink green"></span>
            <span>LOCKED</span>
          </div>
        ) : (
          <div className="observer-status-badge empty">
            <span className="status-dot-blink orange"></span>
            <span>NO DATA</span>
          </div>
        )}
      </div>

      <div className="observer-body">
        {observerLocation ? (
          <div className="observer-telemetry font-numeric">
            <div className="telemetry-source">
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Radio size={10} className="telemetry-pulse-icon" />
                <span>{observerLocation.name === 'Dropped Pin' ? 'MAP PIN LOCATION' : 'GPS POSITION FIX'}</span>
              </div>
              
              <button
                onClick={() => {
                  onSetObserverLocation(null);
                  if (isPinMode) onSetPinMode(false);
                }}
                className="observer-clear-icon-btn"
                title="Reset Koordinat / Clear Position"
              >
                <Trash2 size={11} />
              </button>
            </div>

            <div className="telemetry-coords-grid">
              <div className="telemetry-coord-box">
                <span className="coord-lbl">LATITUDE</span>
                <span className="coord-val">
                  {Math.abs(observerLocation.lat).toFixed(5)}°
                  <span className="coord-dir">{observerLocation.lat >= 0 ? 'N' : 'S'}</span>
                </span>
              </div>
              <div className="telemetry-coord-box">
                <span className="coord-lbl">LONGITUDE</span>
                <span className="coord-val">
                  {Math.abs(observerLocation.lng).toFixed(5)}°
                  <span className="coord-dir">{observerLocation.lng >= 0 ? 'E' : 'W'}</span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="observer-unconfigured">
            <AlertCircle size={16} className="unconfigured-warning-icon" />
            <div className="unconfigured-text">
              <p className="unconfigured-title">Koordinat Kosong / No Data</p>
              <p className="unconfigured-desc">Aktifkan GPS atau tekan "Drop Pin" lalu tandai lokasi pengamat langsung pada peta.</p>
            </div>
          </div>
        )}
      </div>

      <div className="observer-actions">
        <button
          onClick={handleGPS}
          className="observer-btn-premium gps-btn"
          title="Sinkronisasi lokasi perangkat menggunakan GPS"
        >
          <div className="btn-icon-wrapper">
            <Navigation size={12} className="btn-icon-gps" />
          </div>
          <span>USE GPS</span>
        </button>

        <button
          onClick={() => onSetPinMode(!isPinMode)}
          className={`observer-btn-premium pin-btn ${isPinMode ? 'active-pinning' : ''}`}
          title="Pilih lokasi secara manual dengan mengeklik area peta"
        >
          <div className="btn-icon-wrapper">
            <MapPin size={12} className="btn-icon-pin" />
          </div>
          <span>{isPinMode ? 'TAP ON MAP...' : 'DROP PIN'}</span>
        </button>
      </div>
    </div>
  );
}

export default React.memo(ObserverPanel);
