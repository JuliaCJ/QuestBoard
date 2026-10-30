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
    },
    include: {
      recipients: {
        where: { userId: user.id },
        select: { earnedAt: true, source: true },
      },
    },
    orderBy: [{ secret: "asc" }, { name: "asc" }],
  });

  const earned = achievements.filter(
    (a) => a.recipients.length > 0 && !a.secret
  );

  const earnedSecret = achievements.filter(
    (a) => a.recipients.length > 0 && a.secret
  );

  const available = achievements.filter(
    (a) => a.recipients.length === 0 && !a.secret
  );

  const availableSecret = achievements.filter(
    (a) => a.recipients.length === 0 && a.secret
  );

  const common = earned.filter((a) => a.reward <= 400);
  const uncommon = earned.filter(
    (a) => a.reward > 400 && a.reward <= 700
  );
  const rare = earned.filter(
    (a) => a.reward > 700 && a.reward < 1000
  );
  const platinum = earned.filter((a) => a.reward >= 1000);

  const totalEarned = earned.length + earnedSecret.length;
  const totalAchievements = achievements.length;

  function renderAchievements(
    items: typeof achievements,
    isEarned: boolean,
    isSecret = false
  ) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: "1.25rem",
          marginTop: "1rem",
        }}
      >
        {items.map((a) => {
          const image = getAchievementImage(a, isEarned);

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

              <strong>
                {isSecret && !isEarned ? "?????" : a.name}
              </strong>

              {!(isSecret && !isEarned) && (
                <span style={{ fontSize: ".9rem" }}>
                  {a.description}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderTypeDivider() {
    return (
      <div
        style={{
          borderTop: "1px solid #0002",
          marginTop: "1.25rem",
        }}
      />
    );
  }

  return (
    <>
      <article className="panel">
        <h1>Achievements</h1>

        <p>
          {totalEarned} of {totalAchievements} achievements earned.
        </p>

        <p>
          <Link href="/account">Back to Account</Link>
        </p>
      </article>

      {/* Earned Achievements */}
      <article className="panel">
        <h2>Earned ({totalEarned})</h2>

        {totalEarned === 0 && (
          <p>
            You have not earned any achievements yet. Complete quests and
            explore the QuestBoard!
          </p>
        )}

        {common.length > 0 && (
          <>
            <h3>Common</h3>
            {renderAchievements(common, true)}
          </>
        )}

        {uncommon.length > 0 && (
          <>
            {renderTypeDivider()}
            <h3 style={{ marginTop: ".75rem" }}>Uncommon</h3>
            {renderAchievements(uncommon, true)}
          </>
        )}

        {rare.length > 0 && (
          <>
            {renderTypeDivider()}
            <h3 style={{ marginTop: ".75rem" }}>Rare</h3>
            {renderAchievements(rare, true)}
          </>
        )}

        {platinum.length > 0 && (
          <>
            {renderTypeDivider()}
            <h3 style={{ marginTop: ".75rem" }}>Platinum</h3>
            {renderAchievements(platinum, true)}
          </>
        )}

        {earnedSecret.length > 0 && (
          <>
            {renderTypeDivider()}
            <h3 style={{ marginTop: ".75rem" }}>Secret</h3>
            {renderAchievements(earnedSecret, true, true)}
          </>
        )}
      </article>

      {/* Unearned Achievements */}
      <article className="panel">
        <h2>
          Not Yet Earned ({available.length + availableSecret.length})
        </h2>

        {available.length === 0 && availableSecret.length === 0 && (
          <p>
            You have earned every achievement currently available to you!
          </p>
        )}

        {available.length > 0 && (
          <>
            <h3>Achievements</h3>
            {renderAchievements(available, false)}
          </>
        )}

        {availableSecret.length > 0 && (
          <>
            {available.length > 0 && renderTypeDivider()}
            <h3 style={{ marginTop: ".75rem" }}>Secret</h3>
            {renderAchievements(availableSecret, false, true)}
          </>
        )}
      </article>
    </>
  );
}