"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { Area } from "react-easy-crop";

interface Props {
  file: File;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}

const OUTPUT_SIZE = 400;

async function renderCroppedBlob(file: File, area: Area): Promise<Blob> {
  const img = await loadImage(URL.createObjectURL(file));
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, OUTPUT_SIZE, OUTPUT_SIZE,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.88);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export default function AvatarEditor({ file, onCancel, onSave }: Props) {
  const [src, setSrc] = useState<string>("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixelArea, setPixelArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setPixelArea(areaPixels);
  }, []);

  async function handleSave() {
    if (!pixelArea) return;
    setSaving(true);
    try {
      const blob = await renderCroppedBlob(file, pixelArea);
      onSave(blob);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, background: "rgba(10,10,10,0.92)",
      display: "grid", placeItems: "center", zIndex: 200, padding: 20,
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--void-2)",
        color: "var(--bone)",
        borderTop: "2px solid var(--accent)",
        borderRadius: 16,
        maxWidth: 520,
        width: "100%",
        padding: "var(--modal-pad)",
      }}>
        <h2 className="head" style={{ fontSize: 28, margin: "0 0 16px", lineHeight: 1 }}>
          Frame the portrait
        </h2>

        <div style={{
          position: "relative",
          width: "100%",
          height: 340,
          background: "#0A0A0A",
          border: "1px solid var(--muted)",
          borderRadius: 4,
          overflow: "hidden",
        }}>
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: { background: "#0A0A0A" },
              }}
            />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <span className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 16px",
              background: "transparent",
              color: "var(--bone)",
              border: "1px solid var(--muted)",
              fontFamily: "var(--font-ui)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderRadius: 4,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!pixelArea || saving}
            className="btn"
            style={{ padding: "10px 16px" }}
          >
            {saving ? "Saving…" : "✦ Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
