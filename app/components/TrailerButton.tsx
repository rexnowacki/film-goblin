interface Props {
  youtubeId: string;
  filmTitle: string;
  label?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function TrailerButton({ youtubeId, filmTitle, label }: Props) {
  const title = label?.trim() || "Trailer";
  const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  const posterUrl = `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`;
  const escapedEmbedUrl = escapeHtml(embedUrl);
  const escapedFilmTitle = escapeHtml(filmTitle);
  const escapedTitle = escapeHtml(title);
  const srcDoc = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      *{box-sizing:border-box}body{margin:0;background:#000;font-family:system-ui,sans-serif}
      a{position:absolute;inset:0;display:grid;place-items:center;color:#0a0a0a;text-decoration:none;background:#000}
      img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.88}
      span{position:relative;width:74px;height:74px;border-radius:999px;background:#f3ecd8;border:3px solid #0a0a0a;box-shadow:0 0 0 4px #ff2d88;display:grid;place-items:center;font-size:30px;line-height:1;padding-left:6px}
      span::before{content:"▶"}
      small{position:absolute;left:12px;bottom:10px;padding:4px 10px;background:#0a0a0a;color:#f3ecd8;border:1px solid #f3ecd8;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
    </style>
  </head>
  <body>
    <a href="${escapedEmbedUrl}" aria-label="Play ${escapedFilmTitle} ${escapedTitle}">
      <img src="${posterUrl}" alt="">
      <span aria-hidden="true"></span>
      <small>${escapedTitle}</small>
    </a>
  </body>
</html>`;

  return (
    <section aria-label={`${title} for ${filmTitle}`} style={{ width: "100%", maxWidth: 680 }}>
      <div
        className="caps"
        style={{ color: "var(--accent)", fontSize: 11, marginBottom: 10 }}
      >
        {title}
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 9",
          background: "#000",
          border: "2px solid var(--bone)",
          boxShadow: "8px 8px 0 var(--accent)",
          overflow: "hidden",
        }}
      >
        <iframe
          src="about:blank"
          srcDoc={srcDoc}
          title={`${filmTitle} ${title}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
    </section>
  );
}
