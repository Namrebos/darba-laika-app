import { NextRequest, NextResponse } from "next/server";

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

const cache = new Map<
  string,
  { expiresAt: number; results: Array<{ label: string; lat: number; lng: number }> }
>();

const reverseCache = new Map<
  string,
  { expiresAt: number; result: { label: string; lat: number; lng: number } | null }
>();

function addressLabel(properties: PhotonFeature["properties"]) {
  if (!properties) return "";
  const street = [properties.street, properties.housenumber]
    .filter(Boolean)
    .join(" ");
  return [
    properties.name !== properties.street ? properties.name : null,
    street,
    properties.city || properties.district || properties.county,
    properties.postcode,
    properties.country,
  ]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ");
}

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const cached = reverseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ result: cached.result });
    }

    const url = new URL("https://photon.komoot.io/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/geo+json",
          "User-Agent": "DarbaLaikaApp/1.0 (reverse address search)",
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error("Reverse geocoder request failed");

      const data = (await response.json()) as { features?: PhotonFeature[] };
      const feature = data.features?.[0];
      const coordinates = feature?.geometry?.coordinates;
      const label = addressLabel(feature?.properties);
      const result =
        coordinates && label
          ? { label, lat: coordinates[1], lng: coordinates[0] }
          : null;

      reverseCache.set(cacheKey, {
        result,
        expiresAt: Date.now() + 60 * 60 * 1000,
      });
      return NextResponse.json(
        { result },
        { headers: { "Cache-Control": "public, max-age=300" } },
      );
    } catch {
      return NextResponse.json(
        { error: "Adreses noteikšana pašlaik nav pieejama.", result: null },
        { status: 503 },
      );
    }
  }

  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 120) || "";
  if (query.length < 3) {
    return NextResponse.json({ results: [] });
  }

  const cacheKey = query.toLocaleLowerCase("lv-LV");
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ results: cached.results });
  }

  const url = new URL("https://photon.komoot.io/api");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lat", "56.9496");
  url.searchParams.set("lon", "24.1052");
  url.searchParams.set("zoom", "6");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/geo+json",
        "User-Agent": "DarbaLaikaApp/1.0 (address search)",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("Geocoder request failed");

    const data = (await response.json()) as { features?: PhotonFeature[] };
    const results = (data.features || [])
      .map((feature) => {
        const coordinates = feature.geometry?.coordinates;
        if (!coordinates) return null;
        const [lng, lat] = coordinates;
        const label = addressLabel(feature.properties);
        return label && Number.isFinite(lat) && Number.isFinite(lng)
          ? { label, lat, lng }
          : null;
      })
      .filter(
        (
          result,
        ): result is { label: string; lat: number; lng: number } =>
          result !== null,
      );

    cache.set(cacheKey, {
      results,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Adrešu meklēšana pašlaik nav pieejama.", results: [] },
      { status: 503 },
    );
  }
}
