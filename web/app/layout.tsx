import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { SessionProvider } from "@/contexts/SessionContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document Management System",
  description: "Multi-tenant document management with vendor-agnostic object storage.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
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
