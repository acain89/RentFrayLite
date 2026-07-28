import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SiteFooter from "@/components/SiteFooter";
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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:10000"
  ),
  title: {
    default: "RentFrayLite",
    template: "%s | RentFrayLite",
  },
  description:
    "Simple recurring and one-time payment collection for independent businesses.",
  applicationName: "RentFrayLite",
  robots: {
    index: true,
    follow: true,
  },
};

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