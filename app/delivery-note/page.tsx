"use client";

import {
  Check,
  Download,
  Eraser,
  MoreVertical,
  PenLine,
  Printer,
  Share2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Vehicle = {
  id: number;
  registration_number: string;
  display_name: string;
};

type TransportRequest = {
  id: number;
  sender_type: "private" | "company";
  sender_first_name: string | null;
  sender_last_name: string | null;
  sender_company_name: string | null;
  sender_registration_number: string | null;
  sender_address: string | null;
  recipient_type: "private" | "company";
  recipient_first_name: string | null;
  recipient_last_name: string | null;
  recipient_company_name: string | null;
  recipient_registration_number: string | null;
  pickup_address: string | null;
  pickup_date: string;
  dropoff_address: string | null;
  cargo_type: string;
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

export default function DeliveryNotePage() {
  const router = useRouter();
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [notice, setNotice] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [noteNumber, setNoteNumber] = useState("Tiks piešķirts no kartītes ID");
  const [vehicleId, setVehicleId] = useState("");
  const [carrier, setCarrier] = useState("");
  const [customer, setCustomer] = useState("");
  const [recipient, setRecipient] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [cargo, setCargo] = useState("");

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session?.user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, can_access_planned_tasks, can_access_workday")
        .eq("id", session.user.id)
        .single();
      if (
        profile?.role !== "admin" &&
        profile?.can_access_planned_tasks !== true &&
        profile?.can_access_workday !== true
      ) {
        router.replace("/summary");
        return;
      }
      const requestId = Number(
        new URLSearchParams(window.location.search).get("requestId"),
      );
      const requestPromise = Number.isSafeInteger(requestId) && requestId > 0
        ? fetch(`/api/transport-requests/${requestId}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).then(async (response) => ({
            ok: response.ok,
            body: (await response.json()) as {
              request?: TransportRequest;
              vehicleId?: number | null;
            },
          }))
        : Promise.resolve(null);
      const [{ data }, { data: carrierSettings }, requestResult] = await Promise.all([
        supabase
          .from("vehicles")
          .select("id, registration_number, display_name")
          .eq("is_active", true)
          .order("usage_count", { ascending: false })
          .order("last_used_at", { ascending: false, nullsFirst: false }),
        supabase.from("carrier_settings").select("partner_type, first_name, last_name, company_name, registration_number, address, email").eq("id", "default").maybeSingle(),
        requestPromise,
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
      if (requestResult?.ok && requestResult.body.request) {
        const transportRequest = requestResult.body.request;
        const senderName = transportRequest.sender_type === "company"
          ? transportRequest.sender_company_name
          : [transportRequest.sender_first_name, transportRequest.sender_last_name]
              .filter(Boolean)
              .join(" ");
        const recipientName = transportRequest.recipient_type === "company"
          ? transportRequest.recipient_company_name
          : [
              transportRequest.recipient_first_name,
              transportRequest.recipient_last_name,
            ]
              .filter(Boolean)
              .join(" ");
        setNoteNumber(String(transportRequest.id));
        setDate(transportRequest.pickup_date);
        setVehicleId(
          requestResult.body.vehicleId
            ? String(requestResult.body.vehicleId)
            : "",
        );
        setCustomer(
          [
            senderName,
            transportRequest.sender_registration_number
              ? `Reģ. Nr. ${transportRequest.sender_registration_number}`
              : "",
            transportRequest.sender_address,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        setRecipient(
          [
            recipientName,
            transportRequest.recipient_registration_number
              ? `Reģ. Nr. ${transportRequest.recipient_registration_number}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        setOrigin(transportRequest.pickup_address || "");
        setDestination(transportRequest.dropoff_address || "");
        setCargo(transportRequest.cargo_type || "");
      }
      setLoading(false);
    }
    void load();
  }, [router]);

  useEffect(() => {
    if (!shareMenuOpen) return;
    function closeMenu(event: MouseEvent | TouchEvent) {
      if (!shareMenuRef.current?.contains(event.target as Node)) {
        setShareMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("touchstart", closeMenu);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("touchstart", closeMenu);
    };
  }, [shareMenuOpen]);

  async function createPdf() {
    if (!sheetRef.current) throw new Error("Pavadzīme nav pieejama");
    setCreatingPdf(true);
    try {
      await document.fonts.ready;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: 1200,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const width = canvas.width * ratio;
      const height = canvas.height * ratio;
      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.95),
        "JPEG",
        (pageWidth - width) / 2,
        0,
        width,
        height,
      );
      return pdf.output("blob");
    } finally {
      setCreatingPdf(false);
    }
  }

  async function downloadPdf() {
    setShareMenuOpen(false);
    try {
      const blob = await createPdf();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pavadzime-${noteNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice("PDF neizdevās saglabāt. Mēģini vēlreiz.");
      window.setTimeout(() => setNotice(""), 3000);
    }
  }

  async function sharePdf() {
    setShareMenuOpen(false);
    try {
      const blob = await createPdf();
      const file = new File([blob], `pavadzime-${noteNumber}.pdf`, {
        type: "application/pdf",
      });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Transporta pavadzīme Nr. ${noteNumber}`,
        });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      setNotice("PDF saglabāts. To vari pievienot ziņai.");
      window.setTimeout(() => setNotice(""), 3000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("PDF neizdevās nosūtīt. Mēģini vēlreiz.");
      window.setTimeout(() => setNotice(""), 3000);
    }
  }

  if (loading) return <p className="p-6">Ielādē...</p>;

  const selectedVehicle = vehicles.find(
    (vehicle) => String(vehicle.id) === vehicleId,
  );
  const displayDate = date
    ? new Intl.DateTimeFormat("lv-LV").format(new Date(`${date}T00:00:00`))
    : "Nav norādīts";

  return (
    <div className="delivery-note-page min-h-full bg-slate-100 p-3 text-slate-950 sm:p-6 dark:bg-zinc-950">
      <div className="delivery-note-no-print mx-auto mb-4 flex max-w-4xl items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="order-2 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
          aria-label="Aizvērt pavadzīmi"
          title="Aizvērt"
        >
          <X size={22} />
        </button>
        <div ref={shareMenuRef} className="order-1 relative">
          <button
            type="button"
            onClick={() => setShareMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-700 text-white hover:bg-blue-800"
            aria-label={creatingPdf ? "Veido PDF" : "Pavadzīmes darbības"}
            aria-expanded={shareMenuOpen}
            disabled={creatingPdf}
            title="Darbības"
          >
            <MoreVertical size={22} />
          </button>
          {shareMenuOpen && (
            <div className="absolute right-0 top-12 z-50 min-w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-900 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setShareMenuOpen(false);
                  window.print();
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-100"
              >
                <Printer size={18} /> Drukāt / PDF
              </button>
              <button
                type="button"
                onClick={() => void sharePdf()}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-100"
              >
                <Share2 size={18} /> Nosūtīt PDF
              </button>
              <button
                type="button"
                onClick={() => void downloadPdf()}
                className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-100"
              >
                <Download size={18} /> Saglabāt ierīcē
              </button>
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div className="delivery-note-no-print fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-xl">
          {notice}
        </div>
      )}

      <main ref={sheetRef} className="delivery-note-sheet mx-auto min-h-[297mm] w-full max-w-[210mm] space-y-6 bg-white p-5 shadow-xl sm:p-[15mm]">
        <header className="space-y-5 border-b-2 border-slate-900 pb-5">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,0.8fr)] items-end gap-4">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Transporta pavadzīme
            </h1>
            <div className="text-sm">
              <p className="font-semibold">Pavadzīmes Nr.</p>
              <p className="mt-1 text-base text-slate-800">{noteNumber}</p>
            </div>
          </div>
          <div className="text-sm">
            <p className="mb-1 font-semibold">Pārvadātāja dati</p>
            <p className="whitespace-pre-line leading-relaxed text-slate-800">
              {carrier || "Pārvadātāja dati nav norādīti"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-sm">
              <p className="font-semibold">Datums</p>
              <p className="mt-1 text-base text-slate-800">{displayDate}</p>
            </div>
            <div className="text-sm">
              <p className="font-semibold">Transportlīdzekļa VNZ</p>
              <p className="mt-1 text-base text-slate-800">
                {selectedVehicle?.registration_number || "Nav norādīts"}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-5 pr-0 sm:border-r sm:border-slate-300 sm:pr-5">
            <div className="text-sm">
              <p className="font-semibold">Nosūtītājs / pasūtītājs</p>
              <p className="mt-1 whitespace-pre-line leading-relaxed text-slate-800">
                {customer || "Nav norādīts"}
              </p>
            </div>
            <div className="text-sm">
              <p className="font-semibold">Uzkraušanas vieta</p>
              <p className="mt-1 whitespace-pre-line leading-relaxed text-slate-800">
                {origin || "Nav norādīta"}
              </p>
            </div>
            <SignaturePad label="Nosūtītāja paraksts" />
          </div>
          <div className="space-y-5 sm:pl-1">
            <div className="text-sm">
              <p className="font-semibold">Saņēmējs</p>
              <p className="mt-1 whitespace-pre-line leading-relaxed text-slate-800">
                {recipient || "Nav norādīts"}
              </p>
            </div>
            <div className="text-sm">
              <p className="font-semibold">Izkraušanas vieta</p>
              <p className="mt-1 whitespace-pre-line leading-relaxed text-slate-800">
                {destination || "Nav norādīta"}
              </p>
            </div>
            <SignaturePad label="Saņēmēja paraksts" />
          </div>
        </section>

        <div className="text-sm">
          <p className="font-semibold">Kravas veids</p>
          <p className="mt-1 whitespace-pre-line leading-relaxed text-slate-800">
            {cargo || "Nav norādīts"}
          </p>
        </div>

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
