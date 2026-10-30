import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import * as A from "@/app/actions";
import ActionForm from "@/components/ActionForm";
import {
  AchievementFields,
} from "@/components/AchievementControls";
import AchievementImageManager from "@/components/AchievementImageManager";
import AchievementActions from "@/components/AchievementActions";

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

const ACHIEVEMENT_TYPES = [
  { key: "common", label: "Common" },
  { key: "uncommon", label: "Uncommon" },
  { key: "rare", label: "Rare" },
  { key: "platinum", label: "Platinum" },
  { key: "secret", label: "Secret" },
] as const;

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

  const groupedAchievements = ACHIEVEMENT_TYPES.map((type) => ({
    ...type,
    achievements: achievements.filter(
      (a) => getAchievementImage(a) === type.key
    ),
  }));

  return (
    <>
      <article className="panel">
        <h1>Achievement Management</h1>
      </article>

      <article className="panel">
        <h2>Create Achievement</h2>

        <ActionForm
          action={A.createAchievement}
          className="stack"
          resetOnComplete
        >
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

        {groupedAchievements.map((group) => (
          <section key={group.key} style={{ marginTop: "0.5rem" }}>
            <h3
              style={{
                borderBottom: "1px solid #0002",
                paddingBottom: ".35rem",
                marginBottom: ".35rem",
              }}
            >
              {group.label} ({group.achievements.length})
            </h3>

            {group.achievements.length === 0 && (
              <p>
                <small>
                  No {group.label} Achievements.
                </small>
              </p>
            )}

            {group.achievements.map((a) => (
              <section
                key={a.id}
                style={{
                  borderTop: "1px solid #0002",
                  paddingTop: ".3rem",
                  marginTop: ".3rem",
                }}
              >
                {/* Achievement image, name, and details */}
                <div
                  className="row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: ".35rem",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: ".35rem",
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

                {/* Achievement description */}
                {a.description && (
                  <p style={{ margin: ".15rem 0 .35rem" }}>
                    {a.description}
                  </p>
                )}

                {/* Achievement actions and award notification */}
                <AchievementActions
                  achievement={
                    a as unknown as React.ComponentProps<
                      typeof AchievementActions
                    >["achievement"]
                  }
                  players={players}
                  quests={quests}
                />
              </section>
            ))}
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