import PDFDocument from 'pdfkit';
import { Receipt } from './receipt-data';
import { buildReceiptLayout } from './receipt-layout';

/** A single growing sheet: no pagination or shrinking the user's ticket. */
export async function renderReceiptPdf(receipt: Receipt): Promise<Buffer> {
  const layout = buildReceiptLayout(receipt);
  if (layout.height > 14_400) throw new Error('RECEIPT_TOO_TALL');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [layout.width, layout.height], margin: 0, info: { Title: `${receipt.labels.receipt} — ${receipt.recipient.name}`, Author: 'SLENDY BANK INC' } });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.rect(0, 0, layout.width, layout.height).fill(layout.paper);
    for (const command of layout.commands) {
      if (command.kind === 'text') {
        doc.font(command.bold ? 'Courier-Bold' : 'Courier').fontSize(command.size).fillColor(command.color)
          .text(command.text, command.x, command.y, { lineBreak: false });
        if (command.strike) {
          doc.save().strokeColor(command.color).lineWidth(0.6).moveTo(command.x, command.y + command.size * 0.34)
            .lineTo(command.x + Array.from(command.text).length * command.size * 0.6, command.y + command.size * 0.34).stroke().restore();
        }
      } else if (command.kind === 'rule') {
        doc.save().strokeColor('#77776c').lineWidth(0.5).dash(2, { space: 3 }).moveTo(24, command.y).lineTo(layout.width - 24, command.y).stroke().restore();
      } else doc.rect(command.x, command.y, command.width, command.height).fill('#252520');
    }
    doc.end();
  });
}
