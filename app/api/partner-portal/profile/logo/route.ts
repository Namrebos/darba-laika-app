import { NextRequest, NextResponse } from "next/server";
import { getPartnerPortalSession } from "@/lib/partnerPortalServer";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function storagePath(url: string | null) {
  const marker = "/storage/v1/object/public/partner-logos/";
  const index = url?.indexOf(marker) ?? -1;
  return index >= 0 ? decodeURIComponent(url!.slice(index + marker.length)) : "";
}

export async function POST(request: NextRequest) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });
  const formData = await request.formData();
  const file = formData.get("logo");
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Atļauts JPG, PNG vai WEBP logo līdz 5 MB." }, { status: 400 });
  }
  const { data: current } = await auth.client.from("partners").select("logo_url").eq("id", auth.partnerId).single();
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${auth.partnerId}/logo-${Date.now()}.${extension}`;
  const { error: uploadError } = await auth.client.storage.from("partner-logos").upload(path, file, { contentType: file.type });
  if (uploadError) return NextResponse.json({ error: "Logo neizdevās augšupielādēt." }, { status: 500 });
  const logoUrl = auth.client.storage.from("partner-logos").getPublicUrl(path).data.publicUrl;
  const { error: updateError } = await auth.client.from("partners").update({ logo_url: logoUrl, updated_at: new Date().toISOString() }).eq("id", auth.partnerId);
  if (updateError) {
    await auth.client.storage.from("partner-logos").remove([path]);
    return NextResponse.json({ error: "Logo neizdevās saglabāt." }, { status: 500 });
  }
  const oldPath = storagePath(typeof current?.logo_url === "string" ? current.logo_url : null);
  if (oldPath) await auth.client.storage.from("partner-logos").remove([oldPath]);
  return NextResponse.json({ logoUrl });
}

export async function DELETE(request: NextRequest) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });
  const { data: current } = await auth.client.from("partners").select("logo_url").eq("id", auth.partnerId).single();
  const { error } = await auth.client.from("partners").update({ logo_url: null, updated_at: new Date().toISOString() }).eq("id", auth.partnerId);
  if (error) return NextResponse.json({ error: "Logo neizdevās dzēst." }, { status: 500 });
  const oldPath = storagePath(typeof current?.logo_url === "string" ? current.logo_url : null);
  if (oldPath) await auth.client.storage.from("partner-logos").remove([oldPath]);
  return NextResponse.json({ success: true });
}
