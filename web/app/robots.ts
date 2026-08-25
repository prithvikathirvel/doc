import type { MetadataRoute } from "next";

const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://apidev.sifymodernization.digital").replace(/\/+$/, "");
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const ABS = `${ORIGIN}${BASE_PATH}`;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${ABS}/sitemap.xml`,
    host: ORIGIN,
  };
}
