
import { notFound } from "next/navigation";
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CLASSES, doorState, fmt } from "@/lib/util";
import { signUp, withdraw } from "@/app/actions";

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
          : { status: { in: ["signed_up", "completed"] } },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!q) notFound();

  const isPast =
    q.status === "completed" || q.status === "cancelled";

  // Deferred and past quests are available in the portal to admins only.
  if (
    !isAdmin &&
    (q.status !== "active" || q.postAt > now)
  ) {
    notFound();
  }

  const signedUpCount = q.signups.filter(
    (s) => s.status === "signed_up"
  ).length;

  const hp =
    u.hasPriority ||
    (!!u.priorityUntil && u.priorityUntil > now);

  const st = doorState(q, signedUpCount, hp, now);

  const mine = q.signups.find(
    (s) => s.userId === u.id && s.status === "signed_up"
  );

  const canJoin =
    !isAdmin &&
    q.status === "active" &&
    (st === "open" || st === "priority");

  const picker = (
    <label>
      Class
      <select
        name="className"
        defaultValue={mine?.className ?? "Undecided"}
      >
        {CLASSES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <article className="panel">
        <Link href="/quests">← Back to Quest Portal</Link>

        <h1>{q.title}</h1>

        <p>
          <strong>Status:</strong> {q.status}
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
          <strong>Player limits:</strong> {q.minPlayers}–{q.maxPlayers}
        </p>

        <p>
          <strong>Posted:</strong> {fmt(q.postAt)}
        </p>

        <p>
          <strong>Priority sign-up opens:</strong>{" "}
          {fmt(q.prioritySignupAt)}
        </p>

        <p>
          <strong>General sign-up opens:</strong>{" "}
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

            {!isPast && (
              <p>
                <Link href={`/admin/quest/${q.id}`}>
                  Edit and manage this quest
                </Link>
              </p>
            )}

            {isPast && (
              <p>
                This quest is archived. Its details and player history
                are read-only.
              </p>
            )}
          </>
        )}
      </article>

      <article className="panel">
        <h2>
          {isPast ? "Player History" : "Party"}
          {" "}({signedUpCount} of {q.maxPlayers} signed up)
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

        {!isAdmin && (
          <>
            {q.status === "completed" ? (
              <p className="note">This quest is complete.</p>
            ) : q.status === "postponed" ? (
              <p className="note">
                Postponed. Sign-ups are paused.
              </p>
            ) : mine ? (
              <>
                <ActionForm action={signUp} className="stack">
                  <input
                    type="hidden"
                    name="questId"
                    value={q.id}
                  />
                  {picker}
                  <button>Change class</button>
                </ActionForm>

                <ActionForm action={withdraw} className="stack">
                  <input
                    type="hidden"
                    name="questId"
                    value={q.id}
                  />
                  <button>Withdraw</button>
                </ActionForm>
              </>
            ) : canJoin ? (
              <ActionForm action={signUp} className="stack">
                <input
                  type="hidden"
                  name="questId"
                  value={q.id}
                />
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
    </>
  );
}
