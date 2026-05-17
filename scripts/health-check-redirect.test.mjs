import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import test from 'node:test';

function startTestServer() {
  const server = http.createServer((request, response) => {
    switch (request.url) {
      case '/redirect':
        response.writeHead(308, { Location: '/ok' });
        response.end('redirecting');
        break;
      case '/ok':
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
        break;
      default:
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('not found');
        break;
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected server to bind to a TCP port'));
        return;
      }

      resolve({
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => {
            if (error) {
              closeReject(error);
              return;
            }
            closeResolve();
          });
        }),
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function runHealthCheck(env) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['scripts/health-check.sh'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({ code, stderr, stdout });
    });
  });
}

test('health check follows canonical-host redirects before evaluating status', async () => {
  const server = await startTestServer();

  try {
    const result = await runHealthCheck({
      AGENTS_URL: `${server.origin}/ok`,
      ENGINE_URL: `${server.origin}/ok`,
      VERCEL_URL: `${server.origin}/redirect`,
    });

    assert.equal(result.code, 0, `Expected health check to pass.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.match(result.stdout, /Vercel Frontend\.\.\.\s+✓ UP/);
    assert.match(result.stdout, /All services healthy/);
  } finally {
    await server.close();
  }
});
