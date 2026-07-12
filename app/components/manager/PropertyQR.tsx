"use client";

import { useEffect, useState } from "react";

type QRData = {
  ok: true;
  propertyName: string;
  propertyCode: string;
  link: string;
  qrUrl: string;
};

export default function PropertyQR() {
  const [data, setData] = useState<QRData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/manager/property/qr", {
        credentials: "include",
      });
      const json = await res.json();
      if (json?.ok) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (!data?.link) return;
    navigator.clipboard.writeText(data.link);
    alert("Link copied");
  }

  function downloadQR() {
    if (!data?.qrUrl) return;

    const a = document.createElement("a");
    a.href = data.qrUrl;
    a.download = `${data.propertyCode}-qr.png`;
    a.click();
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="p-4">Loading QR...</div>;
  }

  if (!data) {
    return <div className="p-4">Failed to load QR</div>;
  }

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm space-y-4 max-w-sm">
      <div>
        <div className="text-sm text-gray-500">Property</div>
        <div className="font-semibold">{data.propertyName}</div>
        <div className="text-xs text-gray-400">
          Code: {data.propertyCode}
        </div>
      </div>

      <img
        src={data.qrUrl}
        alt="Property QR"
        className="w-full rounded"
      />

      <div className="text-xs break-all text-gray-500">
        {data.link}
      </div>

      <div className="flex gap-2">
        <button
          onClick={copyLink}
          className="flex-1 border rounded px-3 py-2 text-sm"
        >
          Copy Link
        </button>

        <button
          onClick={downloadQR}
          className="flex-1 bg-black text-white rounded px-3 py-2 text-sm"
        >
          Download QR
        </button>
      </div>
    </div>
  );
}