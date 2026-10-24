import ActionForm from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ITEM_TYPES } from "@/lib/util";
import * as A from "@/app/actions";

type Item = Awaited<ReturnType<typeof loadItems>>[number];

function loadItems(onlyActive: boolean) {
  return db.shopItem.findMany({
    where: onlyActive ? { isActive: true } : {},
    orderBy: { name: "asc" },
    include: {
      links: { orderBy: { createdAt: "asc" } },
      image: { select: { id: true } }, // never load the image bytes here
    },
  });
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

function Thumb({ item }: { item: Item }) {
  if (!item.image) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="thumb" src={`/api/store-image/${item.image.id}`} alt={item.name} />;
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

/* ---------------- Player view (read-only) ---------------- */

function PlayerStore({ items }: { items: Item[] }) {
  return (
    <>
      <article className="panel">
        <h1>Renown Store</h1>
        <p>Items you can spend Renown on. Purchasing is coming soon.</p>
      </article>

      <article className="panel">
        {items.length === 0 && <p>The shelves are empty for now.</p>}
        {items.map((item) => (
          <div className="item shopcard" key={item.id}>
            <Thumb item={item} />
            <div className="stack">
              <h2 style={{ margin: 0 }}>{item.name}</h2>
              <p style={{ margin: 0 }}>
                <span className="cap">{item.type}</span> · <strong>{item.price} Renown</strong>
              </p>
              {item.description && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{item.description}</p>}
              {item.statSheet && (
                <details>
                  <summary>Stat sheet</summary>
                  <p style={{ whiteSpace: "pre-wrap" }}>{item.statSheet}</p>
                </details>
              )}
              {item.links.length > 0 && (
                <p style={{ margin: 0 }}>
                  <strong>Find it online:</strong>{" "}
                  {item.links.map((l, i) => (
                    <span key={l.id}>
                      {i > 0 && " · "}
                      <a href={l.url} target="_blank" rel="noopener noreferrer">
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
    </>
  );
}

/* ---------------- Admin view ---------------- */

function ItemRow({ item }: { item: Item }) {
  // Remount the edit form whenever saved values change so fields show what is saved.
  const formKey = [item.name, item.description, item.price, item.type, item.image?.id ?? "", item.statSheet].join("|");

  return (
    <details className="item">
      <summary>
        <strong>{item.name}</strong>
        <span>
          · <span className="cap">{item.type}</span> · {item.price} Renown
          {item.links.length > 0 ? ` · ${item.links.length} source link${item.links.length === 1 ? "" : "s"}` : ""}
        </span>
      </summary>

      <div className="stack" style={{ paddingTop: ".6rem" }}>
        <ActionForm key={formKey} action={A.updateItem} className="stack">
          <input type="hidden" name="itemId" value={item.id} />
          <label>
            Name
            <input name="name" defaultValue={item.name} required maxLength={100} />
          </label>
          <label>
            Description
            <textarea name="description" rows={2} defaultValue={item.description} />
          </label>
          <div className="grid2">
            <label>
              Price (Renown)
              <input name="price" type="number" min={0} step={1} defaultValue={item.price} required />
            </label>
            <label>
              Type
              <TypeSelect defaultValue={item.type} />
            </label>
          </div>

          <div className="stack">
            {item.image && <Thumb item={item} />}
            <label>
              {item.image ? "Replace image" : "Image"} (PNG, JPEG, WebP or GIF, up to 2 MB)
              <input name="image" type="file" accept={IMAGE_ACCEPT} />
            </label>
            {item.image && (
              <label className="checkbox-label">
                Remove current image
                <input name="removeImage" type="checkbox" className="small-checkbox" />
              </label>
            )}
          </div>

          <label>
            Stat sheet
            <textarea name="statSheet" rows={5} defaultValue={item.statSheet} />
          </label>
          <div className="inline">
            <button type="submit">Save changes</button>
            <button type="reset">Cancel changes</button>
          </div>
        </ActionForm>

        {/* ---------- Source links (separate forms: HTML can't nest forms) ---------- */}
        <div className="stack">
          <h3 style={{ margin: 0 }}>Source links (visible to players)</h3>
          {item.links.length === 0 && <p style={{ margin: 0 }}>No source links yet.</p>}
          {item.links.map((l) => (
            <ActionForm key={l.id} action={A.removeItemLink} className="row">
              <span>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>{" "}
                <small>({host(l.url)})</small>
              </span>
              <input type="hidden" name="linkId" value={l.id} />
              <button>Remove link</button>
            </ActionForm>
          ))}
          <ActionForm action={A.addItemLink} className="inline">
            <input type="hidden" name="itemId" value={item.id} />
            <input name="label" placeholder="Label (e.g. D&D Beyond)" aria-label="Link label" maxLength={60} />
            <input name="url" placeholder="https://..." aria-label="Link address" required />
            <button>Add link</button>
          </ActionForm>
        </div>

        <div className="inline">
          <ActionForm action={A.setItemActive} className="inline">
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="value" value={item.isActive ? "0" : "1"} />
            <button>{item.isActive ? "Archive (hide from store)" : "Restore to store"}</button>
          </ActionForm>
          {!item.isActive && (
            <ActionForm action={A.deleteItem} className="inline">
              <input type="hidden" name="itemId" value={item.id} />
              <button>Delete permanently</button>
            </ActionForm>
          )}
        </div>
      </div>
    </details>
  );
}

function AdminStore({ items }: { items: Item[] }) {
  const active = items.filter((i) => i.isActive);
  const archived = items.filter((i) => !i.isActive);

  return (
    <>
      <article className="panel">
        <h1>Renown Store</h1>
        <p>Create and manage store items. Players see active items, including any source links you add.</p>
      </article>

      <article className="panel">
        <h2>Items ({active.length})</h2>
        {active.length === 0 && <p>No items yet. Add your first one below.</p>}
        {active.map((i) => (
          <ItemRow key={i.id} item={i} />
        ))}
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
            <textarea name="description" rows={2} />
          </label>
          <div className="grid2">
            <label>
              Price (Renown)
              <input name="price" type="number" min={0} step={1} defaultValue={100} required />
            </label>
            <label>
              Type
              <TypeSelect />
            </label>
          </div>
          <label>
            Image (optional; PNG, JPEG, WebP or GIF, up to 2 MB)
            <input name="image" type="file" accept={IMAGE_ACCEPT} />
          </label>
          <label>
            Stat sheet
            <textarea name="statSheet" rows={5} placeholder="Abilities, charges, attunement, etc." />
          </label>
          <div className="grid2">
            <label>
              Source link label (optional)
              <input name="linkLabel" placeholder="e.g. D&D Beyond" maxLength={60} />
            </label>
            <label>
              Source link address (optional)
              <input name="linkUrl" placeholder="https://..." />
            </label>
          </div>
          <button>Create Item</button>
        </ActionForm>
      </article>

      {archived.length > 0 && (
        <article className="panel">
          <h2>Archived ({archived.length})</h2>
          <p>Hidden from players. Restore an item to bring it back, or delete it permanently.</p>
          {archived.map((i) => (
            <ItemRow key={i.id} item={i} />
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
  return isAdmin ? <AdminStore items={items} /> : <PlayerStore items={items} />;
}