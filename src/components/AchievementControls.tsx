
"use client";

import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import * as A from "@/app/actions";

type AchievementData = {
  id: string;
  name: string;
  assignType: string;
  earnType: string;
  description: string | null;
  reward: number;
  secret: boolean;
  trigger: string | null;
  target: number;
};

export function AchievementFields({
  achievement,
}: {
  achievement?: AchievementData;
}) {
  const [assignType, setAssignType] = useState(
    achievement?.assignType ?? "Manual"
  );

  return (
    <>
      <label>
        Name
        <input
          name="name"
          required
          defaultValue={achievement?.name ?? ""}
        />
      </label>

      <label>
        Assignment Type
        <select
          name="assignType"
          value={assignType}
          onChange={(e) => setAssignType(e.target.value)}
        >
          <option value="Automatic">Automatic</option>
          <option value="Manual">Manual</option>
        </select>
      </label>

      <label>
        Earn Type
        <select
          name="earnType"
          defaultValue={achievement?.earnType ?? "Individual"}
        >
          <option value="Individual">Individual</option>
          <option value="Team">Team</option>
        </select>
      </label>

      <label>
        Description
        <textarea
          name="description"
          defaultValue={achievement?.description ?? ""}
          rows={2}
        />
      </label>

      <label>
        Renown Reward
        <input
          name="reward"
          type="number"
          min={0}
          required
          defaultValue={achievement?.reward ?? 0}
        />
      </label>

      <label className="checkbox-label">
        Secret achievement
        <input
          name="secret"
          type="checkbox"
          defaultChecked={achievement?.secret ?? false}
          className="small-checkbox"
        />
      </label>

      {assignType === "Automatic" && (
        <>
          <label>
            Automatic Trigger
            <select
              name="trigger"
              defaultValue={achievement?.trigger ?? "completed_quests"}
            >
              <option value="completed_quests">
                Completed quest count
              </option>
              <option value="renown_spent">
                Total Renown spent in store
              </option>
              <option value="completed_quest_party_size">
                Completed quest party size (Team only)
              </option>
              <option value="items_purchased">
                Number of items purchased
              </option>
            </select>
          </label>

          <label>
            Target / Threshold
            <input
              name="target"
              type="number"
              min={1}
              required
              defaultValue={achievement?.target ?? 1}
            />
          </label>
        </>
      )}
    </>
  );
}

export function AchievementEditor({
  achievement,
}: {
  achievement: AchievementData;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(!editing)}
      >
        {editing ? "Cancel Editing" : "Edit"}
      </button>

      {editing && (
        <div
          style={{
            flexBasis: "100%",
            width: "100%",
            minWidth: 0,
            marginTop: ".5rem",
          }}
        >
          <ActionForm action={A.updateAchievement} className="stack">
            <input
              type="hidden"
              name="achievementId"
              value={achievement.id}
            />

            <AchievementFields achievement={achievement} />

            <button type="submit">Save Changes</button>
          </ActionForm>
        </div>
      )}
    </>
  );
}
