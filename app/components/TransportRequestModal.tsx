"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const LocationPicker = dynamic(() => import("@/app/components/LocationPicker"), {
  ssr: false,
});

type TransportRequest = {
  id: number;
  sender_type: "private" | "company";
  sender_first_name: string | null;
  sender_last_name: string | null;
  sender_company_name: string | null;
  sender_registration_number: string | null;
  sender_phone: string;
  recipient_type: "private" | "company";
  recipient_first_name: string | null;
  recipient_last_name: string | null;
  recipient_company_name: string | null;
  recipient_registration_number: string | null;
  recipient_phone: string;
  pickup_address: string | null;
  pickup_lat: number;
  pickup_lng: number;
  pickup_date: string;
  pickup_time: string | null;
  pickup_notes: string;
  dropoff_address: string | null;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_date: string;
  dropoff_time: string | null;
  dropoff_notes: string;
  cargo_type: string;
  additional_notes: string;
};

type RequestImage = {
  id: number;
  fileName: string;
  url: string;
};

function NavigationMenu({ lat, lng }: { lat: number; lng: number }) {
  const [open, setOpen] = useState(false);
  const encodedPoint = encodeURIComponent(`${lat},${lng}`);
  const options = [
    {
      label: "Google Maps",
      href: `https://www.google.com/maps/dir/?api=1&destination=${encodedPoint}`,
    },
    {
      label: "Waze",
      href: `https://waze.com/ul?ll=${encodedPoint}&navigate=yes`,
    },
    {
      label: "Apple Maps",
      href: `https://maps.apple.com/?daddr=${encodedPoint}`,
    },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
      >
        <Navigation size={16} />
        Atvērt navigācijā
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white text-slate-950 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
          {options.map((option) => (
            <a
              key={option.label}
              href={option.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {option.label}
              <ExternalLink size={14} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ReadonlyField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-800">
        {label}
      </span>
      {multiline ? (
        <textarea
          readOnly
          value={value || ""}
          className="form-input min-h-24 resize-none bg-slate-50"
        />
      ) : (
        <input
          readOnly
          value={value || ""}
          className="form-input bg-slate-50"
        />
      )}
    </label>
  );
}

function PartySection({
  title,
  type,
  firstName,
  lastName,
  companyName,
  registrationNumber,
  phone,
}: {
  title: string;
  type: "private" | "company";
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  registrationNumber: string | null;
  phone: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-xl font-bold text-slate-900">{title}</h3>
      <div className="space-y-4">
        <div>
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            Klienta veids
          </span>
          <div className="flex gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={type === "private"} readOnly />
              Privātpersona
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={type === "company"} readOnly />
              Juridiska persona
            </label>
          </div>
        </div>
        {type === "company" ? (
          <>
            <ReadonlyField label="Uzņēmuma nosaukums" value={companyName} />
            <ReadonlyField
              label="Reģistrācijas/PVN numurs"
              value={registrationNumber}
            />
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadonlyField label="Vārds" value={firstName} />
            <ReadonlyField label="Uzvārds" value={lastName} />
          </div>
        )}
        <div>
          <span className="mb-1 block text-sm font-semibold text-slate-800">
            Tālrunis
          </span>
          <div className="flex gap-2">
            <input
              readOnly
              value={phone}
              className="form-input min-w-0 flex-1 bg-slate-50"
            />
            <a
              href={`tel:${phone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 font-semibold text-white"
              aria-label={`Zvanīt ${phone}`}
            >
              <Phone size={18} />
              Zvanīt
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function LocationSection({
  title,
  address,
  lat,
  lng,
  date,
  time,
  notes,
  markerColor,
}: {
  title: string;
  address: string | null;
  lat: number;
  lng: number;
  date: string;
  time: string | null;
  notes: string;
  markerColor: "blue" | "red";
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900">
        <MapPin size={20} className="text-blue-600" />
        {title}
      </h3>
      <div className="space-y-4">
        <ReadonlyField label="Adrese" value={address} />
        <div>
          <span className="mb-1 block text-sm font-semibold text-slate-800">
            Precīza vieta kartē
          </span>
          <LocationPicker
            point={{ lat, lng }}
            onChange={() => undefined}
            markerColor={markerColor}
            readOnly
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadonlyField label="Datums" value={date} />
          <ReadonlyField label="Laiks" value={time?.slice(0, 5) || ""} />
        </div>
        <ReadonlyField label="Piezīmes" value={notes} multiline />
        <NavigationMenu lat={lat} lng={lng} />
      </div>
    </section>
  );
}

export default function TransportRequestModal({
  requestId,
  onClose,
}: {
  requestId: number | null;
  onClose: () => void;
}) {
  const [transportRequest, setTransportRequest] =
    useState<TransportRequest | null>(null);
  const [images, setImages] = useState<RequestImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!requestId) return;

    async function load() {
      setLoading(true);
      setError("");
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`/api/transport-requests/${requestId}`, {
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
      });
      const result = await response.json();
      setLoading(false);
      if (!response.ok) {
        setError(result.error || "Pieteikumu neizdevās ielādēt.");
        return;
      }
      setTransportRequest(result.request as TransportRequest);
      setImages((result.images || []) as RequestImage[]);
    }

    void load();
  }, [requestId]);

  if (!requestId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3">
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-slate-50 text-slate-950 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2 className="text-xl font-bold">Pārvadājuma pieteikums</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Aizvērt"
          >
            <X size={21} />
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {loading && <p>Ielādē...</p>}
          {error && <p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}

          {transportRequest && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <PartySection
                  title="Nosūtītājs"
                  type={transportRequest.sender_type}
                  firstName={transportRequest.sender_first_name}
                  lastName={transportRequest.sender_last_name}
                  companyName={transportRequest.sender_company_name}
                  registrationNumber={
                    transportRequest.sender_registration_number
                  }
                  phone={transportRequest.sender_phone}
                />
                <PartySection
                  title="Saņēmējs"
                  type={transportRequest.recipient_type}
                  firstName={transportRequest.recipient_first_name}
                  lastName={transportRequest.recipient_last_name}
                  companyName={transportRequest.recipient_company_name}
                  registrationNumber={
                    transportRequest.recipient_registration_number
                  }
                  phone={transportRequest.recipient_phone}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <LocationSection
                  title="Uzkraušana"
                  address={transportRequest.pickup_address}
                  lat={transportRequest.pickup_lat}
                  lng={transportRequest.pickup_lng}
                  date={transportRequest.pickup_date}
                  time={transportRequest.pickup_time}
                  notes={transportRequest.pickup_notes}
                  markerColor="blue"
                />
                <LocationSection
                  title="Izkraušana"
                  address={transportRequest.dropoff_address}
                  lat={transportRequest.dropoff_lat}
                  lng={transportRequest.dropoff_lng}
                  date={transportRequest.dropoff_date}
                  time={transportRequest.dropoff_time}
                  notes={transportRequest.dropoff_notes}
                  markerColor="red"
                />
              </div>

              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-xl font-bold text-slate-900">
                  Kravas informācija
                </h3>
                <ReadonlyField
                  label="Kravas veids"
                  value={transportRequest.cargo_type}
                />
                <ReadonlyField
                  label="Papildu piezīmes"
                  value={transportRequest.additional_notes}
                  multiline
                />
              </section>

              {images.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 font-bold">Attēli</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {images.map((image) => (
                      <a
                        key={image.id}
                        href={image.url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative aspect-square overflow-hidden rounded-lg"
                      >
                        <Image
                          src={image.url}
                          alt={image.fileName}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
