
import { notFound } from "next/navigation";
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { CLASSES, fmt } from "@/lib/util";
import * as A from "@/app/actions";

function toLocalInput(date: Date | null) {
  if (!date) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export default async function AdminQuest({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  await requireAdmin();

  const q = await db.quest.findUnique({
    where: { id },
    include: {
      signups: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!q) notFound();

  const isPast = q.status === "completed" || q.status === "cancelled";
  const roster = q.signups.filter((s) => s.status === "signed_up");

  const players = isPast
    ? []
    : await db.user.findMany({
        where: { role: "player", isActive: true },
        orderBy: { displayName: "asc" },
      });

  return (
    <article className="panel">
      <Link href="/admin">← Back to admin</Link>

      <h1>{q.title}</h1>

      <p>
        <strong>Status:</strong> {q.status}
        {q.manualLock ? " (locked)" : ""}
      </p>

      <p>
        <strong>One-shot date:</strong> {fmt(q.oneShotDate)}
      </p>

      <p>
        <strong>Players signed up:</strong> {roster.length}/{q.maxPlayers}
      </p>

      <p>
        <strong>Renown reward:</strong> {q.renownReward} Renown
      </p>

      <h2>Quest Details</h2>

      <p>
        <strong>Description:</strong>
        <br />
        {q.description || "No description provided."}
      </p>

      <p>
        <strong>Level:</strong> {q.level}
      </p>

      <p>
        <strong>Player limit:</strong> {q.minPlayers}–{q.maxPlayers}
      </p>

      <p>
        <strong>Posted at:</strong> {fmt(q.postAt)}
      </p>

      <p>
        <strong>Priority sign-up opens:</strong>{" "}
        {fmt(q.prioritySignupAt)}
      </p>

      <p>
        <strong>General sign-up opens:</strong>{" "}
        {fmt(q.generalSignupAt)}
      </p>

      <p>
        <strong>Created:</strong> {fmt(q.createdAt)}
      </p>

      {isPast ? (
        <>
          <h2>Past Quest Archive</h2>
          <p>
            This quest is {q.status}. Its settings and roster cannot be
            changed from this page.
          </p>
        </>
      ) : (
        <>
          <h2>Edit Quest</h2>

          <ActionForm action={A.updateQuest} className="stack">
            <input type="hidden" name="questId" value={q.id} />

            <label>
              Title
              <input
                name="title"
                defaultValue={q.title}
                required
              />
            </label>

            <label>
              Description
              <textarea
                name="description"
                rows={3}
                defaultValue={q.description}
              />
            </label>

            <div className="grid2">
              <label>
                Level
                <input
                  name="level"
                  type="number"
                  min={1}
                  defaultValue={q.level}
                  required
                />
              </label>

              <label>
                Renown reward
                <input
                  name="renown"
                  type="number"
                  min={0}
                  defaultValue={q.renownReward}
                  required
                />
              </label>

              <label>
                Min players
                <input
                  name="min"
                  type="number"
                  min={1}
                  defaultValue={q.minPlayers}
                  required
                />
              </label>

              <label>
                Max players
                <input
                  name="max"
                  type="number"
                  min={1}
                  defaultValue={q.maxPlayers}
                  required
                />
              </label>
            </div>

            <div className="grid2">
              <label>
                One-shot date
                <input
                  name="oneShot"
                  type="datetime-local"
                  defaultValue={toLocalInput(q.oneShotDate)}
                  required
                />
              </label>

              <label>
                Priority sign-up opens
                <input
                  name="priority"
                  type="datetime-local"
                  defaultValue={toLocalInput(q.prioritySignupAt)}
                  required
                />
              </label>

              <label>
                General sign-up opens
                <input
                  name="general"
                  type="datetime-local"
                  defaultValue={toLocalInput(q.generalSignupAt)}
                  required
                />
              </label>

              <label>
                Post at
                <input
                  name="post"
                  type="datetime-local"
                  defaultValue={toLocalInput(q.postAt)}
                  required
                />
              </label>
            </div>

            <button>Update Quest</button>
          </ActionForm>
        </>
      )}

      <h2>Player History</h2>

      {q.signups.length === 0 ? (
        <p>No player records for this quest.</p>
      ) : (
        <div className="stack">
          {q.signups.map((s) => (
            <div className="row" key={s.id}>
              <span>
                <strong>{s.user.displayName}</strong>
                {" "}· {s.className}
                {" "}· {s.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {!isPast && q.status === "active" && (
        <ActionForm action={A.completeQuest} className="stack">
          <input type="hidden" name="questId" value={q.id} />

          <h2>Complete Quest</h2>

          {roster.length === 0 && <p>No one is signed up.</p>}

          {roster.map((s) => (
            <div className="row" key={s.id}>
              <span>
                {s.user.displayName}, {s.className}
              </span>

              <label className="inline">
                <input
                  type="checkbox"
                  name="noshow"
                  value={s.userId}
                  style={{ width: 24, minHeight: 24 }}
                />
                No-show
              </label>

              <input
                name={`bonus_${s.userId}`}
                type="number"
                min={0}
                placeholder="Bonus Renown"
                style={{ width: "9rem" }}
              />
            </div>
          ))}

          <button>Complete and pay out Renown</button>
        </ActionForm>
      )}

      {!isPast && (
        <>
          <h2>Roster Management</h2>

          {players.length === 0 ? (
            <p>No active players available.</p>
          ) : (
            <ActionForm action={A.addToQuest} className="inline">
              <input type="hidden" name="questId" value={q.id} />

              <select name="userId" required>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>

              <select name="className">
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <button>Add player</button>
            </ActionForm>
          )}

          {roster.map((s) => (
            <ActionForm
              key={s.id}
              action={A.removeFromQuest}
              className="row"
            >
              <span>{s.user.displayName}</span>
              <input
                type="hidden"
                name="signupId"
                value={s.id}
              />
              <button>Remove</button>
            </ActionForm>
          ))}
        </>
      )}
    </article>
  );
}
