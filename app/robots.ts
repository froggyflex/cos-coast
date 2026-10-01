import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/transfers"],
      disallow: ["/admin", "/api/", "/status"],
    },
    sitemap: "https://kos-coast-transfers.andreadikos.chatgpt.site/sitemap.xml",
  };
}
