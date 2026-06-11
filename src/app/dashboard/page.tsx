import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return iso;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'Z');
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (iso === todayStr) return 'Today';
  if (iso === yesterdayStr) return 'Yesterday';
  return iso;
}

async function getDb(): Promise<D1Database | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as any).asdro_db ?? null;
  } catch {
    return null;
  }
}

type StatRow = { count: number };
type DayRow = { day: string; count: number };
type DeviceRow = { device_id: string; last_seen: string; visit_count: number };

const DEVICE_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-lime-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-red-500',
];

export default async function DashboardPage() {
  const db = await getDb();

  if (!db) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-300">
          Dashboard not ready yet. Check back after someone uses the app.
        </div>
      </div>
    );
  }

  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, visited_at TEXT NOT NULL, page TEXT DEFAULT \'/\')').run();
  } catch {
    // table already exists
  }

  const [totalDevices, totalVisits, recentVisits, todayVisits, dayStats, devices] = await Promise.all([
    db.prepare('SELECT COUNT(DISTINCT device_id) as count FROM visits').all<StatRow>(),
    db.prepare('SELECT COUNT(*) as count FROM visits').all<StatRow>(),
    db.prepare("SELECT COUNT(*) as count FROM visits WHERE visited_at > datetime('now', '-7 days')").all<StatRow>(),
    db.prepare("SELECT COUNT(*) as count FROM visits WHERE visited_at > datetime('now', 'start of day')").all<StatRow>(),
    db.prepare("SELECT date(visited_at) as day, COUNT(*) as count FROM visits WHERE visited_at > datetime('now', '-30 days') GROUP BY day ORDER BY day DESC").all<DayRow>(),
    db.prepare("SELECT device_id, MAX(visited_at) as last_seen, COUNT(*) as visit_count FROM visits GROUP BY device_id ORDER BY last_seen DESC LIMIT 50").all<DeviceRow>(),
  ]);

  const totalDev = totalDevices.results[0]?.count ?? 0;
  const totalVisit = totalVisits.results[0]?.count ?? 0;
  const recentVisit = recentVisits.results[0]?.count ?? 0;
  const todayVisit = todayVisits.results[0]?.count ?? 0;
  const maxDayCount = Math.max(...dayStats.results.map(d => d.count), 1);
  const dailyData = dayStats.results.toReversed();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">App Activity</h1>
        <p className="text-sm text-gray-400 mt-1">
          See how many people are using ASDRO
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="People who opened the app"
          value={totalDev}
          subtitle={totalDev === 1 ? '1 person' : `${totalDev} people`}
        />
        <StatCard
          label="Total times opened"
          value={totalVisit}
          subtitle={totalVisit === 1 ? '1 visit' : `${totalVisit} visits`}
        />
        <StatCard
          label="Opened in the last 7 days"
          value={recentVisit}
          subtitle={totalVisits.results[0]?.count ? `${Math.round((recentVisit / totalVisit) * 100)}% of all visits` : '0% of all visits'}
        />
        <StatCard
          label="Opened today"
          value={todayVisit}
          subtitle={todayVisit === 1 ? '1 visit today' : `${todayVisit} visits today`}
        />
      </div>

      {devices.results.length > 0 && (
        <DeviceSummarySection devices={devices.results} />
      )}

      {dailyData.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">
            Daily visits (last 30 days)
          </h2>
          <div className="space-y-1.5">
            {dailyData.map(d => {
              const isToday = d.day === new Date().toISOString().slice(0, 10);
              return (
                <div key={d.day} className="flex items-center gap-2 text-xs">
                  <span className={`w-20 sm:w-24 flex-shrink-0 ${isToday ? 'text-blue-400 font-medium' : 'text-gray-400'}`}>
                    {formatDate(d.day)}
                  </span>
                  <div className="flex-1 h-6 bg-gray-800 rounded overflow-hidden">
                    <div
                      className={`h-full rounded transition-all ${isToday ? 'bg-blue-500/70' : 'bg-blue-600/40'}`}
                      style={{ width: `${(d.count / maxDayCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-gray-300 tabular-nums">{d.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-center text-xs text-gray-600">
        Only basic usage data is collected — no personal info
      </div>
    </div>
  );
}

function StatCard({ label, value, subtitle }: { label: string; value: number; subtitle: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <p className="text-2xl sm:text-3xl font-bold text-blue-400 tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{label}</p>
      <p className="text-[11px] text-gray-600 mt-0.5">{subtitle}</p>
    </div>
  );
}

function DeviceSummarySection({ devices }: { devices: DeviceRow[] }) {
  const activeToday = devices.filter(d => d.last_seen.startsWith(new Date().toISOString().slice(0, 10))).length;
  const activeThisWeek = devices.filter(d => {
    const d7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    return d.last_seen >= d7;
  }).length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 mb-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-200">Devices</h2>
        <div className="flex gap-3 text-xs text-gray-500">
          <span>{activeToday} active today</span>
          <span>{activeThisWeek} active this week</span>
        </div>
      </div>
      <div className="space-y-2">
        {devices.map((d, i) => (
          <div key={d.device_id} className="flex items-center gap-3 py-2 border-b border-gray-800/60 last:border-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DEVICE_COLORS[i % DEVICE_COLORS.length]}`} />
            <span className="text-xs text-gray-400 flex-shrink-0 w-16">Device {i + 1}</span>
            <span className="text-xs text-gray-600 flex-1">{relativeTime(d.last_seen)}</span>
            <span className="text-xs text-gray-300 font-medium tabular-nums">{d.visit_count}×</span>
          </div>
        ))}
      </div>
    </div>
  );
}
