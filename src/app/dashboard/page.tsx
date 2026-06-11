import { getCloudflareContext } from '@opennextjs/cloudflare';
import ClearAnalyticsButton from '@/components/ClearAnalyticsButton';

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

function deviceType(w: number, h: number): string {
  const min = Math.min(w, h);
  if (min < 600) return 'Phone';
  if (min < 1024) return 'Tablet';
  return 'Desktop';
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
type BreakdownRow = { key: string; count: number };
type DeviceRow = { device_id: string; last_seen: string; visit_count: number; browser: string | null; os: string | null; screen_width: number | null; screen_height: number | null; is_pwa: number | null; language: string | null; timezone: string | null; page: string | null };
type EventRow = { event_name: string; count: number };

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
    await db.prepare('CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, visited_at TEXT NOT NULL, page TEXT DEFAULT \'/\', user_agent TEXT, browser TEXT, os TEXT, screen_width INTEGER, screen_height INTEGER, is_pwa INTEGER DEFAULT 0, language TEXT, timezone TEXT)').run();
  } catch {
    // table already exists
  }

  const [totalDevices, totalVisits, recentVisits, todayVisits, dayStats, devices, browsers, oss, pwaStats, languages, timezones, events] = await Promise.all([
    db.prepare('SELECT COUNT(DISTINCT device_id) as count FROM visits').all<StatRow>(),
    db.prepare('SELECT COUNT(*) as count FROM visits').all<StatRow>(),
    db.prepare("SELECT COUNT(*) as count FROM visits WHERE visited_at > datetime('now', '-7 days')").all<StatRow>(),
    db.prepare("SELECT COUNT(*) as count FROM visits WHERE visited_at > datetime('now', 'start of day')").all<StatRow>(),
    db.prepare("SELECT date(visited_at) as day, COUNT(*) as count FROM visits WHERE visited_at > datetime('now', '-30 days') GROUP BY day ORDER BY day DESC").all<DayRow>(),
    db.prepare("SELECT device_id, MAX(visited_at) as last_seen, COUNT(*) as visit_count, MAX(browser) as browser, MAX(os) as os, MAX(screen_width) as screen_width, MAX(screen_height) as screen_height, MAX(is_pwa) as is_pwa, MAX(language) as language, MAX(timezone) as timezone FROM visits GROUP BY device_id ORDER BY last_seen DESC LIMIT 50").all<any>(),
    db.prepare('SELECT browser as key, COUNT(*) as count FROM visits WHERE browser IS NOT NULL GROUP BY browser ORDER BY count DESC').all<BreakdownRow>(),
    db.prepare('SELECT os as key, COUNT(*) as count FROM visits WHERE os IS NOT NULL GROUP BY os ORDER BY count DESC').all<BreakdownRow>(),
    db.prepare('SELECT is_pwa as key, COUNT(*) as count FROM visits GROUP BY is_pwa').all<any>(),
    db.prepare("SELECT language as key, COUNT(*) as count FROM visits WHERE language IS NOT NULL GROUP BY language ORDER BY count DESC").all<BreakdownRow>(),
    db.prepare("SELECT timezone as key, COUNT(*) as count FROM visits WHERE timezone IS NOT NULL GROUP BY timezone ORDER BY count DESC").all<BreakdownRow>(),
    db.prepare("SELECT event_name, COUNT(*) as count FROM events GROUP BY event_name ORDER BY count DESC").all<EventRow>(),
  ]);

  const totalDev = totalDevices.results[0]?.count ?? 0;
  const totalVisit = totalVisits.results[0]?.count ?? 0;
  const recentVisit = recentVisits.results[0]?.count ?? 0;
  const todayVisit = todayVisits.results[0]?.count ?? 0;
  const maxDayCount = Math.max(...dayStats.results.map(d => d.count), 1);
  const dailyData = dayStats.results.toReversed();

  const pwaCount = pwaStats.results.find(r => r.key === 1)?.count ?? 0;
  const browserCount = pwaStats.results.find(r => r.key === 0)?.count ?? 0;
  const pwaTotal = pwaCount + browserCount;

  // device type breakdown from raw visits
  const deviceTypeRaw = await db.prepare('SELECT screen_width, screen_height FROM visits WHERE screen_width IS NOT NULL AND screen_height IS NOT NULL').all<{ screen_width: number; screen_height: number }>();

  let phoneCount = 0, tabletCount = 0, desktopCount = 0;
  for (const r of deviceTypeRaw.results) {
    const t = deviceType(r.screen_width, r.screen_height);
    if (t === 'Phone') phoneCount++;
    else if (t === 'Tablet') tabletCount++;
    else desktopCount++;
  }
  const deviceTypeTotal = phoneCount + tabletCount + desktopCount;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">App Activity</h1>
          <p className="text-sm text-gray-400 mt-1">
            See how many people are using ASDRO and what devices they use
          </p>
        </div>
        <ClearAnalyticsButton />
      </div>

      <OverviewCards totalDev={totalDev} totalVisit={totalVisit} recentVisit={recentVisit} todayVisit={todayVisit} />

      {/* Device type, Browser, OS, PWA, Language — only show sections with data */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {deviceTypeTotal > 0 && (
          <BreakdownCard title="Device Type" items={[
            { label: 'Phone', count: phoneCount, total: deviceTypeTotal },
            { label: 'Tablet', count: tabletCount, total: deviceTypeTotal },
            { label: 'Desktop', count: desktopCount, total: deviceTypeTotal },
          ]} />
        )}
        {browsers.results.length > 0 && (
          <BreakdownCard title="Browser" items={browsers.results.map(b => ({ label: b.key, count: b.count, total: totalVisit }))} />
        )}
        {oss.results.length > 0 && (
          <BreakdownCard title="Operating System" items={oss.results.map(o => ({ label: o.key, count: o.count, total: totalVisit }))} />
        )}
        {pwaTotal > 0 && (
          <BreakdownCard title="How they open" items={[
            { label: 'Browser', count: browserCount, total: pwaTotal },
            { label: 'PWA (installed)', count: pwaCount, total: pwaTotal },
          ]} />
        )}
        {languages.results.length > 0 && (
          <BreakdownCard title="Language" items={languages.results.map(l => ({ label: l.key, count: l.count, total: totalVisit }))} />
        )}
        {timezones.results.length > 0 && (
          <BreakdownCard title="Timezone" items={timezones.results.map(tz => ({ label: tz.key, count: tz.count, total: totalVisit }))} />
        )}
      </div>

      {dailyData.length > 0 && (
        <DailyChart dailyData={dailyData} maxDayCount={maxDayCount} />
      )}

      {events.results.length > 0 && (
        <EventsSection events={events.results} />
      )}

      {devices.results.length > 0 && (
        <DevicesSection devices={devices.results} />
      )}

      <div className="text-center text-xs text-gray-600">
        Only basic usage data is collected — no personal info
      </div>
    </div>
  );
}

