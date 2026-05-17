import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();

function readJson(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('root prepare script no-ops cleanly when husky is unavailable', () => {
  const rootPackage = readJson('package.json');

  assert.equal(rootPackage.scripts.prepare, 'husky || true');
});

test('agents telemetry runtime imports stay in dependencies', () => {
  const telemetrySource = fs.readFileSync(
    path.join(repoRoot, 'apps/agents/src/telemetry.ts'),
    'utf8',
  );
  const agentsPackage = readJson('apps/agents/package.json');

  const runtimeImports = [...telemetrySource.matchAll(/from '(@opentelemetry\/[^']+)'/g)].map(
    ([, packageName]) => packageName,
  );

  assert.ok(runtimeImports.length > 0, 'Expected telemetry.ts to declare OpenTelemetry imports');

  for (const packageName of runtimeImports) {
    assert.ok(
      agentsPackage.dependencies?.[packageName],
      `${packageName} must remain in dependencies for prod installs`,
    );
    assert.equal(
      packageName in (agentsPackage.devDependencies ?? {}),
      false,
      `${packageName} must not move back to devDependencies`,
    );
  }
});
