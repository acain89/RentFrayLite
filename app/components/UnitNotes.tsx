"use client";

import { useEffect, useState } from "react";

type Note = {
  id: string;
  content: string;
  noteType: "GENERAL" | "PAYMENT" | "SYSTEM";
  isPinned: boolean;
  createdAt: string;
};

type Props = {
  unitId: string;
};

export default function UnitNotes({ unitId }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch(`/api/notes?unitId=${unitId}`);
    const json = await res.json();

    if (json.ok) {
      setNotes(json.data);
    }
  }

  async function addNote() {
    if (!content.trim()) return;

    setLoading(true);

    await fetch("/api/notes", {
      method: "POST",
      body: JSON.stringify({
        unitId,
        content,
        noteType: "GENERAL",
      }),
    });

    setContent("");
    setLoading(false);
    load();
  }

  async function togglePin(noteId: string, current: boolean) {
    await fetch("/api/notes", {
      method: "POST",
      body: JSON.stringify({
        unitId,
        content: "", // no-op content (we’ll improve later if needed)
        isPinned: !current,
        noteId,
        action: "PIN_TOGGLE",
      }),
    });

    load();
  }

  function badge(type: Note["noteType"]) {
    if (type === "PAYMENT") return "bg-green-100 text-green-700";
    if (type === "SYSTEM") return "bg-gray-200 text-gray-700";
    return "bg-blue-100 text-blue-700";
  }

  // 🔥 REALTIME
  useEffect(() => {
    load();

    const evt = new EventSource("/api/stream");

    evt.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (
          data?.type === "admin:notes:update" &&
          data?.payload?.unitId === unitId
        ) {
          load();
        }
      } catch {}
    };

    return () => evt.close();
  }, [unitId]);

  return (
    <div className="mt-6">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-base font-semibold">Notes</div>
        <div className="text-xs text-gray-400">
          {notes.length} total
        </div>
      </div>

      {/* INPUT */}
      <div className="flex gap-2 mb-4">
        <input
          value={content}
          onChange={(e) =>
            setContent(e.target.value.slice(0, 500))
          }
          placeholder="Add a note..."
          className="flex-1 px-3 py-2 text-sm border rounded-md"
        />
        <button
          onClick={addNote}
          disabled={loading}
          className="px-4 py-2 text-sm text-white bg-slate-800 rounded-md hover:bg-slate-700"
        >
          Add
        </button>
      </div>

      {/* NOTES LIST */}
      <div className="space-y-3">
        {notes.map((n) => (
          <div
            key={n.id}
            className={`rounded-md border p-3 ${
              n.isPinned
                ? "bg-yellow-50 border-yellow-200"
                : "bg-slate-50"
            }`}
          >
            {/* TOP ROW */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {/* TYPE BADGE */}
                <span
                  className={`px-2 py-0.5 text-xs rounded ${badge(
                    n.noteType
                  )}`}
                >
                  {n.noteType}
                </span>

                {/* PIN INDICATOR */}
                {n.isPinned && (
                  <span className="text-xs text-yellow-600">
                    📌 Pinned
                  </span>
                )}
              </div>

              {/* PIN BUTTON */}
              <button
                onClick={() => togglePin(n.id, n.isPinned)}
                className="text-xs underline text-gray-500 hover:text-black"
              >
                {n.isPinned ? "Unpin" : "Pin"}
              </button>
            </div>

            {/* CONTENT */}
            <div className="text-sm mb-1">{n.content}</div>

            {/* TIMESTAMP */}
            <div className="text-xs text-gray-400">
              {new Date(n.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}