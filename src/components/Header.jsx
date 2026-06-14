import React, { useState, useEffect } from 'react';

function Header({ totalCount, selectedSatelliteName }) {
  const [utc, setUtc] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtc(
        now.toISOString().slice(11, 19) + ' UTC'
      );
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

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
      </div>

      {/* Selected satellite label (top-right, before sidebar) */}
      {selectedSatelliteName && (
        <div className="selected-label">{selectedSatelliteName}</div>
      )}
    </>
  );
}

export default Header;
