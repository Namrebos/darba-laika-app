"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";

type Point = { lat: number; lng: number };
type Suggestion = Point & { label: string };

export default function AddressField({
  id,
  value,
  onChange,
  onMapFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onMapFocus: (point: Point) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedAddressRef = useRef("");

  useEffect(() => {
    const query = value.trim();
    if (query === selectedAddressRef.current) {
      setSuggestions([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    if (query.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        const next = (data.results || []) as Suggestion[];
        setSuggestions(next);
        setOpen(next.length > 0);
        if (next[0]) onMapFocus({ lat: next[0].lat, lng: next[0].lng });
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 650);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [onMapFocus, value]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        required
        value={value}
        onChange={(event) => {
          selectedAddressRef.current = "";
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(suggestions.length > 0)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className="form-input pr-10"
        maxLength={250}
        autoComplete="street-address"
        placeholder="Sāciet rakstīt pilsētu, ielu un numuru"
      />
      {loading && (
        <LoaderCircle
          size={18}
          className="absolute right-3 top-3 animate-spin text-blue-600"
        />
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.lat}-${suggestion.lng}-${suggestion.label}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                selectedAddressRef.current = suggestion.label.trim();
                onChange(suggestion.label);
                onMapFocus({ lat: suggestion.lat, lng: suggestion.lng });
                setSuggestions([]);
                setOpen(false);
                inputRef.current?.blur();
              }}
              className="flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-800 last:border-0 hover:bg-blue-50"
            >
              <MapPin size={16} className="mt-0.5 shrink-0 text-blue-600" />
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Izvēlieties atrasto adresi, pēc tam atzīmējiet precīzo punktu kartē.
      </p>
    </div>
  );
}
