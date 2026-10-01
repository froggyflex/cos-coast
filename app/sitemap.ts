import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/transfers"].map((path) => ({
    url: "https://kos-coast-transfers.andreadikos.chatgpt.site" + path,
    changeFrequency: "monthly" as const,
    priority: path ? 0.7 : 1,
  }));
}
