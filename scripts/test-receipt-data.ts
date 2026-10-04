import assert from 'node:assert/strict';
import { buildReceipt, type ReceiptContext } from '../src/lib/receipt-data';
import { renderReceiptPdf } from '../src/lib/receipt-pdf';
import { buildReceiptLayout } from '../src/lib/receipt-layout';
import { signReceiptRates, verifyReceiptRates } from '../src/lib/receipt-rates';

async function main() {
const context: ReceiptContext = { title: 'New York', people: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }], expenses: [] };
function add(id: string, currency: string, paid = false) {
  context.expenses.push({ id, description: 'Dinner', date: '2026-10-01', amount: 30, amountEur: 26, currency, splitCount: 3, updatedAt: '2026-10-02', splitData: JSON.stringify([{ personId: 'owner', label: 'Me', amount: 10 }, { personId: 'alice', label: 'Alice', amount: 10, repayment: { paid, note: 'private repayment memo' } }, { personId: 'bob', label: 'Bob', amount: 10 }]) });
}
add('a', 'USD', true); add('b', 'GBP');
const eur = buildReceipt(context, 'alice', 'eur', 'en');
assert.deepEqual(eur.totals, [{ currency: 'EUR', total: 17.34, paid: 8.67, discount: 0, owed: 8.67 }]);
assert.equal(eur.lines.length, 2, 'Paid expenses remain itemized');
assert.equal(eur.lines[0].owed, 0, 'Paid expense contributes no balance due');
assert.equal(eur.lines[0].paid, eur.lines[0].total);
assert.equal(eur.totals[0].owed, eur.lines[1].owed, 'Only the unpaid expense contributes to balance');
const beforeDiscount = JSON.stringify(context);
const discounts = Object.freeze({ EUR: 2.35 });
const discounted = buildReceipt(context, 'alice', 'eur', 'en', discounts);
assert.deepEqual(discounted.totals, [{ currency: 'EUR', total: 17.34, paid: 8.67, discount: 2.35, owed: 6.32 }]);
assert.deepEqual(discounted.lines, eur.lines);
assert.equal(JSON.stringify(context), beforeDiscount);
assert.deepEqual(discounts, { EUR: 2.35 });
assert.equal(buildReceipt(context, 'alice', 'eur', 'en', { EUR: 8.67 }).totals[0].owed, 0);
assert.deepEqual(buildReceipt(context, 'alice', 'eur', 'en', {}).totals, eur.totals);
for (const invalid of [null, [], 1, 'discount', new Date(), { EUR: NaN }, { EUR: Infinity }, { EUR: -1 }, { EUR: 0.001 }, { EUR: '1' }, { EUR: Number.MAX_SAFE_INTEGER }, { USD: 1 }, { NOT: 0 }]) {
  assert.throws(() => buildReceipt(context, 'alice', 'eur', 'en', invalid as unknown as Record<string, number>), /INVALID_RECEIPT_DISCOUNT/);
}
assert.throws(() => buildReceipt(context, 'alice', 'eur', 'en', { EUR: 8.68 }), /EXCEEDS_BALANCE/);
assert.throws(() => buildReceipt(context, 'alice', 'original', 'en', { USD: 0.01 }), /EXCEEDS_BALANCE/);
const mixedDiscount = buildReceipt(context, 'alice', 'original', 'en', { USD: 0, GBP: 3.25 });
assert.deepEqual(mixedDiscount.totals, [{ currency: 'USD', total: 10, paid: 10, discount: 0, owed: 0 }, { currency: 'GBP', total: 10, paid: 0, discount: 3.25, owed: 6.75 }]);
assert.equal(buildReceipt(context, 'bob', 'original', 'en').totals[1].owed, 10);
const extras = Object.freeze({ USD: Object.freeze({ amount: 4.5, reason: '  Airport pickup  ' }), GBP: Object.freeze({ amount: 2.25, reason: 'Service charge' }) });
const extraTicket = buildReceipt(context, 'alice', 'original', 'en', { GBP: 3.25 }, extras);
assert.deepEqual(extraTicket.totals, [
  { currency: 'USD', total: 10, paid: 10, discount: 0, owed: 4.5, extra: { amount: 4.5, reason: 'Airport pickup' } },
  { currency: 'GBP', total: 10, paid: 0, discount: 3.25, owed: 9, extra: { amount: 2.25, reason: 'Service charge' } },
], 'Extra payments can be due on paid expenses and remain separate by currency');
assert.deepEqual(extraTicket.lines, buildReceipt(context, 'alice', 'original', 'en').lines, 'Extras never modify expense shares or paid status');
assert.equal(JSON.stringify(context), beforeDiscount, 'Ticket extras never change the recorded ledger');
assert.equal(extras.USD.reason, '  Airport pickup  ', 'Input adjustment objects remain untouched');
assert(!JSON.stringify(buildReceipt(context, 'bob', 'original', 'en')).includes('Airport pickup'), 'Another recipient never receives this ticket adjustment');
assert.throws(() => buildReceipt(context, 'alice', 'original', 'en', { GBP: 10.01 }, { GBP: { amount: 20, reason: 'Extra' } }), /EXCEEDS_BALANCE/, 'An extra cannot increase the allowable discount');
for (const invalid of [null, [], 1, 'extra', new Date(), { EUR: { amount: 1, reason: 'Wrong currency' } }, { USD: null }, { USD: [] },
  ...[0, -1, 0.001, NaN, Infinity, Number.MAX_SAFE_INTEGER, '1'].map(amount => ({ USD: { amount, reason: 'Extra' } })),
  ...['', '   ', 'x'.repeat(201), 'bad\nreason', 'bad\u0000reason', 'bad\u0085reason', 1].map(reason => ({ USD: { amount: 1, reason } })),
]) assert.throws(() => buildReceipt(context, 'alice', 'original', 'en', {}, invalid as unknown as Parameters<typeof buildReceipt>[5]), /INVALID_RECEIPT_EXTRA/);
assert.throws(() => buildReceipt(context, 'alice', 'original', 'en', {}, { GBP: { amount: 90071992547409.9, reason: 'Too large' } }), /INVALID_RECEIPT_EXTRA/, 'The combined balance must stay within safe cents');
const original = buildReceipt(context, 'alice', 'original', 'pt');
assert.equal(original.totals.length, 2);
assert.equal(original.totals[0].total, 10);
const rateSnapshot = { source: 'live' as const, sourceDate: '2026-10-02', rates: { EUR: 1, USD: 0.8, GBP: 1.2, CAD: 0.65, JPY: 0.006 } };
const fxContext = structuredClone(context);
fxContext.exchangeRates = rateSnapshot;
const fxRows = JSON.parse(fxContext.expenses[0].splitData!);
fxRows[1].repayment.paid = false;
fxContext.expenses[0].splitData = JSON.stringify(fxRows);
const fxTicket = buildReceipt(fxContext, 'alice', 'original', 'en', { USD: 2, GBP: 3 });
assert.deepEqual(fxTicket.exchange, { date: '2026-10-02', source: 'Frankfurter / ECB', amounts: [
  { currency: 'EUR', amount: 14.8 }, { currency: 'USD', amount: 18.5 }, { currency: 'GBP', amount: 12.33 },
  { currency: 'CAD', amount: 22.77 }, { currency: 'JPY', amount: 2467 },
] }, 'current equivalents convert discounted remaining currency groups, rounding JPY only at the end');
const paidFx = buildReceipt({ ...context, exchangeRates: rateSnapshot }, 'alice', 'original', 'en', { GBP: 3 });
const extraFx = buildReceipt({ ...context, exchangeRates: rateSnapshot }, 'alice', 'original', 'en', { GBP: 3 }, { USD: { amount: 5, reason: 'Airport pickup' } });
assert.equal(extraFx.exchange?.amounts[0].amount, 12.4, 'Currency equivalents include positive ticket extras, even for an already paid currency');
assert.equal(extraFx.exchange?.amounts[1].amount, 15.5);
const eurExtra = buildReceipt({ ...context, exchangeRates: rateSnapshot }, 'alice', 'eur', 'en', { EUR: 2.35 }, { EUR: { amount: 1.68, reason: 'Pickup' } });
assert.equal(eurExtra.totals[0].owed, 8);
assert.equal(eurExtra.exchange?.amounts[0].amount, 8);
assert.equal(paidFx.exchange?.amounts[0].amount, 8.4, 'already paid USD balance adds no conversion');
const allPaidFx = buildReceipt({ ...context, exchangeRates: rateSnapshot }, 'alice', 'original', 'en', { GBP: 10 });
assert(allPaidFx.exchange?.amounts.every(value => value.amount === 0));
const eurFx = buildReceipt({ ...context, exchangeRates: rateSnapshot }, 'alice', 'eur', 'en', { EUR: 2.35 });
assert.equal(eurFx.exchange?.amounts[0].amount, 6.32, 'EUR mode converts its already discounted EUR balance');
assert.equal(eurFx.exchange?.amounts[1].amount, 7.9);
for (const invalidSnapshot of [undefined, { ...rateSnapshot, source: 'static' }, { ...rateSnapshot, sourceDate: '2026-02-30' }, { ...rateSnapshot, rates: { ...rateSnapshot.rates, USD: 0 } }, { ...rateSnapshot, rates: { ...rateSnapshot.rates, GBP: Infinity } }, { ...rateSnapshot, rates: { ...rateSnapshot.rates, JPY: -1 } }, { ...rateSnapshot, rates: { EUR: 1, USD: 0.8 } }]) {
  assert.equal(buildReceipt({ ...context, exchangeRates: invalidSnapshot as ReceiptContext['exchangeRates'] }, 'alice', 'original', 'en').exchange, undefined);
}
const unsupported = structuredClone(context);
unsupported.exchangeRates = rateSnapshot;
unsupported.expenses[0].currency = 'XXX';
assert(buildReceipt(unsupported, 'alice', 'original', 'en').exchange, 'zero-owed unknown currencies do not prevent conversions');
unsupported.expenses[1].currency = 'XXX';
assert.equal(buildReceipt(unsupported, 'alice', 'original', 'en').exchange, undefined, 'unpaid missing currency rates are never guessed');
const priorSecret = process.env.AUTH_SECRET;
try {
  process.env.AUTH_SECRET = 'receipt-regression-secret-only';
  const now = Date.parse('2026-10-02T12:00:00Z');
  const token = signReceiptRates('workspace-a', rateSnapshot, now);
  assert.deepEqual(verifyReceiptRates(token, 'workspace-a', now + 60000), rateSnapshot);
  assert.throws(() => verifyReceiptRates(token, 'workspace-b', now), /INVALID_RECEIPT_RATES_TOKEN/);
  assert.throws(() => verifyReceiptRates(token, 'workspace-a', now + 24 * 60 * 60 * 1000), /INVALID_RECEIPT_RATES_TOKEN/);
  assert.throws(() => verifyReceiptRates(token + 'x', 'workspace-a', now), /INVALID_RECEIPT_RATES_TOKEN/);
  assert.equal(verifyReceiptRates(signReceiptRates('workspace-a', undefined, now), 'workspace-a', now), undefined, 'unavailable snapshot remains unavailable for export');
  delete process.env.AUTH_SECRET;
  assert.equal(signReceiptRates('workspace-a', rateSnapshot, now), 'unavailable');
  assert.equal(verifyReceiptRates('unavailable', 'workspace-a', now), undefined);
} finally { if (priorSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = priorSecret; }
const serialized = JSON.stringify(eur);
assert(!serialized.includes('Bob')); assert(!serialized.includes('private repayment memo')); assert(!serialized.includes('splitData')); assert(!serialized.includes('amountEur'));
assert.throws(() => buildReceipt(context, 'owner', 'eur', 'en'), /NOT_FOUND/);
const broken = structuredClone(context); broken.expenses[0].amount = 0;
assert.throws(() => buildReceipt(broken, 'alice', 'eur', 'en'), /SPLIT_TOTAL/);
broken.expenses[0].amount = NaN;
assert.throws(() => buildReceipt(broken, 'alice', 'eur', 'en'), /AMOUNT/);
const zero = structuredClone(context); zero.expenses = [zero.expenses[0]]; zero.expenses[0].amount = 0; zero.expenses[0].amountEur = 0; zero.expenses[0].splitData = JSON.stringify([{amount:0}, {personId:'alice',amount:0}, {personId:'bob',amount:0}]);
assert.equal(buildReceipt(zero, 'alice', 'eur', 'fr').totals[0].owed, 0);
zero.expenses[0].amountEur = 5; assert.throws(() => buildReceipt(zero, 'alice', 'eur', 'en'), /CONVERSION/);
const pdf = await renderReceiptPdf(eur); assert(pdf.subarray(0, 4).toString() === '%PDF');
const paidHistory = structuredClone(context);
paidHistory.expenses[0].amount = 3558.48;
paidHistory.expenses[0].amountEur = 3558.48;
paidHistory.expenses[0].currency = 'EUR';
paidHistory.expenses[0].splitData = JSON.stringify([{ amount: 1186.16 }, { personId: 'alice', amount: 1186.16, repayment: { paid: true } }, { personId: 'bob', amount: 1186.16 }]);
const paymentTicket = buildReceipt(paidHistory, 'alice', 'original', 'en', { GBP: 2 }, { GBP: { amount: 5, reason: 'Airport bags' } });
const paymentText = buildReceiptLayout(paymentTicket).commands.filter(command => command.kind === 'text').map(command => command.text).join('\n');
assert(!paymentText.includes('1,186.16'), 'Already-paid thousand-plus history must never appear as money on a payment ticket');
assert(!paymentText.includes('Expenses'), 'Gross expense subtotals do not appear in the payment summary');
assert(paymentText.includes('Paid') && paymentText.includes('GBP 13.00'), 'Paid status stays visible and amount due includes only unpaid balance, discount and extra');
const noAdjustmentText = buildReceiptLayout(buildReceipt(paidHistory, 'alice', 'original', 'en')).commands.filter(command => command.kind === 'text').map(command => command.text);
assert.equal(noAdjustmentText.filter(value => value === 'GBP 10.00').length, 2, 'Unpaid share appears as item and final due, without another subtotal');
assert((await renderReceiptPdf(discounted)).subarray(0, 4).toString() === '%PDF');
const long = { ...eur, lines: Array.from({length: 100}, (_, i) => ({...eur.lines[0], expenseId: String(i), description: 'Very long dinner description '.repeat(20)})) };
await assert.rejects(renderReceiptPdf(long), /RECEIPT_TOO_TALL/);
const project = { ...eur, lines: Array.from({length: 60}, (_, i) => ({...eur.lines[0], expenseId: String(i), description: 'Dinner in Brooklyn'})) };
const longPdf = await renderReceiptPdf(project); assert(longPdf.length > pdf.length);
assert.equal((longPdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1, 'Long projects remain one continuous PDF page');
console.log('Receipt data and PDF tests passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
