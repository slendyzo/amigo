const { prisma } = require('./src/lib/db');

async function main() {
  const expenses = await prisma.expense.findMany({
    select: { date: true, name: true, amount: true, type: true },
    orderBy: { date: 'asc' }
  });

  const byMonth = {};
  for (const exp of expenses) {
    const month = exp.date.toISOString().slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { count: 0, total: 0, types: {} };
    byMonth[month].count++;
    byMonth[month].total += Number(exp.amount);
    byMonth[month].types[exp.type] = (byMonth[month].types[exp.type] || 0) + 1;
  }

  console.log('Expenses by Month:');
  Object.entries(byMonth).sort().forEach(([month, data]) => {
    console.log(month + ': ' + data.count + ' expenses, Total: EUR ' + data.total.toFixed(2));
    console.log('  ' + JSON.stringify(data.types));
  });
  await prisma.$disconnect();
}
main();
