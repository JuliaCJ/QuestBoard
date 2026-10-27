
import { notFound } from "next/navigation";
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import * as A from "@/app/actions";
import { CLASSES, TZ, doorState, fmt, priorityUnlocked } from "@/lib/util";

function toSiteInput(date: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value])
  );

  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export default async function QuestPortalDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const u = await requireUser();
  const now = new Date();
  const isAdmin = u.role === "admin";

  const q = await db.quest.findUnique({
    where: { id },
    include: {
      signups: {
        where: isAdmin
          ? {}
          : { status: { in: ["Signed Up", "Completed", "No Show"] } },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!q) notFound();

  const isPast = q.status === "completed" || q.status === "cancelled";
  const isDraft = q.status === "draft";

  if (!isAdmin) {
    if (q.status === "completed") {
      const participated = q.signups.some(
        (signup) =>
          signup.userId === u.id &&
          ["completed", "no_show"].includes(signup.status)
      );

      if (!participated) notFound();
    } else if (q.status !== "active" || q.postAt > now) {
      notFound();
    }
  }

  const signedUpCount = q.signups.filter(
    (s) => s.status === "signed_up"
  ).length;

  const roster = q.signups.filter(
    (s) => s.status === "signed_up"
  );

  const historyCount = q.signups.filter(
    (s) => ["completed", "no_show"].includes(s.status)
  ).length;

  const displayCount = isPast ? historyCount : signedUpCount;

  const hp =
    u.hasPriority ||
    (!!u.priorityUntil && u.priorityUntil > now);

  const rawSt = doorState(q, signedUpCount, hp, now);
  const unlocked = priorityUnlocked(q, rawSt, signedUpCount, hp);
  const st = unlocked ? "priority" : rawSt;

  const mine = q.signups.find(
    (s) => s.userId === u.id && s.status === "signed_up"
  );

  const canJoin =
    !isAdmin &&
    q.status === "active" &&
    (st === "open" || st === "priority");

  const players =
    isAdmin && !isPast
      ? await db.user.findMany({
          where: { role: "player", isActive: true },
          orderBy: { displayName: "asc" },
        })
      : [];

  const rostered = new Set(roster.map((s) => s.userId));
  const availablePlayers = players.filter((p) => !rostered.has(p.id));

  const picker = (
    <label>
      Class
      <select name="className" defaultValue={mine?.className ?? "Undecided"}>
        {CLASSES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );

  const formKey = [
    q.title,
    q.description,
    q.level,
    q.renownReward,
    q.minPlayers,
    q.maxPlayers,
    q.oneShotDate.getTime(),
    q.generalSignupAt.getTime(),
    q.status,
  ].join("|");

  return (
    <>
      <article className="panel">
        {isAdmin ? (
          <Link href="/quest">← Back to Quest Portal</Link>
        ) : (
          <Link href="/">← Back to QuestBoard</Link>
        )}

        {isAdmin && !isPast && (
          <>
            <h1>Quest Details</h1>

            <p>
              <strong>Status:</strong>{" "}
              <span style={{ textTransform: "capitalize" }}>
                {q.status}
              </span>
              {q.manualLock ? " (locked)" : ""}
              {" "}· <strong>Signed Up:</strong>{" "}
              {signedUpCount}/{q.maxPlayers}
            </p>

            {(isDraft || q.postAt > now || q.status === "postponed") && (
              <ActionForm action={A.postNow} className="inline">
                <input type="hidden" name="questId" value={q.id} />
                {isDraft ? (
                  <span>
                    This quest is a draft and is not visible to players.
                  </span>
                ) : q.postAt > now ? (
                  <span>Scheduled to post {fmt(q.postAt)}.</span>
                ) : (
                  <span>
                    Publish this quest and reopen priority access.
                  </span>
                )}
                <button type="submit">Post now</button>
              </ActionForm>
            )}

            <ActionForm
              key={formKey}
              action={A.updateQuest}
              className="stack"
            >
              <input type="hidden" name="questId" value={q.id} />

              <label>
                Title
                <input name="title" defaultValue={q.title} required />
              </label>

              <label>
                Description
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={q.description}
                />
              </label>

              {/* Match the three-column layout on the Quest Portal. */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "5rem",
                  alignItems: "end",
                }}
              >
                <label>
                  Level
                  <input
                    name="level"
                    type="number"
                    min={1}
                    defaultValue={q.level}
                    required
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </label>

                <label>
                  Renown Reward
                  <input
                    name="renown"
                    type="number"
                    min={0}
                    defaultValue={q.renownReward}
                    required
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </label>

                <div>
                  <label
                    style={{
                      display: "block",
                      textAlign: "center",
                      marginBottom: "0.4rem",
                    }}
                  >
                    Total Players
                  </label>

                  <div
                    style={{
                      display: "flex",
                      gap: "0.4rem",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <input
                      name="min"
                      type="number"
                      min={1}
                      defaultValue={q.minPlayers}
                      required
                      aria-label="Minimum players"
                      style={{
                        width: "3.5rem",
                        textAlign: "center",
                        boxSizing: "border-box",
                      }}
                    />

                    <span>–</span>

                    <input
                      name="max"
                      type="number"
                      min={1}
                      defaultValue={q.maxPlayers}
                      required
                      aria-label="Maximum players"
                      style={{
                        width: "3.5rem",
                        textAlign: "center",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid2">
                <label>
                  General Sign-Up Opens
                  <input
                    name="general"
                    type="datetime-local"
                    defaultValue={toSiteInput(q.generalSignupAt)}
                    required
                  />
                </label>

                <label>
                  One-Shot Date
                  <input
                    name="oneShot"
                    type="datetime-local"
                    defaultValue={toSiteInput(q.oneShotDate)}
                    required
                  />
                </label>
              </div>

              <p>
                <strong>Created:</strong> {fmt(q.createdAt)}
              </p>

              <div className="inline">
                <button type="submit">Update Quest</button>
                <button type="reset">Cancel changes</button>
              </div>
            </ActionForm>
          </>
        )}

        {(!isAdmin || isPast) && (
          <>
            <h1>{q.title}</h1>

            <p>
              <strong>Status:</strong>{" "}
              <span style={{ textTransform: "capitalize" }}>
                {q.status}
              </span>
              {q.manualLock ? " (locked)" : ""}
            </p>

            <p>
              <strong>Level:</strong> {q.level}
              {" "}· <strong>Reward:</strong> {q.renownReward} Renown
            </p>

            <p>
              <strong>One-shot date:</strong> {fmt(q.oneShotDate)}
            </p>

            <p>
              <strong>Player Limits:</strong> {q.minPlayers}–{q.maxPlayers}
            </p>

            <p>
              <strong>General Sign-Up Opens:</strong>{" "}
              {fmt(q.generalSignupAt)}
            </p>

            <h2>Description</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>
              {q.description || "No description provided."}
            </p>

            {isAdmin && (
              <>
                <p>
                  <strong>Created:</strong> {fmt(q.createdAt)}
                </p>
                <p>
                  This quest is archived. Its details and player history are read-only.
                </p>
              </>
            )}
          </>
        )}
      </article>

      <article className="panel">
        <h2>
          {isPast || isAdmin ? "Player History" : "Party"} (
          {displayCount} of {q.maxPlayers}{" "}
          {isPast ? "Participated" : "Signed Up"})
        </h2>

        {q.signups.length === 0 ? (
          <p>No player records for this quest.</p>
        ) : (
          <ul>
            {q.signups.map((s) => (
              <li key={s.id}>
                {s.user?.displayName ?? "Unknown or deleted player"}, {s.className}
                {isAdmin || isPast ? ` — ${s.status}` : ""}
              </li>
            ))}
          </ul>
        )}

        {!isAdmin && (
          <>
            {q.status === "completed" ? (
              <p className="note">This quest is complete.</p>
            ) : q.status === "postponed" ? (
              <p className="note">Postponed. Sign-ups are paused.</p>
            ) : mine ? (
              <>
                <ActionForm action={A.signUp} className="stack">
                  <input type="hidden" name="questId" value={q.id} />
                  {picker}
                  <button type="submit">Change class</button>
                </ActionForm>

                <ActionForm action={A.withdraw} className="stack">
                  <input type="hidden" name="questId" value={q.id} />
                  <button type="submit">Withdraw</button>
                </ActionForm>
              </>
            ) : canJoin ? (
              <ActionForm action={A.signUp} className="stack">
                <input type="hidden" name="questId" value={q.id} />
                {picker}
                <button type="submit">Sign up</button>
              </ActionForm>
            ) : (
              <p className="note">
                {st === "full"
                  ? "This quest is full."
                  : st === "priority"
                    ? "Priority sign-up is open."
                    : `Sign-ups open for everyone ${fmt(q.generalSignupAt)}.`}
              </p>
            )}
          </>
        )}
      </article>

      {isAdmin && !isPast && q.status === "active" && (
        <article className="panel">
          <ActionForm action={A.completeQuest} className="stack">
            <input type="hidden" name="questId" value={q.id} />

            <h2>Complete Quest</h2>

            {roster.length === 0 && <p>No one is signed up.</p>}

            {roster.map((s) => (
              <div className="row" key={s.id}>
                <span>
                  {s.user?.displayName ?? "Unknown or deleted player"}, {s.className}
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

            <button type="submit">Complete and Pay Out Renown</button>
          </ActionForm>
        </article>
      )}

      {isAdmin && !isPast && (
        <article className="panel">
          <h2>Roster Management</h2>

          <h3>
            Current Roster ({roster.length} of {q.maxPlayers})
          </h3>

          {roster.length === 0 && <p>No one is on the roster yet.</p>}

          {roster.map((s) => (
            <ActionForm key={s.id} action={A.removeFromQuest} className="row">
              <span>
                <strong>
                  {s.user?.displayName ?? "Unknown or deleted player"}
                </strong>
                , {s.className}
              </span>

              <input type="hidden" name="signupId" value={s.id} />
              <button type="submit">Remove</button>
            </ActionForm>
          ))}

          <h3>Add a Player</h3>

          <ActionForm action={A.addToQuest} className="inline">
            <input type="hidden" name="questId" value={q.id} />

            <select
              name="userId"
              aria-label="Player"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select a player
              </option>
              {availablePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>

            <select
              name="className"
              aria-label="Class"
              defaultValue="Undecided"
            >
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <button type="submit">Add</button>
          </ActionForm>
        </article>
      )}
    </>
  );
}
