
import Link from "next/link";
import { redirect } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt } from "@/lib/util";
import * as A from "@/app/actions";

const HISTORY_LIMIT = 200;

const REASON: Record<string, string> = {
  quest: "Quest Completed",
  bonus: "Bonus Renown",
  achievement: "Achievement Reward",
  admin_adjust: "Admin Adjustment",
  purchase: "Store Purchase",
  store_purchase: "Store Purchase",
};

export default async function Account() {
  const u = await requireUser();
  if (u.role === "admin") redirect("/admin");

  const [owned, ledger, signups] = await Promise.all([
    db.ownedItem.findMany({
      where: { userId: u.id },
      orderBy: { purchasedAt: "desc" },
    }),
    db.ledger.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    }),
    db.signup.findMany({
      where: {
        userId: u.id,
        status: { in: ["signed_up", "completed"] },
      },
      include: { quest: true },
    }),
  ]);

  const upcoming = signups
    .filter(
      (su) =>
        su.status === "signed_up" &&
        ["active", "postponed"].includes(su.quest.status)
    )
    .sort(
      (a, b) =>
        a.quest.oneShotDate.getTime() - b.quest.oneShotDate.getTime()
    );

  const completed = signups
    .filter((su) => su.status === "completed")
    .sort(
      (a, b) =>
        b.quest.oneShotDate.getTime() - a.quest.oneShotDate.getTime()
    );

  // Calculate the base reward for each completed quest.
  // Ledger entries cannot be linked to individual quests because
  // the current Ledger model does not contain a questId field.
  const earned = new Map<string, number>();

  for (const su of completed) {
    earned.set(su.questId, su.quest.renownReward);
  }

  // Balance after each entry: start from current balance and walk
  // backward through the newer entries.
  let running = u.renown;

  const record = ledger.map((e) => {
    const balanceAfter = running;
    running -= e.amount;
    return { ...e, balanceAfter };
  });

  const usable = owned.filter((o) => !o.usedAt);
  const used = owned.filter((o) => o.usedAt);

  return (
    <>
      <article className="panel">
        <h1>{u.displayName}</h1>
        <p>
          <strong>{u.renown} Renown</strong> ·{" "}
          <Link href="/store">Visit the Renown Store</Link>
        </p>
      </article>

      <article className="panel">
        <h2>Upcoming Quests ({upcoming.length})</h2>
        {upcoming.length === 0 && (
          <p>
            You&apos;re not signed up for any quests.{" "}
            <Link href="/">Browse the QuestBoard</Link>.
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
            <span>
              {su.quest.status === "postponed"
                ? "Postponed"
                : `${su.quest.renownReward} Renown Reward`}
            </span>
          </div>
        ))}
      </article>

      <article className="panel">
        <h2>Completed Quests ({completed.length})</h2>

        {completed.length === 0 && (
          <p>You haven&apos;t completed any quests yet.</p>
        )}

        {completed.map((su) => (
          <div className="row" key={su.id}>
            <span>
              <Link href={`/quest/${su.questId}`}>
                <strong>{su.quest.title}</strong>
              </Link>
              {" "}· Level {su.quest.level} · {su.className}
              <br />
              <small>{fmt(su.quest.oneShotDate)}</small>
            </span>
            <strong style={{ color: "#2f6b2f" }}>
              +{earned.get(su.questId) ?? 0} Renown
            </strong>
          </div>
        ))}
      </article>

      <article className="panel">
        <h2>My Items ({usable.length})</h2>

        {usable.length === 0 && (
          <p>
            You don&apos;t own any unused items. Visit the store to spend
            your Renown.
          </p>
        )}

        {usable.map((o) => (
          <div className="row" key={o.id}>
            <span>
              <strong>{o.name}</strong> ·{" "}
              <span className="cap">{o.type}</span>
              <br />
              <small>Bought {fmt(o.purchasedAt)}</small>
            </span>

            {o.type === "consumable" ? (
              <ActionForm action={A.markItemUsed} className="inline">
                <input type="hidden" name="ownedId" value={o.id} />
                <ConfirmButton
                  message={`Mark "${o.name}" as used? This can't be undone.`}
                >
                  Mark as used
                </ConfirmButton>
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
                <strong>{o.name}</strong> ·{" "}
                <span className="cap">{o.type}</span>
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
              <strong
                style={{
                  color: e.amount < 0 ? "#8a1f1f" : "#2f6b2f",
                }}
              >
                {e.amount > 0 ? "+" : e.amount < 0 ? "−" : ""}
                {Math.abs(e.amount)} Renown
              </strong>
              <br />
              <small>
                {e.amount < 0 ? "Spent" : "Gained"} · Balance{" "}
                {e.balanceAfter}
              </small>
            </span>
          </div>
        ))}

        {ledger.length === HISTORY_LIMIT && (
          <p>
            <small>
              Showing your {HISTORY_LIMIT} most recent entries.
            </small>
          </p>
        )}
      </article>
    </>
  );
}
