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
  const [editingId, setEditingId] = useState<string | null>(null);

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
    const startTime = Date.now();
    const resolved = await resolveLocation(locationInput);
    const elapsed = Date.now() - startTime;
    if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed));
    if (!resolved) { setError(ct.errorLocation); setParsing(false); return; }
    const customer = {
      id: editingId || crypto.randomUUID(), name: name.trim(), phone: phone.trim(),
      location: resolved.location, address: resolved.address, notes: notes.trim(),
    };
    if (editingId) {
      onChange(customers.map(c => c.id === editingId ? customer : c));
    } else {
      onChange([...customers, customer]);
    }
    setName(''); setPhone(''); setLocationInput(''); setNotes('');
    setEditingId(null); setParsing(false);
  };

  const startEdit = (c: Customer) => {
    setName(c.name); setPhone(c.phone); setLocationInput(c.address);
    setNotes(c.notes); setEditingId(c.id); setShowBulk(false); setError('');
  };

  const cancelEdit = () => {
    setName(''); setPhone(''); setLocationInput(''); setNotes('');
    setEditingId(null); setError('');
  };

  const addBulk = async () => {
    if (!bulkInput.trim()) return;
    setError(''); setParsing(true);
    const startTime = Date.now();
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
    const elapsed = Date.now() - startTime;
    if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed));
    onChange([...customers, ...results]);
    setBulkInput(''); setParsing(false);
  };

  const removeCustomer = (id: string) => onChange(customers.filter(c => c.id !== id));

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center text-xs">👤</span>
          {ct.addCustomer}
        </h2>
        <button onClick={() => setShowBulk(!showBulk)}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
            showBulk
              ? 'bg-blue-500/20 text-blue-300'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/10'
          }`}>
          {showBulk ? '✏️ ' + ct.singleEntry : '📋 ' + ct.bulkImport}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {!showBulk ? (
        <div className="space-y-2.5">
          {[ 
            { icon: '👤', placeholder: ct.name, val: name, set: setName, type: 'text' },
            { icon: '📞', placeholder: ct.phone, val: phone, set: setPhone, type: 'tel' },
            { icon: '📍', placeholder: ct.location, val: locationInput, set: setLocationInput, type: 'text' },
            { icon: '📝', placeholder: ct.notes, val: notes, set: setNotes, type: 'text' },
          ].map(({ icon, placeholder, val, set, type }) => (
            <div key={placeholder} className="relative group">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none opacity-40 group-focus-within:opacity-70 transition-opacity">{icon}</span>
              <input type={type} placeholder={placeholder} value={val}
                onChange={e => set(e.target.value)}
                className="w-full ps-10 pe-3 py-2.5 bg-gray-700/50 border border-gray-600/50 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:bg-gray-700 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none" />
            </div>
          ))}
          <div className="flex gap-2">
            {editingId && (
              <button onClick={cancelEdit}
                className="px-4 py-2.5 border border-gray-600/50 text-gray-300 rounded-xl text-sm font-medium hover:bg-white/10 transition-all active:scale-[0.98]">
                {ct.cancel}
              </button>
            )}
            <button onClick={addCustomer} disabled={parsing}
              className={'py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2 ' + (editingId ? 'flex-1' : 'w-full')}>
              {parsing ? (
                <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {ct.adding}</span>
              ) : (
                <><span className={'w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs'}>{editingId ? '✓' : '+'}</span> {editingId ? ct.save : ct.add}</>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="relative group">
            <span className="absolute left-3 top-3 text-sm pointer-events-none opacity-40">📋</span>
            <textarea placeholder={ct.bulkPlaceholder} value={bulkInput}
              onChange={e => setBulkInput(e.target.value)} rows={5}
              className="w-full ps-10 pe-3 py-2.5 bg-gray-700/50 border border-gray-600/50 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:bg-gray-700 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none font-mono text-xs" />
          </div>
          <button onClick={addBulk} disabled={parsing}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2">
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
            <span className="text-blue-400 font-semibold">{customers.length}</span>
          </p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {customers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2 bg-gray-800/50 border border-gray-700/50 hover:border-gray-600/50 px-3 py-2.5 rounded-xl text-sm transition-all shadow-sm hover:shadow-md hover:bg-gray-800/80">
                <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => startEdit(c)}>
                  <span className="font-medium text-gray-100 text-sm flex items-center gap-1.5">
                    {c.name}
                    {c.phone && <span className="text-xs text-gray-400 font-normal">· {c.phone}</span>}
                  </span>
                  <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                    {c.address}
                  </p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                  className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-700/50 hover:bg-blue-500/20 text-gray-400 hover:text-blue-300 transition-all flex items-center justify-center text-xs active:scale-90">
                  ✏️
                </button>
                <button onClick={(e) => { e.stopPropagation(); removeCustomer(c.id); }}
                  className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-700/50 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-all flex items-center justify-center text-xs active:scale-90">
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
