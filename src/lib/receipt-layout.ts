import { Receipt, receiptMoney } from './receipt-data';

export type ReceiptDrawCommand =
  | { kind: 'text'; text: string; x: number; y: number; size: number; bold: boolean; color: string; strike: boolean }
  | { kind: 'rule'; y: number }
  | { kind: 'bar'; x: number; y: number; width: number; height: number };
export type ReceiptLayout = { width: number; height: number; paper: string; commands: ReceiptDrawCommand[] };
const WIDTH = 320, MARGIN = 24, CONTENT = WIDTH - MARGIN * 2;
const INK = '#252520', MUTED = '#62625a', RED = '#b42332';
function clean(text: string) { return text.replace(/\s+/g, ' ').trim(); }
function textWidth(text: string, size: number) { return Array.from(text).length * size * 0.6; }
function wrap(text: string, width: number, size: number) {
  const capacity = Math.max(1, Math.floor(width / (size * 0.6)));
  const lines: string[] = [];
  let line = '';
  for (const word of clean(text).split(' ')) {
    if (Array.from(line ? `${line} ${word}` : word).length <= capacity) { line += `${line ? ' ' : ''}${word}`; continue; }
    if (line) lines.push(line);
    line = '';
    const characters = Array.from(word);
    while (characters.length > capacity) lines.push(characters.splice(0, capacity).join(''));
    line = characters.join('');
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** One shared coordinate system makes PDF and image the same continuous ticket. */
export function buildReceiptLayout(receipt: Receipt): ReceiptLayout {
  const commands: ReceiptDrawCommand[] = [];
  let y = 25;
  const money = (value: number, currency: string) => clean(receiptMoney(value, currency, receipt.locale));
  function text(value: string, x: number, top: number, size: number, bold = false, color = INK, strike = false) {
    commands.push({ kind: 'text', text: clean(value), x, y: top, size, bold, color, strike });
  }
  function centered(value: string, size = 9, bold = false, color = INK) {
    for (const line of wrap(value, CONTENT, size)) { text(line, (WIDTH - textWidth(line, size)) / 2, y, size, bold, color); y += size * 1.4; }
  }
  function rule() { y += 8; commands.push({ kind: 'rule', y }); y += 12; }
  function row(label: string, amount: string, size = 10, bold = false, color = INK, strike = false) {
    const amountWidth = textWidth(amount, size);
    const leftWidth = CONTENT - amountWidth - 12;
    // Exceptional large amounts get their own row rather than colliding with descriptions.
    if (leftWidth < size * 0.6 * 10) {
      for (const line of wrap(label, CONTENT, size)) { text(line, MARGIN, y, size, bold, color, strike); y += size * 1.4; }
      for (const line of wrap(amount, CONTENT, size)) { text(line, WIDTH - MARGIN - textWidth(line, size), y, size, bold, color, strike); y += size * 1.4; }
      return;
    }
    const lines = wrap(label, leftWidth, size);
    text(amount, WIDTH - MARGIN - amountWidth, y, size, bold, color, strike);
    for (const line of lines) { text(line, MARGIN, y, size, bold, color, strike); y += size * 1.4; }
  }
  centered('SLENDY BANK INC', 17, true);
  y += 5;
  centered(receipt.labels.receipt.toLocaleUpperCase(receipt.locale), 9);
  centered(`${receipt.labels.for} ${receipt.recipient.name}`, 9);
  centered(receipt.title, 9);
  rule();
  for (const line of receipt.lines) {
    const settled = line.paid > 0 && line.owed === 0;
    row(line.description, money(line.total, line.currency), 10, false, settled ? MUTED : INK, settled);
    const date = new Intl.DateTimeFormat(receipt.locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(line.date));
    const status = line.paid > 0 ? `${date} · ${receipt.labels.paid}: ${money(line.paid, line.currency)} · ${receipt.labels.owed}: ${money(line.owed, line.currency)}` : date;
    for (const small of wrap(status, CONTENT, 7.5)) { text(small, MARGIN, y + 1, 7.5, false, MUTED); y += 10; }
    y += 7;
  }
  rule();
  for (const total of receipt.totals) {
    row(receipt.labels.total, money(total.total, total.currency));
    if (total.paid > 0) row(receipt.labels.paid, money(-total.paid, total.currency));
    if (total.discount > 0) row(receipt.labels.discount, money(-total.discount, total.currency), 10, true, RED);
    y += 5;
    row(receipt.labels.balance.toLocaleUpperCase(receipt.locale), money(total.owed, total.currency), 12, true);
    y += 9;
  }
  rule();
  if (receipt.exchange) {
    centered(receipt.labels.equivalents.toLocaleUpperCase(receipt.locale), 8, true);
    y += 6;
    for (const equivalent of receipt.exchange.amounts) {
      const number = new Intl.NumberFormat(receipt.locale, { minimumFractionDigits: equivalent.currency === 'JPY' ? 0 : 2, maximumFractionDigits: equivalent.currency === 'JPY' ? 0 : 2 }).format(equivalent.amount);
      row(equivalent.currency, number, 9);
    }
    y += 5;
    centered(`${receipt.labels.ratesAsOf} ${receipt.exchange.date} · ${receipt.exchange.source}`, 7, false, MUTED);
  } else centered(receipt.labels.ratesUnavailable, 7.5, false, MUTED);
  if (receipt.mode === 'eur') { y += 7; centered(receipt.labels.conversion, 7, false, MUTED); }
  rule();
  centered(receipt.labels.thankYou.toLocaleUpperCase(receipt.locale), 13, true);
  y += 9;
  // Decorative bars do not encode a transaction or payment identifier.
  const bars = [2,1,1,3,1,2,3,1,2,1,1,3,2,1,3,1,2,2,1,3,1,1,2,3,1,2,1,3,2,1,1,2,3,1,2,1,3,2,1,1,3,2,1,2,1,3];
  const barcodeWidth = bars.reduce((sum, width) => sum + width, 0) + bars.length;
  let x = (WIDTH - barcodeWidth) / 2;
  bars.forEach(width => { commands.push({ kind: 'bar', x, y, width, height: 22 }); x += width + 1; });
  y += 32;
  centered(receipt.labels.footer, 6.5, false, MUTED);
  return { width: WIDTH, height: Math.ceil(y + 25), paper: '#f8f5ed', commands };
}
