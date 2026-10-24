"use client";
import { useRef } from "react";

// Adds whole days to a "YYYY-MM-DDTHH:mm" wall-clock string without touching
// time zones, so the time of day stays the same (even across daylight saving).
function plusDays(local: string, days: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days, +m[4], +m[5]));
  return d.toISOString().slice(0, 16);
}

export default function SignupDates({
  priority,
  general,
  days,
}: {
  priority: string; // saved priority sign-up date, "YYYY-MM-DDTHH:mm"
  general: string; // saved general sign-up date, "YYYY-MM-DDTHH:mm"
  days: number; // how long after priority the general sign-up opens
}) {
  const generalRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <label>
        Priority Sign-Up Opens
        <input
          name="priority"
          type="datetime-local"
          defaultValue={priority}
          required
          onChange={(e) => {
            const next = plusDays(e.target.value, days);
            if (next && generalRef.current) generalRef.current.value = next;
          }}
        />
      </label>

      <label>
        General Sign-Up Opens
        <input
          ref={generalRef}
          name="general"
          type="datetime-local"
          defaultValue={general}
          required
        />
      </label>
    </>
  );
}