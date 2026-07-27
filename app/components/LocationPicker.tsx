"use client";

import { useEffect } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

type Point = {
  lat: number;
  lng: number;
};

type Props = {
  point: Point | null;
  onChange: (point: Point) => void;
  markerColor?: "blue" | "red";
  active?: boolean;
};

const defaultCenter: [number, number] = [56.9496, 24.1052];

function markerIcon(color: "blue" | "red") {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:24px;height:24px;border-radius:50% 50% 50% 0;background:${color === "red" ? "#dc2626" : "#2563eb"};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);transform:rotate(-45deg)"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });
}

function MapEvents({ onChange }: Pick<Props, "onChange">) {
  useMapEvents({
    click(event) {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function MapUpdater({
  point,
  active,
}: {
  point: Point | null;
  active: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    const timeout = window.setTimeout(() => map.invalidateSize(), 80);
    if (point) map.setView([point.lat, point.lng], Math.max(map.getZoom(), 14));
    return () => window.clearTimeout(timeout);
  }, [active, map, point]);

  return null;
}

export default function LocationPicker({
  point,
  onChange,
  markerColor = "blue",
  active = true,
}: Props) {
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Šī ierīce neatbalsta atrašanās vietas noteikšanu.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        onChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () =>
        alert(
          "Atrašanās vietu neizdevās noteikt. Pārbaudi pārlūka atļaujas.",
        ),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="h-64 overflow-hidden rounded-xl border border-slate-200">
        <MapContainer
          center={point ? [point.lat, point.lng] : defaultCenter}
          zoom={point ? 14 : 7}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents onChange={onChange} />
          <MapUpdater point={point} active={active} />
          {point && (
            <Marker
              position={[point.lat, point.lng]}
              icon={markerIcon(markerColor)}
              draggable
              eventHandlers={{
                dragend(event) {
                  const next = event.target.getLatLng();
                  onChange({ lat: next.lat, lng: next.lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <button
        type="button"
        onClick={useCurrentLocation}
        className="w-full rounded-lg border border-blue-500 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
      >
        Mana atrašanās vieta
      </button>

      <p className="text-xs text-slate-500">
        {point
          ? `Punkts: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`
          : "Pieskaries kartei, lai atzīmētu precīzu vietu."}
      </p>
    </div>
  );
}
