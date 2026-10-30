
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

function getAchievementImage(
  achievement: {
    reward: number;
    secret: boolean;
  },
  earned: boolean
) {
  if (!earned) return "locked";

  if (achievement.secret) return "secret";
  if (achievement.reward <= 400) return "common";
  if (achievement.reward <= 700) return "uncommon";
  if (achievement.reward < 1000) return "rare";

  return "platinum";
}

export default async function AchievementsPage() {
  const user = await requireUser();
  if (user.role === "admin") return null;

  const achievements = await db.achievement.findMany({
    where: {
      isActive: true,
      OR: [
        { secret: false },
        { recipients: { some: { userId: user.id } } },
      ],
    },
    include: {
      recipients: {
        where: { userId: user.id },
        select: { earnedAt: true, source: true },
      },
    },
    orderBy: [{ secret: "asc" }, { name: "asc" }],
  });

  const earned = achievements.filter((a) => a.recipients.length > 0);
  const available = achievements.filter((a) => a.recipients.length === 0);

  return (
    <>
      <article className="panel">
        <h1>Achievements</h1>
        <p>
          {earned.length} of {achievements.length} achievements earned.
        </p>
        <p>
          <Link href="/account">Back to Account</Link>
        </p>
      </article>

      {/* Earned Achievements */}
      <article className="panel">
        <h2>Earned ({earned.length})</h2>

        {earned.length === 0 && (
          <p>
            You have not earned any achievements yet. Complete quests and
            explore the QuestBoard!
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: "1.25rem",
            marginTop: "1rem",
          }}
        >
          {earned.map((a) => {
            const image = getAchievementImage(a, true);

            return (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: ".35rem",
                  minWidth: 0,
                  padding: ".5rem",
                }}
              >
                <img
                  src={`/api/achievement-images/${image}`}
                  alt={`${image} achievement`}
                  style={{
                    width: "72px",
                    height: "72px",
                    objectFit: "contain",
                    flexShrink: 0,
                  }}
                />

                <strong>{a.name}</strong>

                <span style={{ fontSize: ".9rem" }}>
                  {a.description}
                </span>

        

                
              </div>
            );
          })}
        </div>
      </article>

      {/* Unearned Achievements */}
      <article className="panel">
        <h2>Not Yet Earned ({available.length})</h2>

        {available.length === 0 && (
          <p>
            You have earned every achievement currently available to you!
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: "1.25rem",
            marginTop: "1rem",
          }}
        >
          {available.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: ".35rem",
                minWidth: 0,
                padding: ".5rem",
              }}
            >
              <img
                src="/api/achievement-images/locked"
                alt="Locked achievement"
                style={{
                  width: "72px",
                  height: "72px",
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />

              <strong>{a.name}</strong>

              <span style={{ fontSize: ".9rem" }}>
                {a.description}
              </span>

            </div>
          ))}
        </div>
      </article>
    </>
  );
}
