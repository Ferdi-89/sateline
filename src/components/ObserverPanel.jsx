import React from 'react';
import { Navigation, MapPin, Trash2, Compass } from 'lucide-react';

export default function ObserverPanel({
  observerLocation,
  onSetObserverLocation,
  isPinMode,
  onSetPinMode,
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
    <div className="observer-panel-floating">
      <div className="observer-header">
        <span className="observer-title">
          <Compass size={13} className="observer-icon-spin" />
          STASIUN PENGAMAT / OBSERVER
        </span>
        {observerLocation && (
          <button
            onClick={() => {
              onSetObserverLocation(null);
              if (isPinMode) onSetPinMode(false);
            }}
            className="observer-clear-btn"
            title="Hapus Lokasi / Clear Location"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <div className="observer-body">
        {observerLocation ? (
          <div className="observer-coords font-numeric">
            <span className="coords-source">
              {observerLocation.name === 'Dropped Pin' ? '📍 PIN PETA / DROPPED PIN' : '🛰️ LOKASI GPS / GPS LOCATION'}
            </span>
            <span className="coords-values">
              {Math.abs(observerLocation.lat).toFixed(4)}°{observerLocation.lat >= 0 ? 'N' : 'S'}, {Math.abs(observerLocation.lng).toFixed(4)}°{observerLocation.lng >= 0 ? 'E' : 'W'}
            </span>
          </div>
        ) : (
          <div className="observer-placeholder">
            <p className="placeholder-main">Koordinat Pengamat Kosong</p>
            <p className="placeholder-sub">Aktifkan GPS atau letakkan pin pada peta untuk memprediksi lintasan terlihat.</p>
          </div>
        )}
      </div>

      <div className="observer-footer">
        <button
          onClick={handleGPS}
          className="observer-action-btn gps-btn"
          title="Gunakan lokasi GPS perangkat Anda"
        >
          <Navigation size={11} />
          <span>USE GPS</span>
        </button>

        <button
          onClick={() => onSetPinMode(!isPinMode)}
          className={`observer-action-btn pin-btn ${isPinMode ? 'active-pinning' : ''}`}
          title="Tandai koordinat dengan pin langsung di peta"
        >
          <MapPin size={11} />
          <span>{isPinMode ? 'TAP ON MAP...' : 'DROP PIN'}</span>
        </button>
      </div>
    </div>
  );
}
