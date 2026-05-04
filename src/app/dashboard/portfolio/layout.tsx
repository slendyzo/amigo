import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";
import { PortfolioCurrencyProvider } from "@/components/portfolio/portfolio-currency-context";

// Server-rendered layout that wraps every /dashboard/portfolio/* page in the
// EUR/USD display-currency Provider. Pages still own their own data fetches —
// this layout only supplies the FX rate + workspace default so the toggle on
// the portfolio root page propagates to the asset detail page (and any future
// portfolio sub-route).
export default async function PortfolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const workspace = await prisma.workspace.findFirst({
    where: { members: { some: { userId: session.user.id } } },
    select: { defaultCurrency: true },
  });

  const usdConv = await convertToEur(1, "USD");
  const defaultDisplay: "EUR" | "USD" =
    workspace?.defaultCurrency === "USD" ? "USD" : "EUR";

  return (
    <PortfolioCurrencyProvider
      eurPerUsd={usdConv.exchangeRate}
      workspaceDefault={defaultDisplay}
    >
      {children}
    </PortfolioCurrencyProvider>
  );
}
