import { notFound } from "next/navigation";
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CLASSES, doorState, fmt } from "@/lib/util";
import { signUp, withdraw } from "@/app/actions";

export default async function QuestPage({ params }: { params: { id: string } }) {
  const u = await requireUser();
  const now = new Date();
  const q = await db.quest.findUnique({
    where: { id: params.id },
    include: { signups: { where: { status: { in: ["signed_up", "completed"] } }, include: { user: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!q || q.status === "cancelled" || (q.postAt > now && u.role !== "admin")) notFound();
  const hp = u.hasPriority || (!!u.priorityUntil && u.priorityUntil > now);
  const st = doorState(q, q.signups.length, hp, now);
  const mine = q.signups.find((x) => x.userId === u.id && x.status === "signed_up");
  const canJoin = q.status === "active" && (st === "open" || st === "priority");
  const picker = (
    <label>Class
      <select name="className" defaultValue={mine?.className ?? "Undecided"}>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
    </label>
  );
  return (
    <article className="panel">
      <Link href="/">Back to the hallway</Link>
      <h1>{q.title}</h1>
      <p>Level {q.level} · {q.renownReward} Renown · {fmt(q.oneShotDate)}</p>
      <p style={{ whiteSpace: "pre-wrap" }}>{q.description}</p>
      <h2>Party: {q.signups.length} of {q.maxPlayers} filled</h2>
      <ul>{q.signups.map((s) => <li key={s.id}>{s.user.displayName}, {s.className}</li>)}</ul>
      {q.status === "completed" ? <p className="note">This quest is complete.</p>
        : q.status === "postponed" ? <p className="note">Postponed. Sign-ups are paused.</p>
        : mine ? (
          <>
            <ActionForm action={signUp} className="stack"><input type="hidden" name="questId" value={q.id} />{picker}<button>Change class</button></ActionForm>
            <ActionForm action={withdraw} className="stack"><input type="hidden" name="questId" value={q.id} /><button>Withdraw</button></ActionForm>
          </>
        ) : canJoin ? (
          <ActionForm action={signUp} className="stack"><input type="hidden" name="questId" value={q.id} />{picker}<button>Sign up</button></ActionForm>
        ) : <p className="note">{st === "full" ? "This quest is full." : st === "priority" ? "Priority sign-up is open." : `Sign-ups open for everyone ${fmt(q.generalSignupAt)}.`}</p>}
    </article>
  );
}
