import React from 'react';

function Legend({ isOpen = true }) {
  return (
    <div className={`legend-panel ${isOpen ? '' : 'collapsed'}`}>
      <span className="legend-item">
        <span className="legend-dot station"></span> Space Station
      </span>
      <span className="legend-item">
        <span className="legend-dot gps"></span> GPS
      </span>
      <span className="legend-item">
        <span className="legend-dot starlink"></span> Starlink
      </span>
      <span className="legend-item">
        <span className="legend-dot weather"></span> Weather
      </span>
      <span className="legend-item">
        <span className="legend-dot other"></span> Other
      </span>
    </div>
  );
}

export default React.memo(Legend);