function OverviewCards({ totalDev, totalVisit, recentVisit, todayVisit }: { totalDev: number; totalVisit: number; recentVisit: number; todayVisit: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard label="People who opened the app" value={totalDev} subtitle={totalDev === 1 ? '1 person' : `${totalDev} people`} />
      <StatCard label="Total times opened" value={totalVisit} subtitle={totalVisit === 1 ? '1 visit' : `${totalVisit} visits`} />
      <StatCard label="Opened last 7 days" value={recentVisit} subtitle={totalVisit ? `${Math.round((recentVisit / totalVisit) * 100)}% of all visits` : '0%'} />
      <StatCard label="Opened today" value={todayVisit} subtitle={todayVisit === 1 ? '1 visit today' : `${todayVisit} visits today`} />
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

function BreakdownCard({ title, items }: { title: string; items: { label: string; count: number; total: number }[] }) {
  const maxCount = Math.max(...items.map(i => i.count), 1);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-gray-300">{item.label}</span>
              <span className="text-gray-500 tabular-nums">{item.count} · {Math.round((item.count / item.total) * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded overflow-hidden">
              <div className="h-full bg-blue-600/50 rounded" style={{ width: `${(item.count / maxCount) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyChart({ dailyData, maxDayCount }: { dailyData: { day: string; count: number }[]; maxDayCount: number }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gray-200 mb-4">Daily visits (last 30 days)</h2>
      <div className="space-y-1.5">
        {dailyData.map(d => {
          const isToday = d.day === new Date().toISOString().slice(0, 10);
          return (
            <div key={d.day} className="flex items-center gap-2 text-xs">
              <span className={`w-20 sm:w-24 flex-shrink-0 ${isToday ? 'text-blue-400 font-medium' : 'text-gray-400'}`}>
                {formatDate(d.day)}
              </span>
              <div className="flex-1 h-6 bg-gray-800 rounded overflow-hidden">
                <div className={`h-full rounded transition-all ${isToday ? 'bg-blue-500/70' : 'bg-blue-600/40'}`}
                  style={{ width: `${(d.count / maxDayCount) * 100}%` }} />
              </div>
              <span className="w-6 text-right text-gray-300 tabular-nums">{d.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventsSection({ events }: { events: EventRow[] }) {
  const maxCount = Math.max(...events.map(e => e.count), 1);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gray-200 mb-4">What people do in the app</h2>
      <div className="space-y-2">
        {events.map(e => (
          <div key={e.event_name}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-gray-300">{eventLabel(e.event_name)}</span>
              <span className="text-gray-500 tabular-nums">{e.count}×</span>
            </div>
            <div className="h-2 bg-gray-800 rounded overflow-hidden">
              <div className="h-full bg-emerald-500/50 rounded" style={{ width: `${(e.count / maxCount) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function eventLabel(name: string): string {
  const labels: Record<string, string> = {
    'add_stop': 'Added a stop',
    'optimize_route': 'Optimized route',
    'mark_complete': 'Marked stop as done',
    'skip_stop': 'Skipped a stop',
    'clear_all': 'Cleared all stops',
    'locate_me': 'Located their position',
    'manual_paste': 'Pasted a location',
    'detected_add': 'Added from clipboard detection',
  };
  return labels[name] || name;
}

function DevicesSection({ devices }: { devices: any[] }) {
  const activeToday = devices.filter((d: any) => d.last_seen.startsWith(new Date().toISOString().slice(0, 10))).length;
  const activeThisWeek = devices.filter((d: any) => {
    const d7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    return d.last_seen >= d7;
  }).length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-200">Devices</h2>
        <div className="flex gap-3 text-xs text-gray-500">
          <span>{activeToday} active today</span>
          <span>{activeThisWeek} active this week</span>
        </div>
      </div>
      <div className="space-y-2">
        {devices.map((d: any, i: number) => {
          const dt = d.screen_width && d.screen_height ? deviceType(d.screen_width, d.screen_height) : null;
          return (
            <div key={d.device_id} className="py-2.5 border-b border-gray-800/60 last:border-0">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DEVICE_COLORS[i % DEVICE_COLORS.length]}`} />
                <span className="text-xs text-gray-400 flex-shrink-0 w-16">Device {i + 1}</span>
                <span className="text-xs text-gray-600 flex-1">{relativeTime(d.last_seen)}</span>
                <span className="text-xs text-gray-300 font-medium tabular-nums">{d.visit_count}×</span>
              </div>
              <div className="flex gap-1.5 mt-1.5 ml-5 flex-wrap">
                {d.browser && <Badge>{d.browser}</Badge>}
                {d.os && <Badge>{d.os}</Badge>}
                {dt && <Badge>{dt}</Badge>}
                {d.is_pwa === 1 && <Badge>PWA</Badge>}
                {d.language && <Badge>{d.language}</Badge>}
                {d.timezone && <Badge>{d.timezone}</Badge>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-md border border-gray-700/50">
      {children}
    </span>
  );
}
