"use client";
import { useEffect, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";

type Action = (fd: FormData) => Promise<string | void>;

// Buy button for a store item. Shows a banner across the top of the screen:
// red if the purchase fails (including "can't afford it"), green if it works.
export default function BuyForm({
  action,
  itemId,
  itemName,
  price,
  renown,
}: {
  action: Action;
  itemId: string;
  itemName: string;
  price: number;
  renown: number;
}) {
  const [banner, setBanner] = useState<{ text: string; ok: boolean } | null>(null);
  const canAfford = renown >= price;

  // Auto-hide after a few seconds.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  async function run(fd: FormData) {
    if (!canAfford) {
      setBanner({ text: `You don't have enough Renown to buy "${itemName}".`, ok: false });
      return;
    }
    const msg = await action(fd);
    // buyItem's success message always starts with "You bought"; anything else is an error.
    if (msg) setBanner({ text: msg, ok: msg.startsWith("You bought") });
  }

  return (
    <>
      <form action={run}>
        <input type="hidden" name="itemId" value={itemId} />
        {canAfford ? (
          <ConfirmButton message={`Spend ${price} Renown on "${itemName}"?`}>Buy</ConfirmButton>
        ) : (
          <button type="submit">Buy</button>
        )}
      </form>
      {banner && (
        <div className={banner.ok ? "banner ok" : "banner"} role={banner.ok ? "status" : "alert"}>
          <span>{banner.text}</span>
          <button type="button" className="banner-close" aria-label="Dismiss" onClick={() => setBanner(null)}>
            ×
          </button>
        </div>
      )}
    </>
  );
}