import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";

const STATUS_STYLES = {
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "in-progress": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const isLive = (m) => m.status === "in-progress" || m.live;
const hasTranscript = (m) => Boolean(m.has_transcript || m.transcripts_count > 0);
const hasSummary = (m) => Boolean(m.has_summary);
const getTime = (m) => new Date(m.meeting_date || m.created_at || 0).getTime();

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate(isoString) {
  if (!isoString) return "No date set";
  try {
    return new Date(isoString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function formatMetric(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n.toLocaleString("en-US") : Number(n).toFixed(1);
}

function formatHours(hours) {
  const h = Number(hours) || 0;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${(h * 60).toFixed(0)}min`;
}

function getScoreLabel(score) {
  if (score >= 80) return "Strong";
  if (score >= 50) return "Developing";
  return "Needs attention";
}

function ProgressBar({ value, className = "w-full" }) {
  return (
    <div className={`h-2 rounded-full bg-slate-800 overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div className={`bg-slate-900 rounded-2xl border border-slate-800 p-5 transition hover:border-slate-700`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">{label}</h3>
        <span className={`text-lg ${accent || ""}`}>{icon}</span>
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-white mt-2">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const [overviewRes, meetingsRes] = await Promise.all([
          api.get("/analytics/overview"),
          api.get("/meetings"),
        ]);
        setOverview(overviewRes.data.data);
        setMeetings(meetingsRes.data.meetings || []);
        setError("");
      } catch (err) {
        if (err.response?.status === 401) {
          navigate("/login");
        } else {
          setError(err.response?.data?.message || "Failed to load dashboard.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [navigate]);

  const liveMeeting = useMemo(() => meetings.find(isLive), [meetings]);

  const upcoming = overview?.upcoming_meetings || [];
  const nextUpcoming = upcoming[0];

  const completedMeetings = useMemo(() => {
    return [...meetings]
      .filter((m) => m.status === "completed")
      .sort((a, b) => getTime(b) - getTime(a))
      .slice(0, 5);
  }, [meetings]);

  const recent = overview?.recent_meetings || [];

  const totalHours = overview?.total_hours ?? 0;
  const tasksCompleted = overview?.tasks_completed ?? 0;
  const tasksPending = overview?.tasks_pending ?? 0;
  const productivityScore = overview?.productivity_score ?? 0;
  const completedMeetingsCount = overview?.completed_meetings ?? 0;
  const totalMeetings = overview?.total_meetings ?? 0;
  const taskCompletionRate = overview?.task_completion_rate ?? 0;
  const summaryRate = overview?.summary_rate ?? 0;
  const meetingsWithTranscript = overview?.meetings_with_transcript ?? 0;
  const meetingsWithSummary = overview?.meetings_with_summary ?? 0;

  const statCards = [
    { label: "Total Meeting Hours", value: formatHours(totalHours), icon: "🕐", sub: "From all recordings" },
    { label: "Tasks Completed", value: formatMetric(tasksCompleted), icon: "✅", sub: "Across all meetings" },
    { label: "Tasks Pending", value: formatMetric(tasksPending), icon: "⏳", sub: `${taskCompletionRate}% done` },
    { label: "Completed Meetings", value: formatMetric(completedMeetingsCount), icon: "✓", sub: "This month" },
    { label: "Total Meetings", value: formatMetric(totalMeetings), icon: "📅", sub: `${overview?.meetings_this_week ?? 0} this week` },
    { label: "AI Productivity", value: `${productivityScore}`, icon: "🚀", sub: getScoreLabel(productivityScore) },
  ];

  const quickActions = [
    { icon: "➕", title: "New meeting", text: "Schedule or start one", to: "/meetings" },
    { icon: "📹", title: "Video meeting", text: "Start from Meetings", to: "/meetings" },
    { icon: "🎙️", title: "Record audio", text: "Pick a meeting to record", to: "/meetings" },
    { icon: "🗂️", title: "All meetings", text: "Search and filter", to: "/meetings" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-8">
          <Link to="/dashboard" className="text-2xl font-bold text-purple-400">
            MeetMind AI
          </Link>
          <div className="hidden sm:flex items-center gap-4 text-sm font-medium">
            <Link to="/dashboard" className="text-purple-400 border-b-2 border-purple-500 pb-1">
              Dashboard
            </Link>
            <Link to="/meetings" className="text-gray-400 hover:text-white transition">
              Meetings
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-purple-600/20 border border-purple-500/30 text-purple-300 flex items-center justify-center font-semibold">
              {(user.name || "U").charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-gray-300">{user.name || "User"}</span>
          </div>
          <button
            onClick={() => navigate("/meetings")}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg hover:shadow-lg hover:shadow-purple-600/20 transition text-sm font-medium"
          >
            + New Meeting
          </button>
          <button
            onClick={() => handleLogout()}
            className="bg-red-600 px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium"
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 sm:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold">
              {getGreeting()}, <span className="text-purple-400">{user.name || "User"}</span>
            </h2>
            <p className="text-gray-400 mt-1">AI Meeting Dashboard — your meeting intelligence at a glance.</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            ⚠️ {error}
          </div>
        )}

        {liveMeeting && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-900/20 to-slate-900">
            <div className="flex items-center gap-4">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-wider text-red-400 font-semibold">Live now</p>
                <p className="font-semibold text-white">{liveMeeting.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to={`/meetings/${liveMeeting.id}/video`}
                className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl text-sm font-semibold transition"
              >
                📹 Join video
              </Link>
              <Link
                to={`/meetings/${liveMeeting.id}`}
                className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-sm font-semibold transition"
              >
                Open details
              </Link>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {statCards.map((s) => (
            <StatCard
              key={s.label}
              icon={s.icon}
              label={s.label}
              value={s.value}
              sub={s.sub}
              accent={
                s.label === "AI Productivity"
                  ? "text-purple-400"
                  : s.label === "Tasks Completed"
                  ? "text-emerald-400"
                  : s.label === "Tasks Pending"
                  ? "text-amber-400"
                  : s.label === "Total Meeting Hours"
                  ? "text-sky-400"
                  : s.label === "Completed Meetings"
                  ? "text-blue-400"
                  : "text-violet-400"
              }
            />
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upcoming & Completed meetings */}
          <div className="space-y-6">
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">Upcoming</h3>
              {loading ? (
                <div className="h-12 rounded-xl bg-slate-800 animate-pulse" />
              ) : upcoming.length === 0 ? (
                <p className="text-sm text-gray-400">No upcoming meetings scheduled.</p>
              ) : (
                <div className="space-y-4">
                  <Link
                    to={`/meetings/${nextUpcoming.id}`}
                    className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 transition border border-slate-700"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{nextUpcoming.title}</p>
                      <p className="text-xs text-gray-400">📅 {formatDate(nextUpcoming.date)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-purple-400">Start →</span>
                  </Link>
                  {upcoming.length > 1 && (
                    <p className="text-xs text-gray-400">
                      +{upcoming.length - 1} more scheduled meeting {upcoming.length - 1 === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">Completed
                <span className="ml-2 text-sm font-normal text-gray-400">({completedMeetingsCount})</span>
              </h3>
              {loading ? (
                <div className="h-12 rounded-xl bg-slate-800 animate-pulse" />
              ) : completedMeetings.length === 0 ? (
                <p className="text-sm text-gray-400">No completed meetings yet.</p>
              ) : (
                <div className="space-y-3">
                  {completedMeetings.map((m) => (
                    <Link
                      key={m.id}
                      to={`/meetings/${m.id}`}
                      className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 transition border border-slate-700"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{m.title}</p>
                        <p className="text-xs text-gray-400">📅 {formatDate(m.meeting_date)}</p>
                      </div>
                      <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border ${STATUS_STYLES[m.status] || STATUS_STYLES.scheduled}`}>
                        {m.status}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Recent activity + AI productivity score */}
          <div className="space-y-6">
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Recent activity</h3>
                <Link to="/meetings" className="text-sm text-purple-400 hover:underline">
                  View all →
                </Link>
              </div>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl bg-slate-800 animate-pulse" />
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <p className="text-sm text-gray-400">No meeting activity yet.</p>
              ) : (
                <div className="space-y-3">
                  {recent.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 transition border border-slate-700"
                    >
                      <div className="shrink-0 w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-lg">
                        📋
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{m.title}</p>
                        <p className="text-xs text-gray-400">📅 {formatDate(m.date)}</p>
                      </div>
                      <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border ${STATUS_STYLES[m.status] || STATUS_STYLES.scheduled}`}>
                        {m.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-gradient-to-br from-purple-900/30 to-slate-900 border border-purple-500/30 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-1">AI productivity score</h3>
              <p className="text-xs text-gray-400 mb-4">How your meeting workflow is performing.</p>
              <div className="flex items-baseline justify-center mb-4">
                <span className="text-5xl font-extrabold text-white">{formatMetric(productivityScore)}</span>
                <span className="ml-2 text-sm text-gray-400">/{getScoreLabel(productivityScore)}</span>
              </div>
              <ProgressBar value={productivityScore} className="w-3/4 mx-auto" />
              <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <p className="text-lg font-bold text-emerald-400">{summaryRate}%</p>
                  <p className="text-xs text-gray-400">Summaries from transcript</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <p className="text-lg font-bold text-emerald-400">{taskCompletionRate}%</p>
                  <p className="text-xs text-gray-400">Tasks completed</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <p className="text-lg font-bold text-emerald-400">{meetingsWithSummary}/{meetingsWithTranscript}</p>
                  <p className="text-xs text-gray-400">Meetings summarized</p>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Quick actions */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {quickActions.map((a) => (
            <Link
              key={a.title}
              to={a.to}
              className="group bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-purple-500/40 hover:bg-slate-900/80 transition"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-lg group-hover:scale-110 transition">
                {a.icon}
              </span>
              <p className="font-semibold text-white mt-3">{a.title}</p>
              <p className="text-xs text-gray-400 mt-1">{a.text}</p>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
