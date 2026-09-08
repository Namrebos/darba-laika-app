import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "AB Pieteikums",
    applicationName: "AB Pieteikums",
    manifest: `/partner-request/${encodeURIComponent(token)}/manifest.webmanifest`,
    icons: {
      icon: [
        { url: "/ab-pieteikums/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/ab-pieteikums/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/ab-pieteikums/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: "AB Pieteikums",
      statusBarStyle: "default",
    },
  };
}

export default function PartnerRequestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
