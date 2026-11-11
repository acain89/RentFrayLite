import type { MetadataRoute } from "next";
import { PUBLIC_MARKETING_PATHS, RFL_PUBLIC_ORIGIN } from "@/lib/publicMetadata";

// The route group does not appear in the URL: this produces /sitemap.xml.
// Keep the unrelated, untracked root sitemap artifact out of release inputs.
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_MARKETING_PATHS.map(path => ({ url: new URL(path, RFL_PUBLIC_ORIGIN).href }));
}
