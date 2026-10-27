import Link from "next/link";
import { redirect } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt } from "@/lib/util";
import * as A from "@/app/actions";

const HISTORY_LIMIT = 200;

// Fallback titles for ledger rows that have no note (older quest payouts, etc.).
const REASON: Record<string, string> = {
  quest: "Quest completed",
  bonus: "Bonus Renown",
  first_quest: "First quest bonus",
  admin_adjust: "Admin adjustment",
  purchase: "Store purchase",
};

const PAYOUT: Record<string, string> = { quest: "Reward", bonus: "Bonus", first_quest: "First quest bonus" };

export default async function Account() {
  const u = await requireUser();
  if (u.role === "admin") redirect("/admin");

  const [owned, ledger, signups] = await Promise.all([
    db.ownedItem.findMany({ where: { userId: u.id }, orderBy: { purchasedAt: "desc" } }),
    db.ledger.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: HISTORY_LIMIT }),
    db.signup.findMany({
      where: { userId: u.id, status: { in: ["signed_up", "completed"] } },
      include: { quest: true },
    }),
  ]);

  const upcoming = signups
    .filter((su) => su.status === "signed_up" && ["active", "postponed"].includes(su.quest.status))
    .sort((a, b) => a.quest.oneShotDate.getTime() - b.quest.oneShotDate.getTime());
  const completed = signups
    .filter((su) => su.status === "completed")
    .sort((a, b) => b.quest.oneShotDate.getTime() - a.quest.oneShotDate.getTime());

  // Renown earned from each completed quest (reward + any bonus + first-quest bonus).
  const payouts = completed.length
    ? await db.ledger.findMany({
        where: { userId: u.id, questId: { in: completed.map((su) => su.questId) }, amount: { gt: 0 } },
      })
    : [];
  const earned = new Map<string, { total: number; parts: string[] }>();
  for (const p of payouts) {
    if (!p.questId) continue;
    const e = earned.get(p.questId) ?? { total: 0, parts: [] };
    e.total += p.amount;
    e.parts.push(`${PAYOUT[p.reason] ?? p.reason} ${p.amount}`);
    earned.set(p.questId, e);
  }

  // Balance after each entry: start from the current balance and walk back through
  // the newer entries (the list is newest first).
  let running = u.renown;
  const record = ledger.map((e) => {
    const balanceAfter = running;
    running -= e.amount;
    return { ...e, balanceAfter };
  });

  // Usable items first, then ones that are already used up.
  const usable = owned.filter((o) => !o.usedAt);
  const used = owned.filter((o) => o.usedAt);

  return (
    <>
      <article className="panel">
        <h1>{u.displayName}</h1>
        <p>
          <strong>{u.renown} Renown</strong> · <Link href="/store">Visit the Renown Store</Link>
        </p>
      </article>

      <article className="panel">
        <h2>Upcoming Quests ({upcoming.length})</h2>
        {upcoming.length === 0 && (
          <p>
            You&apos;re not signed up for any quests. <Link href="/">Browse the Quest Board</Link>.
          </p>
        )}
        {upcoming.map((su) => (
          <div className="row" key={su.id}>
            <span>
              <Link href={`/quest/${su.questId}`}>
                <strong>{su.quest.title}</strong>
              </Link>
              {" "}· Level {su.quest.level} · {su.className}
              <br />
              <small>{fmt(su.quest.oneShotDate)}</small>
            </span>
            <span>{su.quest.status === "postponed" ? "Postponed" : `${su.quest.renownReward} Renown reward`}</span>
          </div>
        ))}
      </article>

      <article className="panel">
        <h2>Completed Quests ({completed.length})</h2>
        {completed.length === 0 && <p>You haven&apos;t completed any quests yet.</p>}
        {completed.map((su) => {
          const e = earned.get(su.questId);
          return (
            <div className="row" key={su.id}>
              <span>
                <Link href={`/quest/${su.questId}`}>
                  <strong>{su.quest.title}</strong>
                </Link>
                {" "}· Level {su.quest.level} · {su.className}
                <br />
                <small>
                  {fmt(su.quest.oneShotDate)}
                  {e && e.parts.length > 1 ? ` · ${e.parts.join(" + ")}` : ""}
                </small>
              </span>
              <strong style={{ color: "#2f6b2f" }}>+{e?.total ?? 0} Renown</strong>
            </div>
          );
        })}
      </article>

      <article className="panel">
        <h2>My Items ({usable.length})</h2>
        {usable.length === 0 && <p>You don&apos;t own any unused items. Visit the store to spend your Renown.</p>}
        {usable.map((o) => (
          <div className="row" key={o.id}>
            <span>
              <strong>{o.name}</strong> · <span className="cap">{o.type}</span>
              <br />
              <small>Bought {fmt(o.purchasedAt)}</small>
            </span>
            {o.type === "consumable" ? (
              <ActionForm action={A.markItemUsed} className="inline">
                <input type="hidden" name="ownedId" value={o.id} />
                <ConfirmButton message={`Mark "${o.name}" as used? This can't be undone.`}>Mark as used</ConfirmButton>
              </ActionForm>
            ) : (
              <span>Owned</span>
            )}
          </div>
        ))}
      </article>

      {used.length > 0 && (
        <article className="panel">
          <h2>Used Items ({used.length})</h2>
          {used.map((o) => (
            <div className="row" key={o.id}>
              <span>
                <strong>{o.name}</strong> · <span className="cap">{o.type}</span>
                <br />
                <small>Bought {fmt(o.purchasedAt)}</small>
              </span>
              <span>Used {fmt(o.usedAt!)}</span>
            </div>
          ))}
        </article>
      )}

      <article className="panel">
        <h2>Renown Record</h2>
        {ledger.length === 0 && <p>No Renown activity yet.</p>}
        {record.map((e) => (
          <div className="row" key={e.id}>
            <span>
              <strong>{e.note || REASON[e.reason] || e.reason}</strong>
              <br />
              <small>
                {REASON[e.reason] ?? e.reason} · {fmt(e.createdAt)}
              </small>
            </span>
            <span style={{ textAlign: "right" }}>
              <strong style={{ color: e.amount < 0 ? "#8a1f1f" : "#2f6b2f" }}>
                {e.amount > 0 ? "+" : e.amount < 0 ? "−" : ""}
                {Math.abs(e.amount)} Renown
              </strong>
              <br />
              <small>{e.amount < 0 ? "Spent" : "Gained"} · Balance {e.balanceAfter}</small>
            </span>
          </div>
        ))}
        {ledger.length === HISTORY_LIMIT && <p><small>Showing your {HISTORY_LIMIT} most recent entries.</small></p>}
      </article>
    </>
  );
}