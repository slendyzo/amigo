const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Skip when build info is already provided by the environment (e.g. Docker
// --build-arg → ENV). Overwriting .env.local here would be a no-op in practice
// because process.env wins in Next.js, but writing "dev"/"unknown" fallbacks
// into the repo is noisy and misleading — bail out instead.
if (process.env.NEXT_PUBLIC_BUILD_ID && process.env.NEXT_PUBLIC_BUILD_DATE) {
  console.log(
    `Build info inherited from env: ${process.env.NEXT_PUBLIC_BUILD_ID} @ ${process.env.NEXT_PUBLIC_BUILD_DATE}`
  );
  process.exit(0);
}

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
