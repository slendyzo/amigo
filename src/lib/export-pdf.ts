import PDFDocument from "pdfkit";

// ---------------------------------------------------------------------------
// Types (local — no external imports)
// ---------------------------------------------------------------------------

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

type Transaction = {
  date: Date;
  name: string;
  amountEur: number;
  category: string;
  projects: string;
  isIncome: boolean;
  type: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 30;
const BOTTOM_LIMIT = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

// Colors
const COLOR_HEADING = "#1e293b";
const COLOR_SUBTITLE = "#64748b";
const COLOR_MUTED = "#94a3b8";
const COLOR_GREEN = "#059669";
const COLOR_RED = "#dc2626";
const COLOR_LINE = "#e2e8f0";
const COLOR_TABLE_HEADER_BG = "#f1f5f9";
const COLOR_TABLE_HEADER_TEXT = "#475569";
const COLOR_CARD_BG = "#f8fafc";
const COLOR_ALT_ROW = "#f8fafc";

// Table column definitions
const COL_DATE_W = 60;
const COL_DESC_W = 170;
const COL_CAT_W = 100;
const COL_PROJ_W = 80;
const COL_AMT_W = 85;

const COL_DATE_X = MARGIN;
const COL_DESC_X = COL_DATE_X + COL_DATE_W;
const COL_CAT_X = COL_DESC_X + COL_DESC_W;
const COL_PROJ_X = COL_CAT_X + COL_CAT_W;
const COL_AMT_X = COL_PROJ_X + COL_PROJ_W;

const ROW_HEIGHT = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function euro(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-IE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `€${formatted}`;
}

function formatDateShort(d: Date): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]}`;
}

function formatPeriod(range: { start?: Date; end?: Date } | null): string {
  if (!range || (!range.start && !range.end)) return "All Time";

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const start = range.start;
  const end = range.end;

  if (start && end) {
    const sameMonth =
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear();

    if (sameMonth) {
      return `${months[start.getMonth()]} ${start.getDate()} – ${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${months[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()} – ${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }

  if (start) {
    return `From ${months[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()}`;
  }

  if (end) {
    return `Until ${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }

  return "All Time";
}

function formatGeneratedDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function friendlyType(type: string): string {
  const map: Record<string, string> = {
    SURVIVAL_FIXED: "Survival (Fixed)",
    SURVIVAL_VARIABLE: "Survival (Variable)",
    LIFESTYLE: "Lifestyle",
    PROJECT: "Project",
  };
  return map[type] || type;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "…";
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generatePDF(
  expenses: ExpenseData[],
  incomes: IncomeData[],
  dateRange: { start?: Date; end?: Date } | null,
  workspaceName: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = MARGIN;
    let pageCount = 1;

    // ------------------------------------------------------------------
    // Utility: draw footer line + text placeholders (filled in later)
    // ------------------------------------------------------------------
    function drawFooterLine() {
      doc
        .strokeColor(COLOR_LINE)
        .lineWidth(0.5)
        .moveTo(MARGIN, PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT + 5)
        .lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT + 5)
        .stroke();
    }

    // ------------------------------------------------------------------
    // Utility: add a new page
    // ------------------------------------------------------------------
    function newPage() {
      doc.addPage();
      pageCount++;
      drawFooterLine();
      y = MARGIN;
    }

    // ------------------------------------------------------------------
    // Utility: check if we need a page break
    // ------------------------------------------------------------------
    function ensureSpace(needed: number) {
      if (y + needed > BOTTOM_LIMIT) {
        newPage();
      }
    }

    // ------------------------------------------------------------------
    // HEADER
    // ------------------------------------------------------------------
    drawFooterLine(); // first page footer line

    // Left side
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor(COLOR_HEADING)
      .text("AMIGO", MARGIN, y);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLOR_SUBTITLE)
      .text("Financial Statement", MARGIN, y + 24);

    // Right side
    const periodText = `Period: ${formatPeriod(dateRange)}`;
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLOR_HEADING)
      .text(periodText, MARGIN, y, {
        width: CONTENT_WIDTH,
        align: "right",
      });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text(`Generated: ${formatGeneratedDate()}`, MARGIN, y + 14, {
        width: CONTENT_WIDTH,
        align: "right",
      });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text(`Workspace: ${workspaceName}`, MARGIN, y + 26, {
        width: CONTENT_WIDTH,
        align: "right",
      });

    y += 46;

    // Separator line
    doc
      .strokeColor(COLOR_LINE)
      .lineWidth(1)
      .moveTo(MARGIN, y)
      .lineTo(PAGE_WIDTH - MARGIN, y)
      .stroke();

    y += 16;

    // ------------------------------------------------------------------
    // SUMMARY CARDS
    // ------------------------------------------------------------------
    const totalIncome = incomes.reduce((s, i) => s + i.amountEur, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amountEur, 0);
    const net = totalIncome - totalExpenses;

    const cardGap = 12;
    const cardW = (CONTENT_WIDTH - cardGap * 2) / 3;
    const cardH = 52;
    const cardPadX = 10;
    const cardPadY = 8;
    const cardRadius = 4;

    const cards: {
      label: string;
      amount: string;
      color: string;
      sub?: { text: string; color: string };
    }[] = [
      { label: "INCOME", amount: euro(totalIncome), color: COLOR_GREEN },
      { label: "EXPENSES", amount: euro(totalExpenses), color: COLOR_HEADING },
      {
        label: "NET",
        amount: `${net >= 0 ? "+" : "−"}${euro(Math.abs(net))}`,
        color: net >= 0 ? COLOR_GREEN : COLOR_RED,
        sub: {
          text: net >= 0 ? "SURPLUS" : "DEFICIT",
          color: net >= 0 ? COLOR_GREEN : COLOR_RED,
        },
      },
    ];

    cards.forEach((card, i) => {
      const cx = MARGIN + i * (cardW + cardGap);

      // Background
      doc
        .save()
        .roundedRect(cx, y, cardW, cardH, cardRadius)
        .fill(COLOR_CARD_BG)
        .restore();

      // Label
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLOR_SUBTITLE)
        .text(card.label, cx + cardPadX, y + cardPadY);

      // Amount
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor(card.color)
        .text(card.amount, cx + cardPadX, y + cardPadY + 14);

      // Sub label (NET card)
      if (card.sub) {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(card.sub.color)
          .text(card.sub.text, cx + cardPadX, y + cardPadY + 32);
      }
    });

    y += cardH + 20;

    // ------------------------------------------------------------------
    // BUILD TRANSACTIONS LIST
    // ------------------------------------------------------------------
    const transactions: Transaction[] = [];

    for (const e of expenses) {
      const catParts: string[] = [];
      if (e.category) {
        if (e.category.parent) catParts.push(e.category.parent.name);
        catParts.push(e.category.name);
      }
      transactions.push({
        date: new Date(e.date),
        name: e.name,
        amountEur: e.amountEur,
        category: catParts.join(" > ") || "—",
        projects:
          e.projects.length > 0
            ? e.projects.map((p) => p.name).join(", ")
            : "—",
        isIncome: false,
        type: e.type,
      });
    }

    for (const i of incomes) {
      transactions.push({
        date: new Date(i.date),
        name: i.name,
        amountEur: i.amountEur,
        category: i.type ? i.type.replace(/_/g, " ") : "—",
        projects: "—",
        isIncome: true,
        type: i.type || "",
      });
    }

    // Sort ascending by date
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    // ------------------------------------------------------------------
    // EMPTY STATE
    // ------------------------------------------------------------------
    if (transactions.length === 0) {
      ensureSpace(60);
      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor(COLOR_SUBTITLE)
        .text("No transactions for this period.", MARGIN, y + 30, {
          width: CONTENT_WIDTH,
          align: "center",
        });

      addPageNumbers(doc, pageCount);
      doc.end();
      return;
    }

    // ------------------------------------------------------------------
    // TABLE HEADER
    // ------------------------------------------------------------------
    function drawTableHeader() {
      ensureSpace(ROW_HEIGHT + 4);

      // Header background
      doc
        .save()
        .rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT)
        .fill(COLOR_TABLE_HEADER_BG)
        .restore();

      const headerY = y + 6;

      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TABLE_HEADER_TEXT);

      doc.text("DATE", COL_DATE_X + 4, headerY, { width: COL_DATE_W });
      doc.text("DESCRIPTION", COL_DESC_X + 4, headerY, { width: COL_DESC_W });
      doc.text("CATEGORY", COL_CAT_X + 4, headerY, { width: COL_CAT_W });
      doc.text("PROJECTS", COL_PROJ_X + 4, headerY, { width: COL_PROJ_W });
      doc.text("AMOUNT", COL_AMT_X, headerY, {
        width: COL_AMT_W,
        align: "right",
      });

      y += ROW_HEIGHT;
    }

    drawTableHeader();

    // ------------------------------------------------------------------
    // TABLE ROWS
    // ------------------------------------------------------------------
    transactions.forEach((tx, idx) => {
      // Check page break
      if (y + ROW_HEIGHT > BOTTOM_LIMIT) {
        newPage();
        drawTableHeader();
      }

      // Alternate row background
      if (idx % 2 === 1) {
        doc
          .save()
          .rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT)
          .fill(COLOR_ALT_ROW)
          .restore();
      }

      const rowY = y + 6;

      // Date
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLOR_HEADING)
        .text(formatDateShort(tx.date), COL_DATE_X + 4, rowY, {
          width: COL_DATE_W,
        });

      // Description (truncate to ~28 chars)
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLOR_HEADING)
        .text(truncate(tx.name, 28), COL_DESC_X + 4, rowY, {
          width: COL_DESC_W - 8,
          lineBreak: false,
        });

      // Category (truncate to ~16 chars)
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLOR_SUBTITLE)
        .text(truncate(tx.category, 16), COL_CAT_X + 4, rowY, {
          width: COL_CAT_W - 8,
          lineBreak: false,
        });

      // Projects (truncate to ~12 chars)
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLOR_SUBTITLE)
        .text(truncate(tx.projects, 12), COL_PROJ_X + 4, rowY, {
          width: COL_PROJ_W - 8,
          lineBreak: false,
        });

      // Amount
      const isCredit = tx.isIncome || tx.amountEur < 0;
      const amtColor = isCredit ? COLOR_GREEN : COLOR_HEADING;
      const amtPrefix = tx.isIncome ? "+" : tx.amountEur < 0 ? "+" : "";
      const amtDisplay = `${amtPrefix}${euro(Math.abs(tx.amountEur))}`;

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(amtColor)
        .text(amtDisplay, COL_AMT_X, rowY, {
          width: COL_AMT_W,
          align: "right",
        });

      y += ROW_HEIGHT;
    });

    y += 16;

    // ------------------------------------------------------------------
    // TYPE BREAKDOWN
    // ------------------------------------------------------------------
    const typeTotals: Record<string, number> = {};
    for (const e of expenses) {
      typeTotals[e.type] = (typeTotals[e.type] || 0) + e.amountEur;
    }

    const typeEntries = Object.entries(typeTotals).sort(
      (a, b) => b[1] - a[1]
    );

    if (typeEntries.length > 0) {
      const breakdownHeight = 24 + typeEntries.length * 16 + 8;
      ensureSpace(breakdownHeight);

      // Title
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(COLOR_HEADING)
        .text("Breakdown by Type", MARGIN, y);

      y += 18;

      // Two-column layout
      const colLeftX = MARGIN;
      const colRightX = MARGIN + CONTENT_WIDTH / 2;
      const half = Math.ceil(typeEntries.length / 2);

      typeEntries.forEach((entry, idx) => {
        const [type, total] = entry;
        const isRight = idx >= half;
        const colX = isRight ? colRightX : colLeftX;
        const rowIdx = isRight ? idx - half : idx;
        const rowY = y + rowIdx * 16;

        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(COLOR_HEADING)
          .text(friendlyType(type), colX, rowY, {
            width: CONTENT_WIDTH / 2 - 80,
            lineBreak: false,
          });

        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(COLOR_HEADING)
          .text(euro(total), colX, rowY, {
            width: CONTENT_WIDTH / 2 - 10,
            align: "right",
          });
      });
    }

    // ------------------------------------------------------------------
    // PAGE NUMBERS (go back to each page)
    // ------------------------------------------------------------------
    addPageNumbers(doc, pageCount);

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Add page numbers to every page (must be called before doc.end())
// ---------------------------------------------------------------------------
function addPageNumbers(doc: PDFKit.PDFDocument, pageCount: number) {
  const footerY = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT + 14;

  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);

    // Left: Page X of Y
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text(`Page ${i + 1} of ${pageCount}`, MARGIN, footerY, {
        width: CONTENT_WIDTH / 2,
        lineBreak: false,
      });

    // Right: Generated by Amigo
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text("Generated by Amigo", MARGIN, footerY, {
        width: CONTENT_WIDTH,
        align: "right",
      });
  }
}
