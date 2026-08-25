import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { SessionProvider } from "@/contexts/SessionContext";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://apidev.sifymodernization.digital"),
  title: {
    default: "Sify DMS",
    template: "%s · Sify DMS",
  },
  applicationName: "Sify DMS",
  description:
    "Sify DMS — secure, multi-tenant enterprise document management. Upload, version, share and govern documents across workspaces with vendor-agnostic object storage.",
  keywords: [
    "Sify DMS",
    "document management",
    "enterprise DMS",
    "multi-tenant",
    "S3",
    "MinIO",
    "GCS",
    "Azure Blob",
    "document storage",
  ],
  authors: [{ name: "Sify" }],
  creator: "Sify",
  publisher: "Sify",
  formatDetection: { telephone: false },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Sify DMS",
    title: "Sify DMS",
    description:
      "Secure, multi-tenant enterprise document management — upload, version, share and govern documents across workspaces.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sify DMS",
    description:
      "Secure, multi-tenant enterprise document management — upload, version, share and govern documents across workspaces.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "technology",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-[var(--canvas)] text-[var(--text)] antialiased">
        <SessionProvider>
          {children}
          <Toaster position="top-right" theme="light" richColors closeButton duration={4000} />
        </SessionProvider>
      </body>
    </html>
  );
}
