import { useMemo, useState } from 'react';
import * as satellite from 'satellite.js';
import { List, ArrowUpDown, Filter } from 'lucide-react';

const CATEGORY_COLORS = {
  station: '#00e5ff', gps: '#00c853', weather: '#ff6d00',
  starlink: '#9ca3af', other: '#5a7a9a',
};

function computeAllPasses(satellites, observerLocation, simTime, satrecCache) {
  if (!observerLocation || !satellites || satellites.length === 0) return [];

  const observerGeodetic = {
    latitude: observerLocation.lat * Math.PI / 180,
    longitude: observerLocation.lng * Math.PI / 180,
    height: 0.1,
  };

  const passes = [];
  const simMs = simTime.getTime();

  // Only check non-starlink and first 500 sats for performance
  const candidates = satellites.filter(s => s.category !== 'starlink').slice(0, 500);

  for (const sat of candidates) {
    try {
      const key = sat.tle1 + sat.tle2;
      let satrec = satrecCache?.get(key);
      if (!satrec) {
        satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
      }

      let inPass = false;
      let currentPass = null;

      // Scan 24 hours in 180s steps for speed
      for (let step = 0; step < 480; step++) {
        const t = new Date(simMs + step * 180000);
        const pv = satellite.propagate(satrec, t);
        if (!pv || !pv.position) continue;

        const gmst = satellite.gstime(t);
        const posEcf = satellite.eciToEcf(pv.position, gmst);
        const la = satellite.ecfToLookAngles(observerGeodetic, posEcf);
        const el = la.elevation * (180 / Math.PI);

        if (el >= 5) {
          if (!inPass) {
            inPass = true;
            currentPass = {
              name: sat.name,
              category: sat.category,
              riseTime: t,
              maxEl: el,
              maxElTime: t,
              setTime: null,
              azAos: la.azimuth * (180 / Math.PI),
              azLos: la.azimuth * (180 / Math.PI),
            };
          } else {
            if (el > currentPass.maxEl) {
              currentPass.maxEl = el;
              currentPass.maxElTime = t;
            }
            currentPass.azLos = la.azimuth * (180 / Math.PI);
          }
        } else {
          if (inPass) {
            inPass = false;
            currentPass.setTime = t;
            passes.push(currentPass);
            currentPass = null;
            if (passes.length >= 200) break;
          }
        }
      }

      if (inPass && currentPass) {
        currentPass.setTime = new Date(simMs + 86400000);
        passes.push(currentPass);
      }
    } catch {
      // Skip
    }
    if (passes.length >= 200) break;
  }

  return passes;
}

export default function MultiPassTable({ satellites, observerLocation, simTime }) {
  const [sortBy, setSortBy] = useState('time'); // 'time' | 'elevation' | 'name'
  const [filterCat, setFilterCat] = useState('all');

  // Memoize passes rounded to 10-minute increments for performance
  const roundedTime = Math.floor(simTime.getTime() / 600000);
  const allPasses = useMemo(() => {
    if (!observerLocation) return [];
    return computeAllPasses(satellites, observerLocation, new Date(roundedTime * 600000), null);
  }, [satellites, observerLocation, roundedTime]);

  // Filter
  let filtered = filterCat === 'all'
    ? allPasses
    : allPasses.filter(p => p.category === filterCat);

  // Sort
  if (sortBy === 'time') {
    filtered = [...filtered].sort((a, b) => a.riseTime - b.riseTime);
  } else if (sortBy === 'elevation') {
    filtered = [...filtered].sort((a, b) => b.maxEl - a.maxEl);
  } else if (sortBy === 'name') {
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }

  const formatTime = (t) => t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const categories = [
    { id: 'all', label: 'ALL' },
    { id: 'station', label: 'STATIONS' },
    { id: 'gps', label: 'GPS' },
    { id: 'weather', label: 'WEATHER' },
    { id: 'other', label: 'OTHER' },
  ];

  return (
    <div className="multipass-panel">
      <div className="multipass-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <List size={13} />
          <span className="multipass-title">MULTI-SAT PASS TABLE (24H)</span>
          <span className="multipass-count-badge">{filtered.length}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="multipass-toolbar">
        <div className="multipass-filter-group">
          <Filter size={10} style={{ color: '#5a7a9a' }} />
          {categories.map(c => (
            <button
              key={c.id}
              className={`multipass-filter-btn ${filterCat === c.id ? 'active' : ''}`}
              onClick={() => setFilterCat(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="multipass-sort-group">
          <ArrowUpDown size={10} style={{ color: '#5a7a9a' }} />
          {['time', 'elevation', 'name'].map(s => (
            <button
              key={s}
              className={`multipass-sort-btn ${sortBy === s ? 'active' : ''}`}
              onClick={() => setSortBy(s)}
            >
              {s === 'time' ? 'TIME' : s === 'elevation' ? 'ELEV' : 'NAME'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="multipass-table-wrapper">
        {!observerLocation ? (
          <p className="multipass-no-data">Tentukan lokasi observer untuk melihat tabel lintasan multi-satelit.</p>
        ) : filtered.length === 0 ? (
          <p className="multipass-no-data">Tidak ada lintasan satelit dalam 24 jam ke depan.</p>
        ) : (
          <table className="multipass-table">
            <thead>
              <tr>
                <th>SATELLITE</th>
                <th>AOS</th>
                <th>LOS</th>
                <th>MAX EL</th>
                <th>DUR</th>
                <th>AZ AOS</th>
                <th>AZ LOS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 80).map((pass, idx) => {
                const dur = Math.round((pass.setTime - pass.riseTime) / 60000);
                const isNow = simTime >= pass.riseTime && simTime <= pass.setTime;
                return (
                  <tr key={idx} className={isNow ? 'pass-active-row' : ''}>
                    <td className="multipass-sat-name">
                      <span className="multipass-cat-dot" style={{ background: CATEGORY_COLORS[pass.category] || '#5a7a9a' }} />
                      <span className="multipass-name-text">{pass.name}</span>
                    </td>
                    <td className="font-numeric">{formatTime(pass.riseTime)}</td>
                    <td className="font-numeric">{formatTime(pass.setTime)}</td>
                    <td className="font-numeric" style={{ color: pass.maxEl >= 45 ? '#00e5ff' : pass.maxEl >= 25 ? '#ffea00' : '#8fa0b5' }}>
                      {Math.round(pass.maxEl)}°
                    </td>
                    <td className="font-numeric">{dur}m</td>
                    <td className="font-numeric">{Math.round(pass.azAos)}°</td>
                    <td className="font-numeric">{Math.round(pass.azLos)}°</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
