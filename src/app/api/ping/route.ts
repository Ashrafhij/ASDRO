import { getCloudflareContext } from '@opennextjs/cloudflare';

const VISITS_TABLE = `CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  visited_at TEXT NOT NULL,
  page TEXT DEFAULT '/',
  user_agent TEXT,
  browser TEXT,
  os TEXT,
  os_version TEXT,
  device_model TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  screen_density REAL,
  is_pwa INTEGER DEFAULT 0,
  language TEXT,
  timezone TEXT,
  cpu_cores INTEGER DEFAULT 0,
  connection_type TEXT
)`;

async function getDb(): Promise<D1Database | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as any).asdro_db ?? null;
  } catch {
    return null;
  }
}

async function ensureTable(db: D1Database) {
  try {
    await db.prepare(VISITS_TABLE).run();
  } catch {
    // table already exists
  }
  for (const col of ['user_agent', 'browser', 'os', 'screen_width', 'screen_height', 'is_pwa', 'language', 'timezone', 'os_version', 'device_model', 'screen_density', 'cpu_cores', 'connection_type']) {
    try {
      await db.prepare(`ALTER TABLE visits ADD COLUMN ${col} TEXT`).run();
    } catch {
      // column already exists
    }
  }
  // fix typed columns
  try { await db.prepare(`ALTER TABLE visits ADD COLUMN is_pwa INTEGER DEFAULT 0`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE visits ADD COLUMN cpu_cores INTEGER DEFAULT 0`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE visits ADD COLUMN screen_density REAL`).run(); } catch {}
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { deviceId, page, userAgent, browser, os, osVersion, deviceModel, screenWidth, screenHeight, screenDensity, isPwa, language, timezone, cpuCores, connectionType } = body;

    if (!deviceId || typeof deviceId !== 'string') {
      return Response.json({ ok: false, error: 'Missing deviceId' }, { status: 400 });
    }

    const db = await getDb();
    if (db) {
      await ensureTable(db);
      await db.prepare(
        `INSERT INTO visits (device_id, visited_at, page, user_agent, browser, os, os_version, device_model, screen_width, screen_height, screen_density, is_pwa, language, timezone, cpu_cores, connection_type)
         VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        deviceId,
        page || '/',
        userAgent || null,
        browser || null,
        os || null,
        osVersion || null,
        deviceModel || null,
        screenWidth ?? null,
        screenHeight ?? null,
        screenDensity ?? null,
        isPwa ? 1 : 0,
        language || null,
        timezone || null,
        cpuCores ?? null,
        connectionType || null,
      ).run();
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    const db = await getDb();
    if (!db) return Response.json({ ok: false, error: 'No database' }, { status: 500 });
    await db.prepare('DELETE FROM visits').run();
    await db.prepare('DELETE FROM events').run();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: 'Failed to clear' }, { status: 500 });
  }
}
