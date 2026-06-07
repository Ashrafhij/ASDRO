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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <span>👤</span> {ct.addCustomer}
        </h2>
        <button onClick={() => setShowBulk(!showBulk)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
          {showBulk ? <>✏️ {ct.singleEntry}</> : <>📋 {ct.bulkImport}</>}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {!showBulk ? (
        <div className="space-y-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">👤</span>
            <input type="text" placeholder={ct.name} value={name}
              onChange={e => setName(e.target.value)}
              className="w-full ps-8 pe-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-colors" />
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">📞</span>
            <input type="tel" placeholder={ct.phone} value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full ps-8 pe-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-colors" />
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">📍</span>
            <input type="text" placeholder={ct.location} value={locationInput}
              onChange={e => setLocationInput(e.target.value)}
              className="w-full ps-8 pe-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-colors" />
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">📝</span>
            <input type="text" placeholder={ct.notes} value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full ps-8 pe-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-colors" />
          </div>
          <button onClick={addCustomer} disabled={parsing}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg text-sm font-medium hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-1.5">
            {parsing ? '⏳ ' + ct.adding : '➕ ' + ct.add}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <span className="absolute left-3 top-3 text-sm pointer-events-none">📋</span>
            <textarea placeholder={ct.bulkPlaceholder} value={bulkInput}
              onChange={e => setBulkInput(e.target.value)} rows={5}
              className="w-full ps-8 pe-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 font-mono" />
          </div>
          <button onClick={addBulk} disabled={parsing}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg text-sm font-medium hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-1.5">
            {parsing ? '⏳ ' + ct.processing : '📥 ' + ct.importAll}
          </button>
        </div>
      )}

      {customers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
            <span>👥</span> {ct.customers} ({customers.length})
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {customers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 px-2.5 py-2 rounded-lg text-sm group transition-colors">
                <span className="flex-shrink-0 w-5 h-5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 text-xs flex items-center gap-1">
                    <span>👤</span> {c.name}
                  </span>
                  <p className="text-gray-500 text-xs truncate flex items-center gap-1">
                    <span>📍</span> {c.address}
                  </p>
                </div>
                <button onClick={() => removeCustomer(c.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all rounded hover:bg-red-50">
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
