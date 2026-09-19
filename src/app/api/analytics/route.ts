import { NextResponse } from "next/server";

/**
 * Collection point for the product analytics events. Swap the console sink for
 * your warehouse or analytics vendor -- the client contract stays the same.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body?.event !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    console.log("[analytics]", body.event, JSON.stringify(body.properties ?? {}));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
