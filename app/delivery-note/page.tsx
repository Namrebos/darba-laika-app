"use client";

import { Eraser, Printer, RotateCcw } from "lucide-react";
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
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        <button
          type="button"
          onClick={clear}
          className="delivery-note-no-print flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <Eraser size={15} /> Notīrīt
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={700}
        height={180}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        className="h-36 w-full touch-none rounded-lg border-2 border-slate-300 bg-white shadow-inner"
        aria-label={label}
      />
      <p className="delivery-note-no-print text-center text-xs text-slate-500">
        Paraksties ar pirkstu vai datora peli
      </p>
      <div className="border-t border-slate-400 pt-1 text-center text-xs text-slate-500">
        Paraksts
      </div>
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
      const { data } = await supabase
        .from("vehicles")
        .select("id, registration_number, display_name")
        .eq("is_active", true)
        .order("usage_count", { ascending: false })
        .order("last_used_at", { ascending: false, nullsFirst: false });
      setVehicles((data || []) as Vehicle[]);
      setLoading(false);
    }
    void load();
  }, [router]);

  function clearForm() {
    if (!window.confirm("Vai notīrīt visus pavadzīmes laukus?")) return;
    setDate(new Date().toISOString().slice(0, 10));
    setVehicleId("");
    setCarrier("");
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

      <main className="delivery-note-sheet mx-auto max-w-4xl space-y-6 bg-white p-5 shadow-xl sm:p-8">
        <header className="space-y-5 border-b-2 border-slate-900 pb-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_1.15fr] sm:items-start">
            <h1 className="text-3xl font-black tracking-tight sm:pt-2">
              Transporta pavadzīme
            </h1>
            <label className="space-y-1 text-sm font-semibold">
              <span>Pārvadātāja dati</span>
              <textarea
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                placeholder="Firmas nosaukums, reģistrācijas numurs, adrese un kontaktinformācija"
                rows={3}
                className={fieldClass}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm font-semibold">
              <span>Pavadzīmes Nr.</span>
              <input
                value="Tiks piešķirts no kartītes ID"
                readOnly
                className={`${fieldClass} bg-slate-100 text-slate-500`}
              />
            </label>
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
              <span>Pasūtītājs</span>
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
          </div>
        </section>

        <label className="block space-y-1 text-sm font-semibold">
          <span>Kravas veids</span>
          <textarea
            value={cargo}
            onChange={(event) => setCargo(event.target.value)}
            placeholder="Kravas nosaukums, daudzums un cita nepieciešamā informācija"
            rows={5}
            className={fieldClass}
          />
        </label>

        <section className="grid gap-6 border-t border-slate-300 pt-6 sm:grid-cols-2">
          <SignaturePad label="Nosūtītāja paraksts" />
          <SignaturePad label="Saņēmēja paraksts" />
        </section>
      </main>
    </div>
  );
}
