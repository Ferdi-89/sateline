import React from 'react';
import { Search, Radio, Compass, Orbit, MapPin, Navigation, Trash2 } from 'lucide-react';

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
  observerLocation,
  onSetObserverLocation,
  isPinMode,
  onSetPinMode,
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
    <div className="sidebar">
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

      {/* Observer Location Panel */}
      <div className="observer-panel" style={{
        margin: '12px 16px',
        padding: '12px',
        background: 'rgba(10, 22, 40, 0.5)',
        border: '1px dashed rgba(0, 229, 255, 0.15)',
        borderRadius: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#5a7a9a', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={11} style={{ color: '#ff3d00' }} />
            OBSERVER LOCATION
          </span>
          {observerLocation && (
            <button 
              onClick={() => onSetObserverLocation(null)}
              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
              title="Clear Location"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>

        <div style={{ fontSize: '0.75rem', color: observerLocation ? '#e0e6ed' : '#5a7a9a', fontWeight: observerLocation ? '600' : '400' }}>
          {observerLocation ? (
            <div className="font-numeric">
              {observerLocation.name === 'Dropped Pin' ? '📍 Dropped Pin' : '🛰️ GPS Location'}<br/>
              <span style={{ color: '#8fa0b5', fontSize: '10px' }}>
                {observerLocation.lat.toFixed(4)}°N, {observerLocation.lng.toFixed(4)}°E
              </span>
            </div>
          ) : (
            <span style={{ fontStyle: 'italic', fontSize: '10px' }}>Location not set. Enable GPS or use map pin.</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
          <button
            onClick={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    onSetObserverLocation({
                      lat: pos.coords.latitude,
                      lng: pos.coords.longitude,
                      name: 'My GPS Location',
                    });
                  },
                  (err) => {
                    alert('Geolocation error: ' + err.message);
                  }
                );
              } else {
                alert('Geolocation not supported by this browser.');
              }
            }}
            style={{
              flex: 1,
              background: 'rgba(0, 229, 255, 0.08)',
              border: '1px solid rgba(0, 229, 255, 0.25)',
              borderRadius: '3px',
              padding: '5px 8px',
              color: '#00e5ff',
              fontSize: '0.65rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0, 229, 255, 0.15)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0, 229, 255, 0.08)'}
          >
            <Navigation size={10} />
            USE GPS
          </button>

          <button
            onClick={() => onSetPinMode(!isPinMode)}
            style={{
              flex: 1,
              background: isPinMode ? '#ff3d00' : 'rgba(90, 122, 154, 0.08)',
              border: `1px solid ${isPinMode ? '#ff3d00' : 'rgba(90, 122, 154, 0.25)'}`,
              borderRadius: '3px',
              padding: '5px 8px',
              color: isPinMode ? '#ffffff' : '#e0e6ed',
              fontSize: '0.65rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => { if (!isPinMode) e.currentTarget.style.background = 'rgba(90, 122, 154, 0.15)'; }}
            onMouseOut={(e) => { if (!isPinMode) e.currentTarget.style.background = 'rgba(90, 122, 154, 0.08)'; }}
          >
            <MapPin size={10} />
            {isPinMode ? 'TAP ON MAP...' : 'DROP PIN'}
          </button>
        </div>
      </div>

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

export default Sidebar;
