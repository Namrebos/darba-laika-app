import { NextRequest, NextResponse } from "next/server";

function isGoogleMapsHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    /^(?:www\.|maps\.)?google\.[a-z.]{2,12}$/.test(host)
  );
}

function isSupportedMapHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    isGoogleMapsHost(host) ||
    host === "waze.com" ||
    host === "www.waze.com" ||
    host === "ul.waze.com" ||
    host === "maps.apple.com" ||
    host === "maps.apple"
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

function pointFromMapUrl(url: URL) {
  const destinationKeys = ["destination", "daddr", "to"];
  for (const key of destinationKeys) {
    const point = pointFromText(url.searchParams.get(key) || "");
    if (point) return point;
  }

  // A directions link can contain a textual destination and coordinate-based
  // origin. In that case the destination must be geocoded instead of silently
  // returning the origin coordinates.
  if (destinationKeys.some((key) => url.searchParams.get(key)?.trim())) {
    return null;
  }

  for (const key of ["query", "q", "center", "ll", "coordinate", "near", "sll", "origin", "saddr"]) {
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

function pointFromMapContent(value: string) {
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

function searchTextFromMapUrl(url: URL) {
  for (const key of ["destination", "daddr", "to", "query", "q", "address", "origin", "saddr"]) {
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

async function expandShortMapUrl(startUrl: URL) {
  let currentUrl = startUrl;
  for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
    const point = pointFromMapUrl(currentUrl);
    const searchText = searchTextFromMapUrl(currentUrl);
    if (point || searchText) return { url: currentUrl, point, searchText, response: null as Response | null };

    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(7000),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      },
    });
    const location = response.headers.get("location");
    if (!location) {
      return { url: currentUrl, point: null, searchText: "", response };
    }

    const nextUrl = new URL(location, currentUrl);
    if (!isSupportedMapHost(nextUrl.hostname)) {
      throw new Error(`Unexpected redirect host: ${nextUrl.hostname}`);
    }
    currentUrl = nextUrl;
  }
  throw new Error("Too many map link redirects");
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

async function geocodeMapSearchText(query: string) {
  const candidates = [query];
  const parts = query
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const addressStart = parts.findIndex(
    (part) => /\d/.test(part) && /[a-zāčēģīķļņšūž]/i.test(part),
  );
  if (addressStart > 0) candidates.push(parts.slice(addressStart).join(", "));

  for (const candidate of [...new Set(candidates)]) {
    const point = await geocodeSearchText(candidate);
    if (point) return point;
  }
  return null;
}

function mapUrlFromText(value: string) {
  const match = value.match(/(?:https?:\/\/)?(?:(?:www\.|maps\.)?google\.[a-z.]{2,12}|maps\.app\.goo\.gl|goo\.gl|(?:www\.|ul\.)?waze\.com|maps\.apple\.com|maps\.apple)(?:\/[^\s]*)?/i);
  if (!match) return null;
  try {
    const normalized = /^https?:\/\//i.test(match[0]) ? match[0] : `https://${match[0]}`;
    const url = new URL(normalized.replace(/[),.;]+$/, ""));
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" && isSupportedMapHost(url.hostname) ? url : null;
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

  let url = mapUrlFromText(value);
  if (!url) {
    return NextResponse.json(
      { error: "Ielīmē Google Maps, Waze vai Apple Maps saiti vai koordinātes, piemēram, 57.123, 25.456." },
      { status: 400 },
    );
  }

  let point = pointFromMapUrl(url);
  let searchText = searchTextFromMapUrl(url);
  if (!point) {
    try {
      const expanded = await expandShortMapUrl(url);
      url = expanded.url;
      point = expanded.point;
      searchText = expanded.searchText || searchText;
      if (!point && !searchText && expanded.response) {
        const contentType = expanded.response.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          const html = (await expanded.response.text()).slice(0, 2_000_000);
          point = pointFromMapContent(html);
        }
      }
    } catch (error) {
      console.warn("[location-link] map link expansion failed", {
        host: url.hostname,
        error: error instanceof Error ? error.message : String(error),
      });
      // If the map service blocks link expansion, textual location may still be usable.
    }
  }

  if (!point && searchText) point = await geocodeMapSearchText(searchText);

  if (!point) {
    console.warn("[location-link] coordinates not found", { host: url.hostname });
    return NextResponse.json(
      { error: "Saitē neizdevās atrast precīzas koordinātes." },
      { status: 400 },
    );
  }

  return NextResponse.json({ point });
}
