import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

export const COOKIE = "qb_session";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function startSession(userId: string) {
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setExpirationTime("14d").sign(key());
  cookies().set(COOKIE, jwt, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 14 * 86400 });
}

export async function currentUser() {
  const t = cookies().get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key());
    const u = await db.user.findUnique({ where: { id: payload.sub! } });
    return u && u.isActive ? u : null;
  } catch { return null; }
}
export async function requireUser() { const u = await currentUser(); if (!u) redirect("/login"); return u; }
export async function requireAdmin() { const u = await requireUser(); if (u.role !== "admin") redirect("/"); return u; }
