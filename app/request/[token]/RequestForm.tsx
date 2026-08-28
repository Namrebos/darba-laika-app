"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import imageCompression from "browser-image-compression";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ImagePlus,
  Send,
  Trash2,
  Truck,
} from "lucide-react";
import AddressField from "@/app/components/AddressField";
import { supabase } from "@/lib/supabaseClient";

const LocationPicker = dynamic(
  () => import("@/app/components/LocationPicker"),
  { ssr: false },
);

type PartyType = "private" | "company";
type Point = { lat: number; lng: number };
type CompanySuggestion = {
  name: string;
  registrationNumber: string;
  address: string;
};

type FormState = {
  sender_type: PartyType;
  sender_first_name: string;
  sender_last_name: string;
  sender_company_name: string;
  sender_registration_number: string;
  sender_phone_code: string;
  sender_phone: string;
  recipient_type: PartyType;
  recipient_first_name: string;
  recipient_last_name: string;
  recipient_company_name: string;
  recipient_registration_number: string;
  recipient_phone_code: string;
  recipient_phone: string;
  pickup_address: string;
  pickup_date: string;
  pickup_time: string;
  pickup_notes: string;
  dropoff_address: string;
  dropoff_date: string;
  dropoff_time: string;
  dropoff_notes: string;
  cargo_type: string;
  additional_notes: string;
};

const initialForm: FormState = {
  sender_type: "private",
  sender_first_name: "",
  sender_last_name: "",
  sender_company_name: "",
  sender_registration_number: "",
  sender_phone_code: "+371",
  sender_phone: "",
  recipient_type: "private",
  recipient_first_name: "",
  recipient_last_name: "",
  recipient_company_name: "",
  recipient_registration_number: "",
  recipient_phone_code: "+371",
  recipient_phone: "",
  pickup_address: "",
  pickup_date: "",
  pickup_time: "",
  pickup_notes: "",
  dropoff_address: "",
  dropoff_date: "",
  dropoff_time: "",
  dropoff_notes: "",
  cargo_type: "",
  additional_notes: "",
};

const cargoTypes = [
  "Būvmateriāli",
  "Lauksaimniecības tehnika",
  "Celtniecības tehnika",
  "Automašīna",
  "Cits",
];

const countryCodes = [
  ["+371", "Latvija"],
  ["+370", "Lietuva"],
  ["+372", "Igaunija"],
  ["+358", "Somija"],
  ["+46", "Zviedrija"],
  ["+47", "Norvēģija"],
  ["+45", "Dānija"],
  ["+48", "Polija"],
  ["+49", "Vācija"],
  ["+44", "Apvienotā Karaliste"],
  ["+353", "Īrija"],
  ["+31", "Nīderlande"],
  ["+32", "Beļģija"],
  ["+33", "Francija"],
  ["+34", "Spānija"],
  ["+39", "Itālija"],
] as const;

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidPhone(code: string, value: string) {
  const subscriber = phoneDigits(value);
  if (code === "+371") return /^\d{8}$/.test(subscriber);
  const fullNumber = `${code}${subscriber}`;
  return /^\+[1-9]\d{7,14}$/.test(fullNumber);
}

function FieldLabel({
  children,
  required = false,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <span className="mb-1 block text-sm font-semibold text-slate-800">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </span>
  );
}

