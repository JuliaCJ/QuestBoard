import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PRIORITY_WINDOW_DAYS, fmt } from "@/lib/util";
import * as A from "@/app/actions";

export default async function Admin() {
  await requireAdmin();
  const [quests, players, keys] = await Promise.all([
    db.quest.findMany({
      orderBy: { oneShotDate: "desc" },
      include: { _count: { select: { signups: { where: { status: "signed_up" } } } } },
    }),
    db.user.findMany({ where: { role: "player", isActive: true }, orderBy: { displayName: "asc" } }),
    db.priorityKey.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { redeemedBy: true } }),
  ]);
  const currentQuests = quests.filter(
  (q) => q.status === "active" || q.status === "postponed"
);

const pastQuests = quests.filter(
  (q) => q.status === "cancelled" || q.status === "completed"
);
  const now = new Date();

  return (
    <>
      <article className="panel">
        <h1>Admin</h1>

        <h2>Quests</h2>
    {currentQuests.length === 0 && <p>No active or deferred quests.</p>}

    {currentQuests.map((q) => (
      <div className="row" key={q.id}>
        <span>
          <Link href={`/admin/quest/${q.id}`}>
            <strong>{q.title}</strong>
          </Link>
          {" "}· {q.status}
          {q.manualLock ? " (locked)" : ""}
          {" "}· {fmt(q.oneShotDate)}
          {" "}· {q._count.signups}/{q.maxPlayers}
        </span>

        <span className="inline">
          {q.status === "active" && (
            <>
              <ActionForm action={A.setLock} className="inline">
                <input type="hidden" name="questId" value={q.id} />
                <input
                  type="hidden"
                  name="value"
                  value={q.manualLock ? "0" : "1"}
                />
                <button>{q.manualLock ? "Unlock" : "Lock"}</button>
              </ActionForm>

              <ActionForm action={A.deferQuest} className="inline">
                <input type="hidden" name="questId" value={q.id} />
                <button>Defer</button>
              </ActionForm>
            </>
          )}

          <ActionForm action={A.rescheduleQuest} className="inline">
            <input type="hidden" name="questId" value={q.id} />
            <input
              name="oneShot"
              type="datetime-local"
              aria-label="New one-shot date"
              defaultValue={q.oneShotDate.toISOString().slice(0, 16)}
              required
            />
            <button>Reschedule</button>
          </ActionForm>

          {q.status === "postponed" && (
            <ActionForm action={A.reactivateQuest} className="inline">
              <input type="hidden" name="questId" value={q.id} />
              <input
                type="hidden"
                name="oneShot"
                value={q.oneShotDate.toISOString().slice(0, 16)}
              />
              <input
                type="hidden"
                name="priority"
                value={q.prioritySignupAt.toISOString().slice(0, 16)}
              />
              <input
                type="hidden"
                name="general"
                value={q.generalSignupAt.toISOString().slice(0, 16)}
              />
              <input
                type="hidden"
                name="post"
                value={q.postAt.toISOString().slice(0, 16)}
              />
              <button>Reactivate</button>
            </ActionForm>
          )}

          <ActionForm action={A.cancelQuest} className="inline">
            <input type="hidden" name="questId" value={q.id} />
            <button>Delete permanently</button>
          </ActionForm>
        </span>
      </div>
    ))}
  </article>

  <article className="panel">
    <h2>Past Quests</h2>
    <p>Completed and cancelled quests are archived here.</p>

    {pastQuests.length === 0 && <p>No past quests yet.</p>}

    {pastQuests.map((q) => (
      <div className="row" key={q.id}>
        <span>
          <Link href={`/admin/quest/${q.id}`}>
            <strong>{q.title}</strong>
          </Link>
          {" "}· {q.status}
          {" "}· {fmt(q.oneShotDate)}
          {" "}· {q._count.signups}/{q.maxPlayers}
        </span>
      </div>
    ))}
  </article>

      <article className="panel">
        <h2>New Quest</h2>
        {(() => {
          const now = new Date();

          // Next noon; if it is already noon or later, use tomorrow.
          const priorityDate = new Date(now);
          priorityDate.setHours(12, 0, 0, 0);
          if (now >= priorityDate) {
            priorityDate.setDate(priorityDate.getDate() + 1);
          }

          const generalDate = new Date(priorityDate);
          generalDate.setDate(generalDate.getDate() + 5);

          // Default the quest date to one day after general sign-up opens.
          const oneShotDate = new Date(generalDate);
          oneShotDate.setDate(oneShotDate.getDate() + 1);

          // Format for datetime-local: YYYY-MM-DDTHH:mm
          const toLocalInput = (date: Date) => {
            const pad = (n: number) => String(n).padStart(2, "0");
            return (
              `${date.getFullYear()}-${pad(date.getMonth() + 1)}-` +
              `${pad(date.getDate())}T${pad(date.getHours())}:` +
              `${pad(date.getMinutes())}`
            );
          };

          return (
            <ActionForm action={A.createQuest} className="stack">
              <label>
                Title
                <input name="title" required />
              </label>

              <label>
                Description
                <textarea name="description" rows={3} />
              </label>

              <div className="grid2">
                <label>
                  Level
                  <input
                    name="level"
                    type="number"
                    min={1}
                    defaultValue={1}
                  />
                </label>

                <label>
                  Renown reward
                  <input
                    name="renown"
                    type="number"
                    min={0}
                    defaultValue={0}
                  />
                </label>

                <label>
                  Min players
                  <input
                    name="min"
                    type="number"
                    min={1}
                    defaultValue={3}
                  />
                </label>

                <label>
                  Max players
                  <input
                    name="max"
                    type="number"
                    min={1}
                    defaultValue={6}
                  />
                </label>
              </div>

              <div className="grid2">
                <label>
                  Priority sign-up opens
                  <input
                    name="priority"
                    type="datetime-local"
                    required
                    defaultValue={toLocalInput(priorityDate)}
                  />
                </label>

                <label>
                  General sign-up opens
                  <input
                    name="general"
                    type="datetime-local"
                    required
                    defaultValue={toLocalInput(generalDate)}
                  />
                </label>

                <label>
                  One-shot date
                  <input
                    name="oneShot"
                    type="datetime-local"
                    required
                    defaultValue={toLocalInput(oneShotDate)}
                  />
                </label>

                <label>
                  Post at
                  <input
                    name="post"
                    type="datetime-local"
                    defaultValue={toLocalInput(priorityDate)}
                  />
                </label>
              </div>

              <button>Create Quest</button>
            </ActionForm>
          );
        })()}
      </article>

      <article className="panel">
        <h2>Players</h2>
        {players.length === 0 && <p>No players yet.</p>}
        {players.map((p) => {
          const priority = p.hasPriority || (!!p.priorityUntil && p.priorityUntil > now);
          return (
            <div className="stack" key={p.id} style={{ borderTop: "1px solid #0002", paddingTop: ".6rem", marginTop: ".6rem" }}>
              <div className="row" style={{ border: 0, padding: 0 }}>
                <span>
                  <strong>{p.displayName}</strong> ({p.username}) · {p.renown} Renown
                  {priority ? " · priority" : ""}{p.priorityUntil && !p.hasPriority ? ` until ${fmt(p.priorityUntil)}` : ""}
                </span>
                <span className="inline">
                  <ActionForm action={A.setPriority} className="inline">
                    <input type="hidden" name="userId" value={p.id} />
                    <input type="hidden" name="value" value={p.hasPriority ? "0" : "1"} />
                    <button>{p.hasPriority ? "Remove priority" : "Grant priority"}</button>
                  </ActionForm>
                  <ActionForm action={A.deactivate} className="inline">
                    <input type="hidden" name="userId" value={p.id} />
                    <button>Remove player</button>
                  </ActionForm>
                </span>
              </div>
              <ActionForm action={A.adjustRenown} className="inline">
                <input type="hidden" name="userId" value={p.id} />
                <input name="amount" type="number" placeholder="Renown (+/-)" />
                <input name="note" placeholder="Note" />
                <button>Adjust Renown</button>
              </ActionForm>
              <ActionForm action={A.resetPassword} className="inline">
                <input type="hidden" name="userId" value={p.id} />
                <input name="password" type="text" placeholder="New password" autoComplete="off" />
                <button>Reset password</button>
              </ActionForm>
            </div>
          );
        })}
      </article>

      <article className="panel">
  <h2>Add Player</h2>
  <ActionForm action={A.createPlayer} className="stack">
    <label>Display Name<input name="displayName" required /></label>
    <label>Username<input name="username" required autoComplete="off" /></label>
    <label>Password<input name="password" type="text" required minLength={1} autoComplete="off" /></label>
    
    {/* Fixed class to className, and removed required so the form can submit unchecked */}
    <label className="checkbox-label">
      Priority
      <input name="priority" type="checkbox" autoComplete="off" className="small-checkbox" />
    </label>

    <button>Create Player</button>
  </ActionForm>
</article>


      <article className="panel">
        <h2>Priority keys</h2>
        <ActionForm action={A.createKey} className="inline">
          <input name="code" placeholder="Key code" autoComplete="off" required />
          <input name="days" type="number" min={1} defaultValue={5} aria-label="Days valid" />
          <button>Create key</button>
        </ActionForm>
        {keys.map((k) => (
          <div className="row" key={k.id}>
            <span><strong>{k.code}</strong></span>
            <span>
              {k.redeemedBy
                ? `redeemed by ${k.redeemedBy.displayName}`
                : k.expiresAt < now ? "expired" : `valid until ${fmt(k.expiresAt)}`}
            </span>
          </div>
        ))}
      </article>
    </>
  );
}
