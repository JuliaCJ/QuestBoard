
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import BuyForm from "@/components/BuyForm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ITEM_TYPES } from "@/lib/util";
import * as A from "@/app/actions";

type Item = Awaited<ReturnType<typeof loadItems>>[number];
type Label = Awaited<ReturnType<typeof loadLabels>>[number];

function loadLabels() {
  return db.itemLabel.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  });
}

function loadItems(onlyActive: boolean) {
  return db.shopItem.findMany({
    where: onlyActive ? { isActive: true } : {},
    orderBy: { name: "asc" },
    include: {
      label: true,
      links: { orderBy: { createdAt: "asc" } },
      image: { select: { id: true } },
    },
  });
}

// Groups items by label, labels sorted A-Z; items keep their existing name order.
function groupByLabel(items: Item[]) {
  const groups = new Map<string, { label: Item["label"]; items: Item[] }>();

  for (const item of items) {
    const g = groups.get(item.labelId);

    if (g) {
      g.items.push(item);
    } else {
      groups.set(item.labelId, { label: item.label, items: [item] });
    }
  }

  return [...groups.values()].sort((a, b) =>
    a.label.name.localeCompare(b.label.name)
  );
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

function Thumb({ item, small }: { item: Item; small?: boolean }) {
  if (!item.image) {
    return small ? (
      <span className="thumb thumb-sm thumb-empty" aria-hidden="true" />
    ) : null;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      className={small ? "thumb thumb-sm" : "thumb"}
      src={`/api/store-image/${item.image.id}`}
      alt={small ? "" : item.name}
    />
  );
}

function TypeSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="type" defaultValue={defaultValue ?? ITEM_TYPES[0]}>
      {ITEM_TYPES.map((t) => (
        <option key={t} value={t}>
          {t[0].toUpperCase() + t.slice(1)}
        </option>
      ))}
    </select>
  );
}

