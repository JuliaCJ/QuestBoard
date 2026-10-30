"use client";

import { useState } from "react";
import * as A from "@/app/actions";
import ActionForm from "@/components/ActionForm";
import { AchievementEditor } from "@/components/AchievementControls";

type Achievement = React.ComponentProps<
  typeof AchievementEditor
>["achievement"];

type Player = {
  id: string;
  displayName: string;
  username: string;
};

type Quest = {
  id: string;
  title: string;
  oneShotDate: Date | null;
};

export default function AchievementActions({
  achievement,
  players,
  quests,
}: {
  achievement: Achievement;
  players: Player[];
  quests: Quest[];
}) {
  const [message, setMessage] = useState("");

  return (
    <div>
      {/* All buttons stay together in this row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: ".35rem",
        }}
      >
        <AchievementEditor achievement={achievement} />

        {achievement.isActive && (
          achievement.earnType === "Individual" ? (
            <ActionForm
              action={A.awardAchievementManually}
              className="inline"
              messageBelow={false}
              onMessage={setMessage}
            >
              <input
                type="hidden"
                name="achievementId"
                value={achievement.id}
              />

              <select
                name="userId"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Choose Player
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
              messageBelow={false}
              onMessage={setMessage}
            >
              <input
                type="hidden"
                name="achievementId"
                value={achievement.id}
              />

              <select
                name="questId"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Choose Quest Party
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
          )
        )}

        <ActionForm
          action={A.toggleAchievement}
          className="inline"
        >
          <input
            type="hidden"
            name="achievementId"
            value={achievement.id}
          />

          <input
            type="hidden"
            name="isActive"
            value={String(!achievement.isActive)}
          />

          <button type="submit">
            {achievement.isActive ? "Disable" : "Enable"}
          </button>
        </ActionForm>

        <ActionForm
          action={A.deleteAchievement}
          className="inline"
        >
          <input
            type="hidden"
            name="achievementId"
            value={achievement.id}
          />

          <button type="submit">Delete</button>
        </ActionForm>
      </div>

      {/* Notification is outside the button row */}
      {message && (
        <p
          className="note"
          role="status"
          style={{
            margin: ".35rem 0 0",
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}