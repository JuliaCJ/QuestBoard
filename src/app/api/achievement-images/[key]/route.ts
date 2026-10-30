import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const IMAGE_KEYS = [
  "common",
  "uncommon",
  "rare",
  "platinum",
  "secret",
  "locked",
] as const;

type ImageKey = (typeof IMAGE_KEYS)[number];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

function validKey(key: string): key is ImageKey {
  return IMAGE_KEYS.includes(key as ImageKey);
}

async function getAdmin() {
  const user = await currentUser();

  if (!user || user.role !== "admin") {
    return null;
  }

  return user;
}

// Retrieve an achievement image.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const { key } = await params;

  if (!validKey(key)) {
    return NextResponse.json(
      { error: "Invalid image key." },
      { status: 400 }
    );
  }

  const img = await db.achievementImage.findUnique({
    where: { key },
  });

  if (!img) {
    return NextResponse.json(
      { error: "Image not found." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// Upload or replace an achievement image.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    if (!(await getAdmin())) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { key } = await params;

    if (!validKey(key)) {
      return NextResponse.json(
        { error: "Invalid image key." },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("image");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Choose an image first." },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Use a PNG, JPG, WebP, or GIF image." },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: "Images must be 5 MB or smaller." },
        { status: 400 }
      );
    }

    const data = Buffer.from(await file.arrayBuffer());

    await db.achievementImage.upsert({
      where: { key },
      create: {
        key,
        mime: file.type,
        data,
      },
      update: {
        mime: file.type,
        data,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Achievement image upload error:", error);

    return NextResponse.json(
      { error: "The image upload failed. Check the server console." },
      { status: 500 }
    );
  }
}

// Delete an achievement image.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    if (!(await getAdmin())) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { key } = await params;

    if (!validKey(key)) {
      return NextResponse.json(
        { error: "Invalid image key." },
        { status: 400 }
      );
    }

    await db.achievementImage.deleteMany({
      where: { key },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Achievement image deletion error:", error);

    return NextResponse.json(
      { error: "The image could not be deleted." },
      { status: 500 }
    );
  }
}