import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import * as A from "@/app/actions";

function AchievementFields({ achievement }: { achievement?: any }) {
  return (
    <>
      <label>Name<input name="name" required defaultValue={achievement?.name ?? ""} /></label>
      <label>Assignment Type
        <select name="assignType" defaultValue={achievement?.assignType ?? "Manual"}>
          <option value="Automatic">Automatic</option><option value="Manual">Manual</option>
        </select>
      </label>
      <label>Earn Type
        <select name="earnType" defaultValue={achievement?.earnType ?? "Individual"}>
          <option value="Individual">Individual</option><option value="Team">Team</option>
        </select>
      </label>
      <label>Description<textarea name="description" defaultValue={achievement?.description ?? ""} rows={2} /></label>
      <label>Renown Reward<input name="reward" type="number" min={0} required defaultValue={achievement?.reward ?? 0} /></label>
      <label className="checkbox-label">Secret achievement<input name="secret" type="checkbox" defaultChecked={achievement?.secret ?? false} className="small-checkbox" /></label>
      <label>Automatic Trigger
        <select name="trigger" defaultValue={achievement?.trigger ?? "completed_quests"}>
          <option value="completed_quests">Completed quest count</option>
          <option value="renown_spent">Total Renown spent in store</option>
          <option value="completed_quest_party_size">Completed quest party size (Team only)</option>
          <option value="items_purchased">
  Number of items purchased
</option>
        </select>
      </label>
      <label>Target / Threshold<input name="target" type="number" min={1} required defaultValue={achievement?.target ?? 1} /></label>
    </>
  );
}

export default async function AdminAchievementsPage() {
  await requireAdmin();
  const [achievements, players, quests] = await Promise.all([
    db.achievement.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    db.user.findMany({ where: { role: "player", isActive: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, username: true } }),
    db.quest.findMany({ where: { status: { in: ["active", "completed"] } }, orderBy: { oneShotDate: "desc" }, select: { id: true, title: true, oneShotDate: true } }),
  ]);

  return (
    <>
      <article className="panel">
        <h1>Achievement Management</h1>
       
      </article>

      <article className="panel">
        <h2>Create Achievement</h2>
        <ActionForm action={A.createAchievement} className="stack">
          <AchievementFields />
          <button type="submit">Create Achievement</button>
        </ActionForm>
        <p><small>For Automatic achievements, the trigger and target determine when the website awards it. Manual achievements are awarded below.</small></p>
      </article>

      <article className="panel">
        <h2>Existing Achievements ({achievements.length})</h2>
        {achievements.length === 0 && <p>No achievements have been created yet.</p>}
        {achievements.map((a) => (
          <section key={a.id} style={{ borderTop: "1px solid #0002", paddingTop: ".8rem", marginTop: ".8rem" }}>
            <div className="row">
              <span><strong>{a.name}</strong> · {a.assignType} · {a.earnType} · {a.reward} Renown{a.secret ? " · Secret" : ""}</span>
              <strong>{a.isActive ? "Active" : "Disabled"}</strong>
            </div>
            <p>{a.description}</p>
            <ActionForm action={A.updateAchievement} className="stack">
              <input type="hidden" name="achievementId" value={a.id} />
              <AchievementFields achievement={a} />
              <button type="submit">Save Changes</button>
            </ActionForm>
            <div style={{ marginTop: ".6rem" }}>
              <ActionForm action={A.toggleAchievement} className="inline">
                <input type="hidden" name="achievementId" value={a.id} />
                <input type="hidden" name="isActive" value={String(!a.isActive)} />
                <button type="submit">{a.isActive ? "Disable" : "Enable"}</button>
              </ActionForm>
            </div>
            {a.assignType === "Manual" && a.isActive && (
              <div className="stack" style={{ marginTop: ".8rem" }}>
                <strong>Manually Award</strong>
                {a.earnType === "Individual" ? (
                  <ActionForm action={A.awardAchievementManually} className="inline">
                    <input type="hidden" name="achievementId" value={a.id} />
                    <select name="userId" required defaultValue=""><option value="" disabled>Choose player</option>{players.map((p) => <option key={p.id} value={p.id}>{p.displayName} ({p.username})</option>)}</select>
                    <button type="submit">Award Player</button>
                  </ActionForm>
                ) : (
                  <ActionForm action={A.awardAchievementManually} className="inline">
                    <input type="hidden" name="achievementId" value={a.id} />
                    <select name="questId" required defaultValue=""><option value="" disabled>Choose quest party</option>{quests.map((q) => <option key={q.id} value={q.id}>{q.title} · {q.oneShotDate.toLocaleDateString()}</option>)}</select>
                    <button type="submit">Award Quest Party</button>
                  </ActionForm>
                )}
              </div>
            )}
          </section>
        ))}
      </article>
    </>
  );
}
