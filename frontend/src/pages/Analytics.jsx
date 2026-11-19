import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  Hash,
  Loader2,
  Mic,
  PieChart,
  RefreshCw,
  TrendingUp,
  UserCheck,
  Zap,
} from "lucide-react";
import Navbar from "../components/Navbar";
import { getAnalyticsOverview } from "../services/analyticsService";

const SPEAKER_COLORS = [
  { bg: "bg-purple-500", text: "text-purple-400", border: "border-purple-500/30" },
  { bg: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/30" },
  { bg: "bg-sky-500", text: "text-sky-400", border: "border-sky-500/30" },
  { bg: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/30" },
  { bg: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/30" },
  { bg: "bg-indigo-500", text: "text-indigo-400", border: "border-indigo-500/30" },
];

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getAnalyticsOverview();
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load meeting analytics.");
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

  const durationStats = data?.duration_stats || {
    total_hours: 0,
    total_minutes: 0,
    avg_minutes: 0,
    min_minutes: 0,
    max_minutes: 0,
    distribution: [],
  };

  const speakerParticipation = data?.speaker_participation || [];
  const mostDiscussedTopics = data?.most_discussed_topics || [];
  const meetingFrequency = data?.meeting_frequency || {
    by_day: [],
    busiest_day: "None",
    peak_time: "10:00 - 11:00",
    meetings_this_week: 0,
    meetings_this_month: 0,
    avg_per_week: 0,
  };
  const productivityTrends = data?.productivity_trends || {
    overall_score: 0,
    summary_rate: 0,
    task_completion_rate: 0,
    decision_count: 0,
    decisions_per_meeting: 0,
    weekly_trends: [],
  };
  const actionStats = data?.action_completion_stats || {
    tasks_total: 0,
    tasks_completed: 0,
    tasks_in_progress: 0,
    tasks_pending: 0,
    completion_rate: 0,
    overdue_count: 0,
    overdue_rate: 0,
    by_priority: [],
  };

  const maxDayCount = Math.max(1, ...(meetingFrequency.by_day.map((d) => d.count) || [1]));

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                AI Meeting Intelligence
              </span>
              <span className="text-xs text-gray-400">Live Workspace Analytics</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-purple-400" />
              Meeting Analytics & Performance
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Deep insights on durations, speaker time, discussions, frequency, and action items.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="bg-slate-900 border border-slate-700 hover:border-slate-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-purple-400" : ""}`} />
              {refreshing ? "Updating…" : "Refresh"}
            </button>
            <Link
              to="/action-items"
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-1.5 shadow-lg shadow-purple-600/20"
            >
              Action Items <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !data ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-slate-900 border border-slate-800" />
            ))}
          </div>
        ) : (
          <>
            {/* Top Key Metrics Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <span>Total Meeting Hours</span>
                  <Clock className="w-5 h-5 text-sky-400" />
                </div>
                <p className="text-3xl font-extrabold text-white mt-2">
                  {durationStats.total_hours} <span className="text-base font-normal text-gray-400">hrs</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Avg {durationStats.avg_minutes} min per recorded session
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <span>Productivity Score</span>
                  <Zap className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-extrabold text-white">
                    {productivityTrends.overall_score}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    {productivityTrends.overall_score >= 75 ? "Optimal" : productivityTrends.overall_score >= 50 ? "Steady" : "Action Needed"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {productivityTrends.summary_rate}% documented summaries
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <span>Action Completion</span>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-3xl font-extrabold text-white mt-2">
                  {actionStats.completion_rate}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {actionStats.tasks_completed} of {actionStats.tasks_total} tasks resolved
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <span>Meeting Frequency</span>
                  <Calendar className="w-5 h-5 text-amber-400" />
                </div>
                <p className="text-3xl font-extrabold text-white mt-2">
                  {meetingFrequency.meetings_this_week} <span className="text-base font-normal text-gray-400">this wk</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Busiest on {meetingFrequency.busiest_day} • ~{meetingFrequency.avg_per_week}/wk
                </p>
              </div>
            </div>

            {/* Row 1: Meeting Duration Statistics & Speaker Participation Percentage */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. Meeting Duration Statistics */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-sky-400" />
                    <h2 className="text-lg font-bold text-white">Meeting Duration Statistics</h2>
                  </div>
                  <span className="text-xs text-gray-400">Recorded sessions</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Average</p>
                    <p className="text-xl font-bold text-white mt-1">{durationStats.avg_minutes}m</p>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Shortest</p>
                    <p className="text-xl font-bold text-emerald-400 mt-1">{durationStats.min_minutes}m</p>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Longest</p>
                    <p className="text-xl font-bold text-amber-400 mt-1">{durationStats.max_minutes}m</p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Duration Distribution
                  </p>
                  {durationStats.distribution.length === 0 ? (
                    <p className="text-xs text-gray-500 py-3">No recorded meeting durations available.</p>
                  ) : (
                    durationStats.distribution.map((item) => (
                      <div key={item.range} className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-gray-400">
                          <span className="font-mono text-gray-300">{item.range}</span>
                          <span>{item.count} meetings ({item.percentage}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-500 transition-all duration-500"
                            style={{ width: `${Math.min(100, item.percentage)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 2. Speaker Participation Percentage */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-bold text-white">Speaker Participation</h2>
                  </div>
                  <span className="text-xs text-gray-400">By speaking time & word count</span>
                </div>

                {speakerParticipation.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-center text-gray-500">
                    <UserCheck className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">No speaker breakdown yet.</p>
                    <p className="text-xs mt-1">Transcripts will automatically identify speaking turns.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Horizontal stacked bar */}
                    <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-800">
                      {speakerParticipation.map((spk, idx) => {
                        const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
                        return (
                          <div
                            key={spk.speaker}
                            className={`h-full ${color.bg} transition-all duration-500`}
                            style={{ width: `${Math.max(2, spk.percentage)}%` }}
                            title={`${spk.speaker}: ${spk.percentage}%`}
                          />
                        );
                      })}
                    </div>

                    {/* Speaker list breakdown */}
                    <div className="space-y-3 divide-y divide-slate-800/60 pt-1">
                      {speakerParticipation.map((spk, idx) => {
                        const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
                        return (
                          <div key={spk.speaker} className="flex items-center justify-between pt-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-3 h-3 rounded-full ${color.bg}`} />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{spk.speaker}</p>
                                <p className="text-xs text-gray-500">
                                  {spk.turns} speaking turns • {spk.words.toLocaleString()} words
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold text-white">{spk.percentage}%</span>
                              <div className="text-[10px] text-gray-400">share</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Most Discussed Topics & Meeting Frequency */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 3. Most Discussed Topics */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-lg font-bold text-white">Most Discussed Topics</h2>
                  </div>
                  <span className="text-xs text-gray-400">Extracted from AI notes</span>
                </div>

                <div className="space-y-3">
                  {mostDiscussedTopics.length === 0 ? (
                    <div className="h-44 flex flex-col items-center justify-center text-center text-gray-500">
                      <p className="text-sm">No topics detected yet.</p>
                      <p className="text-xs mt-1">Generate AI summaries to see recurring discussion themes.</p>
                    </div>
                  ) : (
                    mostDiscussedTopics.map((top, idx) => (
                      <div key={top.topic} className="space-y-1.5 p-2 rounded-xl bg-slate-800/40 border border-slate-800/60">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-gray-200 flex items-center gap-2">
                            <span className="text-xs font-mono text-emerald-400">#{idx + 1}</span>
                            {top.topic}
                          </span>
                          <span className="text-gray-400">{top.count} mentions ({top.percentage}%)</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                            style={{ width: `${Math.min(100, top.percentage * 2.5)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 4. Meeting Frequency */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-amber-400" />
                    <h2 className="text-lg font-bold text-white">Meeting Frequency</h2>
                  </div>
                  <span className="text-xs text-gray-400">Day & time patterns</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                    <p className="text-xs text-gray-400">Busiest Day</p>
                    <p className="text-lg font-bold text-amber-300 mt-1">{meetingFrequency.busiest_day}</p>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                    <p className="text-xs text-gray-400">Peak Meeting Time</p>
                    <p className="text-lg font-bold text-purple-300 mt-1">{meetingFrequency.peak_time}</p>
                  </div>
                </div>

                {/* Day-of-week bar chart */}
                <div className="pt-2">
                  <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
                    Weekly Cadence
                  </p>
                  <div className="grid grid-cols-7 gap-2 items-end h-28 pt-2">
                    {meetingFrequency.by_day.map((d) => {
                      const hPct = Math.round((d.count / maxDayCount) * 100);
                      const isBusiest = d.day === meetingFrequency.busiest_day && d.count > 0;
                      return (
                        <div key={d.day} className="flex flex-col items-center gap-1.5 h-full justify-end">
                          <span className="text-[10px] text-gray-400 font-mono">{d.count}</span>
                          <div className="w-full bg-slate-800 rounded-t-lg h-20 flex items-end overflow-hidden">
                            <div
                              className={`w-full rounded-t-lg transition-all duration-500 ${
                                isBusiest ? "bg-amber-500" : "bg-purple-600/70"
                              }`}
                              style={{ height: `${Math.max(12, hPct)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-medium ${isBusiest ? "text-amber-400 font-bold" : "text-gray-400"}`}>
                            {d.day}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Productivity Trends (6-Week Timeline) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                  <h2 className="text-lg font-bold text-white">Productivity Trends (6-Week View)</h2>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Score (0-100)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> Duration (hrs)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {productivityTrends.weekly_trends.map((w) => (
                  <div
                    key={w.week}
                    className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5 space-y-2 hover:border-purple-500/40 transition"
                  >
                    <p className="text-xs font-semibold text-gray-400">{w.week}</p>
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-extrabold text-white">{w.productivity_score}</span>
                      <span className="text-[10px] text-purple-400 uppercase font-semibold">pts</span>
                    </div>
                    <div className="space-y-1 text-xs text-gray-400 border-t border-slate-700/60 pt-2">
                      <div className="flex justify-between">
                        <span>Meetings:</span>
                        <span className="text-white font-medium">{w.meetings}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Time:</span>
                        <span className="text-white font-medium">{w.hours}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tasks done:</span>
                        <span className="text-emerald-400 font-medium">+{w.tasks_completed}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Productivity Velocity summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
                <div className="p-3 bg-slate-800/30 rounded-xl">
                  <p className="text-xs text-gray-400">AI Notes Coverage</p>
                  <p className="text-lg font-bold text-purple-300 mt-1">{productivityTrends.summary_rate}%</p>
                  <p className="text-[11px] text-gray-500">Meetings converted to structured notes</p>
                </div>
                <div className="p-3 bg-slate-800/30 rounded-xl">
                  <p className="text-xs text-gray-400">Decisions Recorded</p>
                  <p className="text-lg font-bold text-amber-300 mt-1">{productivityTrends.decision_count}</p>
                  <p className="text-[11px] text-gray-500">Avg {productivityTrends.decisions_per_meeting} decisions per meeting</p>
                </div>
                <div className="p-3 bg-slate-800/30 rounded-xl">
                  <p className="text-xs text-gray-400">Execution Velocity</p>
                  <p className="text-lg font-bold text-emerald-300 mt-1">{productivityTrends.task_completion_rate}%</p>
                  <p className="text-[11px] text-gray-500">Action items closed successfully</p>
                </div>
              </div>
            </div>

            {/* Row 4: Action Completion Rate & Priority Matrix */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-lg font-bold text-white">Action Completion Rate & Task Matrix</h2>
                </div>
                <Link to="/action-items" className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-semibold">
                  Manage all tasks <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Overdue alert if overdue tasks exist */}
              {actionStats.overdue_count > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>{actionStats.overdue_count} action items</strong> are past their target due date ({actionStats.overdue_rate}% of active tasks).
                    </span>
                  </div>
                  <Link to="/action-items" className="underline font-semibold hover:text-white">Review tasks</Link>
                </div>
              )}

              {/* Status bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Task Pipeline Breakdown</span>
                  <span>{actionStats.tasks_completed} done / {actionStats.tasks_total} total</span>
                </div>
                <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-800">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${actionStats.tasks_total ? (actionStats.tasks_completed / actionStats.tasks_total) * 100 : 0}%` }}
                    title={`Completed: ${actionStats.tasks_completed}`}
                  />
                  <div
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${actionStats.tasks_total ? (actionStats.tasks_in_progress / actionStats.tasks_total) * 100 : 0}%` }}
                    title={`In Progress: ${actionStats.tasks_in_progress}`}
                  />
                  <div
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${actionStats.tasks_total ? (actionStats.tasks_pending / actionStats.tasks_total) * 100 : 0}%` }}
                    title={`Pending: ${actionStats.tasks_pending}`}
                  />
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400 pt-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Completed ({actionStats.tasks_completed})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" /> In Progress ({actionStats.tasks_in_progress})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Pending ({actionStats.tasks_pending})
                  </span>
                </div>
              </div>

              {/* Completion by Priority Matrix */}
              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Completion by Priority
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {actionStats.by_priority.map((p) => {
                    const badgeStyles = {
                      urgent: "border-red-500/30 text-red-400 bg-red-500/10",
                      high: "border-amber-500/30 text-amber-400 bg-amber-500/10",
                      medium: "border-purple-500/30 text-purple-400 bg-purple-500/10",
                      low: "border-gray-600 text-gray-300 bg-slate-800",
                    }[p.priority] || "border-slate-700 text-gray-300 bg-slate-800";

                    return (
                      <div key={p.priority} className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${badgeStyles}`}>
                            {p.priority}
                          </span>
                          <span className="text-xs font-bold text-white">{p.completion_rate}%</span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {p.completed} of {p.total} completed
                        </p>
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-emerald-400"
                            style={{ width: `${Math.min(100, p.completion_rate)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Recent Meetings Snapshot */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Recent Meeting Activity</h3>
                <Link to="/meetings" className="text-xs text-purple-400 hover:underline font-semibold">
                  View All Meetings →
                </Link>
              </div>
              {data.recent_meetings.length === 0 ? (
                <p className="text-xs text-gray-500 py-3">No recent meetings found.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.recent_meetings.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 hover:border-slate-700 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/meetings/${m.id}`}
                          className="font-semibold text-white hover:text-purple-300 transition truncate block text-sm"
                        >
                          {m.title}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDate(m.date)} • Status: {m.status}
                        </p>
                      </div>
                      <Link
                        to={`/meetings/${m.id}`}
                        className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1 shrink-0"
                      >
                        Details <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
