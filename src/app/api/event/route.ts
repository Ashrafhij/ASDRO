import { getCloudflareContext } from '@opennextjs/cloudflare';

const EVENTS_TABLE = `CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_at TEXT NOT NULL
)`;

async function getDb(): Promise<D1Database | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as any).asdro_db ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { deviceId, eventName } = await request.json();
    if (!deviceId || typeof deviceId !== 'string' || !eventName || typeof eventName !== 'string') {
      return Response.json({ ok: false, error: 'Missing deviceId or eventName' }, { status: 400 });
    }

    const db = await getDb();
    if (db) {
      try {
        await db.prepare(EVENTS_TABLE).run();
      } catch {
        // already exists
      }
      await db.prepare('INSERT INTO events (device_id, event_name, event_at) VALUES (?, ?, datetime(\'now\'))').bind(deviceId, eventName).run();
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }
}
