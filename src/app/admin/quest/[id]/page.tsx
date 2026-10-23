import { notFound } from "next/navigation";
import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { CLASSES, fmt } from "@/lib/util";
import * as A from "@/app/actions";

export default async function AdminQuest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const q = await db.quest.findUnique({
    where: { id },
    include: { signups: { where: { status: { not: "withdrawn" } }, include: { user: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!q) notFound();
  const players = await db.user.findMany({ where: { role: "player", isActive: true }, orderBy: { displayName: "asc" } });
  const roster = q.signups.filter((s) => s.status === "signed_up");
  return (
    <article className="panel">
      <Link href="/admin">Back to admin</Link>
      <h1>{q.title}</h1>
      <p>{q.status} · {fmt(q.oneShotDate)} · {roster.length}/{q.maxPlayers} signed up · reward {q.renownReward} Renown</p>

      {q.status === "active" ? (
        <ActionForm action={A.completeQuest} className="stack">
          <input type="hidden" name="questId" value={q.id} />
          <h2>Complete quest</h2>
          {roster.length === 0 && <p>No one is signed up.</p>}
          {roster.map((s) => (
            <div className="row" key={s.id}>
              <span>{s.user.displayName}, {s.className}</span>
              <label className="inline"><input type="checkbox" name="noshow" value={s.userId} style={{ width: 24, minHeight: 24 }} /> No-show</label>
              <input name={`bonus_${s.userId}`} type="number" min={0} placeholder="Bonus Renown" style={{ width: "9rem" }} />
            </div>
          ))}
          <button>Complete and pay out Renown</button>
        </ActionForm>
      ) : (
        <ul>{q.signups.map((s) => <li key={s.id}>{s.user.displayName}: {s.status}</li>)}</ul>
      )}

      {q.status !== "completed" && q.status !== "cancelled" && (
        <>
          <h2>Roster</h2>
          <ActionForm action={A.addToQuest} className="inline">
            <input type="hidden" name="questId" value={q.id} />
            <select name="userId">{players.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select>
            <select name="className">{CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
            <button>Add player</button>
          </ActionForm>
          {roster.map((s) => (
            <ActionForm key={s.id} action={A.removeFromQuest} className="row">
              <span>{s.user.displayName}</span><input type="hidden" name="signupId" value={s.id} /><button>Remove</button>
            </ActionForm>
          ))}
        </>
      )}
    </article>
  );
}
