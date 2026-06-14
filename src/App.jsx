import React, { useState, useEffect, useMemo } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Legend from './components/Legend';
import SelectedSatellitePanel from './components/SelectedSatellitePanel';

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

      {/* Full-screen map */}
      <div className="map-area">
        <MapView
          satellites={allSatellites}
          selectedSatellite={selectedSatellite}
          onSelectSatellite={setSelectedSatellite}
        />
      </div>

      {/* Header panels */}
      <Header
        totalCount={allSatellites.length}
        selectedSatelliteName={selectedSatellite?.name || null}
      />

      {/* Left detail panel */}
      {selectedSatellite && (
        <SelectedSatellitePanel
          satellite={selectedSatellite}
          onClose={() => setSelectedSatellite(null)}
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
