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
      position: "fixed", inset: 0, background: "rgba(10,10,10,0.85)",
      display: "grid", placeItems: "center", zIndex: 200, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)",
        boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--accent)",
        maxWidth: 520, width: "100%", padding: "var(--modal-pad)",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Frame the Portrait</div>
        <h2 className="display" style={{ fontSize: 36, margin: "0 0 14px", lineHeight: 0.9 }}>Crop and zoom</h2>

        <div style={{ position: "relative", width: "100%", height: 340, background: "var(--void)", border: "2px solid var(--void)" }}>
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
            />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <span className="caps" style={{ fontSize: 10 }}>Zoom</span>
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
          <button onClick={onCancel} style={{ padding: "10px 16px", background: "transparent", border: "2px solid var(--void)", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!pixelArea || saving} style={{ padding: "10px 16px", background: "var(--void)", color: "var(--bone)", border: "2px solid var(--void)", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", cursor: saving ? "default" : "pointer" }}>
            {saving ? "Saving…" : "✦ Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
