import type { MetadataRoute } from "next";

const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://apidev.sifymodernization.digital").replace(/\/+$/, "");
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const ABS = `${ORIGIN}${BASE_PATH}`;
const now = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${ABS}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${ABS}/admin/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${ABS}/signup`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
