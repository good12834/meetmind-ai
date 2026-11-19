import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  Users,
  Zap,
} from "lucide-react";
import { getAnalyticsOverview } from "../services/analyticsService";
import { getMeetingHistory } from "../services/historyService";

function formatDate(isoString) {
  if (!isoString) return "Not set";
  try {
    return new Date(isoString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [analyticsRes, meetingsRes] = await Promise.all([
        getAnalyticsOverview(),
        getMeetingHistory({ page: 1, per_page: 100 }),
      ]);
      setData(analyticsRes.data);
      setMeetings(meetingsRes.meetings || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-8">
          <Link to="/dashboard" className="text-2xl font-bold text-purple-400">
            MeetMind AI
          </Link>
          <div className="hidden sm:flex items-center gap-4 text-sm font-medium">
            <Link to="/dashboard" className="text-gray-400 hover:text-white transition">
              Dashboard
            </Link>
            <Link to="/analytics" className="text-purple-400 border-b-2 border-purple-500 pb-1">
              AI Analytics
            </Link>
          </div>
        </div>
        <Link
          to="/dashboard"
          className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
        >
          Back to Dashboard
        </Link>
      </nav>

      <main className="max-w-6xl mx-auto p-6 sm:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">AI Analytics</h1>
            <p className="text-gray-400 mt-1">
              Meeting productivity insights, action completion, and team trends.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2"
          >
            {refreshing && <Loader2 className="w-4 h-4 animate-spin" />}
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        {!loading && data ? (
          <>
            {/* Key metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {[
                {
                  label: "Total Meetings",
                  value: data.total_meetings,
                  icon: <Activity className="w-5 h-5 text-purple-400" />,
                  hint: `${data.meetings_this_week} this week`,
                },
                {
                  label: "Completed",
                  value: data.completed_meetings,
                  icon: <Check className="w-5 h-5 text-emerald-400" />,
                  hint: `${pct(data.completed_meetings, data.total_meetings)}% done`,
                },
                {
                  label: "Total Hours",
                  value: data.total_hours,
                  icon: <Clock className="w-5 h-5 text-blue-400" />,
                  hint: "Recorded audio time",
                },
                {
                  label: "Decisions",
                  value: data.decisions_made,
                  icon: <Zap className="w-5 h-5 text-amber-400" />,
                  hint: "AI-detected decisions",
                },
              ].map((s) => (
                <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">{s.label}</h3>
                    <span>{s.icon}</span>
                  </div>
                  <p className="text-3xl sm:text-4xl font-bold text-white mb-1">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.hint}</p>
                </div>
              ))}
            </div>

            {/* Action items metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[
                {
                  label: "Action Items",
                  value: data.action_items_total,
                  icon: <Users className="w-5 h-5 text-slate-400" />,
                  hint: "Across all meetings",
                },
                {
                  label: "Completed",
                  value: data.action_items_completed,
                  icon: <Check className="w-5 h-5 text-emerald-400" />,
                  hint: `${pct(data.action_items_completed, data.action_items_total)}% done`,
                },
                {
                  label: "Pending",
                  value: data.action_items_pending,
                  icon: <Clock className="w-5 h-5 text-amber-400" />,
                  hint: "Needs attention",
                },
              ].map((s) => (
                <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">{s.label}</h3>
                    <span>{s.icon}</span>
                  </div>
                  <p className="text-3xl sm:text-4xl font-bold text-white mb-1">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.hint}</p>
                </div>
              ))}
            </div>

            {/* Recent meetings */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Recent Meetings</h3>
                <Link to="/meetings" className="text-sm text-purple-400 hover:underline">
                  View all
                </Link>
              </div>
              {data.recent_meetings.length === 0 ? (
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center">
                  <p className="text-gray-400">No meetings recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.recent_meetings.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-800/50"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/meetings/${m.id}`}
                          className="font-semibold text-white hover:text-purple-400 transition truncate"
                        >
                          {m.title}
                        </Link>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(m.date)} • {m.status}
                        </p>
                      </div>
                      <Link
                        to={`/meetings/${m.id}`}
                        className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1"
                      >
                        Open <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
