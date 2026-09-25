import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "AB Buss Pieteikums",
    applicationName: "AB Buss Pieteikums",
    description: "AB Buss partneru pieteikumu portāls",
    manifest: "/partner-portal/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/ab-pieteikums/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/ab-pieteikums/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/ab-pieteikums/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: "AB Buss Pieteikums",
      statusBarStyle: "default",
    },
  };
}

export default function PartnerPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
