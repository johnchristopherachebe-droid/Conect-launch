import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, Crosshair, MapPin, Search } from 'lucide-react';

// Leaflet's default marker icons reference image files that don't resolve correctly
// through Vite's bundler. We render our own centered pin as an HTML overlay instead
// (see the fixed <MapPin> below), so no default marker icon is needed on the map itself.

type Result = { label: string; lat: number; lng: number };

export default function LocationPicker({
  api,
  initialLat,
  initialLng,
  onConfirm,
  onCancel,
}: {
  api: any;
  initialLat?: number;
  initialLng?: number;
  onConfirm: (loc: { lat: number; lng: number; address: string }) => void;
  onCancel: () => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const startLat = Number.isFinite(initialLat) ? (initialLat as number) : 6.2649; // Awka, Nigeria fallback
    const startLng = Number.isFinite(initialLng) ? (initialLng as number) : 7.1119;
    const map = L.map(mapRef.current, { zoomControl: false }).setView([startLat, startLng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    leafletMap.current = map;
    return () => {
      map.remove();
      leafletMap.current = null;
    };
  }, []);

  function flyTo(lat: number, lng: number) {
    leafletMap.current?.flyTo([lat, lng], 17, { duration: 0.6 });
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      p => {
        flyTo(p.coords.latitude, p.coords.longitude);
        setLocating(false);
      },
      () => {
        setError('Could not get your current location. Allow location access, or search/pan the map instead.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function onQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.get('/api/geocode/search', { q: value.trim() });
        setResults(r.data?.items || []);
      } catch {
        // silent — search is a convenience, not required
      } finally {
        setSearching(false);
      }
    }, 500);
  }

  function pickResult(res: Result) {
    flyTo(res.lat, res.lng);
    setResults([]);
    setQuery(res.label);
  }

  async function confirm() {
    const center = leafletMap.current?.getCenter();
    if (!center) return;
    setConfirming(true);
    setError('');
    try {
      const r = await api.get('/api/geocode/reverse', { lat: String(center.lat), lng: String(center.lng) });
      onConfirm({ lat: center.lat, lng: center.lng, address: r.data?.label || `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}` });
    } catch {
      onConfirm({ lat: center.lat, lng: center.lng, address: `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}` });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg,#0b0b12)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <button className='circleBtn' onClick={onCancel} type='button'><ArrowLeft size={18} /></button>
        <div className='searchInput' style={{ flex: 1 }}>
          <Search size={17} />
          <input
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder='Search for a street, area, or landmark'
          />
        </div>
      </div>

      {results.length > 0 && (
        <div className='darkPanel' style={{ margin: '0 14px 8px', maxHeight: 180, overflowY: 'auto' }}>
          {results.map((r, i) => (
            <button
              key={i}
              type='button'
              className='darkRow'
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => pickResult(r)}
            >
              <div><small>{r.label}</small></div>
            </button>
          ))}
        </div>
      )}
      {searching && <small style={{ padding: '0 14px 8px', display: 'block' }}>Searching…</small>}

      <div style={{ position: 'relative', flex: 1 }}>
        <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-100%)', pointerEvents: 'none' }}>
          <MapPin size={38} fill='currentColor' style={{ color: '#7c3aed', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.4))' }} />
        </div>
        <button
          type='button'
          className='circleBtn'
          onClick={useCurrentLocation}
          disabled={locating}
          style={{ position: 'absolute', right: 14, bottom: 110, background: 'var(--panel,#1a1a24)' }}
        >
          <Crosshair size={18} />
        </button>
      </div>

      <div style={{ padding: 14 }}>
        <small>Pan the map so the pin sits exactly on the delivery spot, then confirm.</small>
        {error && <div className='authNotice' style={{ marginTop: 8 }}>{error}</div>}
        <button className='purpleBtn wide' type='button' onClick={confirm} disabled={confirming} style={{ marginTop: 10 }}>
          {confirming ? 'Setting location…' : 'Confirm this location'}
        </button>
      </div>
    </div>
  );
}
