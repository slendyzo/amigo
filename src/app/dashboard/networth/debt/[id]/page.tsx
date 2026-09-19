import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { hasPermission } from "@/lib/permissions";
import DebtDetailClient from "./debt-detail-client";

export const dynamic = "force-dynamic";

export default async function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getActiveWorkspace();
  if (!context) redirect("/signin");
  const { id } = await params;
  const debt = await prisma.liability.findFirst({
    where: { id, workspaceId: context.workspace.id },
    include: { realAsset: { select: { id: true, name: true, type: true } } },
  });
  if (!debt) notFound();
  const payments = debt.recurringTemplateId ? await prisma.expense.findMany({
    where: { workspaceId: context.workspace.id, recurringTemplateId: debt.recurringTemplateId },
    select: { id: true, date: true, amount: true, currency: true, status: true },
    orderBy: { date: "asc" },
  }) : [];
  return <DebtDetailClient
    key={debt.id}
    canEdit={hasPermission(context.role, "liability:update")}
    debt={{ id: debt.id, name: debt.name, type: debt.type, currency: debt.currency,
      startDate: debt.startDate.toISOString().slice(0, 10), termMonths: debt.termMonths,
      monthlyPayment: debt.monthlyPayment == null ? null : Number(debt.monthlyPayment),
      principal: Number(debt.principal), interestRate: Number(debt.interestRate ?? 0),
      status: debt.status, realAsset: debt.realAsset, hasTemplate: !!debt.recurringTemplateId }}
    payments={payments.map(p => ({ ...p, date: p.date.toISOString().slice(0, 10), amount: Number(p.amount) }))}
  />;
}
