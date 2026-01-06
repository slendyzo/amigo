import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  importExpensesFromExcel,
  importExpensesFromCSV,
  importExpensesFromPDF,
  importExpensesFromOFX,
  importExpensesFromQIF,
  ColumnMapping,
  DuplicateHandling
} from "@/lib/importer";

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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mappingJson = formData.get("mapping") as string | null;
    const duplicateHandlingValue = formData.get("duplicateHandling") as string | null;
    const currencyValue = formData.get("currency") as string | null;

    // Default to "skip" if not provided
    const duplicateHandling: DuplicateHandling =
      duplicateHandlingValue === "replace" ? "replace" : "skip";

    // Use provided currency or fall back to workspace default
    const currency = currencyValue || workspace.defaultCurrency || "EUR";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name;
    const fileType = fileName.split(".").pop()?.toLowerCase();

    // Parse column mapping if provided
    let mapping: ColumnMapping | undefined;
    if (mappingJson) {
      try {
        mapping = JSON.parse(mappingJson);
      } catch {
        return NextResponse.json({ error: "Invalid column mapping" }, { status: 400 });
      }
    }

    let result;

    if (fileType === "csv") {
      const text = await file.text();
      result = await importExpensesFromCSV(
        text,
        workspace.id,
        session.user.id,
        fileName,
        mapping,
        duplicateHandling,
        currency
      );
    } else if (fileType === "xlsx" || fileType === "xls") {
      const buffer = await file.arrayBuffer();
      result = await importExpensesFromExcel(
        Buffer.from(buffer),
        workspace.id,
        session.user.id,
        fileName,
        mapping,
        duplicateHandling,
        currency
      );
    } else if (fileType === "pdf") {
      const buffer = await file.arrayBuffer();
      result = await importExpensesFromPDF(
        Buffer.from(buffer),
        workspace.id,
        session.user.id,
        fileName,
        duplicateHandling,
        currency
      );
    } else if (fileType === "ofx" || fileType === "qfx") {
      // OFX/QFX - Open Financial Exchange format
      const text = await file.text();
      result = await importExpensesFromOFX(
        text,
        workspace.id,
        session.user.id,
        fileName,
        duplicateHandling,
        currency
      );
    } else if (fileType === "qif") {
      // QIF - Quicken Interchange Format
      const text = await file.text();
      result = await importExpensesFromQIF(
        text,
        workspace.id,
        session.user.id,
        fileName,
        duplicateHandling,
        currency
      );
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload CSV, Excel, PDF, OFX, or QIF files." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: result.success,
      imported: result.imported,
      skipped: result.skipped,
      replaced: result.replaced,
      duplicatesFound: result.duplicatesFound,
      stats: result.stats,
      errors: result.errors,
      sheets: result.sheets,
      recurringCandidates: result.recurringCandidates,
      recurringTemplatesCreated: result.recurringTemplatesCreated,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import file" },
      { status: 500 }
    );
  }
}
