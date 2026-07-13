import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import {
  BADGE_IMAGE_BUCKET,
  BADGE_IMAGE_MAX_BYTES,
  validateBadgeImage,
} from "@/lib/badges/image";

async function requireRouteAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const access = await checkAdminAccess(supabase);
  if (access === "not-authed") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (access === "not-admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(request: Request) {
  const denied = await requireRouteAdmin();
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid multipart form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose SVG or PNG artwork." }, { status: 400 });
  }

  const validation = await validateBadgeImage(file);
  if (!validation.ok) {
    const status = file.size > BADGE_IMAGE_MAX_BYTES ? 413 : 400;
    return NextResponse.json({ error: validation.error }, { status });
  }

  const path = `${randomUUID()}.${validation.extension}`;
  const bucket = serviceRoleClient().storage.from(BADGE_IMAGE_BUCKET);
  const { error } = await bucket.upload(path, validation.bytes, {
    cacheControl: "31536000",
    contentType: validation.contentType,
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ error: "Artwork upload failed." }, { status: 500 });
  }

  const { data } = bucket.getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl, path }, { status: 201 });
}
