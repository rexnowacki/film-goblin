import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm, { type DbFilm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?next=/onboarding");

  const [filmsRes, profileRes] = await Promise.all([
    supabase
      .from("films")
      .select("id, itunes_id, title, director, year, genre_primary, artwork_url")
      .eq("tracking", true)
      .eq("available", true)
      .limit(24),
    supabase.from("profiles").select("handle").eq("id", user.id).single(),
  ]);
  const films = (filmsRes.data ?? []) as DbFilm[];
  const initialHandle = profileRes.data?.handle ?? "";

  return (
    <div style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100dvh" }}>
      <section
        style={{
          background: "var(--bone)",
          color: "var(--void)",
          borderBottom: "3px solid var(--void)",
          padding: "32px 0 24px",
        }}
        className="grain-light"
      >
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            Welcome to the <em style={{ color: "var(--accent)" }}>Coven</em>.
          </h1>
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 18, opacity: 0.75, marginTop: 12, maxWidth: 640 }}>
            Bind your handle, set your alert threshold, pick three films to start.
          </p>
        </div>
      </section>

      <OnboardingForm initialFilms={films} initialHandle={initialHandle} />
    </div>
  );
}
