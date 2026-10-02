import { Receipt, receiptMoney } from './receipt-data';

/** Browser canvas export. Page height stays below mobile canvas limits. */
export async function renderReceiptImages(receipt: Receipt, mimeType = 'image/jpeg'): Promise<Blob[]> {
  if (!['image/jpeg', 'image/png'].includes(mimeType)) throw new Error('INVALID_RECEIPT_IMAGE_TYPE');
  const canvas = document.createElement('canvas');
  canvas.width = 960; canvas.height = 3600;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('RECEIPT_CANVAS_UNAVAILABLE');
  const context = ctx;
  const images: Blob[] = [];
  let y = 72;
  let page = 1;
  function wrapped(value: string, size: number, bold: boolean) {
    context.font = `${bold ? '600' : '400'} ${size}px Arial, sans-serif`;
    const lines: string[] = []; let current = '';
    for (const word of value.split(/\s+/)) {
      const test = current ? `${current} ${word}` : word;
      if (context.measureText(test).width <= 816) { current = test; continue; }
      if (current) lines.push(current);
      current = '';
      for (const character of word) { if (context.measureText(current + character).width > 816) { lines.push(current); current = ''; } current += character; }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }
  function draw(value: string, size = 28, bold = false, color = '#222222', strike = false) {
    const lines = wrapped(value, size, bold);
    context.fillStyle = color; context.textBaseline = 'top';
    for (const line of lines) {
      context.fillText(line, 72, y);
      if (strike && line) {
        context.save(); context.strokeStyle = color; context.lineWidth = Math.max(1, size / 20);
        context.beginPath(); context.moveTo(72, y + size * 0.56); context.lineTo(72 + context.measureText(line).width, y + size * 0.56); context.stroke(); context.restore();
      }
      y += size * 1.4;
    }
    y += 16;
  }
  function measure(value: string, size = 28, bold = false) { return wrapped(value, size, bold).length * size * 1.4 + 16; }
  function rule() { context.strokeStyle = '#aaaaaa'; context.setLineDash([5, 8]); context.beginPath(); context.moveTo(72, y); context.lineTo(888, y); context.stroke(); context.setLineDash([]); y += 36; }
  function start() { context.fillStyle = '#ffffff'; context.fillRect(0, 0, 960, 3600); y = 72; draw('AMIGO', 30, true); draw(receipt.labels.receipt, 54, true); draw(`${receipt.labels.for} ${receipt.recipient.name}`, 32, true); draw(receipt.title, 26); rule(); }
  async function finish() {
    y += 16; draw(receipt.labels.footer, 20); draw(`${receipt.labels.page} ${page}`, 20);
    const cropped = document.createElement('canvas'); cropped.width = 960; cropped.height = Math.min(3600, Math.ceil(y + 56));
    const croppedContext = cropped.getContext('2d'); if (!croppedContext) throw new Error('RECEIPT_CANVAS_UNAVAILABLE');
    croppedContext.drawImage(canvas, 0, 0);
    images.push(await new Promise<Blob>((resolve, reject) => cropped.toBlob(blob => blob ? resolve(blob) : reject(new Error('RECEIPT_IMAGE_FAILED')), mimeType, 0.95)));
    cropped.width = 0; cropped.height = 0;
  }
  async function ensure(height: number) { if (y + height > 3260) { await finish(); page++; start(); } }
  start();
  for (const line of receipt.lines) {
    const settled = line.paid > 0 && line.owed === 0;
    const itemColor = settled ? '#626262' : '#222222';
    const fragments = wrapped(line.description, 32, true);
    const date = new Intl.DateTimeFormat(receipt.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(line.date));
    const share = `${receipt.labels.share}: ${receiptMoney(line.total, line.currency, receipt.locale)}`;
    const paid = `${receipt.labels.paid}: ${receiptMoney(line.paid, line.currency, receipt.locale)}`;
    const owed = `${receipt.labels.owed}: ${receiptMoney(line.owed, line.currency, receipt.locale)}`;
    const detailHeight = measure(date, 23) + measure(share, 30, true) + measure(paid, 25) + measure(owed, 25) + 36;
    const rowHeight = fragments.length * (32 * 1.4 + 16) + detailHeight;
    if (rowHeight < 1800) await ensure(rowHeight);
    for (const fragment of fragments) { await ensure(70); draw(fragment, 32, true, itemColor, settled); }
    await ensure(detailHeight);
    draw(date, 23); draw(share, 30, true, itemColor, settled); draw(paid, 25); draw(owed, 25); rule();
  }
  for (const total of receipt.totals) {
    const totalText = `${receipt.labels.total}: ${receiptMoney(total.total, total.currency, receipt.locale)}`;
    const paidText = `${receipt.labels.paid}: ${receiptMoney(total.paid > 0 ? -total.paid : 0, total.currency, receipt.locale)}`;
    const discountText = `${receipt.labels.discount}: ${receiptMoney(-total.discount, total.currency, receipt.locale)}`;
    const balanceText = receiptMoney(total.owed, total.currency, receipt.locale);
    await ensure(measure(totalText) + measure(paidText) + (total.discount > 0 ? measure(discountText, 28, true) : 0) + measure(receipt.labels.balance, 26) + measure(balanceText, 58, true) + 36);
    draw(totalText); draw(paidText);
    if (total.discount > 0) draw(discountText, 28, true, '#b42332');
    draw(receipt.labels.balance, 26); draw(balanceText, 58, true); rule();
  }
  if (receipt.mode === 'eur') { await ensure(100); draw(receipt.labels.conversion, 22); }
  await finish(); canvas.width = 0; canvas.height = 0;
  return images;
}
