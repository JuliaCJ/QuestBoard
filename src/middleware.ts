import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(req: NextRequest) {
  try {
    await jwtVerify(req.cookies.get("qb_session")?.value ?? "", new TextEncoder().encode(process.env.AUTH_SECRET!));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}
export const config = { matcher: ["/((?!login|api/cron|robots.txt|_next|favicon.ico).*)"] };
