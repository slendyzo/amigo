import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { generateInsight } from "@/lib/glm";
import { aggregateNudgeCandidates } from "@/lib/insight-aggregator";
import { buildNudgeProjectPrompt } from "@/lib/prompts/nudge-project";

// ── Types ─────────────────────────────────────────────────────────────────────

type ClusterExpense = { id: string; name: string; amount: number; date: string };

type ClusterResult = {
  theme: string;
  suggestedProjectName: string;
  expenses: ClusterExpense[];
};

type GetResponse = {
  clusters: ClusterResult[];
  existingProjects: Array<{ id: string; name: string }>;
};

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getActiveWorkspace();
  if (!ctx) {
    return NextResponse.json({ error: "No workspace" }, { status: 401 });
  }

  const { workspace, userId } = ctx;
  const workspaceId = workspace.id;

  // Fetch existing projects in parallel with seed aggregation
  const [nudgeCandidates, existingProjects] = await Promise.all([
    aggregateNudgeCandidates(workspaceId),
    prisma.project.findMany({
      where: { workspaceId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const seeds = nudgeCandidates.potentialClusterSeeds;

  if (seeds.length < 4) {
    return NextResponse.json<GetResponse>({ clusters: [], existingProjects });
  }

  const prompt = buildNudgeProjectPrompt({ expenses: seeds });

  const locale = (
    workspace.language === "pt-PT" || workspace.language === "fr-FR"
      ? workspace.language
      : "en-GB"
  ) as "en-GB" | "pt-PT" | "fr-FR";

  let clusterOutput = null;
  try {
    clusterOutput = await generateInsight({
      userId,
      bucket: "live",
      promptType: "nudge-project",
      locale,
      systemPromptExtra: prompt.systemPromptExtra,
      userMessage: prompt.userMessage,
      tool: prompt.tool,
      schema: prompt.schema,
      maxTokens: 1024,
    });
  } catch (err) {
    console.error("[nudge-project] generateInsight error:", err);
    // Graceful degrade — return empty clusters, still return existingProjects
    return NextResponse.json<GetResponse>({ clusters: [], existingProjects });
  }

  if (!clusterOutput || clusterOutput.clusters.length === 0) {
    return NextResponse.json<GetResponse>({ clusters: [], existingProjects });
  }

  // Build a map of seed ids for fast O(1) lookup
  const seedMap = new Map<string, ClusterExpense>(
    seeds.map((s) => [s.id, s])
  );

  // Resolve clusters — filter out any ids not in the seed set
  const clusters: ClusterResult[] = clusterOutput.clusters
    .map((cluster) => {
      const validExpenses = cluster.expenseIds
        .filter((id) => seedMap.has(id))
        .map((id) => seedMap.get(id)!);

      if (validExpenses.length < 3) return null;

      return {
        theme: cluster.theme,
        suggestedProjectName: cluster.suggestedProjectName,
        expenses: validExpenses,
      };
    })
    .filter((c): c is ClusterResult => c !== null);

  return NextResponse.json<GetResponse>({ clusters, existingProjects });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getActiveWorkspace();
  if (!ctx) {
    return NextResponse.json({ error: "No workspace" }, { status: 401 });
  }

  const workspaceId = ctx.workspace.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { expenseIds, projectId, newProjectName } = body as Record<string, unknown>;

  if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
    return NextResponse.json({ error: "expenseIds must be a non-empty array" }, { status: 400 });
  }

  const hasProjectId = typeof projectId === "string" && projectId.length > 0;
  const hasNewName = typeof newProjectName === "string" && newProjectName.trim().length > 0;

  if (!hasProjectId && !hasNewName) {
    return NextResponse.json({ error: "Provide either projectId or newProjectName" }, { status: 400 });
  }
  if (hasProjectId && hasNewName) {
    return NextResponse.json({ error: "Provide either projectId or newProjectName, not both" }, { status: 400 });
  }

  // Verify all expenseIds belong to the workspace
  const idsToTag = expenseIds as string[];
  const ownedCount = await prisma.expense.count({
    where: { id: { in: idsToTag }, workspaceId },
  });
  if (ownedCount !== idsToTag.length) {
    return NextResponse.json({ error: "One or more expenses not found in workspace" }, { status: 403 });
  }

  let resolvedProjectId: string;

  if (hasNewName) {
    const newProject = await prisma.project.create({
      data: {
        workspaceId,
        name: (newProjectName as string).trim().slice(0, 100),
      },
    });
    resolvedProjectId = newProject.id;
  } else {
    // Verify existing project belongs to workspace
    const existing = await prisma.project.findFirst({
      where: { id: projectId as string, workspaceId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Project not found in workspace" }, { status: 403 });
    }
    resolvedProjectId = existing.id;
  }

  // Connect expenses to project in a transaction
  await prisma.$transaction(
    idsToTag.map((id) =>
      prisma.expense.update({
        where: { id },
        data: { projects: { connect: { id: resolvedProjectId } } },
      })
    )
  );

  return NextResponse.json({ projectId: resolvedProjectId, expensesTagged: idsToTag.length });
}