function LabelSelect({
  labels,
  defaultValue,
}: {
  labels: Label[];
  defaultValue?: string;
}) {
  return (
    <select name="labelId" defaultValue={defaultValue ?? ""} required>
      <option value="" disabled>
        Choose a label…
      </option>

      {labels.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

/* ---------------- Player view ---------------- */

function PlayerStore({
  items,
  renown,
}: {
  items: Item[];
  renown: number;
}) {
  return (
    <>
      <article className="panel">
        <h1>Renown Store</h1>
        <p>Items you can spend Renown on.</p>
        <p>
          <strong>Your Renown:</strong> {renown}
        </p>
      </article>

      {items.length === 0 && (
        <article className="panel">
          <p>The shelves are empty for now.</p>
        </article>
      )}

      {groupByLabel(items).map(({ label, items: group }) => (
        <article className="panel" key={label.id}>
          <h2>
            {label.name} ({group.length})
          </h2>

          {group.map((item) => (
            <div className="item shopcard" key={item.id}>
  <Thumb item={item} />

  <div className="stack" style={{ flex: 1, minWidth: 0 }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        width: "100%",
      }}
    >
      <h3
        style={{
          margin: 0,
          fontFamily: "var(--head), Georgia, serif",
          fontWeight: 400,
          fontSize: "1.4rem",
        }}
      >
        {item.name}
      </h3>

      <BuyForm
        action={A.buyItem}
        itemId={item.id}
        itemName={item.name}
        price={item.price}
        renown={renown}
      />
    </div>

    <p style={{ margin: 0 }}>
      <span className="cap">{item.type}</span>
      {" · "}
      <strong>{item.price} Renown</strong>
    </p>

    {item.description && (
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
        {item.description}
      </p>
    )}

    {item.links.length > 0 && (
      <p style={{ margin: 0 }}>
        <strong>Find it Online:</strong>{" "}
        {item.links.map((l, i) => (
          <span key={l.id}>
            {i > 0 && " · "}
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {l.label}
            </a>
          </span>
        ))}
      </p>
    )}
  </div>
</div>
      ))}
        </article>
      ))}
    </>
  );
}

/* ---------------- Admin view ---------------- */

function ItemRow({ item, labels }: { item: Item; labels: Label[] }) {
  // Remount the edit form whenever saved values change.
  const formKey = [
    item.name,
    item.description,
    item.price,
    item.type,
    item.labelId,
    item.image?.id ?? "",
  ].join("|");

  return (
    <details className="item">
      <summary>
        <Thumb item={item} small />
        <strong>{item.name}</strong>
        <span>
          {" · "}
          {item.label.name}
          {" · "}
          <span className="cap">{item.type}</span>
          {" · "}
          {item.price} Renown
          {item.links.length > 0
            ? ` · ${item.links.length} Source Link${
                item.links.length === 1 ? "" : "s"
              }`
            : ""}
        </span>
      </summary>

      <div className="stack" style={{ paddingTop: ".6rem" }}>
        <ActionForm
          key={formKey}
          action={A.updateItem}
          className="stack"
        >
          <input type="hidden" name="itemId" value={item.id} />

          <label>
            Name
            <input
              name="name"
              defaultValue={item.name}
              required
              maxLength={100}
            />
          </label>

          <label>
            Description
            <textarea
              name="description"
              rows={10}
              defaultValue={item.description}
            />
          </label>

          <div className="grid2">
            <label>
              Price (Renown)
              <input
                name="price"
                type="number"
                min={0}
                step={1}
                defaultValue={item.price}
                required
              />
            </label>

            <label>
              Type
              <TypeSelect defaultValue={item.type} />
            </label>

            <label>
              Label
              <LabelSelect
                labels={labels}
                defaultValue={item.labelId}
              />
            </label>
          </div>

          <div className="stack">
            {item.image && <Thumb item={item} />}

            <label>
              {item.image ? "Replace Image" : "Image"} (PNG, JPEG, WebP or GIF, up to 2 MB)
              <input
                name="image"
                type="file"
                accept={IMAGE_ACCEPT}
              />
            </label>

            {item.image && (
              <label className="checkbox-label">
                Remove Current Image
                <input
                  name="removeImage"
                  type="checkbox"
                  className="small-checkbox"
                />
              </label>
            )}
          </div>

          <div className="inline">
            <button type="submit">Save changes</button>
            <button type="reset">Cancel changes</button>
          </div>
        </ActionForm>

        {/* Source links are separate forms; HTML forms cannot be nested. */}
        <div className="stack">
          <h3 style={{ margin: 0 }}>
            Source Links (Visible to Players)
          </h3>

          {item.links.length === 0 && (
            <p style={{ margin: 0 }}>No source links yet.</p>
          )}

          {item.links.map((l) => (
            <ActionForm
              key={l.id}
              action={A.removeItemLink}
              className="row"
            >
              <span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {l.label}
                </a>{" "}
                <small>({host(l.url)})</small>
              </span>

              <input type="hidden" name="linkId" value={l.id} />
              <button>Remove Link</button>
            </ActionForm>
          ))}

          <ActionForm action={A.addItemLink} className="inline">
            <input type="hidden" name="itemId" value={item.id} />

            <input
              name="label"
              placeholder="Label (e.g. D&D Beyond)"
              aria-label="Link label"
              maxLength={60}
            />

            <input
              name="url"
              placeholder="https://..."
              aria-label="Link address"
              required
            />

            <button>Add Link</button>
          </ActionForm>
        </div>

        <div className="inline">
          <ActionForm action={A.setItemActive} className="inline">
            <input type="hidden" name="itemId" value={item.id} />
            <input
              type="hidden"
              name="value"
              value={item.isActive ? "0" : "1"}
            />

            <button>
              {item.isActive
                ? "Archive (Hide from Store)"
                : "Restore to Store"}
            </button>
          </ActionForm>

          <ActionForm action={A.deleteItem} className="inline">
            <input type="hidden" name="itemId" value={item.id} />

            <ConfirmButton
              message={`Permanently Delete "${item.name}"? This also removes its image and source links, and can't be undone.`}
            >
              Delete permanently
            </ConfirmButton>
          </ActionForm>
        </div>
      </div>
    </details>
  );
}

function AdminStore({
  items,
  labels,
}: {
  items: Item[];
  labels: Label[];
}) {
  const active = items.filter((i) => i.isActive);
  const archived = items.filter((i) => !i.isActive);

  return (
    <>
      <article className="panel">
        <h1>Renown Store</h1>
        <p>
          Create and manage store items. Players see active items,
          including any source links you add.
        </p>
      </article>

      {active.length === 0 && (
        <article className="panel">
          <h2>Items (0)</h2>
          <p>No items yet. Add your first one below.</p>
        </article>
      )}

      {groupByLabel(active).map(({ label, items: group }) => (
        <article className="panel" key={label.id}>
          <h2>
            {label.name} ({group.length})
          </h2>

          {group.map((i) => (
            <ItemRow key={i.id} item={i} labels={labels} />
          ))}
        </article>
      ))}

      <article className="panel">
        <h2>Labels ({labels.length})</h2>
        <p>
          Every item gets exactly one label. A label can only be deleted
          when no item uses it.
        </p>

        {labels.length === 0 && (
          <p>
            No labels yet. Add one below (for example Weapon, Armor,
            Potion).
          </p>
        )}

        {labels.map((l) => (
          <div className="row" key={l.id}>
            <ActionForm
              key={l.id + l.name}
              action={A.renameLabel}
              className="inline"
            >
              <input type="hidden" name="labelId" value={l.id} />

              <input
                name="name"
                defaultValue={l.name}
                aria-label={`Rename ${l.name}`}
                maxLength={30}
                required
              />

              <button>Rename</button>
            </ActionForm>

            <ActionForm action={A.deleteLabel} className="inline">
              <input type="hidden" name="labelId" value={l.id} />

              <small>
                {l._count.items} item{l._count.items === 1 ? "" : "s"}
              </small>

              <button
                disabled={l._count.items > 0}
                title={
                  l._count.items > 0
                    ? "Re-label its items first"
                    : undefined
                }
              >
                Delete
              </button>
            </ActionForm>
          </div>
        ))}

        <ActionForm action={A.createLabel} className="inline">
          <input
            name="name"
            placeholder="New label (e.g. Weapon)"
            aria-label="New label name"
            maxLength={30}
            required
          />

          <button>Add label</button>
        </ActionForm>
      </article>

      <article className="panel">
        <h2>New Item</h2>

        <ActionForm action={A.createItem} className="stack">
          <label>
            Name
            <input name="name" required maxLength={100} />
          </label>

          <label>
            Description
            <textarea name="description" rows={10} />
          </label>

          <div className="grid2">
            <label>
              Price (Renown)
              <input
                name="price"
                type="number"
                min={0}
                step={1}
                defaultValue={100}
                required
              />
            </label>

            <label>
              Type
              <TypeSelect />
            </label>

            <label>
              Label
              <LabelSelect labels={labels} />
            </label>
          </div>

          {labels.length === 0 && (
            <p className="note">
              Add a label in the Labels panel first.
            </p>
          )}

          <label>
            Image (optional; PNG, JPEG, WebP or GIF, up to 2 MB)
            <input
              name="image"
              type="file"
              accept={IMAGE_ACCEPT}
            />
          </label>

          <div className="grid2">
            <label>
              Source Link Label (optional)
              <input
                name="linkLabel"
                placeholder="e.g. D&D Beyond"
                maxLength={60}
              />
            </label>

            <label>
              Source Link Address (optional)
              <input name="linkUrl" placeholder="https://..." />
            </label>
          </div>

          <button>Create Item</button>
        </ActionForm>
      </article>

      {archived.length > 0 && (
        <article className="panel">
          <h2>Archived ({archived.length})</h2>
          <p>
            Hidden from players. Restore an item to bring it back, or
            delete it permanently.
          </p>

          {archived.map((i) => (
            <ItemRow key={i.id} item={i} labels={labels} />
          ))}
        </article>
      )}
    </>
  );
}

export default async function StorePage() {
  const u = await requireUser();
  const isAdmin = u.role === "admin";
  const items = await loadItems(!isAdmin);

  if (!isAdmin) {
    return <PlayerStore items={items} renown={u.renown} />;
  }

  return <AdminStore items={items} labels={await loadLabels()} />;
}
