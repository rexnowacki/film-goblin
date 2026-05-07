import React from "react";
import Image from "next/image";

export interface Film {
  id: string;
  title: string;
  director: string;
  year: number;
  artwork_url?: string | null;
  bg?: string;
  fg?: string;
  accent?: string;
  shape?: "triangle" | "circle" | "bars" | "eye" | "cross" | "skull";
  titleFont?: "display" | "head";
  case?: "upper" | "lower";
  titleBg?: string;
  halftoneOpacity?: number;
  coven_rating_pct?: number | null;
}

interface FilmPosterProps {
  film: Film;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
}

export default function FilmPoster({ film, size = "md", className = "", style = {}, priority = false }: FilmPosterProps) {
  const sizes = {
    xs: { w: 54, h: 80, title: 10, year: 7 },
    sm: { w: 88, h: 130, title: 14, year: 8 },
    md: { w: 160, h: 240, title: 22, year: 11 },
    lg: { w: 240, h: 360, title: 32, year: 14 },
    xl: { w: 340, h: 510, title: 54, year: 20 },
  };
  const s = sizes[size] || sizes.md;
  const bg = film.bg || "#1a1a1a";
  const fg = film.fg || "#f3ecd8";
  const accent = film.accent || "#ff2d88";
  const hasArt = Boolean(film.artwork_url);

  return (
    <div
      className={`film-poster ${className}`}
      style={{
        width: s.w,
        height: s.h,
        background: bg,
        color: fg,
        position: "relative",
        overflow: "hidden",
        border: "2px solid var(--void)",
        boxShadow: "3px 3px 0 var(--void)",
        flexShrink: 0,
        ...style,
      }}
    >
      {hasArt && (
        <Image
          src={film.artwork_url!}
          alt={film.title}
          fill
          sizes={`${s.w}px`}
          style={{ objectFit: "cover" }}
          priority={priority}
        />
      )}
      {!hasArt && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(${accent} 1.4px, transparent 1.6px)`,
            backgroundSize: "8px 8px",
            opacity: film.halftoneOpacity ?? 0.35,
            mixBlendMode: "screen",
          }}
        />
      )}
      {!hasArt && film.shape === "triangle" && (
        <div style={{
          position: "absolute", left: "10%", top: "14%", width: "80%", height: "48%",
          background: accent,
          clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
        }} />
      )}
      {!hasArt && film.shape === "circle" && (
        <div style={{
          position: "absolute", left: "20%", top: "18%", width: "60%",
          aspectRatio: "1 / 1",
          background: accent,
          borderRadius: "50%",
        }} />
      )}
      {!hasArt && film.shape === "bars" && (
        <div style={{
          position: "absolute", left: 0, top: "20%", right: 0, height: "40%",
          background: `repeating-linear-gradient(0deg, ${accent} 0 ${s.h*0.04}px, transparent ${s.h*0.04}px ${s.h*0.09}px)`,
        }} />
      )}
      {!hasArt && film.shape === "eye" && (
        <div style={{
          position: "absolute", left: "25%", top: "22%", width: "50%", aspectRatio: "2/1",
          background: accent,
          borderRadius: "50%",
          boxShadow: `inset 0 0 0 4px ${bg}`,
        }}>
          <div style={{
            position: "absolute", left: "35%", top: "25%", width: "30%", aspectRatio: "1/1",
            background: bg, borderRadius: "50%",
          }} />
        </div>
      )}
      {!hasArt && film.shape === "cross" && (
        <>
          <div style={{ position: "absolute", left: "46%", top: "12%", width: "8%", height: "56%", background: accent }} />
          <div style={{ position: "absolute", left: "30%", top: "26%", width: "40%", height: "8%", background: accent }} />
        </>
      )}
      {!hasArt && film.shape === "skull" && (
        <div style={{
          position: "absolute", left: "22%", top: "16%", width: "56%", aspectRatio: "1/1.1",
          background: accent,
          borderRadius: "46% 46% 40% 40% / 50% 50% 40% 40%",
        }}>
          <div style={{ position: "absolute", left: "18%", top: "40%", width: "22%", aspectRatio: "1", background: bg, borderRadius: "50%" }} />
          <div style={{ position: "absolute", right: "18%", top: "40%", width: "22%", aspectRatio: "1", background: bg, borderRadius: "50%" }} />
          <div style={{ position: "absolute", left: "40%", top: "68%", width: "20%", height: "14%", background: bg }} />
        </div>
      )}

      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        mixBlendMode: "multiply",
        opacity: 0.5,
      }} />

      {!hasArt && <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        padding: s.w > 100 ? "10px 12px 12px" : "6px 6px 8px",
        background: film.titleBg || (size === "xs" || size === "sm" ? `linear-gradient(to top, ${bg} 70%, transparent)` : "none"),
      }}>
        <div style={{
          fontFamily: film.titleFont === "display" ? "var(--font-display)" : "var(--font-head)",
          fontSize: s.title,
          lineHeight: 0.96,
          color: fg,
          textTransform: film.case === "upper" ? "uppercase" : "none",
          letterSpacing: "-0.005em",
        }}>
          {film.title}
        </div>
        {s.year >= 10 && (
          <div style={{
            fontFamily: "var(--font-ui)",
            fontSize: s.year,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginTop: 4,
            opacity: 0.7,
          }}>
            {film.director || film.year}
          </div>
        )}
      </div>}

      {size !== "xs" && film.coven_rating_pct != null && (
        <div style={{
          position: "absolute",
          bottom: 6,
          right: 6,
          background: "rgba(10,10,10,0.82)",
          color: "var(--accent)",
          fontFamily: "var(--font-ui)",
          fontSize: size === "sm" ? 9 : 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          padding: "3px 6px",
          zIndex: 2,
          pointerEvents: "none",
          lineHeight: 1,
        }}>
          {Math.round(film.coven_rating_pct)}%
        </div>
      )}
    </div>
  );
}
