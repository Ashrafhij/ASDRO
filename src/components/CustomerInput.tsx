'use client';

import { useState, useRef, useEffect } from 'react';
import { Customer, Location } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';
import { parseGoogleMapsLink, parseWhatsAppLocation, geocodeAddress } from '@/lib/geocoding';

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRef = useRef<{ location: Location; address: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (inputRef.current && !inputRef.current.parentElement?.contains(target) &&
          listRef.current && !listRef.current.contains(target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = async (query: string) => {
    if (query.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        { headers: { 'User-Agent': 'ASDRO/1.0' } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        setSuggestions(data);
        setShowSuggestions(true);
        setActiveIdx(-1);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch { /* ignore */ }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocationInput(value);
    pendingRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 250);
  };

  const selectSuggestion = (s: Suggestion) => {
    setLocationInput(s.display_name);
    setShowSuggestions(false);
    pendingRef.current = {
      location: { lat: parseFloat(s.lat), lng: parseFloat(s.lon) },
      address: s.display_name,
    };
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') addLocation();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < suggestions.length) {
        selectSuggestion(suggestions[activeIdx]);
      } else {
        addLocation();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

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
    if (pendingRef.current) {
      const customer: Customer = {
        id: crypto.randomUUID(), name: '', phone: '',
        location: pendingRef.current.location, address: pendingRef.current.address, notes: '',
      };
      onChange([...customers, customer]);
      setLocationInput(''); pendingRef.current = null; setError(''); return;
    }
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

      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <input ref={inputRef} type="text" placeholder={ct.location} value={locationInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            className="w-full px-3.5 py-2.5 bg-gray-700/50 border border-gray-600/50 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:bg-gray-700 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none" />
          {showSuggestions && suggestions.length > 0 && (
            <div ref={listRef}
              className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600/50 rounded-xl shadow-2xl overflow-hidden z-50 max-h-64 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => selectSuggestion(s)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors ${
                    i === activeIdx ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-white/5'
                  }`}>
                  <span className="line-clamp-2">{s.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
