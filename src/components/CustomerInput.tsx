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
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [notes, setNotes] = useState('');
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

  const addCustomer = async () => {
    if (!name.trim() || !locationInput.trim()) { setError(ct.errorNameLocation); return; }
    setError(''); setParsing(true);
    const resolved = await resolveLocation(locationInput);
    if (!resolved) { setError(ct.errorLocation); setParsing(false); return; }
    onChange([...customers, {
      id: crypto.randomUUID(), name: name.trim(), phone: phone.trim(),
      location: resolved.location, address: resolved.address, notes: notes.trim(),
    }]);
    setName(''); setPhone(''); setLocationInput(''); setNotes('');
    setParsing(false);
  };

  const addBulk = async () => {
    if (!bulkInput.trim()) return;
    setError(''); setParsing(true);
    const lines = bulkInput.split('\n').filter(l => l.trim());
    const results: Customer[] = [];
    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim());
      const input = parts[0] || line.trim();
      const resolved = await resolveLocation(input);
      if (resolved) {
        results.push({
          id: crypto.randomUUID(),
          name: parts[1] || `Customer ${customers.length + results.length + 1}`,
          phone: parts[2] || '',
          location: resolved.location, address: resolved.address,
          notes: parts.slice(3).join(', ') || '',
        });
      }
    }
    onChange([...customers, ...results]);
    setBulkInput(''); setParsing(false);
  };

  const removeCustomer = (id: string) => onChange(customers.filter(c => c.id !== id));

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-xs">👤</span>
          {ct.addCustomer}
        </h2>
        <button onClick={() => setShowBulk(!showBulk)}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
            showBulk
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}>
          {showBulk ? '✏️ ' + ct.singleEntry : '📋 ' + ct.bulkImport}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {!showBulk ? (
        <div className="space-y-2.5">
          <div className="relative group">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none opacity-50 group-focus-within:opacity-100 transition-opacity">👤</span>
            <input type="text" placeholder={ct.name} value={name}
              onChange={e => setName(e.target.value)}
              className="w-full ps-10 pe-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
          </div>
          <div className="relative group">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none opacity-50 group-focus-within:opacity-100 transition-opacity">📞</span>
            <input type="tel" placeholder={ct.phone} value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full ps-10 pe-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
          </div>
          <div className="relative group">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none opacity-50 group-focus-within:opacity-100 transition-opacity">📍</span>
            <input type="text" placeholder={ct.location} value={locationInput}
              onChange={e => setLocationInput(e.target.value)}
              className="w-full ps-10 pe-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
          </div>
          <div className="relative group">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none opacity-50 group-focus-within:opacity-100 transition-opacity">📝</span>
            <input type="text" placeholder={ct.notes} value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full ps-10 pe-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
          </div>
          <button onClick={addCustomer} disabled={parsing}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2">
            {parsing ? (
              <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {ct.adding}</span>
            ) : (
              <><span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">+</span> {ct.add}</>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="relative group">
            <span className="absolute left-3 top-3 text-sm pointer-events-none opacity-50">📋</span>
            <textarea placeholder={ct.bulkPlaceholder} value={bulkInput}
              onChange={e => setBulkInput(e.target.value)} rows={5}
              className="w-full ps-10 pe-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all outline-none font-mono text-xs" />
          </div>
          <button onClick={addBulk} disabled={parsing}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2">
            {parsing ? (
              <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {ct.processing}</span>
            ) : (
              <><span className="text-base">📥</span> {ct.importAll}</>
            )}
          </button>
        </div>
      )}

      {customers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-blue-400" />
            {ct.customers}
            <span className="text-blue-500 font-semibold">{customers.length}</span>
          </p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {customers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 bg-white border border-gray-100 hover:border-gray-200 px-3 py-2.5 rounded-xl text-sm group transition-all shadow-sm hover:shadow">
                <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                    {c.name}
                    {c.phone && <span className="text-xs text-gray-400 font-normal">· {c.phone}</span>}
                  </span>
                  <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                    {c.address}
                  </p>
                </div>
                <button onClick={() => removeCustomer(c.id)}
                  className="flex-shrink-0 w-7 h-7 rounded-lg opacity-0 group-hover:opacity-100 bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 transition-all flex items-center justify-center text-xs active:scale-90">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
