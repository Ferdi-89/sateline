import React from 'react';
import { Search, Radio, Orbit } from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'ALL SATS' },
  { id: 'station', label: 'SPACE STATIONS' },
  { id: 'starlink', label: 'STARLINK' },
  { id: 'gps', label: 'GPS OPS' },
  { id: 'weather', label: 'WEATHER' },
  { id: 'other', label: 'OTHER SATS' },
];

const CATEGORY_COLORS = {
  all:      '#e0e6ed',
  station:  '#00e5ff',
  gps:      '#00c853',
  weather:  '#ff6d00',
  starlink: '#9ca3af',
  other:    '#5a7a9a',
};

function Sidebar({ 
  satellites, 
  allSatellites, 
  category, 
  setCategory, 
  searchQuery, 
  setSearchQuery, 
  selectedSatellite, 
  onSelectSatellite,
  isOpen = true,
}) {
  // Compute counts per category from allSatellites
  const counts = {};
  counts.all = allSatellites.length;
  CATEGORIES.forEach(c => {
    if (c.id !== 'all') {
      counts[c.id] = allSatellites.filter(s => s.category === c.id).length;
    }
  });

  const getBadgeLabel = (cat) => {
    switch (cat) {
      case 'station': return 'STATION';
      case 'gps': return 'GPS';
      case 'weather': return 'WEATHER';
      case 'starlink': return 'STARLINK';
      default: return 'OTHER';
    }
  };

  const getNoradId = (tle1) => {
    try {
      return tle1.substring(2, 7).trim();
    } catch {
      return '—';
    }
  };

  return (
    <div className={`sidebar ${isOpen ? '' : 'collapsed'}`}>
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <div className="sidebar-header-main">
          <Orbit className="sidebar-header-icon" size={16} />
          <h2 className="sidebar-title">ORBITAL TRACKER</h2>
        </div>
        <div className="sidebar-subtitle-row">
          <p className="sidebar-subtitle">{allSatellites.length} objects tracked</p>
          <span className="sidebar-live">
            <span className="live-dot"></span>
            <span className="live-text">LIVE</span>
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="search-bar">
        <Search size={14} color="#5a7a9a" />
        <input
          type="text"
          placeholder="Search objects by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="search-clear-btn" onClick={() => setSearchQuery('')} title="Clear search">
            &times;
          </button>
        )}
      </div>

      {/* Category Grid */}
      <div className="categories">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            className={`category-btn ${c.id} ${category === c.id ? 'active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            <span className="category-btn-label">{c.label}</span>
            <span className="category-btn-count">{counts[c.id] || 0}</span>
          </button>
        ))}
      </div>

      {/* Observer Location Panel has been moved to floating map widget (ObserverPanel) */}

      {/* Satellite List Header */}
      <div className="satellite-list-header">
        <span>TRACKED OBJECTS ({satellites.length})</span>
        <span>DISPLAYING FIRST 200</span>
      </div>
      
      <div className="satellite-list">
        {satellites.length === 0 ? (
          <div className="no-sats-found">
            <Radio size={24} className="no-sats-icon" />
            <p>No objects matching search query</p>
          </div>
        ) : (
          satellites.slice(0, 200).map((sat, idx) => {
            const isSel = selectedSatellite && 
                          selectedSatellite.name === sat.name && 
                          selectedSatellite.tle1 === sat.tle1;
            const color = CATEGORY_COLORS[sat.category] || CATEGORY_COLORS.other;

            return (
              <div
                key={`${sat.name}-${idx}`}
                className={`satellite-item ${isSel ? 'selected' : ''}`}
                style={{ '--sat-color': color }}
                onClick={() => onSelectSatellite(sat)}
              >
                <div className="sat-info">
                  <span className="sat-name" title={sat.name}>{sat.name}</span>
                  <div className="sat-meta">
                    <span className="sat-id font-numeric">NORAD #{getNoradId(sat.tle1)}</span>
                    {isSel && (
                      <span className="sat-status-pulse">
                        <span className="pulse-dot"></span>
                        TRACKING
                      </span>
                    )}
                  </div>
                </div>
                <span className={`sat-badge ${sat.category || 'other'}`}>
                  {getBadgeLabel(sat.category)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default React.memo(Sidebar);
