import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DAY, POSTPONE_LEAD_DAYS } from "@/lib/util";

export const dynamic = "force-dynamic";
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse("Unauthorized", { status: 401 });
  const cutoff = new Date(Date.now() + POSTPONE_LEAD_DAYS * DAY);
  const due = await db.quest.findMany({
    where: { status: "active", oneShotDate: { lte: cutoff } },
    include: { _count: { select: { signups: { where: { status: "signed_up" } } } } },
  });
  const ids = due.filter((q) => q._count.signups < q.minPlayers).map((q) => q.id);
  await db.quest.updateMany({ where: { id: { in: ids } }, data: { status: "postponed" } });
  const purged = await db.priorityKey.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return NextResponse.json({ postponed: ids.length, keysDeleted: purged.count });
}