import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.TEST_DATABASE_URL;
const agentDir = join(dirname(fileURLToPath(import.meta.url)), '..');

describe.skipIf(!databaseUrl)('CLI session-list contract', () => {
  let admin: pg.Client;
  let child: ChildProcess;
  let base: string;
  const schema = `session_list_${process.pid}_${Date.now()}`;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}`);
    await admin.query(readFileSync(join(agentDir, '../agent-migrator/prisma/migrations/20261025000000_agent_sessions/migration.sql'), 'utf8'));
    const url = new URL(databaseUrl!);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const port = await new Promise<number>((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const port = (probe.address() as { port: number }).port;
        probe.close(() => resolve(port));
      });
    });
    child = spawn('bun', ['src/index.ts'], {
      cwd: agentDir,
      env: { ...process.env, PORT: String(port), DATABASE_URL: url.toString() },
      stdio: 'ignore',
    });
    base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/ready`)).ok) return; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Agent did not become ready');
  });

  afterAll(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it('returns empty metadata, then the fields consumed by the CLI after a real turn', async () => {
    expect(await (await fetch(`${base}/sessions`)).json()).toEqual({ sessions: [], total: 0 });
    const response = await fetch(`${base}/turn`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-session-id': 'contract' },
      body: JSON.stringify({ input: 'hello' }),
    });
    expect(response.status).toBe(200);
    const list = await (await fetch(`${base}/sessions`)).json();
    expect(list.total).toBe(1);
    expect(list.sessions).toHaveLength(1);
    const row = list.sessions[0];
    expect(row).toMatchObject({ sessionId: 'contract', status: 'idle', turns: 1 });
    expect(row.lastActivity).toBe(row.updatedAt);
    expect(Number.isNaN(Date.parse(row.lastActivity))).toBe(false);
    const bytes = await admin.query('SELECT octet_length(messages::text) AS bytes FROM flisk_agent_sessions WHERE session_id = $1', ['contract']);
    expect(row.checkpointBytes).toBe(bytes.rows[0].bytes);
  });

  it('returns the newest 500 rows and the total for 600 stored sessions', async () => {
    await admin.query('DELETE FROM flisk_agent_sessions');
    await admin.query(`INSERT INTO flisk_agent_sessions (session_id, messages, updated_at)
      SELECT 'seed-' || n, '[]'::jsonb, TIMESTAMPTZ '2026-01-01' + n * INTERVAL '1 second'
      FROM generate_series(1, 600) AS n`);
    const list = await (await fetch(`${base}/sessions`)).json();
    expect(list.total).toBe(600);
    expect(list.sessions).toHaveLength(500);
    expect(list.sessions[0].sessionId).toBe('seed-600');
    expect(list.sessions[499].sessionId).toBe('seed-101');
  });

  it('keeps a session active until both overlapping turn requests finish', async () => {
    // Partial HTTP bodies hold real turn requests open without mocking the agent or database.
    const openTurn = () => {
      const req = request(`${base}/turn`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-session-id': 'seed-600' },
      });
      const done = new Promise<void>((resolve, reject) => {
        req.on('error', reject);
        req.on('response', (res) => { res.resume(); res.on('end', () => resolve()); });
      });
      req.write('{"input":');
      return { req, done };
    };
    const status = async () => {
      const list = await (await fetch(`${base}/sessions`)).json();
      return list.sessions.find((row: { sessionId: string }) => row.sessionId === 'seed-600')?.status;
    };
    const first = openTurn();
    const second = openTurn();
    try {
      await expect.poll(status).toBe('active');
      first.req.end('"hello"}');
      await first.done;
      expect(await status()).toBe('active');
      second.req.end('"again"}');
      await second.done;
      await expect.poll(status).toBe('idle');
      const invalid = await fetch(`${base}/turn`, {
        method: 'POST', headers: { 'x-session-id': 'seed-600' }, body: '{',
      });
      expect(invalid.status).toBe(500);
      expect(await status()).toBe('idle');
    } finally {
      first.req.destroy();
      second.req.destroy();
      await Promise.allSettled([first.done, second.done]);
    }
  });
});
