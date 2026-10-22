import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { TZ, fmt } from "@/lib/util";
import * as A from "@/app/actions";

const hid = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

export default async function Admin() {
  await requireAdmin();
  const [players, quests, keys] = await Promise.all([
    db.user.findMany({ where: { role: "player", isActive: true }, orderBy: { displayName: "asc" } }),
    db.quest.findMany({ orderBy: { oneShotDate: "desc" }, include: { _count: { select: { signups: { where: { status: "signed_up" } } } } } }),
    db.priorityKey.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { redeemedBy: true } }),
  ]);
  const now = new Date();
  return (
    <>
      <section className="panel">
        <h2>Players</h2>
        <ActionForm action={A.createPlayer} className="inline"><input name="displayName" placeholder="Display name" required /><input name="username" placeholder="Username" autoCapitalize="none" autoComplete="off" required /><input name="password" placeholder="Password (8+ characters)" autoComplete="off" required /><button>Create player</button></ActionForm>
        {players.map((p) => (
          <div className="row" key={p.id}>
            <span><b>{p.displayName}</b> (@{p.username}) · {p.renown} Renown{p.hasPriority ? " · Priority" : ""}</span>
            <ActionForm action={A.setPriority} className="inline">{hid("userId", p.id)}{hid("value", p.hasPriority ? "0" : "1")}<button>{p.hasPriority ? "Remove priority" : "Give priority"}</button></ActionForm>
            <ActionForm action={A.resetPassword} className="inline">{hid("userId", p.id)}<input name="password" placeholder="New password" autoComplete="off" required /><button>Set password</button></ActionForm>
            <ActionForm action={A.adjustRenown} className="inline">{hid("userId", p.id)}<input name="amount" type="number" placeholder="± Renown" /><input name="note" placeholder="Note" /><button>Apply</button></ActionForm>
            <ActionForm action={A.deactivate} className="inline">{hid("userId", p.id)}<button>Remove player</button></ActionForm>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>New quest</h2>
        <ActionForm action={A.createQuest} className="stack">
          <label>Title<input name="title" required /></label>
          <label>Description<textarea name="description" rows={4} /></label>
          <div className="grid2">
            <label>Level<input name="level" type="number" defaultValue={1} /></label>
            <label>Renown reward<input name="renown" type="number" defaultValue={100} /></label>
            <label>Min players<input name="min" type="number" defaultValue={3} /></label>
            <label>Max players<input name="max" type="number" defaultValue={6} /></label>
          </div>
          <p>Dates use the {TZ} time zone.</p>
          <div className="grid2">
            <label>One-shot date<input name="oneShot" type="datetime-local" required /></label>
            <label>General sign-up opens<input name="general" type="datetime-local" required /></label>
            <label>Priority sign-up opens (blank = 5 days earlier)<input name="priority" type="datetime-local" /></label>
            <label>Posted on (blank = now)<input name="post" type="datetime-local" /></label>
          </div>
          <button>Create quest</button>
        </ActionForm>
      </section>

      <section className="panel">
        <h2>Quests</h2>
        {quests.map((q) => (
          <div className="row" key={q.id}>
            <span><b>{q.title}</b> · {q.status}{q.manualLock ? " · locked" : ""} · {q._count.signups}/{q.maxPlayers} · {fmt(q.oneShotDate)}</span>
            <Link className="btn" href={`/admin/quest/${q.id}`}>Manage</Link>
            {["active", "postponed"].includes(q.status) && (
              <ActionForm action={A.setLock} className="inline">{hid("questId", q.id)}{hid("value", q.manualLock ? "0" : "1")}<button>{q.manualLock ? "Unlock" : "Lock"}</button></ActionForm>
            )}
            {q.status === "postponed" && (
              <ActionForm action={A.unpostpone} className="inline">{hid("questId", q.id)}<input name="oneShot" type="datetime-local" aria-label="New one-shot date" /><button>Reactivate</button></ActionForm>
            )}
            {["active", "postponed"].includes(q.status) && <ActionForm action={A.cancelQuest} className="inline">{hid("questId", q.id)}<button>Cancel</button></ActionForm>}
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Priority keys</h2>
        <ActionForm action={A.createKey} className="inline"><input name="code" placeholder="Key code" autoCapitalize="none" autoComplete="off" required /><input name="days" type="number" defaultValue={5} aria-label="Days valid" /><button>Create key</button></ActionForm>
        {keys.map((k) => (
          <div className="row" key={k.id}>
            <code>{k.code}</code>
            <span>{k.redeemedBy ? `Used by ${k.redeemedBy.displayName}` : k.expiresAt < now ? "Expired" : `Unused, expires ${fmt(k.expiresAt)}`}</span>
          </div>
        ))}
      </section>
    </>
  );
}
