import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Legend from './components/Legend';
import SelectedSatellitePanel from './components/SelectedSatellitePanel';
import TimeControls from './components/TimeControls';
import ObserverPanel from './components/ObserverPanel';
import SdrController from './components/SdrController';
import DopplerPanel from './components/DopplerPanel';
import RotorSimulator from './components/RotorSimulator';
import MultiPassTable from './components/MultiPassTable';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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

// Helper to fetch satellite from CelesTrak by NORAD ID with a local fallback
async function fetchSatelliteByNorad(noradId, name, fallbackTle1, fallbackTle2, category = 'other') {
  const fallback = [{
    name,
    tle1: fallbackTle1,
    tle2: fallbackTle2,
    category,
  }];
  try {
    const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=tle`);
    if (res.ok) {
      const text = await res.text();
      const sats = parseTLE(text, category);
      if (sats && sats.length > 0) {
        sats[0].name = name;
        return sats;
      }
    }
  } catch (err) {
    console.warn(`Unable to reach CelesTrak for ${name}, using fallback TLE:`, err);
  }
  return fallback;
}

// Fetch Telkom-4 (Merah Putih)
async function fetchTelkom4() {
  return fetchSatelliteByNorad(
    '43587',
    'TELKOM-4 (Merah Putih)',
    '1 43587U 18064A   26171.41343206 .00000000 00000-0 00000+0 0 9995',
    '2 43587   0.0169  12.0761 0001515 103.4112  49.9772  1.00269652 28915'
  );
}

// Fetch BRISat
async function fetchBrisat() {
  return fetchSatelliteByNorad(
    '41591',
    'BRISat',
    '1 41591U 16039A   26167.78593465 .00000000 00000-0 00000+0 0 9997',
    '2 41591   0.0232 337.3604 0001888 105.9123 255.2030  1.00268877 36602'
  );
}

// Fetch SATRIA-1 (Nusantara Tiga)
async function fetchSatria1() {
  return fetchSatelliteByNorad(
    '57045',
    'SATRIA-1 (Nusantara)',
    '1 57045U 23086A   26158.58838443 -.00000220 00000-0 00000+0 0 9999',
    '2 57045   0.0374 344.8283 0003568   0.3771 268.6018  1.00269379  9668'
  );
}

// Fetch LAPAN-A2 from SatNOGS DB API with a local fallback TLE
async function fetchLapanA2() {
  const fallback = [{
    name: 'LAPAN-A2 (IO-86)',
    tle1: '1 40931U          26165.13411713  .00000000  00000-0  77536-4 0    03',
    tle2: '2 40931   6.0006 190.4965 0012733 338.8432 279.4005 14.79261912    01',
    category: 'other',
  }];
  try {
    const res = await fetch('https://db.satnogs.org/api/tle/?norad_cat_id=40931');
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        return [{
          name: (data[0].tle0 || 'LAPAN-A2') + ' (IO-86)',
          tle1: data[0].tle1,
          tle2: data[0].tle2,
          category: 'other',
        }];
      }
    }
  } catch (err) {
    console.warn('Unable to reach SatNOGS DB API for LAPAN-A2, using fallback TLE:', err);
  }
  return fallback;
}

// Fetch NOAA 15, 18, and 19 satellites with local fallback TLEs
async function fetchNoaaSatellites() {
  const fallbacks = [
    {
      name: 'NOAA 15',
      tle1: '1 25338U 98030A   26178.77233198  .00000093  00000-0  55528-4 0  9996',
      tle2: '2 25338  98.5063 199.1188 0009415 322.1839  37.8679 14.27149413462804',
      category: 'weather',
    },
    {
      name: 'NOAA 18',
      tle1: '1 28654U 05018A   26171.44845054  .00000038  00000-0  43006-4 0  9998',
      tle2: '2 28654  98.8114 251.0782 0015040 138.7248 221.5065 14.13729855 86770',
      category: 'weather',
    },
    {
      name: 'NOAA 19',
      tle1: '1 33591U 09005A   26177.25243725  .00000026  00000-0  37787-4 0  9992',
      tle2: '2 33591  98.9518 248.1337 0013828   9.4119 350.7310 14.13475498895767',
      category: 'weather',
    }
  ];

  try {
    const promises = fallbacks.map(async (sat) => {
      const norad_id = sat.tle1.split(' ')[1].replace('U', '').trim();
      try {
        const res = await fetch(`https://db.satnogs.org/api/tle/?norad_cat_id=${norad_id}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            return {
              name: data[0].tle0 || sat.name,
              tle1: data[0].tle1,
              tle2: data[0].tle2,
              category: 'weather',
            };
          }
        }
      } catch {
        // Fallback on request error
      }
      return sat;
    });
    return await Promise.all(promises);
  } catch (err) {
    return fallbacks;
  }
}

