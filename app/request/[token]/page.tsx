import "leaflet/dist/leaflet.css";
import RequestForm from "./RequestForm";

export default async function TransportRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const baseUrl =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.APP_PRODUCTION_URL || "http://localhost:3000";

  let initiallyValid = false;
  try {
    const response = await fetch(
      `${baseUrl}/api/transport-requests?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const result = await response.json();
    initiallyValid = response.ok && result.valid === true;
  } catch {
    initiallyValid = false;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-5 text-slate-950 sm:px-6">
      <RequestForm token={token} initiallyValid={initiallyValid} />
    </main>
  );
}
