
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt } from "@/lib/util";
import * as A from "@/app/actions";

function toLocalInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export default async function QuestPortal() {
  const u = await requireUser();
  const isAdmin = u.role === "admin";
  const now = new Date();

  const quests = await db.quest.findMany({
    where: isAdmin
      ? {}
      : { status: "active", postAt: { lte: now } },
    orderBy: { oneShotDate: "desc" },
    include: {
      _count: {
        select: {
          signups: {
            where: { status: "signed_up" },
          },
        },
      },
    },
  });

  const currentQuests = quests.filter(
    (q) => q.status === "active" || q.status === "postponed"
  );

  const pastQuests = quests.filter(
    (q) => q.status === "cancelled" || q.status === "completed"
  );

  // Default priority and post dates to the next noon.
  const priorityDate = new Date(now);
  priorityDate.setHours(12, 0, 0, 0);

  if (now >= priorityDate) {
    priorityDate.setDate(priorityDate.getDate() + 1);
  }

  // General sign-ups open five days after priority sign-ups.
  const generalDate = new Date(priorityDate);
  generalDate.setDate(generalDate.getDate() + 5);

  // Default the one-shot to one day after general sign-ups open.
  const oneShotDate = new Date(generalDate);
  oneShotDate.setDate(oneShotDate.getDate() + 1);

  return (
    <>
      <article className="panel">
        <h1>Quest Portal</h1>
        <p>Browse quests, manage schedules, and review past adventures.</p>

        {isAdmin && (
          <p>
            <Link href="/admin">Back to Admin</Link>
          </p>
        )}
      </article>

      <article className="panel">
        <h2>Quests</h2>

        {currentQuests.length === 0 && (
          <p>No active or deferred quests.</p>
        )}

        {currentQuests.map((q) => (
          <div className="row" key={q.id}>
            <span>
              <Link href={`/quests/${q.id}`}>
                <strong>{q.title}</strong>
              </Link>
              {" "}· {q.status}
              {q.manualLock ? " (locked)" : ""}
              {" "}· {fmt(q.oneShotDate)}
              {" "}· {q._count.signups}/{q.maxPlayers}
            </span>

            {isAdmin && (
              <span className="inline">
                <ActionForm action={A.setLock} className="inline">
                  <input type="hidden" name="questId" value={q.id} />
                  <input
                    type="hidden"
                    name="value"
                    value={q.manualLock ? "0" : "1"}
                  />
                  <button>
                    {q.manualLock ? "Unlock" : "Lock"}
                  </button>
                </ActionForm>

                {q.status === "active" && (
                  <ActionForm action={A.deferQuest} className="inline">
                    <input type="hidden" name="questId" value={q.id} />
                    <button>Defer</button>
                  </ActionForm>
                )}

                <ActionForm
                  action={A.rescheduleQuest}
                  className="inline"
                >
                  <input type="hidden" name="questId" value={q.id} />
                  <input
                    name="oneShot"
                    type="datetime-local"
                    aria-label="New one-shot date"
                    defaultValue={toLocalInput(q.oneShotDate)}
                    required
                  />
                  <button>Reschedule</button>
                </ActionForm>

                {q.status === "postponed" && (
                  <ActionForm
                    action={A.reactivateQuest}
                    className="inline"
                  >
                    <input type="hidden" name="questId" value={q.id} />
                    <input
                      type="hidden"
                      name="oneShot"
                      value={toLocalInput(q.oneShotDate)}
                    />
                    <input
                      type="hidden"
                      name="priority"
                      value={toLocalInput(q.prioritySignupAt)}
                    />
                    <input
                      type="hidden"
                      name="general"
                      value={toLocalInput(q.generalSignupAt)}
                    />
                    <input
                      type="hidden"
                      name="post"
                      value={toLocalInput(q.postAt)}
                    />
                    <button>Reactivate</button>
                  </ActionForm>
                )}

                <ActionForm action={A.cancelQuest} className="inline">
                  <input type="hidden" name="questId" value={q.id} />
                  <button>Delete Permanently</button>
                </ActionForm>
              </span>
            )}
          </div>
        ))}
      </article>

      {isAdmin && (
        <article className="panel">
          <h2>Past Quests</h2>
          <p>
            Completed and cancelled quests are archived here.
            Open a quest to review its details and player history.
          </p>

          {pastQuests.length === 0 && <p>No past quests yet.</p>}

          {pastQuests.map((q) => (
            <div className="row" key={q.id}>
              <span>
                <Link href={`/quests/${q.id}`}>
                  <strong>{q.title}</strong>
                </Link>
                {" "}· {q.status}
                {" "}· {fmt(q.oneShotDate)}
                {" "}· {q._count.signups}/{q.maxPlayers}
              </span>

              <span className="inline">
                <ActionForm
                  action={A.deletePastQuest}
                  className="inline"
                >
                  <input type="hidden" name="questId" value={q.id} />
                  <button>Delete Permanently</button>
                </ActionForm>
              </span>
            </div>
          ))}
        </article>
      )}

      {isAdmin && (
        <article className="panel">
          <h2>New Quest</h2>

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
                Renown Reward
                <input
                  name="renown"
                  type="number"
                  min={0}
                  defaultValue={0}
                />
              </label>

              <label>
                Min Players
                <input
                  name="min"
                  type="number"
                  min={1}
                  defaultValue={3}
                />
              </label>

              <label>
                Max Players
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
                Priority Sign-Up Opens
                <input
                  name="priority"
                  type="datetime-local"
                  required
                  defaultValue={toLocalInput(priorityDate)}
                />
              </label>

              <label>
                General Sign-Up Opens
                <input
                  name="general"
                  type="datetime-local"
                  required
                  defaultValue={toLocalInput(generalDate)}
                />
              </label>

              <label>
                One-Shot Date
                <input
                  name="oneShot"
                  type="datetime-local"
                  required
                  defaultValue={toLocalInput(oneShotDate)}
                />
              </label>

              <label>
                Post At
                <input
                  name="post"
                  type="datetime-local"
                  required
                  defaultValue={toLocalInput(priorityDate)}
                />
              </label>
            </div>

            <button>Create Quest</button>
          </ActionForm>
        </article>
      )}
    </>
  );
}
