import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import sharp from "sharp";

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed image types
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed." },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Read file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Select compression profile based on purpose
    const { searchParams } = new URL(request.url);
    const purpose = searchParams.get("purpose");

    let compressedBuffer: Buffer;
    if (purpose === "expense") {
      // Expense receipts: higher res for readability, aggressive compression
      compressedBuffer = await sharp(buffer)
        .resize(1200, 1200, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 60, effort: 6 })
        .toBuffer();
    } else {
      // Default (feedback screenshots): smaller dimensions
      compressedBuffer = await sharp(buffer)
        .resize(800, 600, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 70 })
        .toBuffer();
    }

    // Convert to base64 data URL
    const base64 = compressedBuffer.toString("base64");
    const imageUrl = `data:image/webp;base64,${base64}`;

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
