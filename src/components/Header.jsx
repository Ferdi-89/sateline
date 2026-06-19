import React from 'react';
import { Globe, Map, Search, Compass } from 'lucide-react';

function Header({ 
  totalCount, 
  selectedSatelliteName, 
  viewMode, 
  setViewMode, 
  simTime,
  isSidebarOpen,
  setIsSidebarOpen,
  showObserverPanel,
  setShowObserverPanel,
}) {
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
        <span className="status-item live-indicator">
          <span className="live-dot"></span>
          <span className="live-text">LIVE</span>
        </span>
        <span className="status-item sat-count">
          <span className="status-label">SATELLITES:</span>
          <span className="status-value">{totalCount}</span>
        </span>
        <span className="status-item utc-time">
          <span className="status-label">UTC:</span>
          <span className="status-value">{utc}</span>
        </span>

        {/* View mode toggle & mobile panels toggle */}
        <span className="status-divider"></span>
        <div className="header-controls">
          <button
            className={`view-toggle-btn ${viewMode === '3d' ? 'active-3d' : ''}`}
            onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')}
            title={viewMode === '2d' ? 'Switch to 3D Globe (Cesium)' : 'Switch to 2D Map'}
          >
            {viewMode === '2d' ? (
              <>
                <Globe size={14} />
                <span className="btn-label">3D</span>
              </>
            ) : (
              <>
                <Map size={14} />
                <span className="btn-label">2D</span>
              </>
            )}
          </button>

          {/* Observer toggle button (visible on mobile, hides/shows observer dashboard) */}
          <button
            className={`view-toggle-btn mobile-only-btn ${showObserverPanel ? 'active-3d' : ''}`}
            onClick={() => setShowObserverPanel(!showObserverPanel)}
            title="Toggle Observer Panel"
          >
            <Compass size={14} />
            <span className="btn-label">Observer</span>
          </button>

          {/* Search/list toggle button (visible on mobile, hides/shows satellite list) */}
          <button
            className={`view-toggle-btn mobile-only-btn ${isSidebarOpen ? 'active-3d' : ''}`}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title="Toggle Satellite List"
          >
            <Search size={14} />
            <span className="btn-label">List</span>
          </button>
        </div>
      </div>

      {/* Selected satellite label (top-right, before sidebar) */}
      {selectedSatelliteName && (
        <div className={`selected-label ${isSidebarOpen ? '' : 'sidebar-collapsed'}`}>
          {selectedSatelliteName}
        </div>
      )}
    </>
  );
}

export default Header;
