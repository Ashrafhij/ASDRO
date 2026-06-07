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
    } catch {
      return null;
    }
  };

  const addCustomer = async () => {
    if (!name.trim() || !locationInput.trim()) {
      setError(ct.errorNameLocation);
      return;
    }
    setError('');
    setParsing(true);
    const resolved = await resolveLocation(locationInput);
    if (!resolved) {
      setError(ct.errorLocation);
      setParsing(false);
      return;
    }
    onChange([...customers, {
      id: crypto.randomUUID(),
      name: name.trim(),
      phone: phone.trim(),
      location: resolved.location,
      address: resolved.address,
      notes: notes.trim(),
    }]);
    setName(''); setPhone(''); setLocationInput(''); setNotes('');
    setParsing(false);
  };

  const addBulk = async () => {
    if (!bulkInput.trim()) return;
    setError('');
    setParsing(true);
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
          location: resolved.location,
          address: resolved.address,
          notes: parts.slice(3).join(', ') || '',
        });
      }
    }
    onChange([...customers, ...results]);
    setBulkInput('');
    setParsing(false);
  };

  const removeCustomer = (id: string) => onChange(customers.filter(c => c.id !== id));

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-blue-600 rounded-full" />
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{ct.addCustomer}</h2>
        <button
          onClick={() => setShowBulk(!showBulk)}
          className="ms-auto text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          {showBulk ? ct.singleEntry : ct.bulkImport}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-fade-in">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Single entry form */}
      {!showBulk ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <svg className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <input
                type="text"
                placeholder={ct.name}
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full ps-9 pe-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm transition-colors focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="relative">
              <svg className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <input
                type="tel"
                placeholder={ct.phone}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full ps-9 pe-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm transition-colors focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
          <div className="relative">
            <svg className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <input
              type="text"
              placeholder={ct.location}
              value={locationInput}
              onChange={e => setLocationInput(e.target.value)}
              className="w-full ps-9 pe-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm transition-colors focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="relative">
            <svg className="absolute start-3 top-3 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <input
              type="text"
              placeholder={ct.notes}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full ps-9 pe-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm transition-colors focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button
            onClick={addCustomer}
            disabled={parsing}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            {parsing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {ct.adding}
              </span>
            ) : ct.add}
          </button>
        </div>
      ) : (
        /* Bulk import form */
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3 animate-fade-in">
          <textarea
            placeholder={ct.bulkPlaceholder}
            value={bulkInput}
            onChange={e => setBulkInput(e.target.value)}
            rows={6}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm transition-colors focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 font-mono"
          />
          <button
            onClick={addBulk}
            disabled={parsing}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            {parsing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {ct.processing}
              </span>
            ) : ct.importAll}
          </button>
        </div>
      )}

      {/* Customer list */}
      {customers.length > 0 && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 bg-emerald-500 rounded-full" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {ct.customers} <span className="text-gray-400">({customers.length})</span>
            </h3>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pe-1">
            {customers.map((c, i) => (
              <div
                key={c.id}
                className="group flex items-center gap-3 bg-white px-3 py-2.5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-150 card-hover animate-slide-in"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{c.name}</span>
                    {c.phone && <span className="text-xs text-gray-400 hidden sm:inline">{c.phone}</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{c.address}</p>
                </div>
                <button
                  onClick={() => removeCustomer(c.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all duration-150 flex-shrink-0"
                  title={ct.remove}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
