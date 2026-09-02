"use client";

import { Check, Eraser } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Snapshot = { noteNumber: string; date: string; vehicleNumber: string; carrier: string; sender: string; recipient: string; origin: string; destination: string; cargo: string };

export default function PublicSigningPage() {
  const { token } = useParams<{ token: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [role, setRole] = useState<"sender" | "recipient">("recipient");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/sign/${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Pavadzīme nav pieejama.");
      setSnapshot(body.snapshot);
      setRole(body.signerRole);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Pavadzīme nav pieejama."));
  }, [token]);

  function position(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * event.currentTarget.width, y: (event.clientY - rect.top) / rect.height * event.currentTarget.height };
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = position(event);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); drawing.current = true;
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = position(event); ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk.current = true;
  }
  function stop(event: React.PointerEvent<HTMLCanvasElement>) { drawing.current = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }
  function clear() { const canvas = canvasRef.current; canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); hasInk.current = false; }
  async function submit() {
    if (!name.trim() || !hasInk.current || !canvasRef.current) { setError("Ievadi savu vārdu un paraksties."); return; }
    setSaving(true); setError("");
    const response = await fetch(`/api/sign/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signerName: name.trim(), signatureData: canvasRef.current.toDataURL("image/png") }) });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) { setError(body.error || "Parakstu neizdevās saglabāt."); return; }
    setDone(true);
  }

  if (done) return <main className="min-h-screen bg-slate-100 p-4 text-slate-950"><div className="mx-auto mt-16 max-w-lg rounded-2xl bg-white p-8 text-center shadow"><Check className="mx-auto mb-4 text-green-600" size={52}/><h1 className="text-2xl font-bold">Pavadzīme parakstīta</h1><p className="mt-2 text-slate-600">Paraksts ir saglabāts un redzams nosūtītāja aplikācijā.</p></div></main>;
  if (error && !snapshot) return <main className="min-h-screen bg-slate-100 p-4 text-slate-950"><div className="mx-auto mt-16 max-w-lg rounded-2xl bg-white p-8 shadow"><h1 className="text-xl font-bold">Pavadzīme nav pieejama</h1><p className="mt-2 text-red-700">{error}</p></div></main>;
  if (!snapshot) return <p className="p-6">Ielādē pavadzīmi...</p>;
  const date = new Intl.DateTimeFormat("lv-LV").format(new Date(`${snapshot.date}T00:00:00`));
  return <main className="min-h-screen bg-slate-100 p-3 text-slate-950 sm:p-6">
    <article className="mx-auto max-w-[210mm] space-y-6 bg-white p-5 shadow-xl sm:p-10">
      <header className="space-y-4 border-b-2 border-slate-900 pb-5"><div className="flex justify-between gap-4"><h1 className="text-2xl font-black">Transporta pavadzīme</h1><div><b>Pavadzīmes Nr.</b><p>{snapshot.noteNumber}</p></div></div><div><b>Pārvadātāja dati</b><p className="whitespace-pre-line">{snapshot.carrier || "Nav norādīti"}</p></div><div className="grid grid-cols-2 gap-4"><div><b>Datums</b><p>{date}</p></div><div><b>Transportlīdzekļa VNZ</b><p>{snapshot.vehicleNumber || "Nav norādīts"}</p></div></div></header>
      <section className="grid gap-5 sm:grid-cols-2"><div><b>Nosūtītājs / pasūtītājs</b><p className="whitespace-pre-line">{snapshot.sender}</p><b className="mt-4 block">Uzkraušanas vieta</b><p>{snapshot.origin}</p></div><div><b>Saņēmējs</b><p className="whitespace-pre-line">{snapshot.recipient}</p><b className="mt-4 block">Izkraušanas vieta</b><p>{snapshot.destination}</p></div></section><div><b>Kravas veids</b><p>{snapshot.cargo}</p></div>
      <section className="border-t pt-5"><h2 className="text-lg font-bold">{role === "sender" ? "Nosūtītāja paraksts" : "Saņēmēja paraksts"}</h2><label className="mt-3 block text-sm font-semibold">Parakstītāja vārds un uzvārds</label><input className="form-input mt-1" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name"/><canvas ref={canvasRef} width={900} height={360} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} className="mt-3 h-64 w-full touch-none rounded-xl border-2 border-slate-300 bg-white shadow-inner"/><div className="mt-3 flex justify-between gap-3"><button type="button" onClick={clear} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-600"><Eraser size={16}/> Notīrīt</button><button type="button" disabled={saving} onClick={() => void submit()} className="rounded-lg bg-green-600 px-6 py-3 font-bold text-white disabled:opacity-50">{saving ? "Saglabā..." : "Parakstīt pavadzīmi"}</button></div>{error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}</section>
    </article>
  </main>;
}

