const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');

const feedbackId = process.argv[2];

if (!feedbackId) {
  console.error('Usage: node mark-resolved.js <feedback-id>');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    const feedback = await prisma.feedback.update({
      where: { id: feedbackId },
      data: { isResolved: true }
    });
    console.log('Feedback marked as resolved:', feedback.id);
    console.log('Message:', feedback.message);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  }
})();
