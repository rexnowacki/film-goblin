import { createClient } from "@/lib/supabase/server";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { redirect } from "next/navigation";
import FilmRequestActions from "./FilmRequestActions";

export default async function FilmRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ show_fulfilled?: string }>;
}) {
  const sp = await searchParams;
  const showFulfilled = sp.show_fulfilled === "1";

  const supabase = await createClient();
  const access = await checkAdminAccess(supabase);
  if (access === "not-authed") redirect("/auth/signin");
  if (access === "not-admin") redirect("/home");

  const svc = serviceRoleClient();

  const { data: requests } = showFulfilled
    ? await (svc.from("film_requests") as any).select("*").order("request_count", { ascending: false }).order("created_at", { ascending: false })
    : await (svc.from("film_requests") as any).select("*").eq("status", "pending").order("request_count", { ascending: false }).order("created_at", { ascending: false });

  const rows = requests ?? [];

  const { count: fulfilledCount } = await (svc.from("film_requests") as any)
    .select("*", { count: "exact", head: true })
    .eq("status", "fulfilled");

  return (
    <div>
      <section style={{ background: "var(--bone)", color: "var(--void)", border: "3px solid var(--void)", padding: "22px 18px 18px", marginBottom: 20 }} className="grain-light">
        <div>
          <h1 className="h-display" style={{ fontSize: "clamp(24px, 4vw, 48px)" }}>Film Requests.</h1>
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--void)", opacity: 0.7, marginTop: 6 }}>
            {rows.length} {showFulfilled ? "total" : "pending"} request{rows.length !== 1 ? "s" : ""}.
          </p>
        </div>
      </section>

      <section>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          <div style={{ marginBottom: 8 }}>
            <a
              href={showFulfilled ? "/admin/film-requests" : "/admin/film-requests?show_fulfilled=1"}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--muted)", textDecoration: "underline" }}
            >
              {showFulfilled ? "Hide fulfilled" : `Show fulfilled (${fulfilledCount ?? 0})`}
            </a>
          </div>

          {rows.length === 0 && (
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", padding: "40px 0" }}>
              No requests yet.
            </p>
          )}

          {rows.map((req: any) => (
            <div
              key={req.id}
              style={{
                display: "flex", gap: 16, alignItems: "flex-start",
                background: "var(--void-2)", border: "1px solid var(--void-3)", borderRadius: 6, padding: 16,
                opacity: req.status === "fulfilled" ? 0.5 : 1,
              }}
            >
              {req.artwork_url ? (
                <img
                  src={req.artwork_url}
                  alt={req.title}
                  style={{ width: 48, height: 72, objectFit: "cover", borderRadius: 3, flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 48, height: 72, background: "#222", borderRadius: 3, flexShrink: 0 }} />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="head" style={{ fontSize: 16 }}>{req.title}</div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                  {[req.year, req.director].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{
                    fontFamily: "var(--font-ui)", fontSize: 10, textTransform: "uppercase",
                    letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 3,
                    background: req.source === "itunes" ? "#1a2a1a" : "#2a1a1a",
                    color: req.source === "itunes" ? "#6f6" : "#f96",
                  }}>
                    {req.source}
                  </span>
                  {req.needs_itunes_id && (
                    <span style={{
                      fontFamily: "var(--font-ui)", fontSize: 10, textTransform: "uppercase",
                      letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 3,
                      background: "#2a1a00", color: "#fa0",
                    }}>
                      needs iTunes ID
                    </span>
                  )}
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
                    {req.request_count} {req.request_count === 1 ? "request" : "requests"}
                  </span>
                </div>
              </div>

              {req.status === "pending" && (
                <div style={{ flexShrink: 0 }}>
                  <FilmRequestActions request={req as { id: string; title: string; needs_itunes_id: boolean }} />
                </div>
              )}

              {req.status === "fulfilled" && (
                <div style={{ flexShrink: 0, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
                  Added ✓
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
