"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  WMSTileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { Layers, LocateFixed } from "lucide-react";

type Point = {
  lat: number;
  lng: number;
};

type Props = {
  point: Point | null;
  focusPoint?: Point | null;
  onChange: (point: Point) => void;
  markerColor?: "blue" | "red";
  active?: boolean;
  readOnly?: boolean;
  footer?: ReactNode;
};

const defaultCenter: [number, number] = [56.9496, 24.1052];
const lvmOrthoUrl =
  "https://geoserver.lvmgeo.lv/wms62531a9bfcfa4015856924e94076a178";
const crs84 = L.extend({}, L.CRS.EPSG4326, { code: "CRS:84" }) as L.CRS;

function markerIcon(color: "blue" | "red") {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:24px;height:24px;border-radius:50% 50% 50% 0;background:${color === "red" ? "#dc2626" : "#2563eb"};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);transform:rotate(-45deg)"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });
}

function MapEvents({
  onChange,
  readOnly,
}: Pick<Props, "onChange" | "readOnly">) {
  useMapEvents({
    click(event) {
      if (readOnly) return;
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function MapUpdater({
  point,
  focusPoint,
  active,
}: {
  point: Point | null;
  focusPoint: Point | null;
  active: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    let frame = 0;
    const refreshSize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => map.invalidateSize(false));
    };
    const container = map.getContainer();
    const observer = new ResizeObserver(refreshSize);
    observer.observe(container);
    const timeouts = [0, 100, 300, 700, 1500].map((delay) =>
      window.setTimeout(refreshSize, delay),
    );
    window.addEventListener("resize", refreshSize);
    window.addEventListener("orientationchange", refreshSize);
    container.addEventListener("transitionend", refreshSize);

    if (point) {
      map.setView([point.lat, point.lng], Math.max(map.getZoom(), 18));
    } else if (focusPoint) {
      map.setView(
        [focusPoint.lat, focusPoint.lng],
        Math.max(map.getZoom(), 13),
      );
    }
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refreshSize);
      window.removeEventListener("orientationchange", refreshSize);
      container.removeEventListener("transitionend", refreshSize);
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      window.cancelAnimationFrame(frame);
    };
  }, [active, focusPoint, map, point]);

  return null;
}

export default function LocationPicker({
  point,
  focusPoint = null,
  onChange,
  markerColor = "blue",
  active = true,
  readOnly = false,
  footer,
}: Props) {
  const [baseLayer, setBaseLayer] = useState<"map" | "ortho">("map");
  const mapRef = useRef<L.Map | null>(null);
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
      <div className="relative h-64 overflow-hidden rounded-xl border border-slate-200">
        <MapContainer
          ref={mapRef}
          center={point ? [point.lat, point.lng] : defaultCenter}
          zoom={point ? 18 : 7}
          zoomControl={false}
          scrollWheelZoom
          className="h-full w-full"
          style={{ height: "100%", width: "100%" }}
        >
          {baseLayer === "map" ? (
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          ) : (
            <WMSTileLayer
              url={lvmOrthoUrl}
              layers="Orto_LKS"
              format="image/jpeg"
              version="1.3.0"
              crs={crs84}
              attribution="Ortofoto &copy; LĢIA, LVM GEO"
            />
          )}
          <MapEvents onChange={onChange} readOnly={readOnly} />
          <MapUpdater point={point} focusPoint={focusPoint} active={active} />
          {point && (
            <Marker
              position={[point.lat, point.lng]}
              icon={markerIcon(markerColor)}
              draggable={!readOnly}
              eventHandlers={{
                dragend(event) {
                  const next = event.target.getLatLng();
                  onChange({ lat: next.lat, lng: next.lng });
                },
              }}
            />
          )}
        </MapContainer>
        <div className="absolute left-2.5 top-2.5 z-[1000] overflow-hidden rounded border border-slate-400 bg-white text-slate-900 shadow-md">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            className="flex h-8 w-8 items-center justify-center border-b border-slate-300 text-xl leading-none"
            aria-label="Pietuvināt karti"
            title="Pietuvināt"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            className="flex h-8 w-8 items-center justify-center text-xl leading-none"
            aria-label="Attālināt karti"
            title="Attālināt"
          >
            −
          </button>
        </div>
        <div className="absolute left-2.5 top-[4.75rem] z-[1000] flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() =>
              setBaseLayer((current) =>
                current === "map" ? "ortho" : "map",
              )
            }
            className={`flex h-8 w-8 items-center justify-center rounded border border-slate-400 shadow-md ${
              baseLayer === "ortho"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-800"
            }`}
            aria-label={
              baseLayer === "map"
                ? "Pārslēgt uz ortofoto"
                : "Pārslēgt uz karti"
            }
            title={baseLayer === "map" ? "Rādīt ortofoto" : "Rādīt karti"}
          >
            <Layers size={17} />
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={useCurrentLocation}
              className="flex h-8 w-8 items-center justify-center rounded border border-slate-400 bg-white text-blue-700 shadow-md"
              aria-label="Izmantot manu atrašanās vietu"
              title="Mana atrašanās vieta"
            >
              <LocateFixed size={18} />
            </button>
          )}
        </div>
      </div>
      {footer}

      <p className="text-xs text-slate-500">
        {point
          ? `Punkts: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`
          : readOnly
            ? "Punkts nav norādīts."
            : "Pieskaries kartei, lai atzīmētu precīzu vietu."}
      </p>
    </div>
  );
}
