import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";
export default function robots(): MetadataRoute.Robots {
  return {
    rules:
      process.env.ALLOW_INDEXING === "true"
        ? {
            userAgent: "*",
            allow: "/",
            disallow: ["/admin", "/api/", "/status"],
          }
        : { userAgent: "*", disallow: "/" },
    sitemap: siteOrigin() + "/sitemap.xml",
  };
}
