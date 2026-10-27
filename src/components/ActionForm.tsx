
"use client";

import { useActionState } from "react";

type Action = (fd: FormData) => Promise<unknown>;

export default function ActionForm({
  action,
  className,
  children,
}: {
  action: Action;
  className?: string;
  children: React.ReactNode;
}) {
  const [msg, run] = useActionState(
    async (_: string, fd: FormData): Promise<string> => {
      const result = await action(fd);
      return typeof result === "string" ? result : "";
    },
    ""
  );

  return (
    <form action={run} className={className}>
      {children}
      {msg && (
        <p className="note" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}
