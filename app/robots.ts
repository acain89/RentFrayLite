import type { MetadataRoute } from "next";
import { PUBLIC_MARKETING_PATHS, RFL_PUBLIC_ORIGIN } from "@/lib/publicMetadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
      // Crawlers need render assets; their responses still carry noindex.
      allow: [...PUBLIC_MARKETING_PATHS.map(path => `${path}$`), "/sitemap.xml$", "/robots.txt$", "/_next/static/"],
    },
    sitemap: `${RFL_PUBLIC_ORIGIN}/sitemap.xml`,
    host: RFL_PUBLIC_ORIGIN,
  };
}
