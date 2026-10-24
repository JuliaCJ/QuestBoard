
import ActionForm from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt } from "@/lib/util";
import * as A from "@/app/actions";
import PlayerEditor from "@/components/PlayerEditor";

export default async function Admin() {
  await requireAdmin();

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
      orderBy: [
        { isActive: "desc" },
        { displayName: "asc" },
      ],
    }),

    db.priorityKey.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { redeemedBy: true },
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
          <div className="row" style={{ border: 0, padding: 0 }}>
            <span>
              <strong>{p.displayName}</strong> ({p.username})
              {" · "}{p.renown} Renown
              {priority ? " · priority" : ""}
              {p.priorityUntil && !p.hasPriority
                ? ` until ${fmt(p.priorityUntil)}`
                : ""}
            </span>

            <span className="inline">
              {p.isActive ? (
                <ActionForm action={A.setPriority} className="inline">
                  <input type="hidden" name="userId" value={p.id} />
                  <input
                    type="hidden"
                    name="value"
                    value={p.hasPriority ? "0" : "1"}
                  />
                  <button>
                    {p.hasPriority ? "Remove priority" : "Grant priority"}
                  </button>
                </ActionForm>
              ) : (
                <ActionForm
                  action={A.reactivatePlayer}
                  className="inline"
                >
                  <input type="hidden" name="userId" value={p.id} />
                  <button>Reactivate player</button>
                </ActionForm>
              )}

              {p.isActive && (
                <ActionForm action={A.deactivate} className="inline">
                  <input type="hidden" name="userId" value={p.id} />
                  <button>Remove player</button>
                </ActionForm>
              )}
            </span>
          </div>

          <div className="inline">
  {p.isActive && <PlayerEditor userId={p.id} />}

  <ActionForm action={A.deletePlayer} className="inline">
    <input type="hidden" name="userId" value={p.id} />
    <button>Delete</button>
  </ActionForm>
</div>
        </div>
      );
    });
  }

  return (
    <>
      <article className="panel">
        <h1>Player Portal</h1>
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
            <input name="username" required autoComplete="off" />
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

          <button>Create Player</button>
        </ActionForm>
      </article>

      <article className="panel">
        <h2>Priority keys</h2>

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
          <button>Create key</button>
        </ActionForm>

        {keys.map((k) => (
          <div className="row" key={k.id}>
            <span>
              <strong>{k.code}</strong>
            </span>
            <span>
              {k.redeemedBy
                ? `redeemed by ${k.redeemedBy.displayName}`
                : k.expiresAt < now
                  ? "expired"
                  : `valid until ${fmt(k.expiresAt)}`}
            </span>
          </div>
        ))}
      </article>
    </>
  );
}
