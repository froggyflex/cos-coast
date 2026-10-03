import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/transfers", "/privacy"].map((path) => ({
    url: siteOrigin() + path,
    changeFrequency: "monthly" as const,
    priority: path ? 0.7 : 1,
  }));
}
