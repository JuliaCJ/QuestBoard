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

  const draftQuests = quests.filter((q) => q.status === "draft");

  const currentQuests = quests.filter(
    (q) => q.status === "active" || q.status === "postponed"
  );

  const pastQuests = quests.filter(
    (q) => q.status === "cancelled" || q.status === "completed"
  );

  // General sign-ups default to noon, five days from today.
  const generalDate = new Date(now);
  generalDate.setDate(generalDate.getDate() + 5);
  generalDate.setHours(12, 0, 0, 0);

  // Default the one-shot date to one day after general sign-ups open.
  const oneShotDate = new Date(generalDate);
  oneShotDate.setDate(oneShotDate.getDate() + 1);

  return (
    <>
      <article className="panel">
        <h1>Quest Portal</h1>
        <p>Browse quests, manage schedules, and review past adventures.</p>
      </article>

      <article className="panel">
        <h2>Quests</h2>

        {currentQuests.length === 0 && (
          <p>No active or deferred quests.</p>
        )}

        {currentQuests.map((q) => (
          <div className="row" key={q.id}>
            <span>
              <Link href={`/quest/${q.id}`}>
                <strong>{q.title}</strong>
              </Link>
              {" "}· <span className="cap">{q.status}</span>
              {q.manualLock ? " (locked)" : ""}
              {" "}· {fmt(q.oneShotDate)}
              {" "}· {q._count.signups}/{q.maxPlayers}
              {q.postAt > now ? ` · posts ${fmt(q.postAt)}` : ""}
            </span>

            {isAdmin && (
              <span className="inline">
                <ActionForm action={A.postNow} className="inline">
                  <input type="hidden" name="questId" value={q.id} />
                  <button type="submit">Post Now</button>
                </ActionForm>

                <ActionForm action={A.setLock} className="inline">
                  <input type="hidden" name="questId" value={q.id} />
                  <input
                    type="hidden"
                    name="value"
                    value={q.manualLock ? "0" : "1"}
                  />
                  <button type="submit">
                    {q.manualLock ? "Unlock" : "Lock"}
                  </button>
                </ActionForm>

                {q.status === "active" && (
                  <ActionForm action={A.deferQuest} className="inline">
                    <input type="hidden" name="questId" value={q.id} />
                    <button type="submit">Defer</button>
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
                  <button type="submit">Reschedule</button>
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
                    <button type="submit">Reactivate</button>
                  </ActionForm>
                )}

                <ActionForm action={A.cancelQuest} className="inline">
                  <input type="hidden" name="questId" value={q.id} />
                  <button type="submit">Delete Permanently</button>
                </ActionForm>
              </span>
            )}
          </div>
        ))}
      </article>

      {isAdmin && (
        <article className="panel">
          <h2>Draft Quests</h2>
          <p>
            Drafts are visible only to administrators. Use Post Now to
            publish a draft and start priority sign-ups immediately.
          </p>

          {draftQuests.length === 0 && <p>No saved drafts.</p>}

          {draftQuests.map((q) => (
            <div className="row" key={q.id}>
              <span>
                <Link href={`/quest/${q.id}`}>
                  <strong>{q.title}</strong>
                </Link>
                {" "}· Draft
                {" "}· {fmt(q.oneShotDate)}
              </span>

              <span className="inline">
                <ActionForm action={A.postNow} className="inline">
                  <input type="hidden" name="questId" value={q.id} />
                  <button type="submit">Post Now</button>
                </ActionForm>

                <ActionForm action={A.cancelQuest} className="inline">
                  <input type="hidden" name="questId" value={q.id} />
                  <button type="submit">Delete Permanently</button>
                </ActionForm>
              </span>
            </div>
          ))}
        </article>
      )}

      {isAdmin && (
        <article className="panel">
          <h2>Past Quests</h2>
          <p>
            Completed quests are archived here.
            Open a quest to review its details and player history.
          </p>

          {pastQuests.length === 0 && <p>No past quests yet.</p>}

          {pastQuests.map((q) => (
            <div className="row" key={q.id}>
              <span>
                <Link href={`/quest/${q.id}`}>
                  <strong>{q.title}</strong>
                </Link>
                {" "}· <span className="cap">{q.status}</span>
                {" "}· {fmt(q.oneShotDate)}
                {" "}· {q._count.signups}/{q.maxPlayers}
              </span>

              <span className="inline">
                <ActionForm
                  action={A.deletePastQuest}
                  className="inline"
                >
                  <input type="hidden" name="questId" value={q.id} />
                  <button type="submit">Delete Permanently</button>
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
                  required
                />
              </label>

              <label>
                Renown Reward
                <input
                  name="renown"
                  type="number"
                  min={0}
                  defaultValue={0}
                  required
                />
              </label>

              <label>
                Min Players
                <input
                  name="min"
                  type="number"
                  min={1}
                  defaultValue={3}
                  required
                />
              </label>

              <label>
                Max Players
                <input
                  name="max"
                  type="number"
                  min={1}
                  defaultValue={6}
                  required
                />
              </label>
            </div>

            <div className="grid2">
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
            </div>

            <p>
              <strong>Save Draft:</strong> Save without publishing the quest.
              <br />
              <strong>Post Now:</strong> Publish immediately and begin
              priority sign-ups immediately. General sign-ups remain
              scheduled for the date above.
            </p>

            <div className="inline">
              <button type="submit" name="intent" value="draft">
                Save Draft
              </button>

              <button type="submit" name="intent" value="postNow">
                Post Now
              </button>
            </div>
          </ActionForm>
        </article>
      )}
    </>
  );
}