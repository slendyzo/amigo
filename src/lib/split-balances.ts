import { prisma } from "@/lib/db";

/**
 * Forest & Bracket — split balances for a workspace.
 *
 * For a given workspace + viewer (the calling user's WorkspaceMember id),
 * returns:
 *   - balances: per-other-member who-owes-whom totals (workspace members only)
 *   - adHocBalances: rolled-up ad-hoc names (non-member labels) — viewer-owed only
 *
 * Computation is naive aggregation of unpaid SplitParticipant rows:
 *
 *   • If the viewer was the payer of an expense (`Expense.payerMemberId == viewer`)
 *     and another member is a participant with `paid: false`, that member owes
 *     the viewer their share.
 *
 *   • If another member was the payer and the viewer is a participant with
 *     `paid: false`, the viewer owes that member their share.
 *
 *   • Ad-hoc participants (memberId null, adHocName set) only count when the
 *     viewer was the payer — those are people-the-viewer-fronted-for. We don't
 *     surface "ad hoc owes someone else" balances; they're outside the
 *     workspace's settle-up loop.
 *
 * Watch perf past ~1k expenses with splits — currently a single big query
 * with reductions in JS. Add indices (already on expenseId/memberId) and
 * paginate or pre-aggregate if it gets slow.
 */

export type MemberBalance = {
  memberId: string;
  memberName: string;
  owesYou: number;
  youOwe: number;
};

export type AdHocBalance = {
  name: string;
  owesYou: number;
};

export type WorkspaceBalances = {
  balances: MemberBalance[];
  adHocBalances: AdHocBalance[];
};

export async function getSplitBalances(
  workspaceId: string,
  viewerMemberId: string,
): Promise<WorkspaceBalances> {
  // Pull every unpaid split row in this workspace where either
  //   (a) the expense was paid by the viewer, OR
  //   (b) the viewer is a participant
  // and the share is owed (paid: false).
  const rows = await prisma.splitParticipant.findMany({
    where: {
      paid: false,
      expense: { workspaceId },
      OR: [
        { expense: { payerMemberId: viewerMemberId } },
        { memberId: viewerMemberId },
      ],
    },
    select: {
      memberId: true,
      adHocName: true,
      share: true,
      member: { select: { id: true, user: { select: { name: true, email: true } } } },
      expense: {
        select: {
          id: true,
          payerMemberId: true,
          payer: {
            select: {
              id: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });

  // Per-member tally
  const memberMap = new Map<string, MemberBalance>();
  const adHocMap = new Map<string, AdHocBalance>();

  for (const row of rows) {
    const share = Number(row.share);
    if (!Number.isFinite(share) || share <= 0) continue;

    const expensePaidByViewer = row.expense.payerMemberId === viewerMemberId;
    const participantIsViewer = row.memberId === viewerMemberId;

    if (expensePaidByViewer && row.memberId && row.memberId !== viewerMemberId) {
      // Another member owes the viewer their share
      const m = row.member!;
      const id = m.id;
      const name = m.user?.name?.trim() || m.user?.email?.split("@")[0] || "Sem nome";
      const entry = memberMap.get(id) ?? {
        memberId: id,
        memberName: name,
        owesYou: 0,
        youOwe: 0,
      };
      entry.owesYou += share;
      memberMap.set(id, entry);
    } else if (expensePaidByViewer && !row.memberId && row.adHocName) {
      // Ad-hoc participant the viewer fronted for
      const name = row.adHocName.trim();
      if (!name) continue;
      const entry = adHocMap.get(name) ?? { name, owesYou: 0 };
      entry.owesYou += share;
      adHocMap.set(name, entry);
    } else if (participantIsViewer && row.expense.payer && row.expense.payerMemberId) {
      // Viewer owes the payer their share
      const p = row.expense.payer;
      const id = p.id;
      const name = p.user?.name?.trim() || p.user?.email?.split("@")[0] || "Sem nome";
      const entry = memberMap.get(id) ?? {
        memberId: id,
        memberName: name,
        owesYou: 0,
        youOwe: 0,
      };
      entry.youOwe += share;
      memberMap.set(id, entry);
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  const balances = [...memberMap.values()]
    .map((b) => ({
      ...b,
      owesYou: round(b.owesYou),
      youOwe: round(b.youOwe),
    }))
    .filter((b) => b.owesYou > 0 || b.youOwe > 0)
    .sort((a, b) => Math.abs(b.owesYou - b.youOwe) - Math.abs(a.owesYou - a.youOwe));

  const adHocBalances = [...adHocMap.values()]
    .map((b) => ({ ...b, owesYou: round(b.owesYou) }))
    .filter((b) => b.owesYou > 0)
    .sort((a, b) => b.owesYou - a.owesYou);

  return { balances, adHocBalances };
}
