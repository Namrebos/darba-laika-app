"use client";

import { Check, Eraser, PenLine, Printer, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Vehicle = {
  id: number;
  registration_number: string;
  display_name: string;
};

type SignaturePadProps = {
  label: string;
};

function SignaturePad({ label }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = Boolean(signature);
    if (!signature) return;
    const image = new window.Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = signature;
  }, [open, signature]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.setPointerCapture(event.pointerId);
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
    drawingRef.current = true;
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.strokeStyle = "#0f172a";
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineTo(position.x, position.y);
    context.stroke();
    hasInkRef.current = true;
  }

  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current) {
      setSignature(null);
      setOpen(false);
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) return;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width;
    let right = 0;
    let top = canvas.height;
    let bottom = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels.data[(y * canvas.width + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }

    const sourceWidth = Math.max(1, right - left + 1);
    const sourceHeight = Math.max(1, bottom - top + 1);
    const normalized = document.createElement("canvas");
    normalized.width = 700;
    normalized.height = 180;
    const normalizedContext = normalized.getContext("2d");
    if (!normalizedContext) return;
    const padding = 14;
    const scale = Math.min(
      (normalized.width - padding * 2) / sourceWidth,
      (normalized.height - padding * 2) / sourceHeight,
    );
    const targetWidth = sourceWidth * scale;
    const targetHeight = sourceHeight * scale;
    normalizedContext.drawImage(
      canvas,
      left,
      top,
      sourceWidth,
      sourceHeight,
      (normalized.width - targetWidth) / 2,
      (normalized.height - targetHeight) / 2,
      targetWidth,
      targetHeight,
    );
    setSignature(normalized.toDataURL("image/png"));
    setOpen(false);
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-4">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      {signature && (
        <div className="flex h-24 items-center justify-center rounded-lg border border-slate-300 bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={signature} alt={label} className="h-full max-w-full object-contain" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="delivery-note-no-print flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800"
      >
        <PenLine size={18} /> {signature ? "Mainīt parakstu" : "Parakstīt"}
      </button>

      {open && (
        <div
          className="delivery-note-no-print fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3"
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-950">{label}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Aizvērt"
              >
                <X size={22} />
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={900}
              height={420}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              className="h-[45vh] max-h-[420px] min-h-64 w-full touch-none rounded-xl border-2 border-slate-300 bg-white shadow-inner"
              aria-label={label}
            />
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={clear}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <Eraser size={14} /> Notīrīt
              </button>
              <button
                type="button"
                onClick={save}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white hover:bg-green-700"
              >
                <Check size={18} /> Saglabāt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const fieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default function DeliveryNotePage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vehicleId, setVehicleId] = useState("");
  const [carrier, setCarrier] = useState("");
  const [customer, setCustomer] = useState("");
  const [recipient, setRecipient] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [cargo, setCargo] = useState("");

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, can_access_planned_tasks")
        .eq("id", authData.user.id)
        .single();
      if (
        profile?.role !== "admin" &&
        profile?.can_access_planned_tasks !== true
      ) {
        router.replace("/summary");
        return;
      }
      const [{ data }, { data: carrierSettings }] = await Promise.all([
        supabase
          .from("vehicles")
          .select("id, registration_number, display_name")
          .eq("is_active", true)
          .order("usage_count", { ascending: false })
          .order("last_used_at", { ascending: false, nullsFirst: false }),
        supabase.from("carrier_settings").select("partner_type, first_name, last_name, company_name, registration_number, address, email").eq("id", "default").maybeSingle(),
      ]);
      setVehicles((data || []) as Vehicle[]);
      if (carrierSettings) {
        const identity = carrierSettings.partner_type === "company"
          ? [carrierSettings.company_name, carrierSettings.registration_number ? `Reģ. Nr. ${carrierSettings.registration_number}` : ""]
          : [`${carrierSettings.first_name || ""} ${carrierSettings.last_name || ""}`.trim()];
        setCarrier(
          [...identity, carrierSettings.address, carrierSettings.email]
            .filter(Boolean)
            .join("\n"),
        );
      }
      setLoading(false);
    }
    void load();
  }, [router]);

  function clearForm() {
    if (!window.confirm("Vai notīrīt visus pavadzīmes laukus?")) return;
    setDate(new Date().toISOString().slice(0, 10));
    setVehicleId("");
    setCustomer("");
    setRecipient("");
    setOrigin("");
    setDestination("");
    setCargo("");
  }

  if (loading) return <p className="p-6">Ielādē...</p>;

  return (
    <div className="delivery-note-page min-h-full bg-slate-100 p-3 text-slate-950 sm:p-6 dark:bg-zinc-950">
      <div className="delivery-note-no-print mx-auto mb-4 flex max-w-4xl items-center justify-end gap-2">
        <button
          type="button"
          onClick={clearForm}
          className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
        >
          <RotateCcw size={18} /> Notīrīt
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
        >
          <Printer size={18} /> Drukāt / PDF
        </button>
      </div>

      <main className="delivery-note-sheet mx-auto min-h-[297mm] w-full max-w-[210mm] space-y-6 bg-white p-5 shadow-xl sm:p-[15mm]">
        <header className="space-y-5 border-b-2 border-slate-900 pb-5">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,0.8fr)] items-end gap-4">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Transporta pavadzīme
            </h1>
            <label className="space-y-1 text-sm font-semibold">
              <span>Pavadzīmes Nr.</span>
              <input
                value="Tiks piešķirts no kartītes ID"
                readOnly
                className={`${fieldClass} bg-slate-100 text-slate-500`}
              />
            </label>
          </div>
          <div className="text-sm">
            <p className="mb-1 font-semibold">Pārvadātāja dati</p>
            <p className="whitespace-pre-line leading-relaxed text-slate-800">
              {carrier || "Pārvadātāja dati nav norādīti"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm font-semibold">
              <span>Datums</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold">
              <span>Transportlīdzekļa VNZ</span>
              <select
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                className={fieldClass}
              >
                <option value="">Izvēlies auto</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.registration_number} — {vehicle.display_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-slate-300 p-4">
            <label className="block space-y-1 text-sm font-semibold">
              <span>Nosūtītājs / pasūtītājs</span>
              <input
                value={customer}
                onChange={(event) => setCustomer(event.target.value)}
                placeholder="Vārds, uzvārds vai uzņēmums"
                className={fieldClass}
              />
            </label>
            <label className="block space-y-1 text-sm font-semibold">
              <span>Uzkraušanas vieta</span>
              <textarea
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                placeholder="Uzkraušanas adrese"
                rows={3}
                className={fieldClass}
              />
            </label>
            <SignaturePad label="Nosūtītāja paraksts" />
          </div>
          <div className="space-y-4 rounded-xl border border-slate-300 p-4">
            <label className="block space-y-1 text-sm font-semibold">
              <span>Saņēmējs</span>
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="Vārds, uzvārds vai uzņēmums"
                className={fieldClass}
              />
            </label>
            <label className="block space-y-1 text-sm font-semibold">
              <span>Izkraušanas vieta</span>
              <textarea
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Izkraušanas adrese"
                rows={3}
                className={fieldClass}
              />
            </label>
            <SignaturePad label="Saņēmēja paraksts" />
          </div>
        </section>

        <label className="block space-y-1 text-sm font-semibold">
          <span>Kravas veids</span>
          <textarea
            value={cargo}
            onChange={(event) => setCargo(event.target.value)}
            placeholder="Kas tiek vests"
            rows={3}
            className={fieldClass}
          />
        </label>

        <section className="space-y-2 border-t border-slate-300 pt-4 text-xs leading-relaxed text-slate-700">
          <p>
            1. Pārvadātājs piestāda rēķinu Pasūtītājam par katru veikto
            uzdevumu.
          </p>
          <p>
            2. Pasūtītājs maksā Pārvadātājam ar bankas pārskaitījumu uz rēķinā
            norādīto kontu 5 (piecu) dienu laikā no rēķina saņemšanas brīža
            e-pastā. Rēķins tiks sagatavots un derīgs bez abu pušu parakstiem.
          </p>
        </section>
      </main>
    </div>
  );
}
