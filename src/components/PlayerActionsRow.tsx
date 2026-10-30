
"use client";

import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import PlayerEditor from "@/components/PlayerEditor";
import PlayerPriorityControls from "@/components/PlayerPriorityControls";
import * as A from "@/app/actions";

type PlayerAchievement = {
  id: string;
  achievement: {
    name: string;
    reward: number;
  };
};

export default function PlayerActionsRow({
  userId,
  hasPriority,
  displayName,
  username,
  achievements,
}: {
  userId: string;
  hasPriority: boolean;
  displayName: string;
  username: string;
  achievements: PlayerAchievement[];
}) {
  const [resetMsg, setResetMsg] = useState("");

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <PlayerEditor
          userId={userId}
          displayName={displayName}
          username={username}
          achievements={achievements}
        />

        <PlayerPriorityControls
          userId={userId}
          hasPriority={hasPriority}
          setPriorityAction={A.setPriority}
          deactivateAction={A.deactivate}
          onResetMessage={setResetMsg}
        />

        <ActionForm
          action={A.deletePlayer}
          className="inline"
        >
          <input type="hidden" name="userId" value={userId} />
          <button type="submit">Delete Player</button>
        </ActionForm>
      </div>

      {resetMsg && (
        <p className="note" role="status">
          {resetMsg}
        </p>
      )}
    </div>
  );
}
