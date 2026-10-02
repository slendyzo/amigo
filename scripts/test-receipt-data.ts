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
assert.deepEqual(eur.totals, [{ currency: 'EUR', total: 17.34, paid: 8.67, owed: 8.67 }]);
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
const long = { ...eur, lines: Array.from({length: 100}, (_, i) => ({...eur.lines[0], expenseId: String(i), description: 'Very long dinner description '.repeat(20)})) };
const longPdf = await renderReceiptPdf(long); assert(longPdf.length > pdf.length);
console.log('Receipt data and PDF tests passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
