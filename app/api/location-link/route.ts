import { NextRequest, NextResponse } from "next/server";

const googleHosts = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "maps.app.goo.gl",
  "goo.gl",
]);

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
  for (const key of ["query", "q", "destination", "center", "ll"]) {
    const point = pointFromText(url.searchParams.get(key) || "");
    if (point) return point;
  }

  const pathPoint = url.pathname.match(
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
  );
  if (pathPoint) {
    const lat = Number(pathPoint[1]);
    const lng = Number(pathPoint[2]);
    if (validPoint(lat, lng)) return { lat, lng };
  }

  const dataPoint = `${url.pathname}${url.search}`.match(
    /!3d(-?\d{1,2}(?:\.\d+)?).*?!4d(-?\d{1,3}(?:\.\d+)?)/,
  );
  if (dataPoint) {
    const lat = Number(dataPoint[1]);
    const lng = Number(dataPoint[2]);
    if (validPoint(lat, lng)) return { lat, lng };
  }

  return null;
}

function googleUrlFromText(value: string) {
  const match = value.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  try {
    const url = new URL(match[0].replace(/[),.;]+$/, ""));
    return url.protocol === "https:" && googleHosts.has(url.hostname)
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
  if (!point && (url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl")) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(7000),
        headers: { "User-Agent": "DarbaLaikaApp/1.0 (location link resolver)" },
      });
      const resolvedUrl = new URL(response.url);
      if (!googleHosts.has(resolvedUrl.hostname)) throw new Error("Unexpected redirect");
      url = resolvedUrl;
      point = pointFromGoogleUrl(url);
    } catch {
      return NextResponse.json(
        { error: "Google Maps īso saiti neizdevās atvērt." },
        { status: 400 },
      );
    }
  }

  if (!point) {
    return NextResponse.json(
      { error: "Saitē neizdevās atrast precīzas koordinātes." },
      { status: 400 },
    );
  }

  return NextResponse.json({ point });
}