function PartyFields({
  prefix,
  form,
  update,
}: {
  prefix: "sender" | "recipient";
  form: FormState;
  update: (changes: Partial<FormState>) => void;
}) {
  const typeKey = `${prefix}_type` as const;
  const partyType = form[typeKey];
  const field = (name: string) =>
    `${prefix}_${name}` as keyof FormState;
  const phone = String(form[field("phone")]);
  const phoneCode = String(form[field("phone_code")]);
  const phoneInvalid = phone.length > 0 && !isValidPhone(phoneCode, phone);
  const phoneErrorId = `${prefix}-phone-error`;
  const companyName = String(form[field("company_name")]);
  const [companySuggestions, setCompanySuggestions] = useState<
    CompanySuggestion[]
  >([]);
  const [companySearchLoading, setCompanySearchLoading] = useState(false);
  const [companySearchFocused, setCompanySearchFocused] = useState(false);

  useEffect(() => {
    const query = companyName.trim();
    if (!companySearchFocused || partyType !== "company" || query.length < 2) {
      setCompanySuggestions([]);
      setCompanySearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCompanySearchLoading(true);
      try {
        const response = await fetch(
          `/api/companies?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          setCompanySuggestions([]);
          return;
        }
        const payload = (await response.json()) as {
          companies?: CompanySuggestion[];
        };
        setCompanySuggestions(payload.companies || []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setCompanySuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) setCompanySearchLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [companyName, companySearchFocused, partyType]);

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Klienta veids</FieldLabel>
        <div className="flex flex-wrap gap-5">
          {(
            [
              ["private", "Privātpersona"],
              ["company", "Juridiska persona"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={partyType === value}
                onChange={() => update({ [typeKey]: value })}
                className="h-4 w-4 accent-blue-600"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {partyType === "private" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <FieldLabel required>Vārds</FieldLabel>
            <input
              value={String(form[field("first_name")])}
              onChange={(event) =>
                update({ [field("first_name")]: event.target.value })
              }
              className="form-input"
              maxLength={60}
            />
          </label>
          <label>
            <FieldLabel>Uzvārds</FieldLabel>
            <input
              value={String(form[field("last_name")])}
              onChange={(event) =>
                update({ [field("last_name")]: event.target.value })
              }
              className="form-input"
              maxLength={60}
            />
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className="relative"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setCompanySearchFocused(false);
                setCompanySuggestions([]);
              }
            }}
          >
            <label htmlFor={`${prefix}-company-name`}>
              <FieldLabel required>Uzņēmuma nosaukums</FieldLabel>
            </label>
            <input
              id={`${prefix}-company-name`}
              value={companyName}
              onFocus={() => setCompanySearchFocused(true)}
              onChange={(event) =>
                update({
                  [field("company_name")]: event.target.value,
                  [field("registration_number")]: "",
                })
              }
              className="form-input"
              maxLength={120}
              autoComplete="off"
              aria-autocomplete="list"
            />
            {companySearchLoading && (
              <span className="mt-1 block text-xs text-slate-500">
                Meklē uzņēmumu...
              </span>
            )}
            {companySuggestions.length > 0 && (
              <div
                role="listbox"
                className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
              >
                {companySuggestions.map((company) => (
                  <button
                    key={`${company.registrationNumber}-${company.name}`}
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => {
                      update({
                        [field("company_name")]: company.name,
                        [field("registration_number")]:
                          company.registrationNumber,
                      });
                      setCompanySuggestions([]);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50"
                  >
                    <span className="block text-sm font-semibold text-slate-900">
                      {company.name}
                    </span>
                    <span className="block text-xs text-slate-600">
                      Reģ. Nr. {company.registrationNumber}
                      {company.address ? ` · ${company.address}` : ""}
                    </span>
                  </button>
                ))}
                <p className="px-3 py-1 text-[11px] text-slate-500">
                  Datu avots: Latvijas Republikas Uzņēmumu reģistra atvērtie dati
                </p>
              </div>
            )}
          </div>
          <label>
            <FieldLabel>Reģistrācijas/PVN numurs</FieldLabel>
            <input
              value={String(form[field("registration_number")])}
              onChange={(event) =>
                update({
                  [field("registration_number")]: event.target.value,
                })
              }
              className="form-input"
              maxLength={30}
            />
          </label>
        </div>
      )}

      <div>
        <FieldLabel required>Tālrunis</FieldLabel>
        <div className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-2">
          <select
            value={phoneCode}
            onChange={(event) =>
              update({ [field("phone_code")]: event.target.value })
            }
            className="form-input"
            aria-label="Valsts tālruņa kods"
          >
            {countryCodes.map(([code, country]) => (
              <option key={code} value={code}>
                {code} {country}
              </option>
            ))}
          </select>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(event) => {
              const digits = phoneDigits(event.target.value);
              const maxDigits = phoneCode === "+371" ? 8 : 15 - phoneDigits(phoneCode).length;
              update({ [field("phone")]: digits.slice(0, maxDigits) });
            }}
            className="form-input"
            placeholder="20 123 456"
            maxLength={15}
            aria-invalid={phoneInvalid}
            aria-describedby={phoneInvalid ? phoneErrorId : undefined}
          />
        </div>
        {phoneInvalid && (
          <span id={phoneErrorId} className="mt-1 block text-sm text-red-600">
            {phoneCode === "+371"
              ? "Ievadiet tieši 8 tālruņa numura ciparus."
              : "Ievadiet korektu tālruņa numuru."}
          </span>
        )}
      </div>
    </div>
  );
}

function FormCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      <h2 className="mb-4 text-xl font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export default function RequestForm({
  token,
  initiallyValid,
  internal = false,
}: {
  token: string;
  initiallyValid: boolean;
  internal?: boolean;
}) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [pickupPoint, setPickupPoint] = useState<Point | null>(null);
  const [dropoffPoint, setDropoffPoint] = useState<Point | null>(null);
  const [pickupFocus, setPickupFocus] = useState<Point | null>(null);
  const [dropoffFocus, setDropoffFocus] = useState<Point | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [step, setStep] = useState(1);
  const [customCargo, setCustomCargo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [internalAccess, setInternalAccess] = useState<
    "checking" | "allowed" | "denied"
  >(internal ? "checking" : "allowed");

  useEffect(() => {
    if (!internal) return;

    async function checkInternalAccess() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setInternalAccess("denied");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, can_access_planned_tasks")
        .eq("id", authData.user.id)
        .single();
      setInternalAccess(
        profile?.role === "admin" || profile?.can_access_planned_tasks === true
          ? "allowed"
          : "denied",
      );
    }

    void checkInternalAccess();
  }, [internal]);

  const previews = useMemo(
    () => images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [images],
  );

  useEffect(
    () => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)),
    [previews],
  );

  const update = (changes: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...changes }));

  const identityComplete = (prefix: "sender" | "recipient") => {
    const type = form[`${prefix}_type`];
    return type === "company"
      ? Boolean(form[`${prefix}_company_name`].trim())
      : Boolean(form[`${prefix}_first_name`].trim());
  };

  const dropoffNotBeforePickup = () => {
    if (!form.pickup_date || !form.dropoff_date) return true;
    if (form.dropoff_date > form.pickup_date) return true;
    if (form.dropoff_date < form.pickup_date) return false;
    if (!form.pickup_time || !form.dropoff_time) return true;
    return form.dropoff_time >= form.pickup_time;
  };

  const stepValid = (targetStep: number): boolean => {
    if (targetStep === 1) {
      return Boolean(
        identityComplete("sender") &&
          isValidPhone(form.sender_phone_code, form.sender_phone) &&
          form.pickup_address.trim() &&
          pickupPoint &&
          form.pickup_date,
      );
    }
    if (targetStep === 2) {
      return Boolean(
        identityComplete("recipient") &&
          isValidPhone(form.recipient_phone_code, form.recipient_phone) &&
          form.dropoff_address.trim() &&
          dropoffPoint &&
          form.dropoff_date &&
          dropoffNotBeforePickup(),
      );
    }
    return Boolean(
      (form.cargo_type === "Cits"
        ? customCargo.trim()
        : form.cargo_type.trim()) &&
        stepValid(1) &&
        stepValid(2),
    );
  };

  const nextStep = () => {
    if (!stepValid(step)) {
      setError("Aizpildi obligātos laukus un atzīmē vietu kartē.");
      return;
    }
    setError("");
    setStep((current) => Math.min(3, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const focusPickupMap = useCallback(
    (point: Point) => {
      setPickupFocus(point);
      setPickupPoint(point);
    },
    [],
  );
  const focusDropoffMap = useCallback(
    (point: Point) => {
      setDropoffFocus(point);
      setDropoffPoint(point);
    },
    [],
  );

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    const available = Math.max(0, 8 - images.length);
    const selected = Array.from(files).slice(0, available);
    const compressed = await Promise.all(
      selected.map(async (file) => {
        try {
          return await imageCompression(file, {
            maxSizeMB: 2,
            maxWidthOrHeight: 2200,
            useWebWorker: true,
          });
        } catch {
          return file;
        }
      }),
    );
    setImages((current) => [...current, ...compressed]);
  };

  const submit = async () => {
    if (!dropoffNotBeforePickup()) {
      setError("Izkraušanas datums un laiks nevar būt agrāks par uzkraušanu.");
      return;
    }
    if (!pickupPoint || !dropoffPoint || !stepValid(3)) {
      setError("Aizpildi visus obligātos laukus.");
      return;
    }

    setSubmitting(true);
    setError("");
    const payload = {
      ...form,
      sender_phone: `${form.sender_phone_code}${phoneDigits(form.sender_phone)}`,
      recipient_phone: `${form.recipient_phone_code}${phoneDigits(form.recipient_phone)}`,
      cargo_type:
        form.cargo_type === "Cits" ? customCargo.trim() : form.cargo_type,
      pickup_lat: pickupPoint.lat,
      pickup_lng: pickupPoint.lng,
      dropoff_lat: dropoffPoint.lat,
      dropoff_lng: dropoffPoint.lng,
    };
    const body = new FormData();
    if (internal) {
      body.set("mode", "internal");
    } else {
      body.set("token", token);
    }
    body.set("payload", JSON.stringify(payload));
    images.forEach((file) => body.append("images", file));

    const { data: sessionData } = internal
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const response = await fetch("/api/transport-requests", {
      method: "POST",
      headers: internal
        ? {
            Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
          }
        : undefined,
      body,
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) {
      setError(result.error || "Pieteikumu neizdevās nosūtīt.");
      return;
    }
    setSubmitted(true);
  };

  if (internalAccess === "checking") {
    return (
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-8 text-center shadow">
        <p className="text-slate-600">Pārbauda piekļuvi...</p>
      </div>
    );
  }

  if (internalAccess === "denied") {
    return (
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-bold">Nav pieejas</h1>
        <p className="mt-3 text-slate-600">
          Šo formu var izmantot lietotāji ar pieeju plānotajiem uzdevumiem.
        </p>
      </div>
    );
  }

  if (!internal && !initiallyValid) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-bold">Pieteikuma saite nav derīga</h1>
        <p className="mt-3 text-slate-600">
          Saite ir izmantota vai tai beidzies derīguma termiņš.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-8 text-center shadow">
        <CheckCircle2 className="mx-auto text-green-600" size={56} />
        <h1 className="mt-4 text-2xl font-bold">
          {internal ? "Brauciens izveidots!" : "Pieteikums nosūtīts!"}
        </h1>
        <p className="mt-3 text-slate-600">
          {internal
            ? "Jaunā brauciena kartīte ir pievienota plānotajiem uzdevumiem."
            : "Paldies! Pakalpojuma sniedzējs ir saņēmis jūsu informāciju."}
        </p>
        {internal && (
          <Link
            href="/planned-tasks"
            className="mt-5 inline-flex rounded-xl bg-blue-800 px-5 py-3 font-semibold text-white"
          >
            Atgriezties pie plānotajiem uzdevumiem
          </Link>
        )}
      </div>
    );
  }

  const sectionClass = (targetStep: number) =>
    step === targetStep ? "block" : "hidden md:block";

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex items-start gap-3">
        <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
          <Truck size={30} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">
            Jauns kravas pārvadājuma pieprasījums
          </h1>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">
            Aizpildiet nepieciešamos laukus un nosūtiet pieprasījumu.
          </p>
        </div>
      </header>

      <div className="mb-5 md:hidden">
        <div className="mb-2 flex justify-between text-sm font-semibold text-slate-700">
          <span>
            {step === 1
              ? "Nosūtītājs un uzkraušana"
              : step === 2
                ? "Saņēmējs un izkraušana"
                : "Krava un papildinformācija"}
          </span>
          <span>{step}. no 3</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className={`space-y-4 ${sectionClass(1)}`}>
          <FormCard title="Nosūtītājs">
            <PartyFields prefix="sender" form={form} update={update} />
          </FormCard>
          <FormCard title="Uzkraušanas vieta">
            <div className="space-y-4">
              <div>
                <label htmlFor="pickup_address">
                  <FieldLabel required>Adrese</FieldLabel>
                </label>
                <AddressField
                  id="pickup_address"
                  value={form.pickup_address}
                  onChange={(value) => update({ pickup_address: value })}
                  onMapFocus={focusPickupMap}
                />
              </div>
              <div>
                <FieldLabel required>Precīza vieta kartē</FieldLabel>
                <LocationPicker
                  point={pickupPoint}
                  focusPoint={pickupFocus}
                  onChange={setPickupPoint}
                  markerColor="blue"
                  active={step === 1}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <FieldLabel required>Uzkraušanas datums</FieldLabel>
                  <input
                    type="date"
                    value={form.pickup_date}
                    onChange={(event) => {
                      const pickupDate = event.target.value;
                      setForm((current) => ({
                        ...current,
                        pickup_date: pickupDate,
                        dropoff_date: current.dropoff_date || pickupDate,
                      }));
                    }}
                    className="form-input"
                  />
                </label>
                <label>
                  <FieldLabel>Laiks</FieldLabel>
                  <input
                    type="time"
                    value={form.pickup_time}
                    onChange={(event) =>
                      update({ pickup_time: event.target.value })
                    }
                    className="form-input"
                  />
                </label>
              </div>
              <label>
                <FieldLabel>Piezīmes par uzkraušanu</FieldLabel>
                <textarea
                  value={form.pickup_notes}
                  onChange={(event) =>
                    update({ pickup_notes: event.target.value })
                  }
                  className="form-input min-h-24 resize-y"
                  maxLength={500}
                />
              </label>
            </div>
          </FormCard>
        </div>

        <div className={`space-y-4 ${sectionClass(2)}`}>
          <FormCard title="Saņēmējs">
            <PartyFields prefix="recipient" form={form} update={update} />
          </FormCard>
          <FormCard title="Izkraušanas vieta">
            <div className="space-y-4">
              <div>
                <label htmlFor="dropoff_address">
                  <FieldLabel required>Adrese</FieldLabel>
                </label>
                <AddressField
                  id="dropoff_address"
                  value={form.dropoff_address}
                  onChange={(value) => update({ dropoff_address: value })}
                  onMapFocus={focusDropoffMap}
                />
              </div>
              <div>
                <FieldLabel required>Precīza vieta kartē</FieldLabel>
                <LocationPicker
                  point={dropoffPoint}
                  focusPoint={dropoffFocus}
                  onChange={setDropoffPoint}
                  markerColor="red"
                  active={step === 2}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <FieldLabel required>Izkraušanas datums</FieldLabel>
                  <input
                    type="date"
                    min={form.pickup_date || undefined}
                    value={form.dropoff_date}
                    onChange={(event) =>
                      update({ dropoff_date: event.target.value })
                    }
                    className="form-input"
                  />
                </label>
                <label>
                  <FieldLabel>Laiks</FieldLabel>
                  <input
                    type="time"
                    min={
                      form.dropoff_date === form.pickup_date
                        ? form.pickup_time || undefined
                        : undefined
                    }
                    value={form.dropoff_time}
                    onChange={(event) =>
                      update({ dropoff_time: event.target.value })
                    }
                    className="form-input"
                  />
                </label>
              </div>
              <label>
                <FieldLabel>Piezīmes par izkraušanu</FieldLabel>
                <textarea
                  value={form.dropoff_notes}
                  onChange={(event) =>
                    update({ dropoff_notes: event.target.value })
                  }
                  className="form-input min-h-24 resize-y"
                  maxLength={500}
                />
              </label>
            </div>
          </FormCard>
        </div>

        <div className={`space-y-4 md:col-span-2 ${sectionClass(3)}`}>
          <FormCard title="Kravas informācija">
            <label>
              <FieldLabel required>Kravas veids</FieldLabel>
              {form.cargo_type === "Cits" ? (
                <div className="flex gap-2">
                  <input
                    value={customCargo}
                    onChange={(event) => setCustomCargo(event.target.value)}
                    className="form-input"
                    placeholder="Ierakstiet kravas veidu"
                    maxLength={100}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      update({ cargo_type: "" });
                      setCustomCargo("");
                    }}
                    className="rounded-lg border border-slate-300 px-3 text-sm"
                  >
                    Mainīt
                  </button>
                </div>
              ) : (
                <select
                  value={form.cargo_type}
                  onChange={(event) =>
                    update({ cargo_type: event.target.value })
                  }
                  className="form-input"
                >
                  <option value="">Izvēlieties</option>
                  {cargoTypes.map((type) => (
                    <option key={type} value={type}>
                      {type === "Cits" ? "Cits..." : type}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </FormCard>

          <div className="grid gap-4 md:grid-cols-2">
            <FormCard title="Papildinformācija">
              <label>
                <FieldLabel>Papildu piezīmes</FieldLabel>
                <textarea
                  value={form.additional_notes}
                  onChange={(event) =>
                    update({ additional_notes: event.target.value })
                  }
                  className="form-input min-h-36 resize-y"
                  maxLength={500}
                />
              </label>
            </FormCard>

            <FormCard title="Attēli">
              <div className="grid grid-cols-2 gap-2">
                <label className="image-upload-button">
                  <Camera size={22} />
                  Uzņemt foto
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => {
                      void addImages(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
                <label className="image-upload-button">
                  <ImagePlus size={22} />
                  Pievienot attēlus
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void addImages(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {previews.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {previews.map(({ file, url }, index) => (
                    <div
                      key={url}
                      className="relative aspect-square overflow-hidden rounded-lg"
                    >
                      <Image
                        src={url}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setImages((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        className="absolute right-1 top-1 rounded-full bg-red-600 p-1 text-white"
                        aria-label="Dzēst attēlu"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </FormCard>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((current) => current - 1)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-semibold md:hidden"
          >
            <ArrowLeft size={18} />
            Atpakaļ
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            onClick={nextStep}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white md:hidden"
          >
            Turpināt
            <ArrowRight size={18} />
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-60 md:hidden"
          >
            <Send size={18} />
            {submitting
              ? "Saglabā..."
              : internal
                ? "Izveidot braucienu"
                : "Nosūtīt pieprasījumu"}
          </button>
        )}
        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className="hidden flex-1 items-center justify-center gap-2 rounded-xl bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-60 md:flex"
        >
          <Send size={18} />
          {submitting
            ? "Saglabā..."
            : internal
              ? "Izveidot braucienu"
              : "Nosūtīt pieprasījumu"}
        </button>
      </div>
    </div>
  );
}
