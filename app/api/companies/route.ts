import { NextRequest, NextResponse } from "next/server";

const RESOURCE_ID = "25e80bf3-f107-4ab4-89ef-251b5b9374e9";
const DATASTORE_URL = "https://data.gov.lv/dati/api/3/action/datastore_search";

type RegistryRecord = {
  regcode?: string | number;
  name?: string;
  address?: string;
  terminated?: string | null;
};

type RegistryResponse = {
  success?: boolean;
  result?: { records?: RegistryRecord[] };
};

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  if (query.length < 2) {
    return NextResponse.json({ companies: [] });
  }
  if (query.length > 80) {
    return NextResponse.json({ error: "Meklēšanas teksts ir pārāk garš." }, { status: 400 });
  }

  const url = new URL(DATASTORE_URL);
  url.searchParams.set("resource_id", RESOURCE_ID);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "30");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Registry response: ${response.status}`);

    const payload = (await response.json()) as RegistryResponse;
    const normalizedQuery = query.toLocaleLowerCase("lv-LV");
    const companies = (payload.result?.records || [])
      .filter((record) => record.name && record.regcode && !record.terminated)
      .sort((left, right) => {
        const leftStarts = left.name!
          .toLocaleLowerCase("lv-LV")
          .startsWith(normalizedQuery);
        const rightStarts = right.name!
          .toLocaleLowerCase("lv-LV")
          .startsWith(normalizedQuery);
        if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
        return left.name!.localeCompare(right.name!, "lv-LV");
      })
      .slice(0, 8)
      .map((record) => ({
        name: record.name!,
        registrationNumber: String(record.regcode),
        address: record.address || "",
      }));

    return NextResponse.json(
      { companies, source: "Latvijas Republikas Uzņēmumu reģistra atvērtie dati" },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
    );
  } catch (error) {
    console.error("Company registry search error:", error);
    return NextResponse.json(
      { error: "Uzņēmumu meklēšana pašlaik nav pieejama.", companies: [] },
      { status: 503 },
    );
  }
}
