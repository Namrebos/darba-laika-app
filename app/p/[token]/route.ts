import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const target = new URL("/partner-portal/register", request.url);
  target.searchParams.set("token", token);
  return NextResponse.redirect(target);
}
