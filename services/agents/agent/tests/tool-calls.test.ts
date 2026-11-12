import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

// Needs Postgres: set TEST_DATABASE_URL, otherwise the test is skipped.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const agentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = join(agentDir, '..', 'agent-migrator', 'prisma', 'migrations', '20261025000000_agent_sessions', 'migration.sql');

let child: ChildProcess | undefined;
afterEach(() => {
  child?.kill('SIGTERM');
  child = undefined;
});

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

describe.skipIf(!TEST_DATABASE_URL)('tool calls and /sessions', () => {
  it('stores the tool call in the session and lists the session', async () => {
    const url = TEST_DATABASE_URL as string;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    const sessionId = `tools-${Date.now()}`;
    try {
      await admin.query(readFileSync(migration, 'utf8'));
      const port = await freePort();
      child = spawn('bun', ['src/index.ts'], {
        cwd: agentDir,
        env: { ...process.env, PORT: String(port), DATABASE_URL: url },
        stdio: 'ignore',
      });
      const base = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(`${base}/health`)).ok) break;
        } catch {
          // not listening yet
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      const turn = await fetch(`${base}/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-session-id': sessionId },
        body: JSON.stringify({ input: 'hello' }),
      });
      expect(turn.status).toBe(200);
      expect((await turn.json()).turns).toBe(1);

      const session = await (await fetch(`${base}/session`, { headers: { 'x-session-id': sessionId } })).json();
      expect(session.turns).toBe(1);
      expect(session.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'tool', 'agent']);
      const tool = session.messages[1];
      expect(tool).toMatchObject({ role: 'tool', name: 'echo', input: { message: 'hello' }, output: { message: 'hello' } });
      expect(typeof tool.at).toBe('string');

      const list = await (await fetch(`${base}/sessions`)).json();
      expect(list.sessions).toContainEqual(expect.objectContaining({ sessionId, turns: 1 }));
    } finally {
      await admin.query('DELETE FROM flisk_agent_sessions WHERE session_id = $1', [sessionId]);
      await admin.end();
    }
  });
});
