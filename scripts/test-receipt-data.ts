import assert from 'node:assert/strict';
import { buildReceipt, type ReceiptContext } from '../src/lib/receipt-data';
import { renderReceiptPdf } from '../src/lib/receipt-pdf';

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
const original = buildReceipt(context, 'alice', 'original', 'pt');
assert.equal(original.totals.length, 2);
assert.equal(original.totals[0].total, 10);
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
assert((await renderReceiptPdf(discounted)).subarray(0, 4).toString() === '%PDF');
const long = { ...eur, lines: Array.from({length: 100}, (_, i) => ({...eur.lines[0], expenseId: String(i), description: 'Very long dinner description '.repeat(20)})) };
const longPdf = await renderReceiptPdf(long); assert(longPdf.length > pdf.length);
console.log('Receipt data and PDF tests passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