function App() {
  const [allSatellites, setAllSatellites] = useState([]);
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('2d'); // '2d' | '3d'
  const [isCameraLocked, setIsCameraLocked] = useState(false);
  
  // Observer location & pinning states
  const [observerLocation, setObserverLocation] = useState(null);
  const [isPinMode, setIsPinMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showObserverPanel, setShowObserverPanel] = useState(window.innerWidth > 768);
  
  // Time Simulation State
  const [isPaused, setIsPaused] = useState(false);
  const [timeMultiplier, setTimeMultiplier] = useState(1);
  const [simTime, setSimTime] = useState(new Date());

  // Favorites & Sorting State
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('sateline_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'norad'

  useEffect(() => {
    localStorage.setItem('sateline_favorites', JSON.stringify(favorites));
  }, [favorites]);
  
  // SDR Panel Global Toggle State
  const [showSdrPanel, setShowSdrPanel] = useState(false);
  const [isSdrFullscreen, setIsSdrFullscreen] = useState(false);

  // GPredict-style panel toggles
  const [showDopplerPanel, setShowDopplerPanel] = useState(false);
  const [showRotorPanel, setShowRotorPanel] = useState(false);
  const [showPassTable, setShowPassTable] = useState(false);

  // Handle satellite selection (with auto-collapse sidebar on mobile)
  const handleSelectSatellite = (sat) => {
    setSelectedSatellite(sat);
    setIsCameraLocked(false);
    if (sat && window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

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



  // Fetch multiple TLE groups in parallel and merge
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const results = await Promise.all([
          ...GROUPS.map(async ({ group, category: cat, limit }) => {
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
          }),
          fetchLapanA2(),
          fetchNoaaSatellites(),
          fetchTelkom4(),
          fetchBrisat(),
          fetchSatria1()
        ]);
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

  // Filter by category, search and sort
  const filteredSatellites = useMemo(() => {
    let sats = allSatellites;
    if (category === 'favorites') {
      sats = sats.filter(s => favorites.includes(s.name));
    } else if (category !== 'all') {
      sats = sats.filter(s => s.category === category);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      sats = sats.filter(s => s.name.toLowerCase().includes(q));
    }

    // Sort
    const getNoradId = (tle1) => {
      try { return tle1.substring(2, 7).trim(); } catch { return ''; }
    };
    
    return [...sats].sort((a, b) => {
      if (sortBy === 'norad') {
        return getNoradId(a.tle1).localeCompare(getNoradId(b.tle1));
      }
      return a.name.localeCompare(b.name);
    });
  }, [allSatellites, category, searchQuery, favorites, sortBy]);

  return (
    <div className="app-container">
      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p className="loading-text">Establishing connection with satellites...</p>
        </div>
      )}

      {/* Full-screen map — 2D Canvas or 3D Cesium Globe */}
      <div className={`map-area ${isSidebarOpen ? '' : 'sidebar-collapsed'}`}>
        {viewMode === '2d' ? (
          <MapView
            satellites={allSatellites}
            selectedSatellite={selectedSatellite}
            onSelectSatellite={handleSelectSatellite}
            simTime={simTime}
            isPaused={isPaused}
            timeMultiplier={timeMultiplier}
            observerLocation={observerLocation}
            onSetObserverLocation={setObserverLocation}
            isPinMode={isPinMode}
            onSetPinMode={setIsPinMode}
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
              onSelectSatellite={handleSelectSatellite}
              simTime={simTime}
              isPaused={isPaused}
              timeMultiplier={timeMultiplier}
              isCameraLocked={isCameraLocked}
              observerLocation={observerLocation}
              onSetObserverLocation={setObserverLocation}
              isPinMode={isPinMode}
              onSetPinMode={setIsPinMode}
            />
          </Suspense>
        )}
      </div>

      {/* Left detail panel (Placed before TimeControls to allow CSS sibling targeting) */}
      {selectedSatellite && (
        <SelectedSatellitePanel
          satellite={selectedSatellite}
          onClose={() => setSelectedSatellite(null)}
          simTime={simTime}
          viewMode={viewMode}
          isCameraLocked={isCameraLocked}
          setIsCameraLocked={setIsCameraLocked}
          observerLocation={observerLocation}
          favorites={favorites}
          setFavorites={setFavorites}
        />
      )}

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
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        showObserverPanel={showObserverPanel}
        setShowObserverPanel={setShowObserverPanel}
        showSdrPanel={showSdrPanel}
        setShowSdrPanel={setShowSdrPanel}
        showDopplerPanel={showDopplerPanel}
        setShowDopplerPanel={setShowDopplerPanel}
        showRotorPanel={showRotorPanel}
        setShowRotorPanel={setShowRotorPanel}
        showPassTable={showPassTable}
        setShowPassTable={setShowPassTable}
      />

      {/* Floating Observer Location Panel */}
      {showObserverPanel && (
        <ObserverPanel
          observerLocation={observerLocation}
          onSetObserverLocation={setObserverLocation}
          isPinMode={isPinMode}
          onSetPinMode={setIsPinMode}
          isSidebarOpen={isSidebarOpen}
        />
      )}

      {/* Floating SDR Monitor Panel */}
      {showSdrPanel && (
        <div className={`sdr-panel-floating ${selectedSatellite ? 'shifted' : ''} ${isSidebarOpen ? '' : 'sidebar-collapsed'} ${isSdrFullscreen ? 'fullscreen' : ''}`}>
          <div className="sdr-panel-floating-header">
            <h3>SDR MONITOR CONSOLE</h3>
            <button className="sdr-panel-close-btn" onClick={() => setShowSdrPanel(false)} title="Close SDR Panel">✕</button>
          </div>
          <div className="sdr-panel-floating-body">
            <SdrController 
              satellite={selectedSatellite} 
              simTime={simTime} 
              isFullscreen={isSdrFullscreen} 
              setIsFullscreen={setIsSdrFullscreen} 
            />
          </div>
        </div>
      )}

      {/* Floating Doppler Panel */}
      {showDopplerPanel && (
        <div className={`doppler-panel-floating ${selectedSatellite ? 'shifted' : ''} ${isSidebarOpen ? '' : 'sidebar-collapsed'}`}>
          <DopplerPanel
            sat={selectedSatellite}
            simTime={simTime}
            observerLocation={observerLocation}
          />
        </div>
      )}

      {/* Floating Rotor Simulator Panel */}
      {showRotorPanel && (
        <div className={`rotor-panel-floating ${selectedSatellite ? 'shifted' : ''} ${isSidebarOpen ? '' : 'sidebar-collapsed'}`}>
          <RotorSimulator
            sat={selectedSatellite}
            simTime={simTime}
            observerLocation={observerLocation}
          />
        </div>
      )}

      {/* Floating Multi-Pass Table */}
      {showPassTable && (
        <div className={`multipass-panel-floating ${isSidebarOpen ? '' : 'sidebar-collapsed'}`}>
          <MultiPassTable
            satellites={allSatellites}
            observerLocation={observerLocation}
            simTime={simTime}
          />
        </div>
      )}

      {/* Sidebar Toggle Button */}
      <button
        className={`sidebar-toggle-btn ${isSidebarOpen ? '' : 'collapsed'}`}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        title={isSidebarOpen ? 'Hide Sidebar / Tutup Sidebar' : 'Show Sidebar / Buka Sidebar'}
      >
        {isSidebarOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Right sidebar */}
      <Sidebar
        satellites={filteredSatellites}
        allSatellites={allSatellites}
        category={category}
        setCategory={setCategory}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedSatellite={selectedSatellite}
        onSelectSatellite={handleSelectSatellite}
        isOpen={isSidebarOpen}
        favorites={favorites}
        setFavorites={setFavorites}
        sortBy={sortBy}
        setSortBy={setSortBy}
      />

      {/* Bottom-right legend */}
      <Legend isOpen={isSidebarOpen} />

      {/* Footer */}
      <div className="footer-text">
        Click satellite to track orbit &mdash; DATA from CelesTrak
      </div>
    </div>
  );
}

export default App;
