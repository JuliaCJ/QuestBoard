import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { doorState, fmt } from "@/lib/util";
import { redeemKey } from "./actions";

const LABEL = { locked: "Locked", priority: "Priority open", open: "Open", full: "Full", postponed: "Postponed" };

export default async function Board() {
  const u = await requireUser();
  const now = new Date();
  const hp = u.hasPriority || (!!u.priorityUntil && u.priorityUntil > now);
  const quests = await db.quest.findMany({
    where: { status: { in: ["active", "postponed"] }, postAt: { lte: now } },
    orderBy: { oneShotDate: "asc" },
    include: { _count: { select: { signups: { where: { status: "signed_up" } } } } },
  });
  return (
    <>
      <section className="hall" aria-label="Quests">
        {quests.length === 0 && <p className="empty">The hallway is quiet. No quests are posted yet.</p>}
        {quests.map((q) => {
          const st = doorState(q, q._count.signups, hp, now);
          return (
            <Link key={q.id} href={`/quest/${q.id}`} className={`door ${st}`}>
              <span className="state">{LABEL[st]}</span>
              <span className="plaque">
                <strong>{q.title}</strong>
                <span>Level {q.level}</span>
                <span>{q.renownReward} Renown</span>
                <span>{fmt(q.oneShotDate)}</span>
              </span>
              <span className="knob" />
            </Link>
          );
        })}
      </section>
      <ActionForm action={redeemKey} className="keybox">
        <label>Have a priority key?<input name="code" placeholder="Enter your code" autoComplete="off" /></label>
        <button>Redeem key</button>
      </ActionForm>
    </>
  );
}
