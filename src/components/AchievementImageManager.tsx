
"use client";

import { useState } from "react";

const IMAGE_TYPES = [
  { key: "common", label: "Common" },
  { key: "uncommon", label: "Uncommon" },
  { key: "rare", label: "Rare" },
  { key: "platinum", label: "Platinum" },
  { key: "secret", label: "Secret" },
  { key: "locked", label: "Locked" },
] as const;

export default function AchievementImageManager({
  existingImages,
}: {
  existingImages: string[];
}) {
  const [images, setImages] = useState(existingImages);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function uploadImage(key: string, file?: File) {
    if (!file) return;

    setBusy(key);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(`/api/achievement-images/${key}`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Upload Failed.");
      }

      setImages((current) =>
        current.includes(key) ? current : [...current, key]
      );

      setMessage(`${key} Image Uploaded Successfully.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Upload Failed."
      );
    } finally {
      setBusy(null);
    }
  }

  async function removeImage(key: string) {
    if (!window.confirm(`Remove the ${key} achievement image?`)) {
      return;
    }

    setBusy(key);
    setMessage("");

    try {
      const response = await fetch(`/api/achievement-images/${key}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Could not remove the image.");
      }

      setImages((current) => current.filter((x) => x !== key));
      setMessage(`${key} Image Removed.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Removal failed."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <h2>Achievement Images</h2>

      <p>
        Upload one shared image for each rarity and special achievement
        state. Images can be replaced or removed at any time.
      </p>

      {IMAGE_TYPES.map(({ key, label }) => (
        <div
          key={key}
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: ".75rem",
            borderTop: "1px solid #0002",
            paddingTop: ".75rem",
          }}
        >
          {/* Image type and upload status */}
          <div style={{ minWidth: "100px" }}>
            <strong>{label}</strong>
            <br />
            <small>
              {images.includes(key) ? "Image Uploaded" : "No image"}
            </small>
          </div>

          {/* Image preview - fixed size and position */}
          {images.includes(key) && (
            <img
              src={`/api/achievement-images/${key}`}
              alt={`${label} achievement`}
              style={{
                width: "64px",
                height: "64px",
                objectFit: "contain",
                borderRadius: "8px",
                flexShrink: 0,
              }}
            />
          )}

          {/* Upload and Remove controls */}
          
{/* Upload and Remove controls */}
<div
  style={{
    display: "flex",
    alignItems: "flex-end",
    gap: ".5rem",
  }}
>
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: ".25rem",
    }}
  >
    <label style={{ margin: 0 }}>
  Upload {label} Image
</label>

    <input
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      disabled={busy !== null}
      aria-label={`Upload ${label} image`}
      onChange={(e) => {
        void uploadImage(key, e.target.files?.[0]);
        e.currentTarget.value = "";
      }}
      style={{
        height: "40px",
        boxSizing: "border-box",
        margin: 0,
      }}
    />
  </div>

  {images.includes(key) && (
    <button
      type="button"
      disabled={busy !== null}
      onClick={() => void removeImage(key)}
      style={{
        height: "40px",
        boxSizing: "border-box",
        margin: 0,
        whiteSpace: "nowrap",
      }}
    >
      Remove
    </button>
  )}
</div>


          {/* Processing indicator */}
          {busy === key && <small>Processing...</small>}
        </div>
      ))}

      {message && <p role="status">{message}</p>}
    </div>
  );
}
