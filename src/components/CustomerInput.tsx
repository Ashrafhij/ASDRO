'use client';

import { useState } from 'react';
import { Customer, Location } from '@/lib/types';
import { parseGoogleMapsLink, parseWhatsAppLocation, geocodeAddress } from '@/lib/geocoding';

interface CustomerInputProps {
  customers: Customer[];
  onChange: (customers: Customer[]) => void;
}

export default function CustomerInput({ customers, onChange }: CustomerInputProps) {
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
      setError('Name and location are required');
      return;
    }
    setError('');
    setParsing(true);

    const resolved = await resolveLocation(locationInput);
    if (!resolved) {
      setError('Could not determine location from input');
      setParsing(false);
      return;
    }

    const newCustomer: Customer = {
      id: crypto.randomUUID(),
      name: name.trim(),
      phone: phone.trim(),
      location: resolved.location,
      address: resolved.address,
      notes: notes.trim(),
    };

    onChange([...customers, newCustomer]);
    setName('');
    setPhone('');
    setLocationInput('');
    setNotes('');
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

  const removeCustomer = (id: string) => {
    onChange(customers.filter(c => c.id !== id));
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Add Customer</h2>
        <button
          onClick={() => setShowBulk(!showBulk)}
          className="text-sm text-blue-600 hover:text-blue-800 ml-auto"
        >
          {showBulk ? 'Single Entry' : 'Bulk Import'}
        </button>
      </div>

      {!showBulk ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Customer name *"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="tel"
              placeholder="Phone number"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <input
            type="text"
            placeholder="Google Maps / WhatsApp link or address *"
            value={locationInput}
            onChange={e => setLocationInput(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={addCustomer}
            disabled={parsing}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {parsing ? 'Adding...' : 'Add Customer'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            placeholder="Paste locations (one per line)&#10;Format: address or link, Name (optional), Phone (optional)&#10;&#10;Example:&#10;https://maps.google.com/?q=40.7128,-74.0060, John, +1234567890&#10;123 Main St, Alice&#10;https://maps.app.goo.gl/abc123"
            value={bulkInput}
            onChange={e => setBulkInput(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
          />
          <button
            onClick={addBulk}
            disabled={parsing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {parsing ? 'Processing...' : 'Import All'}
          </button>
        </div>
      )}

      {customers.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Customers ({customers.length})
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {customers.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg text-sm">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900">{i + 1}. {c.name}</span>
                  {c.phone && <span className="text-gray-500 ml-2">{c.phone}</span>}
                  <p className="text-gray-500 truncate">{c.address}</p>
                </div>
                <button
                  onClick={() => removeCustomer(c.id)}
                  className="ml-2 text-red-500 hover:text-red-700 flex-shrink-0"
                  title="Remove"
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
