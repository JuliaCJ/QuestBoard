import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import * as A from "@/app/actions";
import ActionForm from "@/components/ActionForm";
import {
  AchievementFields,
  AchievementEditor,
} from "@/components/AchievementControls";
import AchievementImageManager from "@/components/AchievementImageManager";

function getAchievementImage(a: {
  reward: number;
  secret: boolean;
}) {
  if (a.secret) return "secret";
  if (a.reward <= 400) return "common";
  if (a.reward <= 700) return "uncommon";
  if (a.reward < 1000) return "rare";
  return "platinum";
}

export default async function AdminAchievementsPage() {
  await requireAdmin();

  const [achievements, players, quests, achievementImages] =
  await Promise.all([
    db.achievement.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),

    db.user.findMany({
      where: { role: "player", isActive: true },
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        username: true,
      },
    }),

    db.quest.findMany({
      where: { status: { in: ["active", "completed"] } },
      orderBy: { oneShotDate: "desc" },
      select: {
        id: true,
        title: true,
        oneShotDate: true,
      },
    }),

    db.achievementImage.findMany({
      select: { key: true },
    }),
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

        <p>
          <small>
            For Automatic achievements, the trigger and target determine
            when the website awards them. Manual achievements are awarded
            below.
          </small>
        </p>
      </article>

      <article className="panel">
        <h2>Existing Achievements ({achievements.length})</h2>

        {achievements.length === 0 && (
          <p>No achievements have been created yet.</p>
        )}

        {achievements.map((a) => (
          <section
            key={a.id}
            style={{
              borderTop: "1px solid #0002",
              paddingTop: ".8rem",
              marginTop: ".8rem",
            }}
          >
            <div
  className="row"
  style={{
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: ".5rem",
  }}
>
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: ".5rem",
      flexShrink: 0,
    }}
  >
    <img
      src={`/api/achievement-images/${getAchievementImage(a)}`}
      alt={`${getAchievementImage(a)} achievement`}
      style={{
        width: "36px",
        height: "36px",
        objectFit: "contain",
        display: "block",
        flexShrink: 0,
      }}
    />

    <strong>{a.name}</strong>
  </span>

  <span>
    · {a.assignType} · {a.earnType}
    {" "}· {a.reward} Renown
    {a.secret ? " · Secret" : ""}
  </span>

  <strong style={{ marginLeft: "auto" }}>
    {a.isActive ? "Active" : "Disabled"}
  </strong>
</div>

            <p>{a.description}</p>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: ".5rem",
              }}
            >
              {/* Edit */}
              <AchievementEditor achievement={a} />

              {/* Manual reward */}
              {a.isActive && (
                <>
                  {a.earnType === "Individual" ? (
                    <ActionForm
                      action={A.awardAchievementManually}
                      className="inline"
                    >
                      <input
                        type="hidden"
                        name="achievementId"
                        value={a.id}
                      />

                      <select
                        name="userId"
                        required
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Choose player
                        </option>

                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName} ({p.username})
                          </option>
                        ))}
                      </select>

                      <button type="submit">Reward Player</button>
                    </ActionForm>
                  ) : (
                    <ActionForm
                      action={A.awardAchievementManually}
                      className="inline"
                    >
                      <input
                        type="hidden"
                        name="achievementId"
                        value={a.id}
                      />

                      <select
                        name="questId"
                        required
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Choose quest party
                        </option>

                        {quests.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.title} ·{" "}
                            {q.oneShotDate
                              ? q.oneShotDate.toLocaleDateString()
                              : "No date"}
                          </option>
                        ))}
                      </select>

                      <button type="submit">Reward Party</button>
                    </ActionForm>
                  )}
                </>
              )}

              {/* Disable / Enable */}
              <ActionForm action={A.toggleAchievement} className="inline">
                <input
                  type="hidden"
                  name="achievementId"
                  value={a.id}
                />

                <input
                  type="hidden"
                  name="isActive"
                  value={String(!a.isActive)}
                />

                <button type="submit">
                  {a.isActive ? "Disable" : "Enable"}
                </button>
              </ActionForm>

              {/* Delete */}
              <ActionForm action={A.deleteAchievement} className="inline">
                <input
                  type="hidden"
                  name="achievementId"
                  value={a.id}
                />

                <button type="submit">Delete</button>
              </ActionForm>

            </div>
          </section>
        ))}
      </article>

      <article className="panel">
  <AchievementImageManager
    existingImages={achievementImages.map((image) => image.key)}
  />
</article>

    </>
  );
}