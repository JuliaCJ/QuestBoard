"use client";

import { useActionState, useEffect, useRef } from "react";

type Action = (fd: FormData) => Promise<unknown>;

export default function ActionForm({
  action,
  className,
  children,
  messageBelow = true,
  onMessage,
  resetOnComplete = false,
  messageStyle,
}: {
  action: Action;
  className?: string;
  children: React.ReactNode;
  messageBelow?: boolean;
  onMessage?: (message: string) => void;
  resetOnComplete?: boolean;
  messageStyle?: React.CSSProperties;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const [msg, run] = useActionState(
    async (_: string, fd: FormData): Promise<string> => {
      const result = await action(fd);

      if (resetOnComplete) {
        formRef.current?.reset();
      }

      return typeof result === "string" ? result : "";
    },
    ""
  );

  useEffect(() => {
    if (msg) onMessage?.(msg);
  }, [msg, onMessage]);

  return (
    <>
      <form ref={formRef} action={run} className={className}>
        {children}
      </form>

      {messageBelow && msg && (
        <p
          className="note"
          role="status"
          style={messageStyle}
        >
          {msg}
        </p>
      )}
    </>
  );
}