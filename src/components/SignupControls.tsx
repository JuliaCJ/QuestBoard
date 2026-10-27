
"use client";

import { useActionState } from "react";

type Action = (fd: FormData) => Promise<unknown>;

export default function SignupControls({
  questId,
  userId,
  currentClass,
  classes,
  updateAction,
  withdrawAction,
}: {
  questId: string;
  userId: string;
  currentClass: string;
  classes: readonly string[];
  updateAction: Action;
  withdrawAction: Action;
}) {
  const [updateMsg, updateRun] = useActionState(
    async (_: string, fd: FormData): Promise<string> => {
      const result = await updateAction(fd);
      return typeof result === "string" ? result : "";
    },
    ""
  );

  const [withdrawMsg, withdrawRun] = useActionState(
    async (_: string, fd: FormData): Promise<string> => {
      const result = await withdrawAction(fd);
      return typeof result === "string" ? result : "";
    },
    ""
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <form action={updateRun} className="inline">
          <input type="hidden" name="questId" value={questId} />
          <input type="hidden" name="userId" value={userId} />

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "0.75rem",
            }}
          >
            <label>
              Class
              <select
                name="className"
                defaultValue={currentClass}
              >
                {classes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit">Change class</button>
          </div>
        </form>

        <form action={withdrawRun} className="inline">
          <input type="hidden" name="questId" value={questId} />
          <button type="submit">Withdraw</button>
        </form>
      </div>

      {updateMsg && (
        <p className="note" role="status">
          {updateMsg}
        </p>
      )}

      {withdrawMsg && (
        <p className="note" role="status">
          {withdrawMsg}
        </p>
      )}
    </div>
  );
}
