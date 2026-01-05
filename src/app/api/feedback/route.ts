import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST - Create new feedback
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type, message, pageUrl, userAgent } = body;

    if (!type || !message) {
      return NextResponse.json(
        { error: "Type and message are required" },
        { status: 400 }
      );
    }

    if (!["BUG", "FEATURE"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid feedback type" },
        { status: 400 }
      );
    }

    const feedback = await prisma.feedback.create({
      data: {
        userId: session.user.id,
        type,
        message,
        pageUrl,
        userAgent,
      },
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("Feedback error:", error);
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}

// GET - Get all feedback (admin only - checks if user email matches admin)
export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only allow admin email to view all feedback
    const adminEmail = "kikoman200@gmail.com";
    if (session.user.email !== adminEmail) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get("type");
    const unreadOnly = searchParams.get("unread") === "true";

    const where: {
      type?: "BUG" | "FEATURE";
      isRead?: boolean;
    } = {};

    if (typeFilter && ["BUG", "FEATURE"].includes(typeFilter)) {
      where.type = typeFilter as "BUG" | "FEATURE";
    }
    if (unreadOnly) {
      where.isRead = false;
    }

    const feedback = await prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Get user info for each feedback
    const userIds = [...new Set(feedback.map((f) => f.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const feedbackWithUsers = feedback.map((f) => ({
      ...f,
      user: userMap.get(f.userId) || null,
    }));

    // Count unread
    const unreadCount = await prisma.feedback.count({
      where: { isRead: false },
    });

    return NextResponse.json({ feedback: feedbackWithUsers, unreadCount });
  } catch (error) {
    console.error("Feedback fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}

// PATCH - Mark feedback as read/resolved
export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only allow admin
    const adminEmail = "kikoman200@gmail.com";
    if (session.user.email !== adminEmail) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, isRead, isResolved } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Feedback ID is required" },
        { status: 400 }
      );
    }

    const updateData: { isRead?: boolean; isResolved?: boolean } = {};
    if (typeof isRead === "boolean") updateData.isRead = isRead;
    if (typeof isResolved === "boolean") updateData.isResolved = isResolved;

    const feedback = await prisma.feedback.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("Feedback update error:", error);
    return NextResponse.json(
      { error: "Failed to update feedback" },
      { status: 500 }
    );
  }
}

// DELETE - Delete feedback
export async function DELETE(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only allow admin
    const adminEmail = "kikoman200@gmail.com";
    if (session.user.email !== adminEmail) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Feedback ID is required" },
        { status: 400 }
      );
    }

    await prisma.feedback.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feedback delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete feedback" },
      { status: 500 }
    );
  }
}
