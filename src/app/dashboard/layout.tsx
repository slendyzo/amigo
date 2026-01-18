import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { LocaleSync } from "@/components/locale-sync";
import { prisma } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  // Get user's active workspace info for the shell
  let workspaceName = "Personal";
  let workspaceType: "PERSONAL" | "SHARED" = "PERSONAL";
  let workspaceLanguage = "en";

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { activeWorkspaceId: true },
    });

    if (user?.activeWorkspaceId) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: user.activeWorkspaceId },
        select: { name: true, type: true, language: true },
      });
      if (workspace) {
        workspaceName = workspace.name;
        workspaceType = workspace.type as "PERSONAL" | "SHARED";
        workspaceLanguage = workspace.language || "en";
      }
    } else {
      // Fallback to first workspace
      const membership = await prisma.workspaceMember.findFirst({
        where: { userId: session.user.id },
        include: { workspace: { select: { name: true, type: true, language: true } } },
        orderBy: { createdAt: "asc" },
      });
      if (membership) {
        workspaceName = membership.workspace.name;
        workspaceType = membership.workspace.type as "PERSONAL" | "SHARED";
        workspaceLanguage = membership.workspace.language || "en";
      }
    }
  } catch (error) {
    console.error("Error fetching workspace for layout:", error);
  }

  return (
    <DashboardShell
      userEmail={session.user.email || undefined}
      workspaceName={workspaceName}
      workspaceType={workspaceType}
    >
      <LocaleSync workspaceLanguage={workspaceLanguage} />
      {children}
    </DashboardShell>
  );
}
