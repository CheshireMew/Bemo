import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

type BackendServerMode = 'app' | 'server';

type BackendServerContext = {
  baseUrl: string;
  dataDir: string;
  syncToken: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const backendDir = path.join(repoRoot, 'backend');
const syncToken = 'test-sync-token';

async function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate test port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForServerReady(baseUrl: string, child: ReturnType<typeof spawn>, logs: string[]) {
  const startedAt = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startedAt < 15_000) {
    if (child.exitCode !== null) {
      throw new Error(`Backend server exited early (${child.exitCode}).\n${logs.join('')}`);
    }
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Unexpected backend status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for backend server.\n${String(lastError || '')}\n${logs.join('')}`);
}

async function stopServer(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) return;
  child.kill();
  const exited = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 5_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (exited || !child.pid) return;
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
    stdio: 'ignore',
  });
}

export async function withBackendServer<T>(
  mode: BackendServerMode,
  run: (context: BackendServerContext) => Promise<T>,
) {
  const port = await getFreePort();
  const dataDir = mkdtempSync(path.join(tmpdir(), `bemo-${mode}-`));
  const logs: string[] = [];
  const target = mode === 'server' ? 'sync_server:app' : 'main:app';
  const pythonExecutable = [
    path.join(backendDir, 'venv', 'Scripts', 'python.exe'),
    path.join(repoRoot, 'venv', 'Scripts', 'python.exe'),
    'python',
  ].find((candidate) => candidate === 'python' || existsSync(candidate)) || 'python';
  const child = spawn(
    pythonExecutable,
    ['-m', 'uvicorn', target, '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        BEMO_DATA_DIR: dataDir,
        BEMO_SYNC_TOKEN: syncToken,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout?.on('data', (chunk) => {
    logs.push(String(chunk));
  });
  child.stderr?.on('data', (chunk) => {
    logs.push(String(chunk));
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServerReady(baseUrl, child, logs);
    return await run({
      baseUrl,
      dataDir,
      syncToken,
    });
  } finally {
    await stopServer(child);
    rmSync(dataDir, { recursive: true, force: true });
  }
}
