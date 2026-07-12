// app/components/PwaServiceWorker.tsx

"use client";

import { useEffect } from "react";

export default function PwaServiceWorker() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Silent fail. PWA install should never break RentFray.
    });
  }, []);

  return null;
}