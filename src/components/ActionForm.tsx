"use client";

import { useActionState, useEffect } from "react";

type Action = (fd: FormData) => Promise<unknown>;

export default function ActionForm({
  action,
  className,
  children,
  messageBelow = true,
  onMessage,
}: {
  action: Action;
  className?: string;
  children: React.ReactNode;
  messageBelow?: boolean;
  onMessage?: (message: string) => void;
}) {
  const [msg, run] = useActionState(
    async (_: string, fd: FormData): Promise<string> => {
      const result = await action(fd);
      return typeof result === "string" ? result : "";
    },
    ""
  );

  useEffect(() => {
    if (msg) onMessage?.(msg);
  }, [msg, onMessage]);

  return (
    <>
      <form action={run} className={className}>
        {children}
      </form>

      {messageBelow && msg && (
        <p className="note" role="status">
          {msg}
        </p>
      )}
    </>
  );
}