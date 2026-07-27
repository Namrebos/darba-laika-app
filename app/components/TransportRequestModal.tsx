"use client";

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

function partyName(
  type: "private" | "company",
  firstName: string | null,
  lastName: string | null,
  companyName: string | null,
) {
  return type === "company"
    ? companyName || "Uzņēmums"
    : [firstName, lastName].filter(Boolean).join(" ") || "Privātpersona";
}

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
        <div className="absolute left-0 top-full z-20 mt-1 min-w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {options.map((option) => (
            <a
              key={option.label}
              href={option.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
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

function LocationBlock({
  title,
  address,
  lat,
  lng,
  date,
  time,
  notes,
}: {
  title: string;
  address: string | null;
  lat: number;
  lng: number;
  date: string;
  time: string | null;
  notes: string;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
      <h3 className="flex items-center gap-2 font-bold">
        <MapPin size={18} className="text-blue-600" />
        {title}
      </h3>
      <div className="text-sm">
        <p>{address || "Adrese nav norādīta"}</p>
        <p className="mt-1 text-zinc-500">
          {date}
          {time ? ` · ${time.slice(0, 5)}` : ""}
        </p>
        {notes && <p className="mt-2 whitespace-pre-wrap">{notes}</p>}
      </div>
      <NavigationMenu lat={lat} lng={lng} />
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
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white text-zinc-950 shadow-2xl dark:bg-zinc-950 dark:text-white">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-4 dark:border-zinc-700 dark:bg-zinc-950">
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
                <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                  <h3 className="font-bold">Nosūtītājs</h3>
                  <p className="mt-2">
                    {partyName(
                      transportRequest.sender_type,
                      transportRequest.sender_first_name,
                      transportRequest.sender_last_name,
                      transportRequest.sender_company_name,
                    )}
                  </p>
                  {transportRequest.sender_registration_number && (
                    <p className="text-sm text-zinc-500">
                      Reģ. Nr. {transportRequest.sender_registration_number}
                    </p>
                  )}
                  <a
                    href={`tel:${transportRequest.sender_phone.replace(/\s/g, "")}`}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
                  >
                    <Phone size={16} />
                    {transportRequest.sender_phone}
                  </a>
                </section>

                <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                  <h3 className="font-bold">Saņēmējs</h3>
                  <p className="mt-2">
                    {partyName(
                      transportRequest.recipient_type,
                      transportRequest.recipient_first_name,
                      transportRequest.recipient_last_name,
                      transportRequest.recipient_company_name,
                    )}
                  </p>
                  {transportRequest.recipient_registration_number && (
                    <p className="text-sm text-zinc-500">
                      Reģ. Nr. {transportRequest.recipient_registration_number}
                    </p>
                  )}
                  <a
                    href={`tel:${transportRequest.recipient_phone.replace(/\s/g, "")}`}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
                  >
                    <Phone size={16} />
                    {transportRequest.recipient_phone}
                  </a>
                </section>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <LocationBlock
                  title="Uzkraušana"
                  address={transportRequest.pickup_address}
                  lat={transportRequest.pickup_lat}
                  lng={transportRequest.pickup_lng}
                  date={transportRequest.pickup_date}
                  time={transportRequest.pickup_time}
                  notes={transportRequest.pickup_notes}
                />
                <LocationBlock
                  title="Izkraušana"
                  address={transportRequest.dropoff_address}
                  lat={transportRequest.dropoff_lat}
                  lng={transportRequest.dropoff_lng}
                  date={transportRequest.dropoff_date}
                  time={transportRequest.dropoff_time}
                  notes={transportRequest.dropoff_notes}
                />
              </div>

              <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                <h3 className="font-bold">Krava</h3>
                <p className="mt-2">{transportRequest.cargo_type}</p>
                {transportRequest.additional_notes && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">
                    {transportRequest.additional_notes}
                  </p>
                )}
              </section>

              {images.length > 0 && (
                <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
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
