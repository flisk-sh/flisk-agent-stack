import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import pg from 'pg';

// The agent contract (flisk AGENTS.md): /health liveness, /ready needs the checkpoint store, /turn routes by
// x-session-id, and a checkpoint survives a restart. These tests start src/index.ts as a real process.
// The restart test needs Postgres: set TEST_DATABASE_URL (CI does); without it that test is skipped.

const here = dirname(fileURLToPath(import.meta.url));
const agentDir = join(here, '..');
const migrationDir = join(agentDir, '..', 'agent-migrator', 'prisma', 'migrations');
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
// Nothing listens here, so /ready has no database to reach.
const NO_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:1/postgres';

const running: ChildProcess[] = [];

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

async function startAgent(databaseUrl: string): Promise<{ base: string; child: ChildProcess }> {
  const port = await freePort();
  const child = spawn('bun', ['src/index.ts'], {
    cwd: agentDir,
    env: { ...process.env, PORT: String(port), DATABASE_URL: databaseUrl },
    stdio: 'ignore',
  });
  running.push(child);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return { base, child };
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('agent did not start');
}

async function stopAgent(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  await exited;
}

afterEach(async () => {
  while (running.length) await stopAgent(running.pop() as ChildProcess);
});

describe('agent contract', () => {
  it('/health answers 200 even with no database', async () => {
    const { base } = await startAgent(NO_DATABASE_URL);
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ok');
  });

  it('/ready answers 503 with no database', async () => {
    const { base } = await startAgent(NO_DATABASE_URL);
    const res = await fetch(`${base}/ready`);
    expect(res.status).toBe(503);
    expect((await res.json()).ready).toBe(false);
  });

  it('/turn requires x-session-id', async () => {
    const { base } = await startAgent(NO_DATABASE_URL);
    const res = await fetch(`${base}/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'hello' }),
    });
    expect(res.status).toBe(400);
  });

  it('/turn rejects an invalid x-session-id', async () => {
    const { base } = await startAgent(NO_DATABASE_URL);
    const res = await fetch(`${base}/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session-id': 'has spaces!' },
      body: JSON.stringify({ input: 'hello' }),
    });
    expect(res.status).toBe(400);
  });

  it.skipIf(!TEST_DATABASE_URL)('a checkpoint survives a restart', async () => {
    const url = TEST_DATABASE_URL as string;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    try {
      // The table comes from the migrator's SQL, the same file `flisk up` runs.
      const sql = readFileSync(join(migrationDir, '20261025000000_agent_sessions', 'migration.sql'), 'utf8');
      await admin.query(sql);
      const sessionId = `contract-${Date.now()}`;
      await admin.query('DELETE FROM flisk_agent_sessions WHERE session_id = $1', [sessionId]);

      const first = await startAgent(url);
      const ready = await fetch(`${first.base}/ready`);
      expect(ready.status).toBe(200);
      const turn = await fetch(`${first.base}/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-session-id': sessionId },
        body: JSON.stringify({ input: 'remember me' }),
      });
      expect(turn.status).toBe(200);
      await stopAgent(first.child);

      const second = await startAgent(url);
      const session = await fetch(`${second.base}/session`, { headers: { 'x-session-id': sessionId } });
      expect(session.status).toBe(200);
      const body = await session.json();
      expect(body.messages[0].content).toBe('remember me');
      expect(body.turns).toBe(1);
      await admin.query('DELETE FROM flisk_agent_sessions WHERE session_id = $1', [sessionId]);
    } finally {
      await admin.end();
    }
  });
});
