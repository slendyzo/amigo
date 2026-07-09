import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveApiToken } from "@/lib/api-token";

// GET - Validate a Shortcuts token ("Test connection" in the setup guide)
export async function GET(request: Request) {
  try {
    const context = await resolveApiToken(request);
    if (!context) {
      return NextResponse.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { name: true, username: true },
    });

    return NextResponse.json({
      success: true,
      message: `Connected to ${context.workspace.name}`,
      workspace: context.workspace.name,
      user: user?.name || user?.username || null,
    });
  } catch (error) {
    console.error("Shortcuts ping error:", error);
    return NextResponse.json(
      { success: false, message: "Something went wrong" },
      { status: 500 }
    );
  }
}
