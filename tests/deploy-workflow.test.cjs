const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const workflow = yaml.load(fs.readFileSync('.github/workflows/deploy.yml', 'utf8'));
const config = workflow.jobs.deploy.steps.find(step => step.uses?.startsWith('appleboy/ssh-action')).with;
// Mirror drone-ssh v1.8.0's scriptCommands: script_stop injects checks
// after each line, including else, where $? may be a valid false condition.
function actionScript(script) {
  if (!config.script_stop) return script;
  return script.split('\n').map(line => line.trim()).filter(Boolean).flatMap(line => [line,
    ...(line.endsWith('\\') ? [] : ['DRONE_SSH_PREV_COMMAND_EXIT_CODE=$?; if [ $DRONE_SSH_PREV_COMMAND_EXIT_CODE -ne 0 ]; then exit $DRONE_SSH_PREV_COMMAND_EXIT_CODE; fi;'])]).join('\n');
}
test('deployment cleanup continues when no orphan processes exist', () => {
  const start = config.script.indexOf('ORPHANS=$(');
  const end = config.script.indexOf('echo "Disk before build:', start);
  const script = 'set -eo pipefail\npgrep() { return 1; }\n' + config.script.slice(start, end) + '\necho cleanup-complete\n';
  const result = spawnSync('bash', ['-c', actionScript(script)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No orphaned build processes/);
  assert.match(result.stdout, /cleanup-complete/);
});
test('native shell fail-fast still aborts actual deployment errors', () => {
  const result = spawnSync('bash', ['-c', actionScript('set -eo pipefail\nfalse\necho must-not-run')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /must-not-run/);
});
