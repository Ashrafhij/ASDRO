'use client';

import { useState } from 'react';

export default function ClearAnalyticsButton() {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    setClearing(true);
    try {
      const res = await fetch('/api/ping', { method: 'DELETE' });
      if (res.ok) {
        window.location.reload();
      }
    } catch {
      setClearing(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-400">Sure?</span>
        <button onClick={handleClear} disabled={clearing}
          className="text-xs bg-red-600 hover:bg-red-500 text-white px-2.5 py-1 rounded-lg transition-all disabled:opacity-40">
          {clearing ? 'Clearing...' : 'Yes, clear all'}
        </button>
        <button onClick={() => setConfirming(false)}
          className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2.5 py-1 rounded-lg transition-all">
          No
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setConfirming(true)}
      className="text-xs text-gray-500 hover:text-red-400 transition-colors">
      Clear data
    </button>
  );
}
