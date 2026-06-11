const TABLE = `CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  visited_at TEXT NOT NULL,
  page TEXT DEFAULT '/'
)`;

async function getDb(): Promise<D1Database | null> {
  try {
    return (process.env as any).DB ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { deviceId } = await request.json();
    if (!deviceId || typeof deviceId !== 'string') {
      return Response.json({ ok: false, error: 'Missing deviceId' }, { status: 400 });
    }

    const db = await getDb();
    if (db) {
      try {
        await db.prepare('INSERT INTO visits (device_id, visited_at) VALUES (?, datetime(\'now\'))').bind(deviceId).run();
      } catch {
        await db.prepare(TABLE).run();
        await db.prepare('INSERT INTO visits (device_id, visited_at) VALUES (?, datetime(\'now\'))').bind(deviceId).run();
      }
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }
}
