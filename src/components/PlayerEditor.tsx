
"use client";

import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import * as A from "@/app/actions";

type PlayerAchievement = {
  id: string;
  achievement: {
    name: string;
    reward: number;
  };
};

export default function PlayerEditor({
  userId,
  displayName,
  username,
  achievements,
}: {
  userId: string;
  displayName: string;
  username: string;
  achievements: PlayerAchievement[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? "Close Editor" : "Edit Player"}
      </button>

      {isOpen && (
        <div className="stack" style={{ marginTop: ".6rem" }}>

          {/* Player information */}
          <h3>Player Information</h3>

          <ActionForm
            action={A.updatePlayerDetails}
            className="stack"
          >
            <input
              type="hidden"
              name="userId"
              value={userId}
            />

            <label>
              Display Name
              <input
                name="displayName"
                defaultValue={displayName}
                required
                maxLength={60}
              />
            </label>

            <label>
              Username
              <input
                name="username"
                defaultValue={username}
                required
                minLength={3}
                maxLength={24}
                autoComplete="off"
              />
            </label>

            <button type="submit">
              Save Player Information
            </button>
          </ActionForm>

          {/* Renown adjustment */}
          <h3>Adjust Renown</h3>

          <ActionForm
            action={A.adjustRenown}
            className="inline"
          >
            <input
              type="hidden"
              name="userId"
              value={userId}
            />

            <input
              name="amount"
              type="number"
              placeholder="Renown (+/-)"
              required
            />

            <input
              name="note"
              placeholder="Note"
            />

            <button type="submit">
              Update Renown
            </button>
          </ActionForm>

          {/* Password reset */}
          <h3>Reset Password</h3>

          <ActionForm
            action={A.resetPassword}
            className="inline"
          >
            <input
              type="hidden"
              name="userId"
              value={userId}
            />

            <input
              name="password"
              type="password"
              placeholder="New password"
              autoComplete="new-password"
              required
            />

            <button type="submit">
              Update Password
            </button>
          </ActionForm>

          {/* Achievement management */}
          <h3>
            Earned Achievements ({achievements.length})
          </h3>

          {achievements.length === 0 ? (
            <p>This player has not earned any achievements.</p>
          ) : (
            <div className="stack">
              {achievements.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: ".75rem",
                    flexWrap: "wrap",
                    borderTop: "1px solid #0002",
                    paddingTop: ".5rem",
                  }}
                >
                  <div>
                    <strong>
                      {item.achievement.name}
                    </strong>
                    <div>
                      {item.achievement.reward} Renown
                    </div>
                  </div>

                  <ActionForm
                    action={A.removePlayerAchievement}
                    className="inline"
                  >
                    <input
                      type="hidden"
                      name="userId"
                      value={userId}
                    />

                    <input
                      type="hidden"
                      name="userAchievementId"
                      value={item.id}
                    />

                    <ConfirmButton
                      message={`Remove "${item.achievement.name}" from this player? This will deduct ${item.achievement.reward} Renown and return the achievement to its locked state.`}
                    >
                      Remove Achievement
                    </ConfirmButton>
                  </ActionForm>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
