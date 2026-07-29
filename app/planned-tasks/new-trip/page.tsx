import "leaflet/dist/leaflet.css";
import RequestForm from "@/app/request/[token]/RequestForm";

export default function NewTripPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-3 py-5 text-slate-950 sm:px-6">
      <RequestForm token="" initiallyValid internal />
    </main>
  );
}
