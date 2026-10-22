"use client";
import { useFormState } from "react-dom";

type Action = (fd: FormData) => Promise<string | void>;
export default function ActionForm({ action, className, children }: { action: Action; className?: string; children: React.ReactNode }) {
  const [msg, run] = useFormState(async (_: string, fd: FormData) => (await action(fd)) ?? "", "");
  return (
    <form action={run} className={className}>
      {children}
      {msg && <p className="note" role="status">{msg}</p>}
    </form>
  );
}
