import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { aiProcessingEnabled: true, aiConsentAt: true },
    });

    return NextResponse.json({
      aiProcessingEnabled: user?.aiProcessingEnabled ?? false,
      aiConsentAt: user?.aiConsentAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("Error fetching AI consent:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action !== "enable" && action !== "decline") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        aiProcessingEnabled: action === "enable",
        aiConsentAt: new Date(),
      },
      select: { aiProcessingEnabled: true, aiConsentAt: true },
    });

    return NextResponse.json({
      aiProcessingEnabled: updated.aiProcessingEnabled,
      aiConsentAt: updated.aiConsentAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("Error updating AI consent:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
