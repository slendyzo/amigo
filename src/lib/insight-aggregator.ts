/**
 * AI Advisor pre-aggregation layer.
 *
 * Pure functions — no LLM calls, no DB writes, no side effects.
 * All math runs in Postgres via Prisma aggregates; only compact JSON summaries
 * are returned for downstream use by the advisor.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { ExpenseType, InsightType } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function monthBounds(year: number, month: number): { gte: Date; lt: Date } {
  return {
    gte: new Date(year, month - 1, 1),
    lt: new Date(year, month, 1),
  };
}

function normalizeKey(value: string | null | undefined, fallback: string): string {
  return (value ?? fallback).toLowerCase().trim();
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// aggregateMonth
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthAggregate {
  total: number;
  expenseCount: number;
  byType: Record<
    "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT" | "INVESTMENT",
    number
  >;
  byCategory: Array<{ name: string; total: number; count: number }>;
  topMerchants: Array<{ name: string; total: number; count: number }>;
  momDiff: {
    totalPct: number | null;
    byCategory: Record<string, number>;
  };
  untaggedCount: number;
}

export async function aggregateMonth(
  workspaceId: string,
  year: number,
  month: number
): Promise<MonthAggregate> {
  const bounds = monthBounds(year, month);

  // ── Total + count ───────────────────────────────────────────────────────────
  const totalAgg = await prisma.expense.aggregate({
    where: { workspaceId, date: bounds },
    _sum: { amountEur: true },
    _count: { id: true },
  });
  const total = Number(totalAgg._sum.amountEur ?? 0);
  const expenseCount = totalAgg._count.id;

  // ── By type (groupBy type, sum amountEur) ──────────────────────────────────
  const byTypeRows = await prisma.expense.groupBy({
    by: ["type"],
    where: { workspaceId, date: bounds },
    _sum: { amountEur: true },
  });

  const byType: MonthAggregate["byType"] = {
    SURVIVAL_FIXED: 0,
    SURVIVAL_VARIABLE: 0,
    LIFESTYLE: 0,
    PROJECT: 0,
    INVESTMENT: 0,
  };
  for (const row of byTypeRows) {
    byType[row.type] = Number(row._sum.amountEur ?? 0);
  }

  // ── By category (groupBy categoryId, join names) ───────────────────────────
  const byCatRows = await prisma.expense.groupBy({
    by: ["categoryId"],
    where: { workspaceId, date: bounds, categoryId: { not: null } },
    _sum: { amountEur: true },
    _count: { id: true },
    orderBy: { _sum: { amountEur: "desc" } },
    take: 10,
  });

  const catIds = byCatRows
    .map((r) => r.categoryId)
    .filter((id): id is string => id !== null);

  const categories = catIds.length
    ? await prisma.category.findMany({
        where: { id: { in: catIds } },
        select: { id: true, name: true },
      })
    : [];

  const catNameMap = new Map(categories.map((c) => [c.id, c.name]));

  const byCategory = byCatRows.map((row) => ({
    name: catNameMap.get(row.categoryId ?? "") ?? "Unknown",
    total: Number(row._sum.amountEur ?? 0),
    count: row._count.id,
  }));

  // ── Top merchants (load name+merchant+amountEur, group in JS) ─────────────
  const merchantRows = await prisma.expense.findMany({
    where: { workspaceId, date: bounds },
    select: { merchant: true, name: true, amountEur: true },
  });

  const merchantMap = new Map<string, { total: number; count: number }>();
  for (const r of merchantRows) {
    const key = normalizeKey(r.merchant, r.name);
    const existing = merchantMap.get(key);
    const amt = Number(r.amountEur);
    if (existing) {
      existing.total += amt;
      existing.count += 1;
    } else {
      merchantMap.set(key, { total: amt, count: 1 });
    }
  }

  const topMerchants = Array.from(merchantMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([name, v]) => ({ name, total: v.total, count: v.count }));

  // ── Untagged count ─────────────────────────────────────────────────────────
  const untaggedCount = await prisma.expense.count({
    where: { workspaceId, date: bounds, categoryId: null },
  });

  // ── MoM diff ───────────────────────────────────────────────────────────────
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevBounds = monthBounds(prevYear, prevMonth);

  const prevTotalAgg = await prisma.expense.aggregate({
    where: { workspaceId, date: prevBounds },
    _sum: { amountEur: true },
  });
  const prevTotal = Number(prevTotalAgg._sum.amountEur ?? 0);

  let totalPct: number | null = null;
  if (prevTotal !== 0) {
    totalPct = ((total - prevTotal) / prevTotal) * 100;
  }

  const prevByCatRows = await prisma.expense.groupBy({
    by: ["categoryId"],
    where: { workspaceId, date: prevBounds, categoryId: { not: null } },
    _sum: { amountEur: true },
  });

  const prevCatIds = prevByCatRows
    .map((r) => r.categoryId)
    .filter((id): id is string => id !== null);

  const prevCategories = prevCatIds.length
    ? await prisma.category.findMany({
        where: { id: { in: prevCatIds } },
        select: { id: true, name: true },
      })
    : [];

  const prevCatNameMap = new Map(prevCategories.map((c) => [c.id, c.name]));
  const prevCatTotals = new Map<string, number>();
  for (const row of prevByCatRows) {
    const name = prevCatNameMap.get(row.categoryId ?? "") ?? "Unknown";
    prevCatTotals.set(name, Number(row._sum.amountEur ?? 0));
  }

  const momByCategory: Record<string, number> = {};
  for (const cur of byCategory) {
    const prev = prevCatTotals.get(cur.name) ?? 0;
    if (prev !== 0) {
      momByCategory[cur.name] = ((cur.total - prev) / prev) * 100;
    }
  }

  return {
    total,
    expenseCount,
    byType,
    byCategory,
    topMerchants,
    momDiff: { totalPct, byCategory: momByCategory },
    untaggedCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// aggregateNudgeCandidates
// ─────────────────────────────────────────────────────────────────────────────

export interface NudgeCandidates {
  untaggedExpenseCount: number;
  repeatedCategorizations: Array<{
    merchantKey: string;
    categoryId: string;
    categoryName: string;
    count: number;
  }>;
  recurringCandidates: Array<{
    name: string;
    amount: number;
    dayOfMonth: number;
    monthsObserved: number;
    sampleExpenseIds: string[];
  }>;
  potentialClusterSeeds: Array<{
    id: string;
    name: string;
    amount: number;
    date: string;
  }>;
}

export async function aggregateNudgeCandidates(
  workspaceId: string
): Promise<NudgeCandidates> {
  const now = new Date();
  const ago90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── Untagged last 90 days ──────────────────────────────────────────────────
  const untaggedExpenseCount = await prisma.expense.count({
    where: { workspaceId, categoryId: null, date: { gte: ago90 } },
  });

  // ── Repeated categorizations (merchant → category, last 30 days) ───────────
  const categorizedRows = await prisma.expense.findMany({
    where: {
      workspaceId,
      date: { gte: ago30 },
      categoryId: { not: null },
    },
    select: { merchant: true, name: true, categoryId: true },
  });

  // Group by merchantKey+categoryId
  const catGroupMap = new Map<string, { categoryId: string; count: number }>();
  for (const r of categorizedRows) {
    const merchantKey = normalizeKey(r.merchant, r.name);
    const key = `${merchantKey}::${r.categoryId}`;
    const existing = catGroupMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      catGroupMap.set(key, { categoryId: r.categoryId!, count: 1 });
    }
  }

  // Filter to 3+ occurrences
  const candidates = Array.from(catGroupMap.entries())
    .filter(([, v]) => v.count >= 3)
    .map(([key, v]) => {
      const merchantKey = key.split("::")[0];
      return { merchantKey, categoryId: v.categoryId, count: v.count };
    });

  // Remove those already covered by a KeywordMapping
  const existingMappings = candidates.length
    ? await prisma.keywordMapping.findMany({
        where: {
          workspaceId,
          keyword: { in: candidates.map((c) => c.merchantKey) },
        },
        select: { keyword: true },
      })
    : [];
  const mappedKeywords = new Set(existingMappings.map((m) => m.keyword));

  const filteredCandidates = candidates.filter(
    (c) => !mappedKeywords.has(c.merchantKey)
  );

  // Snooze suppression for NUDGE_KEYWORD
  const snoozedKeywordInsights = filteredCandidates.length
    ? await prisma.insight.findMany({
        where: {
          workspaceId,
          type: InsightType.NUDGE_KEYWORD,
          snoozeUntil: { gt: now },
        },
        select: { inputHash: true },
      })
    : [];
  const snoozedKeywordHashes = new Set(snoozedKeywordInsights.map((i) => i.inputHash));

  const afterKeywordSnooze = filteredCandidates.filter((c) => {
    const hash = sha256(`keyword:${c.merchantKey}:${c.categoryId}`);
    return !snoozedKeywordHashes.has(hash);
  });

  // Fetch category names
  const catIds = [...new Set(afterKeywordSnooze.map((c) => c.categoryId))];
  const catRecords = catIds.length
    ? await prisma.category.findMany({
        where: { id: { in: catIds } },
        select: { id: true, name: true },
      })
    : [];
  const catNameById = new Map(catRecords.map((c) => [c.id, c.name]));

  const repeatedCategorizations = afterKeywordSnooze.map((c) => ({
    merchantKey: c.merchantKey,
    categoryId: c.categoryId,
    categoryName: catNameById.get(c.categoryId) ?? "Unknown",
    count: c.count,
  }));

  // ── Recurring candidates ───────────────────────────────────────────────────
  // Load non-recurring expenses from last 6 months with name+amount+date
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const recentExpenses = await prisma.expense.findMany({
    where: {
      workspaceId,
      date: { gte: sixMonthsAgo },
      isRecurring: false,
      recurringTemplateId: null,
    },
    select: { id: true, name: true, amountEur: true, date: true },
    orderBy: { date: "asc" },
  });

  // Group by normalized 8-char prefix
  const prefixGroups = new Map<string, typeof recentExpenses>();
  for (const e of recentExpenses) {
    const prefix = e.name.toLowerCase().trim().slice(0, 8);
    const group = prefixGroups.get(prefix);
    if (group) group.push(e);
    else prefixGroups.set(prefix, [e]);
  }

  // Existing recurring templates for suppression
  const existingTemplates = await prisma.recurringTemplate.findMany({
    where: { workspaceId, isActive: true },
    select: { name: true, amount: true },
  });

  // Snooze suppression for NUDGE_RECURRING
  const snoozedRecurringInsights = await prisma.insight.findMany({
    where: {
      workspaceId,
      type: InsightType.NUDGE_RECURRING,
      snoozeUntil: { gt: now },
    },
    select: { inputHash: true },
  });
  const snoozedRecurringHashes = new Set(
    snoozedRecurringInsights.map((i) => i.inputHash)
  );

  const recurringCandidates: NudgeCandidates["recurringCandidates"] = [];

  for (const [, group] of prefixGroups) {
    if (group.length < 3) continue;

    const amounts = group.map((e) => Number(e.amountEur));
    amounts.sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];

    // Filter within ±€2 of median
    const amountFiltered = group.filter(
      (e) => Math.abs(Number(e.amountEur) - median) <= 2
    );
    if (amountFiltered.length < 3) continue;

    // Distinct months
    const monthSet = new Set(
      amountFiltered.map((e) => {
        const d = new Date(e.date);
        return `${d.getFullYear()}-${d.getMonth()}`;
      })
    );
    if (monthSet.size < 3) continue;

    // Day-of-month mode
    const dayFreq = new Map<number, number>();
    for (const e of amountFiltered) {
      const day = new Date(e.date).getDate();
      dayFreq.set(day, (dayFreq.get(day) ?? 0) + 1);
    }
    const modeDay = [...dayFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // Filter by day-of-month within ±3
    const dayFiltered = amountFiltered.filter(
      (e) => Math.abs(new Date(e.date).getDate() - modeDay) <= 3
    );

    // Need entries from 3+ distinct months after day filter
    const finalMonthSet = new Set(
      dayFiltered.map((e) => {
        const d = new Date(e.date);
        return `${d.getFullYear()}-${d.getMonth()}`;
      })
    );
    if (finalMonthSet.size < 3) continue;

    const representativeName = group[0].name;
    const avgAmount = amounts.reduce((s, v) => s + v, 0) / amounts.length;

    // Suppress if existing template covers it (same prefix + amount ±€5)
    const prefix8 = representativeName.toLowerCase().trim().slice(0, 8);
    const coveredByTemplate = existingTemplates.some((t) => {
      const tPrefix = t.name.toLowerCase().trim().slice(0, 8);
      return (
        tPrefix === prefix8 && Math.abs(Number(t.amount ?? 0) - avgAmount) <= 5
      );
    });
    if (coveredByTemplate) continue;

    // Snooze suppression
    const hash = sha256(`recurring:${prefix8}`);
    if (snoozedRecurringHashes.has(hash)) continue;

    recurringCandidates.push({
      name: representativeName,
      amount: Math.round(avgAmount * 100) / 100,
      dayOfMonth: modeDay,
      monthsObserved: finalMonthSet.size,
      sampleExpenseIds: dayFiltered.slice(0, 5).map((e) => e.id),
    });
  }

  // ── Potential cluster seeds (project-tag nudge pre-filter) ─────────────────
  const clusterSeedRows = await prisma.expense.findMany({
    where: {
      workspaceId,
      date: { gte: ago30 },
      amountEur: { gt: 20 },
      projects: { none: {} },
    },
    select: { id: true, name: true, amountEur: true, date: true },
    orderBy: { date: "desc" },
    take: 50,
  });

  const potentialClusterSeeds = clusterSeedRows.map((e) => ({
    id: e.id,
    name: e.name,
    amount: Number(e.amountEur),
    date: new Date(e.date).toISOString(),
  }));

  return {
    untaggedExpenseCount,
    repeatedCategorizations,
    recurringCandidates,
    potentialClusterSeeds,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Snooze helpers (used by nudge route handlers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the workspace has an active NUDGE_CATEGORIZE snooze.
 */
export async function isWorkspaceCategorizeSnoozed(workspaceId: string): Promise<boolean> {
  const result = await prisma.insight.findFirst({
    where: {
      workspaceId,
      type: InsightType.NUDGE_CATEGORIZE,
      inputHash: sha256("categorize:workspace"),
      snoozeUntil: { gt: new Date() },
    },
    select: { id: true },
  });
  return !!result;
}

/**
 * Returns the set of inputHashes for active NUDGE_PROJECT snoozes in the workspace.
 */
export async function getProjectSnoozeHashes(workspaceId: string): Promise<Set<string>> {
  const rows = await prisma.insight.findMany({
    where: {
      workspaceId,
      type: InsightType.NUDGE_PROJECT,
      snoozeUntil: { gt: new Date() },
    },
    select: { inputHash: true },
  });
  return new Set(rows.map((r) => r.inputHash));
}
