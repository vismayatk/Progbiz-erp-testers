'use strict';
// Run the suite in ONE real Chrome window (headed, single worker, sequential).
// Pass-through args: `npm run chrome -- -g "TC-09 |"`
process.env.CHANNEL = 'chrome';
process.env.HEADED = '1';
const { spawnSync } = require('child_process');
const r = spawnSync('npx', ['playwright', 'test', '--workers=1', ...process.argv.slice(2)],
  { stdio: 'inherit', shell: true });
process.exit(r.status || 0);
