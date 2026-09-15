"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp, LoaderCircle, MapPin } from "lucide-react";

type Point = { lat: number; lng: number };
type Suggestion = { label: string; placeId?: string; lat?: number; lng?: number };

export default function AddressField({
  id,
  value,
  onChange,
  onMapFocus,
  onLocationImport,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onMapFocus: (point: Point) => void;
  onLocationImport?: (point: Point) => void | Promise<void>;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const selectedAddressRef = useRef("");
  const userQueryRef = useRef("");
  const sessionTokenRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!helpOpen) return;

    const closeHelpOutside = (event: PointerEvent) => {
      if (!fieldRef.current?.contains(event.target as Node)) {
        setHelpOpen(false);
      }
    };
    const closeHelpWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelpOpen(false);
    };

    document.addEventListener("pointerdown", closeHelpOutside);
    document.addEventListener("keydown", closeHelpWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeHelpOutside);
      document.removeEventListener("keydown", closeHelpWithEscape);
    };
  }, [helpOpen]);

  const looksLikeLocation = (text: string) =>
    /https?:\/\//i.test(text) ||
    /^\s*-?\d{1,2}(?:\.\d+)?\s*[, ]\s*-?\d{1,3}(?:\.\d+)?\s*$/.test(text);

  const importLocation = async (text: string) => {
    if (!onLocationImport || !looksLikeLocation(text)) return false;
    setImportLoading(true);
    setImportError("");
    setSuggestions([]);
    setOpen(false);
    try {
      const response = await fetch("/api/location-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: text }),
      });
      const result = (await response.json()) as { point?: Point; error?: string };
      if (!response.ok || !result.point) {
        setImportError(result.error || "Lokāciju neizdevās nolasīt.");
        return true;
      }
      await onLocationImport(result.point);
      inputRef.current?.blur();
      return true;
    } catch {
      setImportError("Lokāciju neizdevās nolasīt.");
      return true;
    } finally {
      setImportLoading(false);
    }
  };

  useEffect(() => {
    const query = value.trim();
    if (query === selectedAddressRef.current) {
      setSuggestions([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    if (query !== userQueryRef.current) {
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
        const response = await fetch(
          `/api/geocode?q=${encodeURIComponent(query)}&sessionToken=${encodeURIComponent(sessionTokenRef.current)}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        const next = (data.results || []) as Suggestion[];
        setSuggestions(next);
        setOpen(next.length > 0);
        if (typeof next[0]?.lat === "number" && typeof next[0]?.lng === "number") {
          onMapFocus({ lat: next[0].lat, lng: next[0].lng });
        }
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
    <div ref={fieldRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        required
        value={value}
        onChange={(event) => {
          selectedAddressRef.current = "";
          userQueryRef.current = event.target.value.trim();
          setImportError("");
          onChange(event.target.value);
          setOpen(true);
        }}
        onPaste={(event) => {
          const pastedValue = event.clipboardData.getData("text").trim();
          if (!looksLikeLocation(pastedValue)) return;
          event.preventDefault();
          selectedAddressRef.current = "";
          userQueryRef.current = "";
          onChange(pastedValue);
          void importLocation(pastedValue);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && looksLikeLocation(value)) {
            event.preventDefault();
            void importLocation(value);
          }
        }}
        onFocus={() => setOpen(suggestions.length > 0)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className="form-input pr-20"
        maxLength={2048}
        autoComplete="off"
        data-1p-ignore="true"
        placeholder="Adrese, uzņēmums, vieta vai kartes saite"
      />
      {(loading || importLoading) && (
        <LoaderCircle
          size={18}
          className="absolute right-11 top-3 animate-spin text-blue-600"
        />
      )}
      <button
        type="button"
        aria-label="Kā aizpildīt atrašanās vietu"
        aria-expanded={helpOpen}
        onClick={() => setHelpOpen((current) => !current)}
        onBlur={() => setHelpOpen(false)}
        className="group absolute right-3 top-3 text-slate-500 hover:text-blue-600 focus:text-blue-600"
      >
        <CircleHelp size={19} />
        <span
          role="tooltip"
          className={`${helpOpen ? "block" : "hidden group-hover:block group-focus:block"} absolute right-0 top-7 z-[1100] w-64 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-xl`}
        >
          Rakstiet adresi, uzņēmuma vai vietas nosaukumu vai ielīmējiet koordinātes, Google Maps, Waze vai Apple Maps saiti.
        </span>
      </button>
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId || `${suggestion.lat}-${suggestion.lng}-${suggestion.label}`}
              type="button"
              onPointerDown={async (event) => {
                event.preventDefault();
                setSuggestions([]);
                setOpen(false);
                let selected = suggestion;
                if (suggestion.placeId) {
                  setLoading(true);
                  try {
                    const response = await fetch(
                      `/api/geocode?placeId=${encodeURIComponent(suggestion.placeId)}&sessionToken=${encodeURIComponent(sessionTokenRef.current)}`,
                    );
                    const data = (await response.json()) as { result?: Suggestion };
                    if (response.ok && data.result) selected = data.result;
                  } finally {
                    setLoading(false);
                    sessionTokenRef.current = crypto.randomUUID();
                  }
                }
                if (typeof selected.lat !== "number" || typeof selected.lng !== "number") return;
                selectedAddressRef.current = selected.label.trim();
                onChange(selected.label);
                onMapFocus({ lat: selected.lat, lng: selected.lng });
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
      {importError && <p className="mt-1 text-xs text-red-600">{importError}</p>}
    </div>
  );
}
