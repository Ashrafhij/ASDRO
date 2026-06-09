'use client';

import { useState } from 'react';
import { Customer, Location } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';
import { parseGoogleMapsLink, parseWhatsAppLocation, geocodeAddress } from '@/lib/geocoding';

interface CustomerInputProps {
  customers: Customer[];
  onChange: (customers: Customer[]) => void;
}

export default function CustomerInput({ customers, onChange }: CustomerInputProps) {
  const { t } = useI18n();
  const ct = t.customerInput;
  const [locationInput, setLocationInput] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');

  const resolveLocation = async (input: string): Promise<{ location: Location; address: string } | null> => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const mapsLoc = parseGoogleMapsLink(trimmed);
    if (mapsLoc) return { location: mapsLoc, address: trimmed };
    const waLoc = parseWhatsAppLocation(trimmed);
    if (waLoc) return { location: waLoc, address: trimmed };
    try {
      const geoResult = await geocodeAddress(trimmed);
      return geoResult ? { location: geoResult, address: trimmed } : null;
    } catch { return null; }
  };

  const addLocation = async () => {
    if (!locationInput.trim()) { setError(ct.errorLocation); return; }
    setError(''); setParsing(true);
    const startTime = Date.now();
    const resolved = await resolveLocation(locationInput);
    const elapsed = Date.now() - startTime;
    if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed));
    if (!resolved) { setError(ct.errorLocation); setParsing(false); return; }
    const customer: Customer = {
      id: crypto.randomUUID(), name: '', phone: '',
      location: resolved.location, address: resolved.address, notes: '',
    };
    onChange([...customers, customer]);
    setLocationInput(''); setParsing(false);
  };

  const addBulk = async () => {
    if (!bulkInput.trim()) return;
    setError(''); setParsing(true);
    const startTime = Date.now();
    const lines = bulkInput.split('\n').filter(l => l.trim());
    const results: Customer[] = [];
    for (const line of lines) {
      const resolved = await resolveLocation(line.trim());
      if (resolved) {
        results.push({
          id: crypto.randomUUID(), name: '', phone: '',
          location: resolved.location, address: resolved.address, notes: '',
        });
      }
    }
    const elapsed = Date.now() - startTime;
    if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed));
    onChange([...customers, ...results]);
    setBulkInput(''); setParsing(false);
  };

  const removeCustomer = (id: string) => onChange(customers.filter(c => c.id !== id));

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-900/30 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      <div className="flex gap-2">
        <input type="text" placeholder={ct.location} value={locationInput}
          onChange={e => setLocationInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addLocation()}
          className="flex-1 px-3.5 py-2.5 bg-gray-700/50 border border-gray-600/50 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:bg-gray-700 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none" />
        <button onClick={addLocation} disabled={parsing}
          className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 min-w-[80px]">
          {parsing ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : ct.add}
        </button>
      </div>

      <button onClick={() => setShowBulk(!showBulk)}
        className="text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1.5">
        <span>{showBulk ? '✏️' : '📋'}</span>
        {showBulk ? 'Single Entry' : ct.importAll}
      </button>

      {showBulk && (
        <div className="space-y-2">
          <textarea placeholder={ct.bulkPlaceholder} value={bulkInput}
            onChange={e => setBulkInput(e.target.value)} rows={4}
            className="w-full px-3.5 py-2.5 bg-gray-700/50 border border-gray-600/50 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:bg-gray-700 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none font-mono text-xs" />
          <button onClick={addBulk} disabled={parsing}
            className="w-full py-2.5 bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-xl border border-gray-600/30 hover:border-gray-600/50 transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-40">
            {parsing ? (
              <span className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
            ) : (
              <><span className="text-base">📥</span> {ct.importAll}</>
            )}
          </button>
        </div>
      )}

      {customers.length > 0 && (
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {customers.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2.5 bg-gray-800/50 border border-gray-700/50 px-3.5 py-2.5 rounded-xl text-sm">
              <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-100 text-sm truncate">{c.address || `Stop ${i + 1}`}</p>
              </div>
              <button onClick={() => removeCustomer(c.id)}
                className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-700/50 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-all flex items-center justify-center text-xs active:scale-90">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
