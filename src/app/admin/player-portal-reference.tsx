
import ActionForm from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, timeLeft } from "@/lib/util";
import * as A from "@/app/actions";
import PlayerEditor from "@/components/PlayerEditor";
import ConfirmButton from "@/components/ConfirmButton";
import PlayerPriorityControls from "@/components/PlayerPriorityControls";
import PlayerActionsRow from "@/components/PlayerActionsRow";


export default async function Admin() {
  await requireAdmin();

  // Expired keys are deleted permanently. Players keep any priority they already
  // got from a key (it is stored on the player, not on the key).
  await db.priorityKey.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });

  const [quests, players, keys] = await Promise.all([
    db.quest.findMany({
      orderBy: { oneShotDate: "desc" },
      include: {
        _count: {
          select: {
            signups: {
              where: { status: "signed_up" },
            },
          },
        },
      },
    }),

    db.user.findMany({
      where: { role: "player" },
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    }),

    db.priorityKey.findMany({
      orderBy: { expiresAt: "asc" },
    }),
  ]);

  const currentQuests = quests.filter(
    (q) => q.status === "active" || q.status === "postponed"
  );

  const pastQuests = quests.filter(
    (q) => q.status === "cancelled" || q.status === "completed"
  );

  const activePlayers = players.filter((p) => p.isActive);
  const inactivePlayers = players.filter((p) => !p.isActive);

  const now = new Date();

  


function renderPlayerList(list: typeof players) {
  if (list.length === 0) {
    return <p>No players in this section.</p>;
  }

  return list.map((p) => {
    const priority =
      p.hasPriority ||
      (!!p.priorityUntil && p.priorityUntil > now);

    return (
      <div
        className="stack"
        key={p.id}
        style={{
          borderTop: "1px solid #0002",
          paddingTop: ".6rem",
          marginTop: ".6rem",
        }}
      >
        {/* Player information on the first row */}
        <div>
          <strong>{p.displayName}</strong> ({p.username})
          {" · "}{p.renown} Renown
          {priority ? " · Priority" : ""}
          {p.priorityUntil && !p.hasPriority
            ? ` Until ${fmt(p.priorityUntil)}`
            : ""}
        </div>

        {/* All buttons on the row underneath */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          {p.isActive ? (
  
  <PlayerActionsRow
    userId={p.id}
    hasPriority={priority}
  />

          ) : (
            <>
              <ActionForm
                action={A.reactivatePlayer}
                className="inline"
              >
                <input
                  type="hidden"
                  name="userId"
                  value={p.id}
                />
                <button type="submit">
                  Reactivate Player
                </button>
              </ActionForm>

              <ActionForm
                action={A.resetPlayer}
                className="inline"
              >
                <input
                  type="hidden"
                  name="userId"
                  value={p.id}
                />
                <ConfirmButton
                  message={`Reset "${p.displayName}"? This permanently deletes all inventory items, quest history, achievements, and Renown history, and sets Renown to zero. This cannot be undone.`}
                >
                  Reset Player
                </ConfirmButton>
              </ActionForm>

              <ActionForm
                action={A.deletePlayer}
                className="inline"
              >
                <input
                  type="hidden"
                  name="userId"
                  value={p.id}
                />
                <button type="submit">Delete Player</button>
              </ActionForm>
            </>
          )}
        </div>
      </div>
    );
  });
}



  return (
    <>
      <article className="panel">
        <h1>Player Portal</h1>
        <p><a href="/admin/achievements">Manage Achievements</a></p>
      </article>

      <article className="panel">
        <h2>Active Players ({activePlayers.length})</h2>
        {renderPlayerList(activePlayers)}
      </article>

      <article className="panel">
        <h2>Inactive Players ({inactivePlayers.length})</h2>
        {renderPlayerList(inactivePlayers)}
      </article>

      <article className="panel">
        <h2>Add Player</h2>

        <ActionForm action={A.createPlayer} className="stack">
          <label>
            Display Name
            <input name="displayName" required />
          </label>

          <label>
            Username
            <input
              name="username"
              required
              autoComplete="off"
            />
          </label>

          <label>
            Password
            <input
              name="password"
              type="text"
              required
              minLength={1}
              autoComplete="off"
            />
          </label>

          <label className="checkbox-label">
            Priority
            <input
              name="priority"
              type="checkbox"
              autoComplete="off"
              className="small-checkbox"
            />
          </label>

          <button type="submit">Create Player</button>
        </ActionForm>
      </article>

      <article className="panel">
        <h2>Priority Keys</h2>

        <ActionForm action={A.createKey} className="inline">
          <input
            name="code"
            placeholder="Key code"
            autoComplete="off"
            required
          />

          <input
            name="days"
            type="number"
            min={1}
            defaultValue={5}
            aria-label="Days valid"
          />

          <button type="submit">Create key</button>
        </ActionForm>

        <h3>Active Keys ({keys.length})</h3>
        {keys.length === 0 && <p>No active keys.</p>}

        {keys.map((k) => (
          <div className="row" key={k.id}>
            <span>
              <strong>{k.code}</strong>
              {" "}· {timeLeft(k.expiresAt, now)} Left
              {" "}<small>(until {fmt(k.expiresAt)})</small>
            </span>

            <span className="inline">
              <ActionForm action={A.extendKey} className="inline">
                <input type="hidden" name="keyId" value={k.id} />

                <input
                  name="days"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={1}
                  aria-label={`Days to add to ${k.code}`}
                />

                <button type="submit">Add days</button>
              </ActionForm>

              <ActionForm action={A.deleteKey} className="inline">
                <input type="hidden" name="keyId" value={k.id} />

                <ConfirmButton
                  message={`Delete key "${k.code}"? It will stop working immediately.`}
                >
                  Delete
                </ConfirmButton>
              </ActionForm>
            </span>
          </div>
        ))}
      </article>
    </>
  );
}
