import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { resolveReturnContract } from "@/lib/return-contract/resolve";
import type { ReturnContract, ReturnContractCandidate } from "@/lib/return-contract/types";
import { getTasteTwinSuggestions } from "@/lib/queries/taste-twins";

type Client = SupabaseClient<Database>;

export async function getReturnContract(
  client: Client,
  userId: string,
  now: Date,
): Promise<ReturnContract | null> {
  try {
    const [requests, recommendations, attendeeRows, hostedRows, hostedAftermath, watchlistRows, deferrals, tasteTwins] = await Promise.all([
      client.from("coven_requests").select("id, from_user_id, created_at").eq("to_user_id", userId).eq("status", "pending").order("created_at", { ascending: false }).limit(5),
      client.from("recommendations").select("id, from_user_id, film_id, created_at").eq("to_user_id", userId).order("created_at", { ascending: false }).limit(5),
      client.from("gazing_attendees").select("invite_id, created_at").eq("user_id", userId).limit(10),
      client.from("gazing_invites").select("id, token, film_title, starts_at, created_at").eq("created_by", userId).eq("status","scheduled").gte("starts_at", now.toISOString()).order("starts_at").limit(5),
      client.from("gazing_invites").select("id,token,film_title,starts_at,created_at").eq("created_by",userId).eq("status","happened").order("starts_at",{ascending:false}).limit(3),
      client.from("watchlists").select("id, film_id, max_price_usd, created_at").eq("user_id", userId).not("max_price_usd", "is", null).limit(20),
      client.from("return_contract_deferrals").select("contract_key, deferred_until").eq("user_id", userId).gt("deferred_until", now.toISOString()),
      getTasteTwinSuggestions(client, userId, 1),
    ]);
    const failures = [requests, recommendations, attendeeRows, hostedRows, hostedAftermath, watchlistRows, deferrals].filter(result => result.error);
    if (failures.length) throw failures[0].error;

    const attendeeInviteIds = (attendeeRows.data ?? []).map(row => row.invite_id);
    const recFilmIds = (recommendations.data ?? []).map(row => row.film_id);
    const priceFilmIds = (watchlistRows.data ?? []).map(row => row.film_id);
    const actorIds = [...new Set([
      ...(requests.data ?? []).map(row => row.from_user_id),
      ...(recommendations.data ?? []).map(row => row.from_user_id),
    ])];

    const [attendingInvites, films, profiles] = await Promise.all([
      attendeeInviteIds.length
        ? client.from("gazing_invites").select("id, token, film_title, starts_at, created_at").in("id", attendeeInviteIds).eq("status","scheduled").gte("starts_at", now.toISOString()).order("starts_at")
        : Promise.resolve({ data: [], error: null }),
      recFilmIds.length || priceFilmIds.length
        ? client.from("films_with_stats").select("id, title, latest_price").in("id", [...new Set([...recFilmIds, ...priceFilmIds])])
        : Promise.resolve({ data: [], error: null }),
      actorIds.length
        ? client.from("profiles").select("id, username, display_name, avatar_url").in("id", actorIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (attendingInvites.error || films.error || profiles.error) throw attendingInvites.error ?? films.error ?? profiles.error;

    const profileById = new Map((profiles.data ?? []).map(profile => [profile.id, profile]));
    const filmById = new Map((films.data ?? []).filter(film => film.id).map(film => [film.id!, film]));
    const deferralByKey = new Map((deferrals.data ?? []).map(row => [row.contract_key, row.deferred_until]));
    const candidates: ReturnContractCandidate[] = [];
    const push = (candidate: Omit<ReturnContractCandidate, "deferredUntil">) => candidates.push({
      ...candidate,
      deferredUntil: deferralByKey.get(candidate.key) ?? null,
    });

    for (const invite of [...(attendingInvites.data ?? []), ...(hostedRows.data ?? [])]) {
      const key = `gazing_upcoming:${invite.id}`;
      push({ kind: "gazing_upcoming", key, href: `/gazing/${invite.token}`, title: `${invite.film_title} is approaching.`, detail: `Your gazing begins ${new Date(invite.starts_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`, actionLabel: "Open the gazing", changedAt: invite.created_at, deadline: invite.starts_at });
    }
    for(const invite of hostedAftermath.data??[]){push({kind:"gazing_aftermath",key:`gazing_aftermath:${invite.id}`,href:`/gazing/${invite.token}`,title:`${invite.film_title} is waiting for its verdict.`,detail:"Confirm who was there and record what you thought.",actionLabel:"Close the loop",changedAt:invite.starts_at});}
    for (const request of requests.data ?? []) {
      const actor = profileById.get(request.from_user_id);
      if (!actor) continue;
      push({ kind: "coven_request", key: `coven_request:${request.id}`, href: "/coven", title: `${actor.display_name || actor.username} wants to join your coven.`, detail: "Their invitation is waiting for your answer.", actionLabel: "Answer invitation", changedAt: request.created_at });
    }
    for (const rec of recommendations.data ?? []) {
      const actor = profileById.get(rec.from_user_id);
      const film = filmById.get(rec.film_id);
      if (!actor || !film?.id || !film.title) continue;
      push({ kind: "recommendation", key: `recommendation:${rec.id}`, href: `/film/${film.id}?src=return_contract&contract_key=${encodeURIComponent(`recommendation:${rec.id}`)}`, title: `${actor.display_name || actor.username} sent you ${film.title}.`, detail: "Their recommendation is ready to inspect.", actionLabel: "See the film", changedAt: rec.created_at });
    }
    for (const item of watchlistRows.data ?? []) {
      const film = filmById.get(item.film_id);
      if (!film?.id || !film.title || film.latest_price == null || item.max_price_usd == null || Number(film.latest_price) > Number(item.max_price_usd)) continue;
      push({ kind: "price_action", key: `price_action:${item.id}`, href: `/film/${film.id}?src=return_contract&contract_key=${encodeURIComponent(`price_action:${item.id}`)}`, title: `${film.title} reached your price.`, detail: `$${Number(film.latest_price).toFixed(2)} on Apple TV is within your $${Number(item.max_price_usd).toFixed(2)} limit.`, actionLabel: "Make the call", changedAt: item.created_at });
    }
    const twin = tasteTwins[0];
    if (twin) push({ kind: "taste_twin", key: `taste_twin:${twin.user.id}`, href: "/coven", title: `Your film trail crosses @${twin.user.username}.`, detail: twin.sharedTraits.length ? `You share ${twin.sharedTraits.map(t => t.name).join(" and ")}.` : twin.sharedFilm ? `You both saved ${twin.sharedFilm.title}.` : "They are connected through someone already in your coven.", actionLabel: "Meet your kindred", changedAt: now.toISOString() });

    const day = now.toISOString().slice(0, 10);
    push({ kind: "daily_omen", key: `daily_omen:${day}`, href: "/films?src=return_contract", title: "Today's Daily Omen is waiting.", detail: "One film has been drawn from your current taste signals.", actionLabel: "Reveal the omen", changedAt: `${day}T00:00:00.000Z`, deadline: new Date(`${day}T23:59:59.999Z`).toISOString() });
    return resolveReturnContract(candidates, now);
  } catch (error) {
    console.error("return contract query failed", error);
    return null;
  }
}
