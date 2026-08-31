"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CalendarClock,
  CheckCircle2,
  ImagePlus,
  Link2,
  Send,
  Repeat2,
  Trash2,
  Truck,
  X,
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

const defaultCargoTypes = [
  "Būvmateriāli",
  "Lauksaimniecības tehnika",
  "Celtniecības tehnika",
  "Automašīna",
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

function dateTimeLabel(date: string, time: string, placeholder: string) {
  if (!date) return placeholder;
  const [year, month, day] = date.split("-");
  const formattedDate = `${day}.${month}.${year}.`;
  return time ? `${formattedDate} ${time.slice(0, 5)}` : formattedDate;
}

function DateTimeField({
  label,
  date,
  time,
  min,
  onChange,
}: {
  label: string;
  date: string;
  time: string;
  min?: string;
  onChange: (date: string, time: string) => void;
}) {
  const pickerValue = date ? `${date}T${time || "09:00"}` : "";

  return (
    <div>
      <FieldLabel required>{label}</FieldLabel>
      <div className="relative">
        <div className="form-input flex min-h-12 w-full items-center gap-3 text-left">
          <CalendarClock size={20} className="shrink-0 text-blue-600" />
          <span className={date ? "font-medium" : "text-slate-400"}>
            {dateTimeLabel(date, time, "Izvēlēties datumu un laiku")}
          </span>
        </div>
        <input
          type="datetime-local"
          value={pickerValue}
          min={min}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker();
            } catch {
              // Safari atver sistēmas izvēlni ar pašu uzticamo pieskārienu.
            }
          }}
          onChange={(event) => {
            const [nextDate = "", nextTime = ""] =
              event.currentTarget.value.split("T");
            onChange(nextDate, nextTime.slice(0, 5));
          }}
          aria-label={label}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
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
  const selectedCompanyNameRef = useRef("");

  useEffect(() => {
    const query = companyName.trim();
    if (query === selectedCompanyNameRef.current) {
      setCompanySuggestions([]);
      setCompanySearchLoading(false);
      return;
    }
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
              onChange={(event) => {
                selectedCompanyNameRef.current = "";
                update({
                  [field("company_name")]: event.target.value,
                  [field("registration_number")]: "",
                });
              }}
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
                      selectedCompanyNameRef.current = company.name.trim();
                      setCompanySearchFocused(false);
                      setCompanySearchLoading(false);
                      setCompanySuggestions([]);
                      update({
                        [field("company_name")]: company.name,
                        [field("registration_number")]:
                          company.registrationNumber,
                      });
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
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
          <select
            value={phoneCode}
            onChange={(event) =>
              update({ [field("phone_code")]: event.target.value })
            }
            className="form-input"
            aria-label="Valsts tālruņa kods"
          >
            {countryCodes.map(([code]) => (
              <option key={code} value={code}>
                {code}
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

function LocationImportField({
  onPoint,
}: {
  onPoint: (point: Point) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const importLocation = async () => {
    if (!value.trim()) {
      setError("Ielīmē Google Maps saiti vai koordinātes.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/location-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const result = (await response.json()) as {
        point?: Point;
        error?: string;
      };
      if (!response.ok || !result.point) {
        setError(result.error || "Lokāciju neizdevās nolasīt.");
        return;
      }
      await onPoint(result.point);
      setValue("");
    } catch {
      setError("Lokāciju neizdevās nolasīt.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <FieldLabel>Google Maps saite vai koordinātes</FieldLabel>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void importLocation();
            }
          }}
          className="form-input min-w-0 flex-1"
          placeholder="Ielīmē WhatsApp saņemto saiti"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => void importLocation()}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Link2 size={17} />
          <span className="hidden sm:inline">Ielādēt</span>
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function RequestForm({
  token,
  initiallyValid,
  internal = false,
  sourceRequestId,
}: {
  token: string;
  initiallyValid: boolean;
  internal?: boolean;
  sourceRequestId?: number;
}) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [pickupPoint, setPickupPoint] = useState<Point | null>(null);
  const [dropoffPoint, setDropoffPoint] = useState<Point | null>(null);
  const [pickupFocus, setPickupFocus] = useState<Point | null>(null);
  const [dropoffFocus, setDropoffFocus] = useState<Point | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [step, setStep] = useState(1);
  const [customCargo, setCustomCargo] = useState("");
  const [cargoTypes, setCargoTypes] = useState(defaultCargoTypes);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [internalAccess, setInternalAccess] = useState<
    "checking" | "allowed" | "denied"
  >(internal ? "checking" : "allowed");
  const pickupReverseRequest = useRef(0);
  const dropoffReverseRequest = useRef(0);

  useEffect(() => {
    if (!internal || !sourceRequestId) return;
    async function loadSource() {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/transport-requests/${sourceRequestId}`, { headers: { Authorization: `Bearer ${data.session?.access_token || ""}` } });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Iepriekšējo braucienu neizdevās ielādēt."); return; }
      const request = result.request as Record<string, string | number | null>;
      const splitPhone = (value: string) => {
        const compact = String(value || "").replace(/\D/g, "");
        const match = countryCodes.find(([code]) => compact.startsWith(code.slice(1)));
        const code = match?.[0] || "+371";
        return { code, number: compact.slice(code.length - 1) };
      };
      const senderPhone = splitPhone(String(request.sender_phone || ""));
      const recipientPhone = splitPhone(String(request.recipient_phone || ""));
      setForm({
        sender_type: request.sender_type as PartyType, sender_first_name: String(request.sender_first_name || ""), sender_last_name: String(request.sender_last_name || ""), sender_company_name: String(request.sender_company_name || ""), sender_registration_number: String(request.sender_registration_number || ""), sender_phone_code: senderPhone.code, sender_phone: senderPhone.number,
        recipient_type: request.recipient_type as PartyType, recipient_first_name: String(request.recipient_first_name || ""), recipient_last_name: String(request.recipient_last_name || ""), recipient_company_name: String(request.recipient_company_name || ""), recipient_registration_number: String(request.recipient_registration_number || ""), recipient_phone_code: recipientPhone.code, recipient_phone: recipientPhone.number,
        pickup_address: String(request.pickup_address || ""), pickup_date: String(request.pickup_date || ""), pickup_time: String(request.pickup_time || "").slice(0, 5), pickup_notes: String(request.pickup_notes || ""),
        dropoff_address: String(request.dropoff_address || ""), dropoff_date: String(request.dropoff_date || ""), dropoff_time: String(request.dropoff_time || "").slice(0, 5), dropoff_notes: String(request.dropoff_notes || ""), cargo_type: String(request.cargo_type || ""), additional_notes: String(request.additional_notes || ""),
      });
      const pickup = { lat: Number(request.pickup_lat), lng: Number(request.pickup_lng) };
      const dropoff = { lat: Number(request.dropoff_lat), lng: Number(request.dropoff_lng) };
      setPickupPoint(pickup); setPickupFocus(pickup); setDropoffPoint(dropoff); setDropoffFocus(dropoff);
      const copiedImages = await Promise.all((result.images || []).map(async (image: { url: string; fileName: string }) => {
        const fileResponse = await fetch(image.url); const blob = await fileResponse.blob(); return new File([blob], image.fileName, { type: blob.type });
      }));
      setImages(copiedImages);
    }
    void loadSource();
  }, [internal, sourceRequestId]);

  useEffect(() => {
    async function loadCargoTypes() {
      const { data, error: cargoTypesError } = await supabase
        .from("cargo_types")
        .select("name")
        .order("name");
      if (!cargoTypesError && data && data.length > 0) {
        setCargoTypes(data.map((item) => item.name));
      }
    }
    void loadCargoTypes();
  }, []);

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

  const reverseRoute = () => {
    setForm((current) => ({
      ...current,
      sender_type: current.recipient_type, sender_first_name: current.recipient_first_name, sender_last_name: current.recipient_last_name, sender_company_name: current.recipient_company_name, sender_registration_number: current.recipient_registration_number, sender_phone_code: current.recipient_phone_code, sender_phone: current.recipient_phone,
      recipient_type: current.sender_type, recipient_first_name: current.sender_first_name, recipient_last_name: current.sender_last_name, recipient_company_name: current.sender_company_name, recipient_registration_number: current.sender_registration_number, recipient_phone_code: current.sender_phone_code, recipient_phone: current.sender_phone,
      pickup_address: current.dropoff_address, pickup_notes: current.dropoff_notes,
      dropoff_address: current.pickup_address, dropoff_notes: current.pickup_notes,
    }));
    setPickupPoint(dropoffPoint); setPickupFocus(dropoffPoint); setDropoffPoint(pickupPoint); setDropoffFocus(pickupPoint);
  };

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

  const updatePointFromMap = useCallback(
    async (target: "pickup" | "dropoff", point: Point) => {
      const requestRef =
        target === "pickup" ? pickupReverseRequest : dropoffReverseRequest;
      const requestId = ++requestRef.current;

      if (target === "pickup") {
        setPickupPoint(point);
        setPickupFocus(point);
      } else {
        setDropoffPoint(point);
        setDropoffFocus(point);
      }

      try {
        const response = await fetch(
          `/api/geocode?lat=${encodeURIComponent(point.lat)}&lng=${encodeURIComponent(point.lng)}`,
        );
        const data = (await response.json()) as {
          result?: { label?: string } | null;
        };
        const label = data.result?.label?.trim();
        if (!response.ok || !label || requestId !== requestRef.current) return;

        setForm((current) => ({
          ...current,
          [target === "pickup" ? "pickup_address" : "dropoff_address"]:
            label,
        }));
      } catch {
        // Precīzās koordinātes saglabājas arī tad, ja adrese nav atrodama.
      }
    },
    [],
  );

  const updatePickupPointFromMap = useCallback(
    (point: Point) => updatePointFromMap("pickup", point),
    [updatePointFromMap],
  );
  const updateDropoffPointFromMap = useCallback(
    (point: Point) => updatePointFromMap("dropoff", point),
    [updatePointFromMap],
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
        {!internal && (
          <p className="mt-3 text-slate-600">
            Paldies! Pakalpojuma sniedzējs ir saņēmis jūsu informāciju.
          </p>
        )}
        {internal && (
          <Link
            href="/planned-tasks"
            className="mt-5 inline-flex rounded-xl bg-blue-800 px-5 py-3 font-semibold text-white"
          >
            Atgriezties
          </Link>
        )}
      </div>
    );
  }

  const sectionClass = (targetStep: number) =>
    step === targetStep ? "block" : "hidden md:block";

  return (
    <div className="mx-auto max-w-6xl">
      <header className="relative mb-5 flex items-start gap-3 pr-12">
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
        {internal && (
          <div className="absolute right-0 top-0 flex gap-2">
          {sourceRequestId && <button type="button" onClick={reverseRoute} aria-label="Apgriezt maršrutu" title="Apgriezt maršrutu" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm"><Repeat2 size={23}/></button>}
          <Link
            href="/planned-tasks"
            aria-label="Aizvērt formu bez saglabāšanas"
            title="Aizvērt"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            <X size={24} />
          </Link>
          </div>
        )}
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
                  onChange={updatePickupPointFromMap}
                  markerColor="blue"
                  active={step === 1}
                  footer={
                    <LocationImportField onPoint={updatePickupPointFromMap} />
                  }
                />
              </div>
              <DateTimeField
                label="Uzkraušanas datums un laiks"
                date={form.pickup_date}
                time={form.pickup_time}
                onChange={(pickupDate, pickupTime) => {
                  setForm((current) => ({
                    ...current,
                    pickup_date: pickupDate,
                    pickup_time: pickupTime,
                    dropoff_date: pickupDate,
                  }));
                }}
              />
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
                  onChange={updateDropoffPointFromMap}
                  markerColor="red"
                  active={step === 2}
                  footer={
                    <LocationImportField onPoint={updateDropoffPointFromMap} />
                  }
                />
              </div>
              <DateTimeField
                label="Izkraušanas datums un laiks"
                date={form.dropoff_date}
                time={form.dropoff_time}
                min={
                  form.pickup_date
                    ? `${form.pickup_date}T${form.pickup_time || "00:00"}`
                    : undefined
                }
                onChange={(dropoffDate, dropoffTime) =>
                  update({
                    dropoff_date: dropoffDate,
                    dropoff_time: dropoffTime,
                  })
                }
              />
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
                  <option value="Cits">Cits...</option>
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
