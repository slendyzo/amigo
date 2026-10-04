import { Receipt, receiptMoney } from './receipt-data';

export type ReceiptDrawCommand =
  | { kind: 'text'; text: string; x: number; y: number; size: number; bold: boolean; color: string; strike: boolean; align: 'left' | 'right' | 'center' }
  | { kind: 'rule'; y: number }
  | { kind: 'bar'; x: number; y: number; width: number; height: number; color?: string };
export type ReceiptLayout = { width: number; height: number; paper: string; commands: ReceiptDrawCommand[] };
const WIDTH = 320, MARGIN = 24, CONTENT = WIDTH - MARGIN * 2;
const INK = '#000000', MUTED = '#4b4b4b', RED = '#b42332';
function clean(text: string) { return text.replace(/\s+/g, ' ').trim(); }
// Standard Helvetica AFM advances in WinAnsi order, also used for safe browser wrapping.
const FONT_WIDTHS = [[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,500,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,0],
[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,556,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,0]];
const WIN_ANSI: Record<number, number> = {
  402: 131,
  8211: 150,
  8212: 151,
  8216: 145,
  8217: 146,
  8218: 130,
  8220: 147,
  8221: 148,
  8222: 132,
  8224: 134,
  8225: 135,
  8226: 149,
  8230: 133,
  8364: 128,
  8240: 137,
  8249: 139,
  8250: 155,
  710: 136,
  8482: 153,
  338: 140,
  339: 156,
  732: 152,
  352: 138,
  353: 154,
  376: 159,
  381: 142,
  382: 158
};
function textWidth(text: string, size: number, bold = false) {
  const widths = FONT_WIDTHS[bold ? 1 : 0];
  return Array.from(text).reduce((sum, character) => {
    const code = character.codePointAt(0)!;
    return sum + (widths[(WIN_ANSI[code] || code) - 32] || 556);
  }, 0) * size / 1000;
}
function wrap(text: string, width: number, size: number, bold = false) {
  const lines: string[] = [];
  let line = '';
  for (const word of clean(text).split(' ')) {
    const candidate = line ? line + ' ' + word : word;
    if (textWidth(candidate, size, bold) <= width) { line = candidate; continue; }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (line && textWidth(line + character, size, bold) > width) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** One shared coordinate system makes PDF and image the same continuous ticket. */
export function buildReceiptLayout(receipt: Receipt): ReceiptLayout {
  const commands: ReceiptDrawCommand[] = [];
  let y = 25;
  const money = (value: number, currency: string) => clean(receiptMoney(value, currency, receipt.locale));
  function text(value: string, x: number, top: number, size: number, bold = false, color = INK, strike = false, align: 'left' | 'right' | 'center' = 'left') {
    commands.push({ kind: 'text', text: clean(value), x, y: top, size, bold, color, strike, align });
  }
  function centered(value: string, size = 9, bold = false, color = INK) {
    for (const line of wrap(value, CONTENT, size, bold)) { text(line, WIDTH / 2, y, size, bold, color, false, 'center'); y += size * 1.4; }
  }
  function rule() { y += 8; commands.push({ kind: 'rule', y }); y += 12; }
  function row(label: string, amount: string, size = 10, bold = false, color = INK, strike = false) {
    const amountWidth = textWidth(amount, size, bold);
    const leftWidth = CONTENT - amountWidth - 12;
    // Exceptional large amounts get their own row rather than colliding with descriptions.
    if (leftWidth < size * 4) {
      for (const line of wrap(label, CONTENT, size, bold)) { text(line, MARGIN, y, size, bold, color, strike); y += size * 1.4; }
      for (const line of wrap(amount, CONTENT, size, bold)) { text(line, WIDTH - MARGIN, y, size, bold, color, strike, 'right'); y += size * 1.4; }
      return;
    }
    const lines = wrap(label, leftWidth, size, bold);
    text(amount, WIDTH - MARGIN, y, size, bold, color, strike, 'right');
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
    if (total.owed === 0 && total.total === total.paid && total.discount === 0 && !total.extra) {
      text(total.currency + ' — ' + receipt.labels.paid, MARGIN, y, 10, true);
      y += 23;
      continue;
    }
    if (receipt.totals.length > 1) { text(total.currency, MARGIN, y, 10, true); y += 18; }
    row(receipt.labels.total, money(total.total, total.currency));
    if (total.paid > 0) row(receipt.labels.paid, money(-total.paid, total.currency));
    if (total.discount > 0) row(receipt.labels.discount, money(-total.discount, total.currency), 10, true, RED);
    if (total.extra && total.extra.amount > 0) {
      y += 7;
      const top = y;
      const backgroundIndex = commands.length;
      commands.push({ kind: 'bar', x: MARGIN - 8, y: top - 8, width: CONTENT + 16, height: 0, color: INK });
      row(receipt.labels.extraPayment, '+' + money(total.extra.amount, total.currency), 10, true, '#ffffff');
      y += 4;
      for (const line of wrap(total.extra.reason, CONTENT, 9)) { text(line, MARGIN, y, 9, false, '#ffffff'); y += 13; }
      const background = commands[backgroundIndex];
      if (background.kind === 'bar') background.height = y - top + 16;
      y += 17;
    }
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
  return { width: WIDTH, height: Math.ceil(y + 25), paper: '#ffffff', commands };
}
