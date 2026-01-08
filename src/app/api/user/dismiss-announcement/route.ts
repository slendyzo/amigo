import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { announcementId } = await request.json();

    if (!announcementId || typeof announcementId !== "string") {
      return NextResponse.json(
        { error: "Invalid announcement ID" },
        { status: 400 }
      );
    }

    // Get current user's seen announcements
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { seenAnnouncements: true },
    });

    // Add the announcement ID if not already seen
    const currentSeen = user?.seenAnnouncements || [];
    if (!currentSeen.includes(announcementId)) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          seenAnnouncements: [...currentSeen, announcementId],
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error dismissing announcement:", error);
    return NextResponse.json(
      { error: "Failed to dismiss announcement" },
      { status: 500 }
    );
  }
}
