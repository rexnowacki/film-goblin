import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  _sendCovenRequest,
  _acceptCovenRequest,
  _declineCovenRequest,
  _leaveCoven,
} from "../../lib/actions/coven";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  alice = await createTestUser();
  bob = await createTestUser();
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("coven_requests").delete().in("from_user_id", [alice.id, bob.id]);
  await admin.from("coven_members").delete()
    .or(`user_a_id.eq.${alice.id},user_b_id.eq.${alice.id},user_a_id.eq.${bob.id},user_b_id.eq.${bob.id}`);
  await deleteTestUser(alice.id);
  await deleteTestUser(bob.id);
});

describe("actions/coven", () => {
  it("sendCovenRequest inserts a pending row", async () => {
    const c = await signedInClient(alice.email, alice.password);
    const { id } = await _sendCovenRequest(c, bob.id);
    const admin = adminClient();
    const { data } = await admin.from("coven_requests").select("*").eq("id", id).single();
    expect(data?.status).toBe("pending");
    expect(data?.from_user_id).toBe(alice.id);
    expect(data?.to_user_id).toBe(bob.id);
    await admin.from("coven_requests").delete().eq("id", id);
  });

  it("self-invite rejects", async () => {
    const c = await signedInClient(alice.email, alice.password);
    await expect(_sendCovenRequest(c, alice.id)).rejects.toThrow();
  });

  it("acceptCovenRequest transitions status and creates a coven_members row", async () => {
    const admin = adminClient();
    const { data: req } = await admin.from("coven_requests")
      .insert({ from_user_id: alice.id, to_user_id: bob.id, status: "pending" })
      .select("id").single();
    const requestId = req!.id as string;
    const c = await signedInClient(bob.email, bob.password);
    await _acceptCovenRequest(c, requestId);
    const updated = await admin.from("coven_requests").select("status").eq("id", requestId).single();
    expect(updated.data?.status).toBe("accepted");
    const pair = await admin.from("coven_members").select("*")
      .or(`and(user_a_id.eq.${alice.id},user_b_id.eq.${bob.id}),and(user_a_id.eq.${bob.id},user_b_id.eq.${alice.id})`);
    expect(pair.data?.length).toBe(1);
    await admin.from("coven_members").delete()
      .or(`and(user_a_id.eq.${alice.id},user_b_id.eq.${bob.id}),and(user_a_id.eq.${bob.id},user_b_id.eq.${alice.id})`);
    await admin.from("coven_requests").delete().eq("id", requestId);
  });

  it("declineCovenRequest transitions status without creating a coven_members row", async () => {
    const admin = adminClient();
    const { data: req } = await admin.from("coven_requests")
      .insert({ from_user_id: alice.id, to_user_id: bob.id, status: "pending" })
      .select("id").single();
    const requestId = req!.id as string;
    const c = await signedInClient(bob.email, bob.password);
    await _declineCovenRequest(c, requestId);
    const updated = await admin.from("coven_requests").select("status").eq("id", requestId).single();
    expect(updated.data?.status).toBe("declined");
    const pair = await admin.from("coven_members").select("*")
      .or(`and(user_a_id.eq.${alice.id},user_b_id.eq.${bob.id}),and(user_a_id.eq.${bob.id},user_b_id.eq.${alice.id})`);
    expect(pair.data?.length).toBe(0);
    await admin.from("coven_requests").delete().eq("id", requestId);
  });

  it("leaveCoven deletes the coven_members row", async () => {
    const admin = adminClient();
    const ua = alice.id < bob.id ? alice.id : bob.id;
    const ub = alice.id < bob.id ? bob.id : alice.id;
    await admin.from("coven_members").insert({ user_a_id: ua, user_b_id: ub });
    const c = await signedInClient(alice.email, alice.password);
    await _leaveCoven(c, bob.id);
    const pair = await admin.from("coven_members").select("*").eq("user_a_id", ua).eq("user_b_id", ub);
    expect(pair.data?.length).toBe(0);
  });
});
