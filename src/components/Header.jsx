import React from 'react';
import { Globe, Map } from 'lucide-react';

function Header({ totalCount, selectedSatelliteName, viewMode, setViewMode, simTime }) {
  const utc = simTime ? simTime.toISOString().slice(11, 19) + ' UTC' : 'N/A';

  return (
    <>
      {/* Top-left brand panel */}
      <div className="header-panel">
        <p className="header-label">Real-Time</p>
        <h1 className="header-title">Satellite Tracker</h1>
      </div>

      {/* Top-center status bar */}
      <div className="status-bar">
        <span className="status-item">
          <span className="live-dot"></span>
          <span className="live-text">LIVE</span>
        </span>
        <span className="status-item">
          <span className="status-label">SATELLITES:</span>
          <span className="status-value">{totalCount}</span>
        </span>
        <span className="status-item">
          <span className="status-label">UTC:</span>
          <span className="status-value">{utc}</span>
        </span>

        {/* View mode toggle */}
        <span className="status-divider"></span>
        <button
          className={`view-toggle-btn ${viewMode === '3d' ? 'active-3d' : ''}`}
          onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')}
          title={viewMode === '2d' ? 'Switch to 3D Globe (Cesium)' : 'Switch to 2D Map'}
        >
          {viewMode === '2d' ? (
            <>
              <Globe size={14} />
              <span>3D</span>
            </>
          ) : (
            <>
              <Map size={14} />
              <span>2D</span>
            </>
          )}
        </button>
      </div>

      {/* Selected satellite label (top-right, before sidebar) */}
      {selectedSatelliteName && (
        <div className="selected-label">{selectedSatelliteName}</div>
      )}
    </>
  );
}

export default Header;
