import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SiteFooter from "@/components/SiteFooter";
import { RFL_PUBLIC_ORIGIN } from "@/lib/publicMetadata";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(RFL_PUBLIC_ORIGIN),
  title: {
    default: "RentFrayLite",
    template: "%s | RentFrayLite",
  },
  description:
    "Standard rent and Custom Payments for rental properties.",
  applicationName: "RentFrayLite",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icons/rentfray-icon-192.png" },
  appleWebApp: { capable: true, title: "RentFrayLite", statusBarStyle: "default" },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = { themeColor: "#173c24" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <div className="rfl-site-frame">
          <div className="rfl-site-content">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
