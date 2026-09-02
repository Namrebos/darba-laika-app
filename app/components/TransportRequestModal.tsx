"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  Save,
  Repeat2,
  X,
} from "lucide-react";
import AddressField from "@/app/components/AddressField";
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
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  dropoff_contact_name: string | null;
  dropoff_contact_phone: string | null;
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
  if (!value?.trim()) return null;

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
        {type === "company" ? (
          <>
            <ReadonlyField label="Uzņēmuma nosaukums" value={companyName} />
            <ReadonlyField
              label="Reģistrācijas/PVN numurs"
              value={registrationNumber}
            />
          </>
        ) : (
          <div
            className={`grid gap-3 ${lastName?.trim() ? "sm:grid-cols-2" : ""}`}
          >
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
  contactName,
  contactPhone,
  markerColor,
}: {
  title: string;
  address: string | null;
  lat: number;
  lng: number;
  date: string;
  time: string | null;
  notes: string;
  contactName: string | null;
  contactPhone: string | null;
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
        <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2"><ReadonlyField label="Kontaktpersona" value={contactName} /><ReadonlyField label="Kontakttālrunis" value={contactPhone} /></div>
        <div className={`grid gap-3 ${time?.trim() ? "sm:grid-cols-2" : ""}`}>
          <ReadonlyField label="Datums" value={date} />
          <ReadonlyField label="Laiks" value={time?.slice(0, 5) || ""} />
        </div>
        <ReadonlyField label="Piezīmes" value={notes} multiline />
        <NavigationMenu lat={lat} lng={lng} />
      </div>
    </section>
  );
}

function EditField({
  label,
  value,
  onChange,
  required = false,
  multiline = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  required?: boolean;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-800">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {multiline ? (
        <textarea
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          className="form-input min-h-24 resize-y bg-white"
        />
      ) : (
        <input
          required={required}
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          className="form-input bg-white"
        />
      )}
    </label>
  );
}

