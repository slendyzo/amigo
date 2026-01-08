import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ExcelJS from "exceljs";

// GET /api/export - Export expenses data
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the user's workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: { workspace: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspaceId;

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get("format") || "csv"; // csv, xlsx
    const type = searchParams.get("type"); // expense type filter
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const categoryId = searchParams.get("categoryId");

    // Build query
    const where: Record<string, unknown> = { workspaceId };

    if (type) {
      where.type = type;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        (where.date as Record<string, Date>).gte = new Date(startDate);
      }
      if (endDate) {
        (where.date as Record<string, Date>).lte = new Date(endDate);
      }
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    // Fetch expenses
    const expenses = await prisma.expense.findMany({
      where,
      include: {
        category: true,
        bankAccount: true,
        projects: true,
      },
      orderBy: { date: "desc" },
    });

    // Fetch incomes too
    const incomes = await prisma.income.findMany({
      where: { workspaceId },
      orderBy: { date: "desc" },
    });

    if (format === "xlsx") {
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Amigo";
      workbook.created = new Date();

      // Expenses sheet
      const expensesSheet = workbook.addWorksheet("Expenses");
      expensesSheet.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "Name", key: "name", width: 30 },
        { header: "Amount (EUR)", key: "amount", width: 15 },
        { header: "Type", key: "type", width: 18 },
        { header: "Category", key: "category", width: 20 },
        { header: "Bank Account", key: "bankAccount", width: 20 },
        { header: "Projects", key: "projects", width: 25 },
        { header: "Status", key: "status", width: 10 },
        { header: "Notes", key: "notes", width: 30 },
      ];

      // Style header row
      expensesSheet.getRow(1).font = { bold: true };
      expensesSheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      };

      // Add expense data
      for (const expense of expenses) {
        const typeLabels: Record<string, string> = {
          SURVIVAL_FIXED: "Survival (Fixed)",
          SURVIVAL_VARIABLE: "Survival (Variable)",
          LIFESTYLE: "Lifestyle",
          PROJECT: "Project",
        };

        expensesSheet.addRow({
          date: new Date(expense.date).toLocaleDateString("en-GB"),
          name: expense.name,
          amount: Number(expense.amountEur).toFixed(2),
          type: typeLabels[expense.type] || expense.type,
          category: expense.category?.name || "",
          bankAccount: expense.bankAccount?.name || "",
          projects: expense.projects.map((p: { name: string }) => p.name).join(", "),
          status: expense.status,
          notes: expense.description || "",
        });
      }

      // Add summary row
      const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amountEur), 0);
      expensesSheet.addRow({});
      expensesSheet.addRow({
        date: "TOTAL",
        name: "",
        amount: totalExpenses.toFixed(2),
      });
      const lastRow = expensesSheet.lastRow;
      if (lastRow) {
        lastRow.font = { bold: true };
      }

      // Incomes sheet
      const incomesSheet = workbook.addWorksheet("Incomes");
      incomesSheet.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "Name", key: "name", width: 30 },
        { header: "Amount (EUR)", key: "amount", width: 15 },
        { header: "Type", key: "type", width: 20 },
        { header: "Description", key: "description", width: 30 },
      ];

      incomesSheet.getRow(1).font = { bold: true };
      incomesSheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD1FAE5" },
      };

      for (const income of incomes) {
        incomesSheet.addRow({
          date: new Date(income.date).toLocaleDateString("en-GB"),
          name: income.name,
          amount: Number(income.amountEur).toFixed(2),
          type: income.type || "",
          description: income.description || "",
        });
      }

      const totalIncomes = incomes.reduce((sum, i) => sum + Number(i.amountEur), 0);
      incomesSheet.addRow({});
      incomesSheet.addRow({
        date: "TOTAL",
        name: "",
        amount: totalIncomes.toFixed(2),
      });
      const lastIncomeRow = incomesSheet.lastRow;
      if (lastIncomeRow) {
        lastIncomeRow.font = { bold: true };
      }

      // Summary sheet
      const summarySheet = workbook.addWorksheet("Summary");
      summarySheet.columns = [
        { header: "Category", key: "category", width: 25 },
        { header: "Total (EUR)", key: "total", width: 15 },
        { header: "Count", key: "count", width: 10 },
      ];

      summarySheet.getRow(1).font = { bold: true };
      summarySheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDBEAFE" },
      };

      // Group by type
      const byType: Record<string, { total: number; count: number }> = {};
      for (const e of expenses) {
        const typeLabels: Record<string, string> = {
          SURVIVAL_FIXED: "Survival (Fixed)",
          SURVIVAL_VARIABLE: "Survival (Variable)",
          LIFESTYLE: "Lifestyle",
          PROJECT: "Project",
        };
        const label = typeLabels[e.type] || e.type;
        if (!byType[label]) {
          byType[label] = { total: 0, count: 0 };
        }
        byType[label].total += Number(e.amountEur);
        byType[label].count++;
      }

      Object.entries(byType).forEach(([category, data]) => {
        summarySheet.addRow({
          category,
          total: data.total.toFixed(2),
          count: data.count,
        });
      });

      summarySheet.addRow({});
      summarySheet.addRow({
        category: "Total Expenses",
        total: totalExpenses.toFixed(2),
        count: expenses.length,
      });
      summarySheet.addRow({
        category: "Total Incomes",
        total: totalIncomes.toFixed(2),
        count: incomes.length,
      });
      summarySheet.addRow({
        category: "Net (Income - Expenses)",
        total: (totalIncomes - totalExpenses).toFixed(2),
        count: "",
      });

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();

      const filename = `amigo-export-${new Date().toISOString().split("T")[0]}.xlsx`;

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // CSV format (default)
    const csvRows: string[] = [];

    // Header
    csvRows.push("Date,Name,Amount (EUR),Type,Category,Bank Account,Projects,Status,Notes");

    // Data rows
    for (const expense of expenses) {
      const typeLabels: Record<string, string> = {
        SURVIVAL_FIXED: "Survival (Fixed)",
        SURVIVAL_VARIABLE: "Survival (Variable)",
        LIFESTYLE: "Lifestyle",
        PROJECT: "Project",
      };

      const row = [
        new Date(expense.date).toLocaleDateString("en-GB"),
        `"${(expense.name || "").replace(/"/g, '""')}"`,
        Number(expense.amountEur).toFixed(2),
        typeLabels[expense.type] || expense.type,
        `"${(expense.category?.name || "").replace(/"/g, '""')}"`,
        `"${(expense.bankAccount?.name || "").replace(/"/g, '""')}"`,
        `"${expense.projects.map((p: { name: string }) => p.name).join(", ").replace(/"/g, '""')}"`,
        expense.status,
        `"${(expense.description || "").replace(/"/g, '""')}"`,
      ];
      csvRows.push(row.join(","));
    }

    // Add total
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amountEur), 0);
    csvRows.push("");
    csvRows.push(`TOTAL,,${totalExpenses.toFixed(2)}`);

    const csvContent = csvRows.join("\n");
    const filename = `amigo-export-${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
