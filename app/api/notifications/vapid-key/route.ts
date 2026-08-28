import { NextResponse } from "next/server";
import { getVapidKeys } from "@/lib/webPush";

export async function GET() {
  const keys = getVapidKeys();
  if (!keys) {
    return NextResponse.json({ error: "Push nav konfigurēts." }, { status: 503 });
  }
  return NextResponse.json({ publicKey: keys.publicKey });
}
