import type { MetadataRoute } from "next";

// basePath-aware icon paths; public/ assets are served under the basePath.
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sify DMS",
    short_name: "Sify DMS",
    description:
      "Secure, multi-tenant enterprise document management — upload, version, share and govern documents across workspaces.",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#3b5bdb",
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
