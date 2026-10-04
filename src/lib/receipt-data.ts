export type ReceiptExpense = { id: string; description: string; date: string; amount: number; amountEur: number; currency: string; splitCount: number | null; splitData: string | null; updatedAt: string };
export type ReceiptPerson = { id: string; name: string };
export type ReceiptExchangeRates = { rates: Record<string, number>; source: 'live'; sourceDate: string };
export type ReceiptContext = { title: string; people: ReceiptPerson[]; expenses: ReceiptExpense[]; exchangeRates?: ReceiptExchangeRates; ratesToken?: string };
export type ReceiptExtra = { amount: number; reason: string };
export type ReceiptTotals = { currency: string; total: number; paid: number; discount: number; owed: number; extra?: ReceiptExtra };
export type ReceiptLine = Omit<ReceiptTotals, 'discount' | 'extra'> & { expenseId: string; description: string; date: string };
export type Receipt = { title: string; recipient: ReceiptPerson; mode: 'eur' | 'original'; locale: string; lines: ReceiptLine[]; totals: ReceiptTotals[]; exchange?: { date: string; source: string; amounts: { currency: string; amount: number }[] }; labels: ReturnType<typeof getReceiptLabels> };

export function getReceiptLabels(locale: string) {
  const dictionaries = {
    en: { receipt: 'Expense ticket', for: 'Prepared for', share: 'Your share', paid: 'Paid', owed: 'Remaining', total: 'Expenses', discount: 'Ticket discount', balance: 'Amount to pay', extraPayment: 'Pay this extra', extraCharge: 'Extra payment', footer: 'Personal expense summary · Not a tax receipt', conversion: 'EUR values use the saved expense exchange rates.', continued: 'Continued', page: 'Page' },
    pt: { receipt: 'Talão de despesas', for: 'Preparado para', share: 'A tua parte', paid: 'Pago', owed: 'Por pagar', total: 'Despesas', discount: 'Desconto no talão', balance: 'Total a pagar', extraPayment: 'Paga este extra', extraCharge: 'Pagamento extra', footer: 'Resumo de despesas pessoais · Não é um recibo fiscal', conversion: 'Valores em EUR às taxas guardadas nas despesas.', continued: 'Continuação', page: 'Página' },
    fr: { receipt: 'Ticket de dépenses', for: 'Préparé pour', share: 'Votre part', paid: 'Payé', owed: 'Restant', total: 'Dépenses', discount: 'Remise sur le ticket', balance: 'Total à payer', extraPayment: 'Payez ce supplément', extraCharge: 'Paiement supplémentaire', footer: 'Résumé de dépenses personnelles · Sans valeur fiscale', conversion: 'Montants en EUR aux taux enregistrés des dépenses.', continued: 'Suite', page: 'Page' },
  };
  const extras = {
    en: { equivalents: 'Approximate equivalents', ratesUnavailable: 'Current exchange rates unavailable', ratesAsOf: 'Rates as of', thankYou: 'Thank you!' },
    pt: { equivalents: 'Equivalentes aproximados', ratesUnavailable: 'Taxas de câmbio atuais indisponíveis', ratesAsOf: 'Taxas de', thankYou: 'Obrigado!' },
    fr: { equivalents: 'Équivalents approximatifs', ratesUnavailable: 'Taux de change actuels indisponibles', ratesAsOf: 'Taux du', thankYou: 'Merci !' },
  };
  const language = locale.split('-')[0] as keyof typeof dictionaries;
  return { ...(dictionaries[language] || dictionaries.en), ...(extras[language] || extras.en) };
}

const EXCHANGE_CURRENCIES = ['EUR', 'USD', 'GBP', 'CAD', 'JPY'] as const;

export function validReceiptExchangeRates(value: unknown): value is ReceiptExchangeRates {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as ReceiptExchangeRates;
  return snapshot.source === 'live' && typeof snapshot.sourceDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(snapshot.sourceDate) && Number.isFinite(Date.parse(snapshot.sourceDate)) &&
    new Date(snapshot.sourceDate).toISOString().slice(0, 10) === snapshot.sourceDate &&
    !!snapshot.rates && typeof snapshot.rates === 'object' && !Array.isArray(snapshot.rates) && snapshot.rates.EUR === 1 &&
    EXCHANGE_CURRENCIES.every(currency => Number.isFinite(snapshot.rates[currency]) && snapshot.rates[currency] > 0) &&
    Object.entries(snapshot.rates).every(([currency, rate]) => /^[A-Z]{3}$/.test(currency) && Number.isFinite(rate) && rate > 0);
}

