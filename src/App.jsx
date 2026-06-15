import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Legend from './components/Legend';
import SelectedSatellitePanel from './components/SelectedSatellitePanel';
import TimeControls from './components/TimeControls';

// Lazy-load CesiumMapView (heavy dependency ~30MB) only when user toggles to 3D
const CesiumMapView = lazy(() => import('./components/CesiumMapView'));

// CelesTrak groups to fetch, each tagged with a category
const GROUPS = [
  { group: 'stations',  category: 'station'  },
  { group: 'gps-ops',   category: 'gps'      },
  { group: 'glonass',   category: 'gps'      },
  { group: 'galileo',   category: 'gps'      },
  { group: 'weather',   category: 'weather'  },
  { group: 'starlink',  category: 'starlink', limit: 2000 },
  { group: 'iridium',   category: 'other'    },
  { group: 'oneweb',    category: 'other'    },
  { group: 'resource',  category: 'other'    },
  { group: 'science',   category: 'other'    },
  { group: 'visual',    category: 'other'    },
];

// Parse raw TLE text into array of { name, tle1, tle2, category }
function parseTLE(text, category) {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  const sats = [];
  for (let i = 0; i < lines.length; i += 3) {
    if (lines[i] && lines[i + 1] && lines[i + 2]) {
      sats.push({
        name: lines[i].trim(),
        tle1: lines[i + 1].trim(),
        tle2: lines[i + 2].trim(),
        category,
      });
    }
  }
  return sats;
}

function App() {
  const [allSatellites, setAllSatellites] = useState([]);
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('2d'); // '2d' | '3d'
  const [isCameraLocked, setIsCameraLocked] = useState(false);
  
  // Time Simulation State
  const [isPaused, setIsPaused] = useState(false);
  const [timeMultiplier, setTimeMultiplier] = useState(1);
  const [simTime, setSimTime] = useState(new Date());

  // 5Hz Simulated clock tick for UI updates (Header and Detail Panel)
  useEffect(() => {
    let lastTime = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTime;
      lastTime = now;
      if (!isPaused) {
        setSimTime(prev => new Date(prev.getTime() + delta * timeMultiplier));
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isPaused, timeMultiplier]);

  const handleResetTime = () => {
    setSimTime(new Date());
    setTimeMultiplier(1);
    setIsPaused(false);
  };

  // Reset camera lock when satellite selection changes
  useEffect(() => {
    setIsCameraLocked(false);
  }, [selectedSatellite]);

  // Fetch multiple TLE groups in parallel and merge
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          GROUPS.map(async ({ group, category: cat, limit }) => {
            try {
              const res = await fetch(
                `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`
              );
              if (!res.ok) return [];
              const text = await res.text();
              let sats = parseTLE(text, cat);
              if (limit) sats = sats.slice(0, limit);
              return sats;
            } catch {
              return [];
            }
          })
        );
        // Merge all groups; deduplicate by name
        const seen = new Set();
        const merged = [];
        results.flat().forEach(sat => {
          if (!seen.has(sat.name)) {
            seen.add(sat.name);
            merged.push(sat);
          }
        });
        setAllSatellites(merged);
      } catch (err) {
        console.error('Failed to fetch satellite data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // Filter by category and search
  const filteredSatellites = useMemo(() => {
    let sats = allSatellites;
    if (category !== 'all') {
      sats = sats.filter(s => s.category === category);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      sats = sats.filter(s => s.name.toLowerCase().includes(q));
    }
    return sats;
  }, [allSatellites, category, searchQuery]);

  return (
    <div className="app-container">
      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p className="loading-text">Establishing connection with satellites...</p>
        </div>
      )}

      {/* Full-screen map — 2D Canvas or 3D Cesium Globe */}
      <div className="map-area">
        {viewMode === '2d' ? (
          <MapView
            satellites={allSatellites}
            selectedSatellite={selectedSatellite}
            onSelectSatellite={setSelectedSatellite}
            simTime={simTime}
            isPaused={isPaused}
            timeMultiplier={timeMultiplier}
          />
        ) : (
          <Suspense fallback={
            <div className="cesium-loading">
              <div className="spinner"></div>
              <p className="loading-text">Initializing 3D Globe...</p>
            </div>
          }>
            <CesiumMapView
              satellites={allSatellites}
              selectedSatellite={selectedSatellite}
              onSelectSatellite={setSelectedSatellite}
              simTime={simTime}
              isPaused={isPaused}
              timeMultiplier={timeMultiplier}
              isCameraLocked={isCameraLocked}
            />
          </Suspense>
        )}
      </div>

      {/* Time Controls (floating above map) */}
      <TimeControls
        isPaused={isPaused}
        setIsPaused={setIsPaused}
        timeMultiplier={timeMultiplier}
        setTimeMultiplier={setTimeMultiplier}
        onResetTime={handleResetTime}
      />

      {/* Header panels */}
      <Header
        totalCount={allSatellites.length}
        selectedSatelliteName={selectedSatellite?.name || null}
        viewMode={viewMode}
        setViewMode={setViewMode}
        simTime={simTime}
      />

      {/* Left detail panel */}
      {selectedSatellite && (
        <SelectedSatellitePanel
          satellite={selectedSatellite}
          onClose={() => setSelectedSatellite(null)}
          simTime={simTime}
          viewMode={viewMode}
          isCameraLocked={isCameraLocked}
          setIsCameraLocked={setIsCameraLocked}
        />
      )}

      {/* Right sidebar */}
      <Sidebar
        satellites={filteredSatellites}
        allSatellites={allSatellites}
        category={category}
        setCategory={setCategory}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedSatellite={selectedSatellite}
        onSelectSatellite={setSelectedSatellite}
      />

      {/* Bottom-right legend */}
      <Legend />

      {/* Footer */}
      <div className="footer-text">
        Click satellite to track orbit &mdash; DATA from CelesTrak
      </div>
    </div>
  );
}

export default App;
