
"use client";

import { useActionState } from "react";

type Action = (fd: FormData) => Promise<unknown>;

export default function PlayerPriorityControls({
  userId,
  hasPriority,
  setPriorityAction,
  deactivateAction,
}: {
  userId: string;
  hasPriority: boolean;
  setPriorityAction: Action;
  deactivateAction: Action;
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
            {hasPriority ? "Remove priority" : "Grant priority"}
          </button>
        </form>

        <form action={deactivateRun} className="inline">
          <input type="hidden" name="userId" value={userId} />
          <button type="submit">Remove player</button>
        </form>
      </div>

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
  );
}
