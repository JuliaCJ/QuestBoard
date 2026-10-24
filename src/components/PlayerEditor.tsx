
"use client";

import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import * as A from "@/app/actions";

export default function PlayerEditor({ userId }: { userId: string }) {
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
          <ActionForm action={A.adjustRenown} className="inline">
            <input type="hidden" name="userId" value={userId} />
            <input
              name="amount"
              type="number"
              placeholder="Renown (+/-)"
              required
            />
            <input name="note" placeholder="Note" />
            <button>Update Renown</button>
          </ActionForm>

          <ActionForm action={A.resetPassword} className="inline">
            <input type="hidden" name="userId" value={userId} />
            <input
              name="password"
              type="password"
              placeholder="New password"
              autoComplete="new-password"
              required
            />
            <button>Update Password</button>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
