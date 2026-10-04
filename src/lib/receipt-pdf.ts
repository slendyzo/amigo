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
        doc.font(command.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(command.size).fillColor(command.color);
        const width = doc.widthOfString(command.text);
        const x = command.align === 'right' ? command.x - width : command.align === 'center' ? command.x - width / 2 : command.x;
        doc.text(command.text, x, command.y, { lineBreak: false });
        if (command.strike) {
          doc.save().strokeColor(command.color).lineWidth(0.6).moveTo(x, command.y + command.size * 0.42)
            .lineTo(x + width, command.y + command.size * 0.42).stroke().restore();
        }
      } else if (command.kind === 'rule') {
        doc.save().strokeColor('#000000').lineWidth(0.5).dash(2, { space: 3 }).moveTo(24, command.y).lineTo(layout.width - 24, command.y).stroke().restore();
      } else doc.rect(command.x, command.y, command.width, command.height).fill(command.color || '#000000');
    }
    doc.end();
  });
}
