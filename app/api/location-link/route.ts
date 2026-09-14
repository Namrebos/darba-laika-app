import { NextRequest, NextResponse } from "next/server";

function isGoogleMapsHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    /^(?:www\.|maps\.)?google\.[a-z.]{2,12}$/.test(host)
  );
}

function validPoint(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function pointFromText(value: string) {
  const match = value.match(/(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return validPoint(lat, lng) ? { lat, lng } : null;
}

function pointFromGoogleUrl(url: URL) {
  for (const key of ["query", "q", "destination", "origin", "daddr", "saddr", "center", "ll"]) {
    const point = pointFromText(url.searchParams.get(key) || "");
    if (point) return point;
  }

  let decodedUrl = `${url.pathname}${url.search}${url.hash}`;
  try {
    decodedUrl = decodeURIComponent(decodedUrl);
  } catch {
    // Keep the original URL text if it contains malformed percent encoding.
  }
  const pathPoint = decodedUrl.match(
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
  );
  if (pathPoint) {
    const lat = Number(pathPoint[1]);
    const lng = Number(pathPoint[2]);
    if (validPoint(lat, lng)) return { lat, lng };
  }

  const dataPoint = decodedUrl.match(
    /!3d(-?\d{1,2}(?:\.\d+)?).*?!4d(-?\d{1,3}(?:\.\d+)?)/,
  );
  if (dataPoint) {
    const lat = Number(dataPoint[1]);
    const lng = Number(dataPoint[2]);
    if (validPoint(lat, lng)) return { lat, lng };
  }

  const reversedDataPoint = decodedUrl.match(
    /!2d(-?\d{1,3}(?:\.\d+)?).*?!3d(-?\d{1,2}(?:\.\d+)?)/,
  );
  if (reversedDataPoint) {
    const lng = Number(reversedDataPoint[1]);
    const lat = Number(reversedDataPoint[2]);
    if (validPoint(lat, lng)) return { lat, lng };
  }

  return null;
}

function pointFromGoogleContent(value: string) {
  const decoded = value.replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
  const latLngPatterns = [
    /!3d(-?\d{1,2}(?:\.\d+)?).*?!4d(-?\d{1,3}(?:\.\d+)?)/,
    /"latitude"\s*:\s*(-?\d{1,2}(?:\.\d+)?).*?"longitude"\s*:\s*(-?\d{1,3}(?:\.\d+)?)/,
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
  ];
  for (const pattern of latLngPatterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (validPoint(lat, lng)) return { lat, lng };
  }

  const reversed = decoded.match(
    /!2d(-?\d{1,3}(?:\.\d+)?).*?!3d(-?\d{1,2}(?:\.\d+)?)/,
  );
  if (reversed) {
    const lng = Number(reversed[1]);
    const lat = Number(reversed[2]);
    if (validPoint(lat, lng)) return { lat, lng };
  }
  return null;
}

function searchTextFromGoogleUrl(url: URL) {
  for (const key of ["query", "q", "destination", "origin", "daddr", "saddr"]) {
    const value = url.searchParams.get(key)?.trim();
    if (value && !pointFromText(value) && !/^place_id:/i.test(value)) return value;
  }
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep the encoded pathname and continue with the available text.
  }
  const match = pathname.match(/\/maps\/(?:place|search)\/([^/@]+)/i);
  return match?.[1]?.replace(/\+/g, " ").trim() || "";
}

async function geocodeSearchText(query: string) {
  if (query.length < 3 || query.length > 200) return null;
  const url = new URL("https://photon.komoot.io/api");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lat", "56.9496");
  url.searchParams.set("lon", "24.1052");
  url.searchParams.set("zoom", "6");
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/geo+json", "User-Agent": "DarbaLaikaApp/1.0 (map link search)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
    };
    const coordinates = data.features?.[0]?.geometry?.coordinates;
    if (!coordinates) return null;
    const [lng, lat] = coordinates;
    return validPoint(lat, lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

function googleUrlFromText(value: string) {
  const match = value.match(/(?:https?:\/\/)?(?:(?:www\.|maps\.)?google\.[a-z.]{2,12}|maps\.app\.goo\.gl|goo\.gl)\/[^\s]+/i);
  if (!match) return null;
  try {
    const normalized = /^https?:\/\//i.test(match[0]) ? match[0] : `https://${match[0]}`;
    const url = new URL(normalized.replace(/[),.;]+$/, ""));
    return url.protocol === "https:" && isGoogleMapsHost(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let value = "";
  try {
    const body = (await request.json()) as { value?: unknown };
    value = typeof body.value === "string" ? body.value.trim().slice(0, 2048) : "";
  } catch {
    return NextResponse.json({ error: "Lokācijas dati nav derīgi." }, { status: 400 });
  }

  const directPoint = pointFromText(value);
  if (directPoint && !value.includes("http")) {
    return NextResponse.json({ point: directPoint });
  }

  let url = googleUrlFromText(value);
  if (!url) {
    return NextResponse.json(
      { error: "Ielīmē Google Maps saiti vai koordinātes, piemēram, 57.123, 25.456." },
      { status: 400 },
    );
  }

  let point = pointFromGoogleUrl(url);
  let searchText = searchTextFromGoogleUrl(url);
  if (!point) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(7000),
        headers: { "User-Agent": "DarbaLaikaApp/1.0 (location link resolver)" },
      });
      const resolvedUrl = new URL(response.url);
      if (!isGoogleMapsHost(resolvedUrl.hostname)) throw new Error("Unexpected redirect");
      url = resolvedUrl;
      point = pointFromGoogleUrl(url);
      searchText = searchText || searchTextFromGoogleUrl(url);
      if (!point) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          const html = (await response.text()).slice(0, 2_000_000);
          point = pointFromGoogleContent(html);
        }
      }
    } catch {
      // If Google blocks link expansion, the textual location may still be usable.
    }
  }

  if (!point && searchText) point = await geocodeSearchText(searchText);

  if (!point) {
    return NextResponse.json(
      { error: "Saitē neizdevās atrast precīzas koordinātes." },
      { status: 400 },
    );
  }

  return NextResponse.json({ point });
}