function exchangeEquivalents(totals: ReceiptTotals[], snapshot: ReceiptContext['exchangeRates']): Receipt['exchange'] {
  if (!validReceiptExchangeRates(snapshot)) return undefined;
  let remainingEur = 0;
  for (const group of totals) {
    // A fully paid currency needs no conversion and must not block other balances.
    if (group.owed === 0) continue;
    const rate = snapshot.rates[group.currency];
    if (!Number.isFinite(rate) || rate <= 0) return undefined;
    remainingEur += group.owed * rate;
  }
  if (!Number.isFinite(remainingEur) || remainingEur < 0) return undefined;
  const amounts = EXCHANGE_CURRENCIES.map(currency => ({ currency, amount: Number((remainingEur / snapshot.rates[currency]).toFixed(currency === 'JPY' ? 0 : 2)) }));
  if (amounts.some(item => !Number.isSafeInteger(Math.round(item.amount * (item.currency === 'JPY' ? 1 : 100))))) return undefined;
  return { date: snapshot.sourceDate, source: 'Frankfurter / ECB', amounts };
}

function cents(value: number) {
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) throw new Error('INVALID_RECEIPT_AMOUNT');
  return Math.round((value + Number.EPSILON) * 100);
}

export function buildReceipt(context: ReceiptContext, personId: string, mode: 'eur' | 'original', locale: string, discounts: Record<string, number> = {}, extras: Record<string, ReceiptExtra> = {}): Receipt {
  if (!discounts || typeof discounts !== 'object' || Array.isArray(discounts) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(discounts)) || Object.getOwnPropertySymbols(discounts).length) throw new Error('INVALID_RECEIPT_DISCOUNT');
  if (!extras || typeof extras !== 'object' || Array.isArray(extras) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(extras)) || Object.getOwnPropertySymbols(extras).length) throw new Error('INVALID_RECEIPT_EXTRA');
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
  for (const currency of Object.getOwnPropertyNames(extras)) {
    const descriptor = Object.getOwnPropertyDescriptor(extras, currency);
    const value: unknown = descriptor?.value;
    const group = groups.get(currency);
    if (!group || !descriptor || !('value' in descriptor) || !value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length) throw new Error('INVALID_RECEIPT_EXTRA');
    const amountDescriptor = Object.getOwnPropertyDescriptor(value, 'amount');
    const reasonDescriptor = Object.getOwnPropertyDescriptor(value, 'reason');
    const amount: unknown = amountDescriptor?.value;
    const reason: unknown = reasonDescriptor?.value;
    if (!amountDescriptor || !('value' in amountDescriptor) || !reasonDescriptor || !('value' in reasonDescriptor) ||
      typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || Number(amount.toFixed(2)) !== amount ||
      !Number.isSafeInteger(Math.round(amount * 100)) || typeof reason !== 'string' ||
      !reason.trim().length || reason.trim().length > 200 || /[\u0000-\u001f\u007f-\u009f]/.test(reason)) throw new Error('INVALID_RECEIPT_EXTRA');
    const extra = cents(amount);
    if (!Number.isSafeInteger(group.owed + extra)) throw new Error('INVALID_RECEIPT_EXTRA');
    group.extra = { amount: extra, reason: reason.trim() };
    group.owed += extra;
  }
  const totals = [...groups.values()].map(g => ({ currency: g.currency, total: g.total / 100, paid: g.paid / 100, discount: g.discount / 100, owed: g.owed / 100, ...(g.extra ? { extra: { amount: g.extra.amount / 100, reason: g.extra.reason } } : {}) }));
  return { title: context.title, recipient: { id: person.id, name: person.name }, mode, locale, lines, totals, exchange: exchangeEquivalents(totals, context.exchangeRates), labels: getReceiptLabels(locale) };
}

export function receiptMoney(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
export function receiptFilename(receipt: Receipt, extension: string, page?: number) {
  const name = `${receipt.title}-${receipt.recipient.name}`.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'receipt';
  return `${name}${page === undefined ? '' : `-${page}`}.${extension.replace(/[^a-z0-9]/gi, '')}`;
}
