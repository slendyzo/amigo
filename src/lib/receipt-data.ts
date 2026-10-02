export type ReceiptExpense = { id: string; description: string; date: string; amount: number; amountEur: number; currency: string; splitCount: number | null; splitData: string | null; updatedAt: string };
export type ReceiptPerson = { id: string; name: string };
export type ReceiptContext = { title: string; people: ReceiptPerson[]; expenses: ReceiptExpense[] };
export type ReceiptTotals = { currency: string; total: number; paid: number; discount: number; owed: number };
export type ReceiptLine = Omit<ReceiptTotals, 'discount'> & { expenseId: string; description: string; date: string };
export type Receipt = { title: string; recipient: ReceiptPerson; mode: 'eur' | 'original'; locale: string; lines: ReceiptLine[]; totals: ReceiptTotals[]; labels: ReturnType<typeof getReceiptLabels> };

export function getReceiptLabels(locale: string) {
  const dictionaries = {
    en: { receipt: 'Expense ticket', for: 'Prepared for', share: 'Your share', paid: 'Paid', owed: 'Remaining', total: 'Total share', discount: 'Ticket discount', balance: 'Balance due', footer: 'Personal expense summary · Not a tax receipt', conversion: 'EUR values use the saved expense exchange rates.', continued: 'Continued', page: 'Page' },
    pt: { receipt: 'Talão de despesas', for: 'Preparado para', share: 'A tua parte', paid: 'Pago', owed: 'Por pagar', total: 'Total da tua parte', discount: 'Desconto no talão', balance: 'Saldo em dívida', footer: 'Resumo de despesas pessoais · Não é um recibo fiscal', conversion: 'Valores em EUR às taxas guardadas nas despesas.', continued: 'Continuação', page: 'Página' },
    fr: { receipt: 'Ticket de dépenses', for: 'Préparé pour', share: 'Votre part', paid: 'Payé', owed: 'Restant', total: 'Total de votre part', discount: 'Remise sur le ticket', balance: 'Solde à régler', footer: 'Résumé de dépenses personnelles · Sans valeur fiscale', conversion: 'Montants en EUR aux taux enregistrés des dépenses.', continued: 'Suite', page: 'Page' },
  };
  return dictionaries[locale.split('-')[0] as keyof typeof dictionaries] || dictionaries.en;
}

function cents(value: number) {
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) throw new Error('INVALID_RECEIPT_AMOUNT');
  return Math.round((value + Number.EPSILON) * 100);
}

export function buildReceipt(context: ReceiptContext, personId: string, mode: 'eur' | 'original', locale: string, discounts: Record<string, number> = {}): Receipt {
  if (!discounts || typeof discounts !== 'object' || Array.isArray(discounts) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(discounts)) || Object.getOwnPropertySymbols(discounts).length) throw new Error('INVALID_RECEIPT_DISCOUNT');
  const person = context.people.find(p => p.id === personId);
  if (!person || !person.name.trim()) throw new Error('RECEIPT_PERSON_NOT_FOUND');
  if (mode !== 'eur' && mode !== 'original') throw new Error('INVALID_RECEIPT_CURRENCY_MODE');
  const lines: ReceiptLine[] = [];
  for (const expense of context.expenses) {
    if (!expense.splitCount || expense.splitCount < 2) continue;
    let rows: { personId?: string; amount: number; repayment?: { paid: boolean } }[];
    try { rows = JSON.parse(expense.splitData || 'null'); } catch { throw new Error('INVALID_RECEIPT_SPLIT'); }
    if (!Array.isArray(rows) || rows.length !== expense.splitCount || rows.some(row => !row || typeof row !== 'object')) throw new Error('INVALID_RECEIPT_SPLIT');
    const matches = rows.slice(1).filter(row => row.personId === personId);
    if (!matches.length) continue;
    if (matches.length !== 1) throw new Error('DUPLICATE_RECEIPT_PERSON');
    const row = matches[0];
    const full = cents(expense.amount);
    const share = cents(row.amount);
    if (share > full || rows.reduce((sum, item) => sum + cents(item.amount), 0) !== full) throw new Error('INVALID_RECEIPT_SPLIT_TOTAL');
    if (row.repayment && typeof row.repayment.paid !== 'boolean') throw new Error('INVALID_RECEIPT_REPAYMENT');
    if (!/^[A-Z]{3}$/.test(expense.currency) || !Number.isFinite(Date.parse(expense.date))) throw new Error('INVALID_RECEIPT_EXPENSE');
    let total = share;
    if (mode === 'eur') {
      const eur = cents(expense.amountEur);
      if (full === 0 && eur !== 0) throw new Error('INVALID_RECEIPT_CONVERSION');
      total = full === 0 ? 0 : cents(expense.amountEur * row.amount / expense.amount);
    }
    const paid = row.repayment?.paid ? total : 0;
    lines.push({ expenseId: expense.id, description: expense.description, date: expense.date, currency: mode === 'eur' ? 'EUR' : expense.currency, total: total / 100, paid: paid / 100, owed: (total - paid) / 100 });
  }
  if (!lines.length) throw new Error('NO_RECEIPT_EXPENSES');
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.expenseId.localeCompare(b.expenseId));
  const groups = new Map<string, ReceiptTotals>();
  for (const line of lines) {
    const group = groups.get(line.currency) || { currency: line.currency, total: 0, paid: 0, discount: 0, owed: 0 };
    group.total += cents(line.total); group.paid += cents(line.paid); group.owed += cents(line.owed);
    if (![group.total, group.paid, group.owed].every(Number.isSafeInteger)) throw new Error('INVALID_RECEIPT_AMOUNT');
    groups.set(line.currency, group);
  }
  for (const currency of Object.getOwnPropertyNames(discounts)) {
    const descriptor = Object.getOwnPropertyDescriptor(discounts, currency);
    const amount: unknown = descriptor?.value;
    const group = groups.get(currency);
    // Ticket adjustments are explicit cent amounts; do not silently round user input.
    if (!group || !descriptor || !('value' in descriptor) || typeof amount !== 'number' ||
      !Number.isFinite(amount) || amount < 0 || Number(amount.toFixed(2)) !== amount ||
      !Number.isSafeInteger(Math.round(amount * 100))) throw new Error('INVALID_RECEIPT_DISCOUNT');
    const discount = cents(amount);
    if (discount > group.owed) throw new Error('RECEIPT_DISCOUNT_EXCEEDS_BALANCE');
    group.discount = discount;
    group.owed -= discount;
  }
  return { title: context.title, recipient: { id: person.id, name: person.name }, mode, locale, lines, totals: [...groups.values()].map(g => ({ currency: g.currency, total: g.total / 100, paid: g.paid / 100, discount: g.discount / 100, owed: g.owed / 100 })), labels: getReceiptLabels(locale) };
}

export function receiptMoney(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
export function receiptFilename(receipt: Receipt, extension: string, page?: number) {
  const name = `${receipt.title}-${receipt.recipient.name}`.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'receipt';
  return `${name}${page === undefined ? '' : `-${page}`}.${extension.replace(/[^a-z0-9]/gi, '')}`;
}
