
"use client";

import { useActionState } from "react";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import * as A from "@/app/actions";

type Action = (fd: FormData) => Promise<unknown>;

export default function PlayerPriorityControls({
  userId,
  hasPriority,
  setPriorityAction,
  deactivateAction,
  onResetMessage,
}: {
  userId: string;
  hasPriority: boolean;
  setPriorityAction: Action;
  deactivateAction: Action;
  onResetMessage: (message: string) => void;
}) {
  const [priorityMsg, priorityRun] = useActionState(
    async (_: string, fd: FormData): Promise<string> => {
      const result = await setPriorityAction(fd);
      return typeof result === "string" ? result : "";
    },
    ""
  );

  const [deactivateMsg, deactivateRun] = useActionState(
    async (_: string, fd: FormData): Promise<string> => {
      const result = await deactivateAction(fd);
      return typeof result === "string" ? result : "";
    },
    ""
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <form action={priorityRun} className="inline">
          <input type="hidden" name="userId" value={userId} />
          <input
            type="hidden"
            name="value"
            value={hasPriority ? "0" : "1"}
          />
          <button type="submit">
            {hasPriority ? "Remove Priority" : "Grant Priority"}
          </button>
        </form>

        <ActionForm
          action={A.resetPlayer}
          className="inline"
          messageBelow={false}
          onMessage={onResetMessage}
        >
          <input type="hidden" name="userId" value={userId} />
          <ConfirmButton
            message="Reset this player? This permanently deletes all inventory items, quest history, and Renown history, and sets Renown to zero. This cannot be undone."
          >
            Reset Player
          </ConfirmButton>
        </ActionForm>

        <form action={deactivateRun} className="inline">
          <input type="hidden" name="userId" value={userId} />
          <button type="submit">Remove Player</button>
        </form>
      </div>

      {/* Priority and removal notifications remain below these buttons. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
        }}
      >
        {priorityMsg && (
          <p className="note" role="status">
            {priorityMsg}
          </p>
        )}

        {deactivateMsg && (
          <p className="note" role="status">
            {deactivateMsg}
          </p>
        )}
      </div>
    </div>
  );
}
