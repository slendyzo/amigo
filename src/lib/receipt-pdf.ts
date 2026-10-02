import PDFDocument from 'pdfkit';
import { Receipt, receiptMoney } from './receipt-data';

/** Only accepts the privacy-filtered receipt contract, never expense records. */
export async function renderReceiptPdf(receipt: Receipt): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [320, 760], margin: 28, info: { Title: `${receipt.labels.receipt} — ${receipt.recipient.name}`, Author: 'Amigo' } });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const width = 264;
    let y = 28;
    let page = 0;
    const measure = (value: string, size = 10, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
      return doc.heightOfString(value, { width, lineGap: 3 }) + 7;
    };
    const text = (value: string, size = 10, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#222222');
      const height = doc.heightOfString(value, { width, lineGap: 3 });
      doc.text(value, 28, y, { width, lineGap: 3 }); y += height + 7;
    };
    const rule = () => { doc.save().strokeColor('#999999').lineWidth(0.5).dash(2, { space: 3 }).moveTo(28, y).lineTo(292, y).stroke().restore(); y += 16; };
    const header = () => { page++; text('AMIGO', 12, true); text(receipt.labels.receipt, 22, true); text(`${receipt.labels.for} ${receipt.recipient.name}`, 12, true); text(receipt.title, 10); rule(); };
    const footer = () => { doc.font('Helvetica').fontSize(7).fillColor('#777777').text(`${receipt.labels.footer}\n${receipt.labels.page} ${page}`, 28, 706, { width, align: 'center', height: 26 }); };
    const ensure = (height: number) => { if (y + height > 690) { footer(); doc.addPage(); y = 28; header(); } };
    header();
    for (const line of receipt.lines) {
      doc.font('Helvetica-Bold').fontSize(11);
      // Bound long descriptions into independently paginated paragraphs.
      const words: string[] = [];
      let paragraph = '';
      for (const word of line.description.split(/\s+/)) {
        if (paragraph && paragraph.length + word.length > 120) { words.push(paragraph); paragraph = ''; }
        if (word.length > 120) {
          if (paragraph) { words.push(paragraph); paragraph = ''; }
          words.push(...(word.match(/[\s\S]{1,120}/g) || []));
        } else paragraph += `${paragraph ? ' ' : ''}${word}`;
      }
      if (paragraph || !words.length) words.push(paragraph);
      const date = new Intl.DateTimeFormat(receipt.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(line.date));
      const share = `${receipt.labels.share}: ${receiptMoney(line.total, line.currency, receipt.locale)}`;
      const settlement = `${receipt.labels.paid}: ${receiptMoney(line.paid, line.currency, receipt.locale)}   ·   ${receipt.labels.owed}: ${receiptMoney(line.owed, line.currency, receipt.locale)}`;
      const detailHeight = measure(date, 9) + measure(share, 11, true) + measure(settlement, 8) + 16;
      const rowHeight = words.reduce((height, fragment) => height + measure(fragment, 11, true), detailHeight);
      if (rowHeight < 380) ensure(rowHeight);
      for (const fragment of words) { ensure(measure(fragment, 11, true)); text(fragment, 11, true); }
      ensure(detailHeight);
      text(date, 9);
      text(share, 11, true);
      text(settlement, 8);
      rule();
    }
    for (const total of receipt.totals) {
      const totalText = `${receipt.labels.total} · ${receiptMoney(total.total, total.currency, receipt.locale)}`;
      const paidText = `${receipt.labels.paid} · ${receiptMoney(total.paid, total.currency, receipt.locale)}`;
      const balanceText = receiptMoney(total.owed, total.currency, receipt.locale);
      ensure(measure(totalText, 11) + measure(paidText, 11) + measure(receipt.labels.balance, 10) + measure(balanceText, 24, true) + 16);
      text(totalText, 11);
      text(paidText, 11);
      text(receipt.labels.balance, 10);
      text(balanceText, 24, true); rule();
    }
    if (receipt.mode === 'eur') { ensure(measure(receipt.labels.conversion, 8)); text(receipt.labels.conversion, 8); }
    footer(); doc.end();
  });
}
