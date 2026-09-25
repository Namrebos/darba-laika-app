import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    id: "/partner-portal",
    name: "AB Buss Pieteikums",
    short_name: "AB Pieteikums",
    description: "AB Buss partneru pieteikumu portāls",
    start_url: "/partner-portal",
    scope: "/partner-portal",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#ffffff",
    orientation: "portrait",
    icons: [
      { src: "/ab-pieteikums/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/ab-pieteikums/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/ab-pieteikums/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