function EditablePartySection({
  title,
  prefix,
  request,
  update,
}: {
  title: string;
  prefix: "sender" | "recipient";
  request: TransportRequest;
  update: (changes: Partial<TransportRequest>) => void;
}) {
  const [suggestions, setSuggestions] = useState<{ name: string; registrationNumber: string; address?: string }[]>([]);
  const [searchField, setSearchField] = useState<"name" | "registration" | null>(null);
  const typeKey = `${prefix}_type` as "sender_type" | "recipient_type";
  const type = request[typeKey];
  const key = (name: string) => `${prefix}_${name}` as keyof TransportRequest;
  const setText = (name: string, value: string) =>
    update({ [key(name)]: value } as Partial<TransportRequest>);
  const companyName = String(request[key("company_name")] || "");
  const registrationNumber = String(request[key("registration_number")] || "");
  useEffect(() => {
    const query = (searchField === "registration" ? registrationNumber : companyName).trim();
    if (!searchField || type !== "company" || query.length < 2) return setSuggestions([]);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/companies?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      const result = await response.json();
      setSuggestions(result.companies || []);
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [companyName, registrationNumber, searchField, type]);

  const chooseCompany = (company: { name: string; registrationNumber: string; address?: string }) => {
    update({
      [key("company_name")]: company.name,
      [key("registration_number")]: company.registrationNumber,
      ...(prefix === "sender" && company.address
        ? { sender_address: company.address }
        : {}),
    } as Partial<TransportRequest>);
    setSearchField(null);
    setSuggestions([]);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-xl font-bold text-slate-900">{title}</h3>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-800">Klienta veids</span>
          <select
            value={type}
            onChange={(event) => update({ [typeKey]: event.target.value } as Partial<TransportRequest>)}
            className="form-input bg-white"
          >
            <option value="private">Privātpersona</option>
            <option value="company">Juridiska persona</option>
          </select>
        </label>
        {type === "company" ? (
          <>
            <div className="relative"><label className="block"><span className="mb-1 block text-sm font-semibold text-slate-800">Uzņēmuma nosaukums *</span><input value={companyName} onFocus={() => setSearchField("name")} onChange={(e) => setText("company_name", e.target.value)} className="form-input bg-white" autoComplete="off" /></label>
            {searchField === "name" && suggestions.length > 0 && <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-lg border bg-white shadow-xl">{suggestions.map((company) => <button type="button" key={`${company.registrationNumber}-${company.name}`} onPointerDown={(event) => { event.preventDefault(); chooseCompany(company); }} className="block w-full px-3 py-2 text-left hover:bg-blue-50"><strong>{company.name}</strong><span className="block text-xs text-slate-500">Reģ. Nr. {company.registrationNumber}</span></button>)}</div>}</div>
            <div className="relative"><label className="block"><span className="mb-1 block text-sm font-semibold text-slate-800">Reģistrācijas/PVN numurs</span><input value={registrationNumber} onFocus={() => setSearchField("registration")} onChange={(event) => setText("registration_number", event.target.value)} className="form-input bg-white" autoComplete="off" /></label>
            {searchField === "registration" && suggestions.length > 0 && <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-lg border bg-white shadow-xl">{suggestions.map((company) => <button type="button" key={`${company.registrationNumber}-${company.name}`} onPointerDown={(event) => { event.preventDefault(); chooseCompany(company); }} className="block w-full px-3 py-2 text-left hover:bg-blue-50"><strong>{company.name}</strong><span className="block text-xs text-slate-500">Reģ. Nr. {company.registrationNumber}</span></button>)}</div>}</div>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <EditField label="Vārds" required value={String(request[key("first_name")] || "")} onChange={(value) => setText("first_name", value)} />
            <EditField label="Uzvārds" value={String(request[key("last_name")] || "")} onChange={(value) => setText("last_name", value)} />
          </div>
        )}
        <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-800">Tālrunis *</span><input type="tel" value={String(request[key("phone")] || "")} onChange={(e) => setText("phone", e.target.value.replace(/[^+\d\s()-]/g, ""))} pattern="\+[1-9]\d{7,14}" className="form-input bg-white" />{!/^\+[1-9]\d{7,14}$/.test(String(request[key("phone")] || "").replace(/[\s()-]/g, "")) && <span className="mt-1 block text-xs text-red-600">Ievadi valsts kodu un 8–15 ciparus.</span>}</label>
      </div>
    </section>
  );
}

function EditableDateTime({
  label,
  date,
  time,
  onChange,
}: {
  label: string;
  date: string;
  time: string | null;
  onChange: (date: string, time: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const value = `${date}T${time?.slice(0, 5) || "09:00"}`;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-800">{label} *</span>
      <div className="relative">
        <button type="button" onClick={() => { const input = inputRef.current; if (!input) return; if (typeof input.showPicker === "function") input.showPicker(); else { input.focus(); input.click(); } }} className="form-input flex min-h-12 w-full items-center gap-3 bg-white text-left">
          <CalendarClock size={20} className="text-blue-600" />
          <span>{date}{time ? ` ${time.slice(0, 5)}` : ""}</span>
        </button>
        <input
          ref={inputRef}
          type="datetime-local"
          value={value}
          onChange={(event) => {
            const [nextDate = "", nextTime = ""] = event.currentTarget.value.split("T");
            onChange(nextDate, nextTime);
          }}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      </div>
    </label>
  );
}

function EditableLocationSection({
  title,
  prefix,
  request,
  update,
  markerColor,
}: {
  title: string;
  prefix: "pickup" | "dropoff";
  request: TransportRequest;
  update: (changes: Partial<TransportRequest>) => void;
  markerColor: "blue" | "red";
}) {
  const addressKey = `${prefix}_address` as "pickup_address" | "dropoff_address";
  const latKey = `${prefix}_lat` as "pickup_lat" | "dropoff_lat";
  const lngKey = `${prefix}_lng` as "pickup_lng" | "dropoff_lng";
  const dateKey = `${prefix}_date` as "pickup_date" | "dropoff_date";
  const timeKey = `${prefix}_time` as "pickup_time" | "dropoff_time";
  const notesKey = `${prefix}_notes` as "pickup_notes" | "dropoff_notes";
  const contactNameKey = `${prefix}_contact_name` as "pickup_contact_name" | "dropoff_contact_name";
  const contactPhoneKey = `${prefix}_contact_phone` as "pickup_contact_phone" | "dropoff_contact_phone";
  const setPoint = useCallback(async (point: { lat: number; lng: number }) => {
    update({ [latKey]: point.lat, [lngKey]: point.lng } as Partial<TransportRequest>);
    try {
      const response = await fetch(`/api/geocode?lat=${point.lat}&lng=${point.lng}`);
      const result = await response.json();
      if (result.result?.label) {
        update({
          [latKey]: point.lat,
          [lngKey]: point.lng,
          [addressKey]: result.result.label,
        } as Partial<TransportRequest>);
      }
    } catch {
      // Precīzais punkts saglabājas arī tad, ja adresi neizdodas noteikt.
    }
  }, [addressKey, latKey, lngKey, update]);
  const focusPoint = useCallback((point: { lat: number; lng: number }) => {
    update({ [latKey]: point.lat, [lngKey]: point.lng } as Partial<TransportRequest>);
  }, [latKey, lngKey, update]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900">
        <MapPin size={20} className="text-blue-600" />{title}
      </h3>
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-sm font-semibold text-slate-800">Adrese *</span>
          <AddressField
            id={`${prefix}-edit-address`}
            value={request[addressKey] || ""}
            onChange={(value) => update({ [addressKey]: value } as Partial<TransportRequest>)}
            onMapFocus={focusPoint}
            onLocationImport={setPoint}
          />
        </div>
        <div>
          <span className="mb-1 block text-sm font-semibold text-slate-800">Precīza vieta kartē *</span>
          <LocationPicker
            point={{ lat: request[latKey], lng: request[lngKey] }}
            onChange={setPoint}
            markerColor={markerColor}
          />
        </div>
        <EditableDateTime
          label="Datums un laiks"
          date={request[dateKey]}
          time={request[timeKey]}
          onChange={(date, time) => update({ [dateKey]: date, [timeKey]: time || null } as Partial<TransportRequest>)}
        />
        <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
          <EditField label="Kontaktpersona" required value={request[contactNameKey]} onChange={(value) => update({ [contactNameKey]: value } as Partial<TransportRequest>)} />
          <EditField label="Kontakttālrunis" required value={request[contactPhoneKey]} onChange={(value) => update({ [contactPhoneKey]: value } as Partial<TransportRequest>)} />
        </div>
        <EditField label="Piezīmes" value={request[notesKey]} multiline onChange={(value) => update({ [notesKey]: value } as Partial<TransportRequest>)} />
      </div>
    </section>
  );
}

export default function TransportRequestModal({
  requestId,
  onClose,
  editable = false,
  onSaved,
}: {
  requestId: number | null;
  onClose: () => void;
  editable?: boolean;
  onSaved?: () => void;
}) {
  const [transportRequest, setTransportRequest] =
    useState<TransportRequest | null>(null);
  const [images, setImages] = useState<RequestImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cargoTypes, setCargoTypes] = useState<string[]>([]);

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

  useEffect(() => {
    supabase.from("cargo_types").select("name").order("name").then(({ data }) => setCargoTypes((data || []).map((item) => item.name)));
  }, []);

  const updateRequest = useCallback((changes: Partial<TransportRequest>) => {
    setTransportRequest((current) => current ? { ...current, ...changes } : current);
  }, []);

  async function saveRequest() {
    if (!transportRequest || !requestId) return;
    const validPhone = (value: string) => /^\+[1-9]\d{7,14}$/.test(value.replace(/[\s()-]/g, ""));
    if (!validPhone(transportRequest.sender_phone) || !validPhone(transportRequest.recipient_phone)) {
      setError("Pārbaudi abus tālruņa numurus: nepieciešams valsts kods un 8–15 cipari.");
      return;
    }
    if (!transportRequest.pickup_date || !transportRequest.dropoff_date) {
      setError("Izvēlies uzkraušanas un izkraušanas datumu.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch(`/api/transport-requests/${requestId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(transportRequest),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(result.error || "Pieteikumu neizdevās saglabāt.");
      return;
    }
    setTransportRequest(result.request as TransportRequest);
    setMessage("Pieteikuma izmaiņas saglabātas.");
    onSaved?.();
  }

  function reverseRoute() {
    setTransportRequest((current) => current ? {
      ...current,
      sender_type: current.recipient_type,
      sender_first_name: current.recipient_first_name,
      sender_last_name: current.recipient_last_name,
      sender_company_name: current.recipient_company_name,
      sender_registration_number: current.recipient_registration_number,
      sender_phone: current.recipient_phone,
      recipient_type: current.sender_type,
      recipient_first_name: current.sender_first_name,
      recipient_last_name: current.sender_last_name,
      recipient_company_name: current.sender_company_name,
      recipient_registration_number: current.sender_registration_number,
      recipient_phone: current.sender_phone,
      pickup_address: current.dropoff_address,
      pickup_lat: current.dropoff_lat,
      pickup_lng: current.dropoff_lng,
      pickup_notes: current.dropoff_notes,
      pickup_contact_name: current.dropoff_contact_name,
      pickup_contact_phone: current.dropoff_contact_phone,
      dropoff_address: current.pickup_address,
      dropoff_lat: current.pickup_lat,
      dropoff_lng: current.pickup_lng,
      dropoff_notes: current.pickup_notes,
      dropoff_contact_name: current.pickup_contact_name,
      dropoff_contact_phone: current.pickup_contact_phone,
    } : current);
  }

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
          {message && <p className="rounded-lg bg-green-50 p-3 text-green-700">{message}</p>}

          {transportRequest && editable && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <EditablePartySection title="Pasūtītājs" prefix="sender" request={transportRequest} update={updateRequest} />
                <EditablePartySection title="Saņēmējs" prefix="recipient" request={transportRequest} update={updateRequest} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <EditableLocationSection title="Uzkraušana" prefix="pickup" request={transportRequest} update={updateRequest} markerColor="blue" />
                <EditableLocationSection title="Izkraušana" prefix="dropoff" request={transportRequest} update={updateRequest} markerColor="red" />
              </div>
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-xl font-bold text-slate-900">Kravas informācija</h3>
                <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-800">Kravas veids *</span><select value={transportRequest.cargo_type} onChange={(event) => updateRequest({ cargo_type: event.target.value })} className="form-input bg-white"><option value="">Izvēlies</option>{cargoTypes.map((name) => <option key={name} value={name}>{name}</option>)}{transportRequest.cargo_type && !cargoTypes.includes(transportRequest.cargo_type) && <option value={transportRequest.cargo_type}>{transportRequest.cargo_type}</option>}</select></label>
                <EditField label="Papildu piezīmes" value={transportRequest.additional_notes} multiline onChange={(value) => updateRequest({ additional_notes: value })} />
              </section>
              <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 py-3">
                <button type="button" onClick={reverseRoute} aria-label="Apgriezt maršrutu" title="Apgriezt maršrutu" className="rounded-lg border border-slate-400 p-3 text-slate-800">
                  <Repeat2 size={22} />
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveRequest()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
                >
                  <Save size={18} />{saving ? "Saglabā..." : "Saglabāt izmaiņas"}
                </button>
              </div>
            </>
          )}

          {transportRequest && !editable && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <PartySection
                  title="Pasūtītājs"
                  type={transportRequest.sender_type}
                  firstName={transportRequest.sender_first_name}
                  lastName={transportRequest.sender_last_name}
                  companyName={transportRequest.sender_company_name}
                  registrationNumber={
                    transportRequest.sender_registration_number
                  }
                  phone={transportRequest.sender_phone}
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
                  contactName={transportRequest.pickup_contact_name}
                  contactPhone={transportRequest.pickup_contact_phone}
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
                  contactName={transportRequest.dropoff_contact_name}
                  contactPhone={transportRequest.dropoff_contact_phone}
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
