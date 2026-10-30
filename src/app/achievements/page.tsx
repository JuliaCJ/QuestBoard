import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AchievementsPage() {
  const user = await requireUser();
  if (user.role === "admin") return null;

  // Secret achievements are only queried for players who have earned them.
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
        <p>{earned.length} of {achievements.length} achievements earned.</p>
        <p><Link href="/account">Back to Account</Link></p>
      </article>

      <article className="panel">
        <h2>Earned ({earned.length})</h2>
        {earned.length === 0 && <p>You have not earned any achievements yet. Complete quests and explore the QuestBoard!</p>}
        {earned.map((a) => (
          <div className="row" key={a.id}>
            <span>
              <strong>{a.name}</strong>
              <br />
              <small>{a.description}</small>
              <br />
              <small>Earned {a.recipients[0].earnedAt.toLocaleDateString()} · {a.recipients[0].source === "manual" ? "Admin awarded" : "Automatically earned"}</small>
            </span>
            <strong>+{a.reward} Renown</strong>
          </div>
        ))}
      </article>

      <article className="panel">
        <h2>Not Yet Earned ({available.length})</h2>
        {available.length === 0 && <p>You have earned every achievement currently available to you!</p>}
        {available.map((a) => (
          <div className="row" key={a.id}>
            <span>
              <strong>{a.name}</strong>
              <br />
              <small>{a.description}</small>
            </span>
            <span>{a.reward} Renown</span>
          </div>
        ))}
      </article>
    </>
  );
}
