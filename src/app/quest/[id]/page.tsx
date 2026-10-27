import { notFound } from "next/navigation";
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import * as A from "@/app/actions";
import SignupDates from "@/components/SignupDates";
import { CLASSES, PRIORITY_WINDOW_DAYS, TZ, doorState, fmt } from "@/lib/util";

// Formats a date for <input type="datetime-local"> in the SITE time zone,
// which is what zonedToUtc() in the update action expects.
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
        where: isAdmin ? {} : { status: { in: ["signed_up", "completed"] } },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!q) notFound();

  const isPast = q.status === "completed" || q.status === "cancelled";

  // Deferred and past quests are available in the portal to admins only.
  if (!isAdmin && (q.status !== "active" || q.postAt > now)) {
    notFound();
  }

  const signedUpCount = q.signups.filter((s) => s.status === "signed_up").length;
  const roster = q.signups.filter((s) => s.status === "signed_up");

  const hp = u.hasPriority || (!!u.priorityUntil && u.priorityUntil > now);
  const st = doorState(q, signedUpCount, hp, now);

  const mine = q.signups.find((s) => s.userId === u.id && s.status === "signed_up");

  const canJoin =
    !isAdmin && q.status === "active" && (st === "open" || st === "priority");

  // Only admins managing a live quest need the player list.
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

  // Remounts the edit form whenever saved values change, so the fields and the
  // "Cancel changes" reset always return to what is currently saved.
  const formKey = [
    q.title,
    q.description,
    q.level,
    q.renownReward,
    q.minPlayers,
    q.maxPlayers,
    q.oneShotDate.getTime(),
    q.prioritySignupAt.getTime(),
    q.generalSignupAt.getTime(),
    q.postAt.getTime(),
  ].join("|");

  return (
    <>
      <article className="panel">
        <Link href="/quest">← Back to Quest Portal</Link>

        {/* ---------- Admin: live quest, directly editable ---------- */}
        {isAdmin && !isPast && (
          <>
            <h1>Quest Details</h1>

            <p>
              <strong>Status:</strong>{" "}
<span style={{ textTransform: "capitalize" }}>{q.status}</span>
              {q.manualLock ? " (locked)" : ""}
              {" "}· <strong>Signed Up:</strong> {signedUpCount}/{q.maxPlayers}
            </p>

            {q.postAt > now && (
              <ActionForm action={A.postNow} className="inline">
                <input type="hidden" name="questId" value={q.id} />
                <span>Scheduled to post {fmt(q.postAt)}.</span>
                <button>Post now</button>
              </ActionForm>
            )}

            <ActionForm key={formKey} action={A.updateQuest} className="stack">
              <input type="hidden" name="questId" value={q.id} />

              <label>
                Title
                <input name="title" defaultValue={q.title} required />
              </label>

              <label>
                Description
                <textarea name="description" rows={4} defaultValue={q.description} />
              </label>

              <div className="grid2">
                <label>
                  Level
                  <input name="level" type="number" min={1} defaultValue={q.level} required />
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
                    defaultValue={toSiteInput(q.oneShotDate)}
                    required
                  />
                </label>

                <SignupDates
                priority={toSiteInput(q.prioritySignupAt)}
                general={toSiteInput(q.generalSignupAt)}
                days={PRIORITY_WINDOW_DAYS}
/>

                <label>
                  Post At
                  <input
                    name="post"
                    type="datetime-local"
                    defaultValue={toSiteInput(q.postAt)}
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

        {/* ---------- Everyone else: read-only details ---------- */}
        {(!isAdmin || isPast) && (
          <>
            <h1>{q.title}</h1>

            <p>
              <strong>Status:</strong>{" "}
<span style={{ textTransform: "capitalize" }}>{q.status}</span>
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
              <strong>Posted:</strong> {fmt(q.postAt)}
            </p>

            <p>
              <strong>Priority Sign-Up Opens:</strong> {fmt(q.prioritySignupAt)}
            </p>

            <p>
              <strong>General Sign-Up Opens:</strong> {fmt(q.generalSignupAt)}
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
                  This quest is archived. Its details and player history are
                  read-only.
                </p>
              </>
            )}
          </>
        )}
      </article>

      <article className="panel">
        <h2>
          {isPast || isAdmin ? "Player History" : "Party"} ({signedUpCount} of{" "}
          {q.maxPlayers} Signed Up)
        </h2>

        {q.signups.length === 0 ? (
          <p>No player records for this quest.</p>
        ) : (
          <ul>
            {q.signups.map((s) => (
              <li key={s.id}>
                {s.user.displayName}, {s.className}
                {isAdmin || isPast ? ` — ${s.status}` : ""}
              </li>
            ))}
          </ul>
        )}

        {/* ---------- Player sign-up controls ---------- */}
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
                  <button>Change class</button>
                </ActionForm>

                <ActionForm action={A.withdraw} className="stack">
                  <input type="hidden" name="questId" value={q.id} />
                  <button>Withdraw</button>
                </ActionForm>
              </>
            ) : canJoin ? (
              <ActionForm action={A.signUp} className="stack">
                <input type="hidden" name="questId" value={q.id} />
                {picker}
                <button>Sign up</button>
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

      {/* ---------- Admin: complete quest ---------- */}
      {isAdmin && !isPast && q.status === "active" && (
        <article className="panel">
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

            <button>Complete and Pay Out Renown</button>
          </ActionForm>
        </article>
      )}

      {/* ---------- Admin: roster management ---------- */}
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
                <strong>{s.user.displayName}</strong>, {s.className}
              </span>
              <input type="hidden" name="signupId" value={s.id} />
              <button>Remove</button>
            </ActionForm>
          ))}

          <h3> Add a Player</h3>
            <ActionForm action={A.addToQuest} className="inline">
              <input type="hidden" name="questId" value={q.id} />

              <select name="userId" aria-label="Player" required>
                {availablePlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>

              <select name="className" aria-label="Class">
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <button>Add</button>
            </ActionForm>
        </article>
      )}
    </>
  );
}