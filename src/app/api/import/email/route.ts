import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseEmailTransaction, importEmailTransaction } from "@/lib/importer";

/**
 * POST /api/import/email
 * Parse and import a bank notification email
 *
 * Body:
 * - subject: string (email subject)
 * - body: string (email body text or HTML)
 * - receivedDate?: string (ISO date, defaults to now)
 * - bankAccountId?: string (optional bank account to link)
 */
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await request.json();
    const { subject, body: emailBody, receivedDate, bankAccountId } = body;

    if (!subject && !emailBody) {
      return NextResponse.json(
        { error: "Email subject or body is required" },
        { status: 400 }
      );
    }

    // Parse the email
    const parsedDate = receivedDate ? new Date(receivedDate) : new Date();
    const transaction = parseEmailTransaction(
      subject || "",
      emailBody || "",
      parsedDate
    );

    if (!transaction) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not parse transaction from email. The email format may not be supported."
        },
        { status: 400 }
      );
    }

    // If bankAccountId provided, verify it belongs to the workspace
    if (bankAccountId) {
      const bankAccount = await prisma.bankAccount.findFirst({
        where: { id: bankAccountId, workspaceId: workspace.id },
      });

      if (!bankAccount) {
        return NextResponse.json(
          { error: "Bank account not found" },
          { status: 400 }
        );
      }
    }

    // Import the transaction
    const result = await importEmailTransaction(
      transaction,
      workspace.id,
      bankAccountId
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      transaction: {
        type: transaction.isIncome ? "income" : "expense",
        id: result.expenseId || result.incomeId,
        name: transaction.name,
        amount: transaction.amount,
        currency: transaction.currency,
        date: transaction.date,
        bankName: transaction.bankName,
      },
    });
  } catch (error) {
    console.error("Email import error:", error);
    return NextResponse.json(
      { error: "Failed to import email" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/import/email/batch
 * Import multiple emails at once
 */
export async function PUT(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await prisma.workspace.findFirst({
      where: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await request.json();
    const { emails, bankAccountId } = body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "Array of emails is required" },
        { status: 400 }
      );
    }

    // Verify bank account if provided
    if (bankAccountId) {
      const bankAccount = await prisma.bankAccount.findFirst({
        where: { id: bankAccountId, workspaceId: workspace.id },
      });

      if (!bankAccount) {
        return NextResponse.json(
          { error: "Bank account not found" },
          { status: 400 }
        );
      }
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];

      try {
        const parsedDate = email.receivedDate ? new Date(email.receivedDate) : new Date();
        const transaction = parseEmailTransaction(
          email.subject || "",
          email.body || "",
          parsedDate
        );

        if (!transaction) {
          results.skipped++;
          continue;
        }

        const result = await importEmailTransaction(
          transaction,
          workspace.id,
          bankAccountId
        );

        if (result.success) {
          results.imported++;
        } else {
          results.errors.push(`Email ${i + 1}: ${result.error}`);
        }
      } catch (err) {
        results.errors.push(`Email ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported: results.imported,
      skipped: results.skipped,
      errors: results.errors.slice(0, 10),
    });
  } catch (error) {
    console.error("Batch email import error:", error);
    return NextResponse.json(
      { error: "Failed to import emails" },
      { status: 500 }
    );
  }
}
