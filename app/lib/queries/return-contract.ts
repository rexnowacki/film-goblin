import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { resolveReturnContracts } from "@/lib/return-contract/resolve";
import type { ReturnContract, ReturnContractCandidate } from "@/lib/return-contract/types";
import { getTasteTwinSuggestions } from "@/lib/queries/taste-twins";

type Client = SupabaseClient<Database>;

export async function getReturnContracts(
  client: Client,
  userId: string,
  now: Date,
): Promise<ReturnContract[]> {
  try {
    const [requests, deferrals, tasteTwins] = await Promise.all([
      client
        .from("coven_requests")
        .select("id, from_user_id, created_at")
        .eq("to_user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
      client
        .from("return_contract_deferrals")
        .select("contract_key, deferred_until")
        .eq("user_id", userId)
        .gt("deferred_until", now.toISOString()),
      getTasteTwinSuggestions(client, userId, 3),
    ]);
    if (requests.error || deferrals.error) throw requests.error ?? deferrals.error;

    const profileIds = [...new Set([
      userId,
      ...(requests.data ?? []).map(request => request.from_user_id),
    ])];
    const profiles = await client
      .from("profiles")
      .select("id, username, avatar_url, created_at")
      .in("id", profileIds);
    if (profiles.error) throw profiles.error;

    const profileById = new Map((profiles.data ?? []).map(profile => [profile.id, profile]));
    const viewer = profileById.get(userId);
    const deferralByKey = new Map((deferrals.data ?? []).map(row => [row.contract_key, row.deferred_until]));
    const candidates: ReturnContractCandidate[] = [];
    const push = (candidate: Omit<ReturnContractCandidate, "deferredUntil">) => candidates.push({
      ...candidate,
      deferredUntil: deferralByKey.get(candidate.key) ?? null,
    });

    for (const request of requests.data ?? []) {
      const actor = profileById.get(request.from_user_id);
      if (!actor) continue;
      push({
        kind: "coven_request",
        key: `coven_request:${request.id}`,
        href: "/coven",
        title: `@${actor.username} wants to join your coven.`,
        detail: "Another goblin is waiting for your answer.",
        actionLabel: "Answer invitation",
        changedAt: request.created_at,
        subjectId: request.id,
        subjectUsername: actor.username,
      });
    }

    if (viewer && !viewer.avatar_url) {
      push({
        kind: "profile_photo",
        key: `profile_photo:${userId}`,
        href: "/settings#your-face",
        title: "Give your goblin a face.",
        detail: "A profile photo helps covenfolk recognize you around the Pit.",
        actionLabel: "Set your photo",
        changedAt: viewer.created_at,
        subjectId: userId,
        subjectUsername: viewer.username,
      });
    }

    for (const twin of tasteTwins) {
      push({
        kind: "taste_twin",
        key: `taste_twin:${twin.user.id}`,
        href: `/p/${encodeURIComponent(twin.user.username)}`,
        title: `Your film trail crosses @${twin.user.username}.`,
        detail: twin.sharedTraits.length
          ? `Your strongest shared tastes include ${twin.sharedTraits.map(trait => trait.name).join(" and ")}.`
          : twin.sharedFilm
            ? `You both saved ${twin.sharedFilm.title}.`
            : "They are connected through someone already in your coven.",
        actionLabel: "Invite to coven",
        changedAt: now.toISOString(),
        subjectId: twin.user.id,
        subjectUsername: twin.user.username,
      });
    }

    return resolveReturnContracts(candidates, now);
  } catch (error) {
    console.error("return contract query failed", error);
    return [];
  }
}

export async function getReturnContract(
  client: Client,
  userId: string,
  now: Date,
): Promise<ReturnContract | null> {
  return (await getReturnContracts(client, userId, now))[0] ?? null;
}
