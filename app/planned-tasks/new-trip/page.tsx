import RequestForm from "@/app/request/[token]/RequestForm";

export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ repeat?: string }> }) {
  const { repeat } = await searchParams;
  const sourceRequestId = Number(repeat);
  return (
    <main className="min-h-screen bg-slate-50 px-3 py-5 text-slate-950 sm:px-6">
      <RequestForm token="" initiallyValid internal sourceRequestId={Number.isSafeInteger(sourceRequestId) && sourceRequestId > 0 ? sourceRequestId : undefined} />
    </main>
  );
}
