import React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

export default function TimeControls({ isPaused, setIsPaused, timeMultiplier, setTimeMultiplier, onResetTime }) {
  const speeds = [
    { label: '1x', value: 1 },
    { label: '10x', value: 10 },
    { label: '60x (1m/s)', value: 60 },
    { label: '600x (10m/s)', value: 600 },
    { label: '3600x (1h/s)', value: 3600 },
  ];

  return (
    <div className="time-controls-panel">
      <div className="time-controls-group">
        {/* Reset button */}
        <button
          className="time-control-btn"
          onClick={onResetTime}
          title="Reset to current real time"
        >
          <RotateCcw size={12} />
        </button>

        {/* Play / Pause */}
        <button
          className={`time-control-btn play-pause-btn ${isPaused ? 'paused' : 'playing'}`}
          onClick={() => setIsPaused(!isPaused)}
          title={isPaused ? 'Resume Simulation' : 'Pause Simulation'}
        >
          {isPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
        </button>
      </div>

      <div className="time-divider" />

      {/* Speed Multipliers */}
      <div className="time-speeds">
        {speeds.map(spd => (
          <button
            key={spd.value}
            className={`speed-btn ${timeMultiplier === spd.value ? 'active' : ''}`}
            onClick={() => {
              setTimeMultiplier(spd.value);
              setIsPaused(false);
            }}
          >
            {spd.label}
          </button>
        ))}
      </div>
    </div>
  );
}
