export const dynamic = 'force-dynamic';

async function getDb(): Promise<D1Database | null> {
  try {
    return (process.env as any).asdro_db ?? null;
  } catch {
    return null;
  }
}

type StatRow = { count: number };
type DayRow = { day: string; count: number };
type DeviceRow = { device_id: string; last_seen: string; visit_count: number };

export default async function DashboardPage() {
  const db = await getDb();

  if (!db) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
        <h1 className="text-xl font-bold mb-4">ASDRO Analytics</h1>
        <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-300">
          Database not configured. Set up a D1 database and add its ID to wrangler.toml.
        </div>
      </div>
    );
  }

  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, visited_at TEXT NOT NULL, page TEXT DEFAULT \'/\')').run();
  } catch {
    // table already exists or no permissions
  }

  const [totalDevices, totalVisits, recentVisits, todayVisits, dayStats, devices] = await Promise.all([
    db.prepare('SELECT COUNT(DISTINCT device_id) as count FROM visits').all<StatRow>(),
    db.prepare('SELECT COUNT(*) as count FROM visits').all<StatRow>(),
    db.prepare("SELECT COUNT(*) as count FROM visits WHERE visited_at > datetime('now', '-7 days')").all<StatRow>(),
    db.prepare("SELECT COUNT(*) as count FROM visits WHERE visited_at > datetime('now', 'start of day')").all<StatRow>(),
    db.prepare("SELECT date(visited_at) as day, COUNT(*) as count FROM visits WHERE visited_at > datetime('now', '-30 days') GROUP BY day ORDER BY day DESC").all<DayRow>(),
    db.prepare("SELECT device_id, MAX(visited_at) as last_seen, COUNT(*) as visit_count FROM visits GROUP BY device_id ORDER BY last_seen DESC LIMIT 50").all<DeviceRow>(),
  ]);

  const maxDayCount = Math.max(...dayStats.results.map(d => d.count), 1);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">ASDRO Analytics</h1>
      <p className="text-xs text-gray-500 mb-6">Dashboard for tracking app usage</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Devices', value: totalDevices.results[0]?.count ?? 0 },
          { label: 'Total Visits', value: totalVisits.results[0]?.count ?? 0 },
          { label: 'Visits (7 days)', value: recentVisits.results[0]?.count ?? 0 },
          { label: 'Visits Today', value: todayVisits.results[0]?.count ?? 0 },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{stat.value.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-200 mb-3">Visits per Day (last 30 days)</h2>
        {dayStats.results.length === 0 ? (
          <p className="text-xs text-gray-500">No data yet</p>
        ) : (
          <div className="space-y-1">
            {dayStats.results.map(d => (
              <div key={d.day} className="flex items-center gap-2 text-xs">
                <span className="w-24 text-gray-400 flex-shrink-0">{d.day}</span>
                <div className="flex-1 h-5 bg-gray-800 rounded overflow-hidden">
                  <div className="h-full bg-blue-600/60 rounded transition-all" style={{ width: `${(d.count / maxDayCount) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-gray-300 flex-shrink-0">{d.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-200 mb-3">Recent Devices</h2>
        {devices.results.length === 0 ? (
          <p className="text-xs text-gray-500">No data yet</p>
        ) : (
          <div className="space-y-2">
            {devices.results.map(d => (
              <div key={d.device_id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-800 last:border-0">
                <span className="font-mono text-gray-400 truncate max-w-[160px]">{d.device_id.slice(0, 8)}...{d.device_id.slice(-4)}</span>
                <span className="text-gray-500">{d.last_seen}</span>
                <span className="text-gray-300 font-medium">{d.visit_count} visits</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
