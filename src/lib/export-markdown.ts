type ExpenseData = {
  date: Date;
  name: string;
  amountEur: number;
  type: string;
  category: { name: string; parent?: { name: string } | null } | null;
  bankAccount: { name: string } | null;
  projects: { name: string }[];
  status: string;
  description: string | null;
};

type IncomeData = {
  date: Date;
  name: string;
  amountEur: number;
  type: string | null;
  description: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  SURVIVAL_FIXED: "Survival (Fixed)",
  SURVIVAL_VARIABLE: "Survival (Variable)",
  LIFESTYLE: "Lifestyle",
  PROJECT: "Project",
};

function formatEur(amount: number): string {
  const formatted = Math.abs(amount).toLocaleString("en-IE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-€${formatted}` : `€${formatted}`;
}

function formatSignedEur(amount: number): string {
  const formatted = Math.abs(amount).toLocaleString("en-IE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (amount > 0) return `+€${formatted}`;
  if (amount < 0) return `-€${formatted}`;
  return `€${formatted}`;
}

function formatDateShort(date: Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatPeriod(dateRange: { start?: Date; end?: Date } | null): string {
  if (!dateRange || (!dateRange.start && !dateRange.end)) {
    return "All Time";
  }

  const { start, end } = dateRange;

  if (start && end) {
    const sameMonth =
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth();
    if (sameMonth) {
      return formatMonthYear(start);
    }
    return `${formatMonthYear(start)} – ${formatMonthYear(end)}`;
  }

  if (start) return `From ${formatMonthYear(start)}`;
  return `Until ${formatMonthYear(end!)}`;
}

function formatCategory(
  category: ExpenseData["category"]
): string {
  if (!category) return "—";
  if (category.parent?.name) return `${category.parent.name} > ${category.name}`;
  return category.name;
}

function formatPercentage(value: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function generateMarkdown(
  expenses: ExpenseData[],
  incomes: IncomeData[],
  dateRange: { start?: Date; end?: Date } | null,
  workspaceName: string
): string {
  const today = new Date();
  const todayFormatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const totalIncome = incomes.reduce((sum, i) => sum + i.amountEur, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amountEur, 0);
  const net = totalIncome - totalExpenses;

  const lines: string[] = [];

  // Header
  lines.push("# Amigo Financial Report");
  lines.push(
    `**Period:** ${formatPeriod(dateRange)} | **Generated:** ${todayFormatted} | **Workspace:** ${workspaceName}`
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Amount |");
  lines.push("|--------|--------|");
  lines.push(`| Total Income | ${formatEur(totalIncome)} |`);
  lines.push(`| Total Expenses | ${formatEur(totalExpenses)} |`);
  lines.push(`| **Net** | **${formatSignedEur(net)}** |`);
  lines.push(`| Status | ${net >= 0 ? "SURPLUS" : "DEFICIT"} |`);
  lines.push(
    `| Transaction Count | ${expenses.length} expense${expenses.length !== 1 ? "s" : ""}, ${incomes.length} income${incomes.length !== 1 ? "s" : ""} |`
  );
  lines.push("");

  // Breakdown by expense type
  if (expenses.length > 0) {
    const typeGroups = new Map<string, { amount: number; count: number }>();
    for (const e of expenses) {
      const existing = typeGroups.get(e.type) || { amount: 0, count: 0 };
      existing.amount += e.amountEur;
      existing.count += 1;
      typeGroups.set(e.type, existing);
    }

    const typeOrder = [
      "SURVIVAL_FIXED",
      "SURVIVAL_VARIABLE",
      "LIFESTYLE",
      "PROJECT",
    ];

    lines.push("## Breakdown by Expense Type");
    lines.push("");
    lines.push("| Type | Amount | Count | % of Total |");
    lines.push("|------|--------|-------|------------|");

    for (const type of typeOrder) {
      const group = typeGroups.get(type);
      if (!group) continue;
      const label = TYPE_LABELS[type] || type;
      lines.push(
        `| ${label} | ${formatEur(group.amount)} | ${group.count} | ${formatPercentage(group.amount, totalExpenses)} |`
      );
    }

    // Include any types not in the predefined order
    for (const [type, group] of typeGroups) {
      if (typeOrder.includes(type)) continue;
      const label = TYPE_LABELS[type] || type;
      lines.push(
        `| ${label} | ${formatEur(group.amount)} | ${group.count} | ${formatPercentage(group.amount, totalExpenses)} |`
      );
    }

    lines.push("");
  }

  // Top Categories
  if (expenses.length > 0) {
    const categoryGroups = new Map<string, { amount: number; count: number }>();
    for (const e of expenses) {
      const catName = formatCategory(e.category);
      const existing = categoryGroups.get(catName) || { amount: 0, count: 0 };
      existing.amount += e.amountEur;
      existing.count += 1;
      categoryGroups.set(catName, existing);
    }

    const sortedCategories = [...categoryGroups.entries()].sort(
      (a, b) => b[1].amount - a[1].amount
    );

    lines.push("## Top Categories");
    lines.push("");
    lines.push("| Category | Amount | Count |");
    lines.push("|----------|--------|-------|");

    for (const [name, group] of sortedCategories) {
      lines.push(`| ${name} | ${formatEur(group.amount)} | ${group.count} |`);
    }

    lines.push("");
  }

  // Project Expenses
  const projectExpenses = expenses.filter((e) => e.type === "PROJECT");
  if (projectExpenses.length > 0) {
    const projectGroups = new Map<
      string,
      { amount: number; count: number; categories: Set<string> }
    >();

    for (const e of projectExpenses) {
      const projectNames =
        e.projects.length > 0
          ? e.projects.map((p) => p.name)
          : ["Untagged"];

      for (const projName of projectNames) {
        const existing = projectGroups.get(projName) || {
          amount: 0,
          count: 0,
          categories: new Set<string>(),
        };
        existing.amount += e.amountEur;
        existing.count += 1;
        if (e.category) {
          existing.categories.add(e.category.name);
        }
        projectGroups.set(projName, existing);
      }
    }

    const sortedProjects = [...projectGroups.entries()].sort(
      (a, b) => b[1].amount - a[1].amount
    );

    lines.push("## Project Expenses");
    lines.push("");
    lines.push("| Project | Amount | Count | Categories |");
    lines.push("|---------|--------|-------|------------|");

    for (const [name, group] of sortedProjects) {
      const cats =
        group.categories.size > 0
          ? [...group.categories].join(", ")
          : "—";
      lines.push(
        `| ${name} | ${formatEur(group.amount)} | ${group.count} | ${cats} |`
      );
    }

    lines.push("");
  }

  // Incomes
  if (incomes.length > 0) {
    const sortedIncomes = [...incomes].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    lines.push("## Incomes");
    lines.push("");
    lines.push("| Date | Description | Type | Amount |");
    lines.push("|------|-------------|------|--------|");

    for (const income of sortedIncomes) {
      lines.push(
        `| ${formatDateShort(income.date)} | ${income.name} | ${income.type || "—"} | ${formatSignedEur(income.amountEur)} |`
      );
    }

    lines.push("");
  }

  // Expenses
  if (expenses.length > 0) {
    const sortedExpenses = [...expenses].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    lines.push("## Expenses");
    lines.push("");
    lines.push("| Date | Description | Type | Category | Projects | Amount |");
    lines.push("|------|-------------|------|----------|----------|--------|");

    for (const e of sortedExpenses) {
      const typeLabel = TYPE_LABELS[e.type] || e.type;
      const category = formatCategory(e.category);
      const projects =
        e.projects.length > 0
          ? e.projects.map((p) => p.name).join(", ")
          : "—";

      lines.push(
        `| ${formatDateShort(e.date)} | ${e.name} | ${typeLabel} | ${category} | ${projects} | ${formatEur(e.amountEur)} |`
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}
