import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateDueForTemplate } from "@/lib/recurring-generate";

// Daily cron: generate any due monthly payments for LOAN-LINKED recurring
// templates (installments / loans), catching up months missed because nobody
// opened the app. Scoped to templates attached to an active Liability —
// manual/standalone recurring (house, utilities, subscriptions) are never
// touched and keep their dashboard-on-open behaviour.
//
// Idempotent: generateDueForTemplate skips months that already have an expense
// and honours each template's endDate, so it stops exactly at the loan term.
//
// Crontab on CT 104 (daily 05:00 Lisbon):
//   0 5 * * * curl -fsS -X POST -H "x-cron-secret: ${CRON_SECRET}" \
//     https://amigo.slendyzo.pt/api/cron/generate-recurring

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret") ?? request.headers.get("authorization");
  if (!header) return false;
  const provided = header.startsWith("Bearer ") ? header.slice(7) : header;
  return provided === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loans = await prisma.liability.findMany({
    where: { status: "ACTIVE", recurringTemplateId: { not: null } },
    select: { id: true, recurringTemplateId: true, startDate: true },
  });

  let generated = 0;
  const results: Array<{ liabilityId: string; generated: number }> = [];
  for (const loan of loans) {
    if (!loan.recurringTemplateId) continue;
    const n = await generateDueForTemplate(loan.recurringTemplateId, {
      startDate: loan.startDate,
    }).catch((e) => {
      console.error(`[cron/generate-recurring] ${loan.id} failed:`, e);
      return 0;
    });
    generated += n;
    if (n > 0) results.push({ liabilityId: loan.id, generated: n });
  }

  return NextResponse.json({ ok: true, loansChecked: loans.length, generated, results });
}
