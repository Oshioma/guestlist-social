"use client";

import { useState } from "react";

type Creative = {
  url: string;
  name: string;
};

type Props = {
  creatives: Creative[];
  onPick: (url: string) => void;
};

export default function CreativeLibraryPicker({ creatives, onPick }: Props) {
  const [open, setOpen] = useState(false);

  if (creatives.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid #e4e4e7",
          background: "#fff",
          color: "#18181b",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {open ? "Close library" : `Pick from library (${creatives.length})`}
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
            gap: 8,
            maxHeight: 240,
            overflowY: "auto",
            padding: 8,
            border: "1px solid #e4e4e7",
            borderRadius: 10,
            background: "#fafafa",
          }}
        >
          {creatives.map((c) => (
            <button
              key={c.url}
              type="button"
              onClick={() => {
                onPick(c.url);
                setOpen(false);
              }}
              style={{
                padding: 0,
                border: "2px solid transparent",
                borderRadius: 8,
                background: "none",
                cursor: "pointer",
                overflow: "hidden",
              }}
              title={c.name}
            >
              <img
                src={c.url}
                alt={c.name}
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                  display: "block",
                  borderRadius: 6,
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
