import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { lang: "en", id: "/manager/dashboard", name: "RentFrayLite Manager", short_name: "RentFrayLite", description: "Manage your RentFrayLite payments.", start_url: "/manager/dashboard", scope: "/", display: "standalone", background_color: "#f4f8f4", theme_color: "#173c24", icons: [
    { src: "/icons/rentfray-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/rentfray-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/rentfray-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ] };
}
