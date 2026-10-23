import type { Metadata } from "next";
import { IM_Fell_English, Alegreya_Sans } from "next/font/google";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { logout } from "./actions";
import "./globals.css";

const head = IM_Fell_English({ weight: "400", subsets: ["latin"], variable: "--head" });
const body = Alegreya_Sans({ weight: ["400", "700"], subsets: ["latin"], variable: "--body" });

export const metadata: Metadata = { title: "QuestBoard", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function Root({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  return (
    <html lang="en">
      <body className={`${head.variable} ${body.variable}`}>
        {u && (
          <header className="bar">
            <Link href="/">Quest Board</Link> { " | "}
            {u.role === "admin" && <><Link href="/admin">Admin</Link>{" | "}</>}
            {u.role === "admin" && <><Link href="/quest">Quest Portal</Link>{" | "}</>}
            
            <span className="grow" />
            <b>{u.renown} Renown</b>
            <form action={logout}><button className="link">Log out</button></form>
          </header>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
