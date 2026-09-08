import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const startUrl = `/partner-request/${encodeURIComponent(token)}`;

  return NextResponse.json({
    name: "AB Pieteikums",
    short_name: "AB Pieteikums",
    description: "Brauciena pieteikuma forma",
    start_url: startUrl,
    scope: startUrl,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "portrait",
    icons: [
      { src: "/ab-pieteikums/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/ab-pieteikums/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/ab-pieteikums/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" },
  });
}
