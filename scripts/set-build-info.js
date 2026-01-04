const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get git commit hash (short)
let commitHash = 'dev';
try {
  commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  console.log('Could not get git commit hash, using "dev"');
}

// Get current date/time
const now = new Date();
const buildDate = now.toLocaleDateString('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Set environment variables for the build
process.env.NEXT_PUBLIC_BUILD_ID = commitHash;
process.env.NEXT_PUBLIC_BUILD_DATE = buildDate;

// Write to .env.local for Next.js to pick up during build
const envPath = path.join(__dirname, '..', '.env.local');
let envContent = '';

// Read existing .env.local if it exists
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  // Remove old build info lines
  envContent = envContent
    .split('\n')
    .filter(line => !line.startsWith('NEXT_PUBLIC_BUILD_ID=') && !line.startsWith('NEXT_PUBLIC_BUILD_DATE='))
    .join('\n');
}

// Add new build info
const buildInfo = `\nNEXT_PUBLIC_BUILD_ID=${commitHash}\nNEXT_PUBLIC_BUILD_DATE=${buildDate}\n`;
envContent = envContent.trim() + buildInfo;

fs.writeFileSync(envPath, envContent);

console.log(`Build info set: ${commitHash} @ ${buildDate}`);
