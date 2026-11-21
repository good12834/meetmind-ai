import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Folder,
  Hourglass,
  Mic,
  Plus,
  Rocket,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import api from "../services/api";
import Navbar from "../components/Navbar";

const STATUS_STYLES = {
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "in-progress": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const isLive = (m) => m.status === "in-progress" || m.live;
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

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 transition hover:border-slate-700">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">{label}</h3>
        <span className={accent || "text-gray-400"}><Icon className="w-5 h-5" /></span>
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-white mt-2">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
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
    { label: "Total Meeting Hours", value: formatHours(totalHours), icon: Clock, sub: "From all recordings", accent: "text-sky-400" },
    { label: "Tasks Completed", value: formatMetric(tasksCompleted), icon: CheckCircle2, sub: "Across all meetings", accent: "text-emerald-400" },
    { label: "Tasks Pending", value: formatMetric(tasksPending), icon: Hourglass, sub: `${taskCompletionRate}% done`, accent: "text-amber-400" },
    { label: "Completed Meetings", value: formatMetric(completedMeetingsCount), icon: Check, sub: "This month", accent: "text-blue-400" },
    { label: "Total Meetings", value: formatMetric(totalMeetings), icon: Calendar, sub: `${overview?.meetings_this_week ?? 0} this week`, accent: "text-violet-400" },
    { label: "AI Productivity", value: `${productivityScore}`, icon: Rocket, sub: getScoreLabel(productivityScore), accent: "text-purple-400" },
  ];

  const quickActions = [
    { icon: Plus, title: "New meeting", text: "Schedule or start one", to: "/meetings" },
    { icon: Mic, title: "Live transcription", text: "Real-time speech-to-text", to: "/live-transcription" },
    { icon: Bot, title: "AI Chat", text: "Ask anything about meetings", to: "/ai-chat" },
    { icon: CheckCircle2, title: "Action items", text: "Track tasks and deadlines", to: "/action-items" },
    { icon: BarChart3, title: "Analytics", text: "Meeting productivity stats", to: "/analytics" },
    { icon: Users, title: "Team", text: "Collaborate with your team", to: "/team" },
    { icon: Video, title: "Video meeting", text: "Start from Meetings page", to: "/meetings" },
    { icon: Folder, title: "All meetings", text: "Search and filter history", to: "/meetings" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />

      <main className="max-w-6xl mx-auto p-6 sm:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold">
              {getGreeting()}, <span className="text-purple-400">{user.name || "User"}</span>
            </h2>
            <p className="text-gray-400 mt-1">AI Meeting Dashboard — your meeting intelligence at a glance.</p>
          </div>
          <Link
            to="/meetings"
            className="self-start sm:self-auto bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-purple-600/20 transition inline-flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create a new meeting to get started</span>
          </Link>
        </div>

        {/* Empty state onboarding banner when no meetings exist yet */}
        {meetings.length === 0 && !loading && (
          <div className="bg-gradient-to-r from-purple-900/30 via-slate-900 to-slate-900 border border-purple-500/30 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <span>Ready to start collaborating?</span>
              </h3>
              <p className="text-sm text-gray-300">
                Create a new meeting to get started with live speech-to-text, AI notes, and action tracking.
              </p>
            </div>
            <Link
              to="/meetings"
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-lg shadow-purple-600/30 transition inline-flex items-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create a new meeting to get started</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {error && (
          <div role="alert" className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
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
                className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-1.5"
              >
                <Video className="w-4 h-4" /> Join video
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
              accent={s.accent}
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
                <div className="text-center py-5">
                  <p className="text-sm text-gray-400 mb-2">No upcoming meetings scheduled.</p>
                  <Link
                    to="/meetings"
                    className="text-xs text-purple-400 hover:text-purple-300 font-semibold inline-flex items-center gap-1"
                  >
                    <span>Create a new meeting to get started</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <Link
                    to={`/meetings/${nextUpcoming.id}`}
                    className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 transition border border-slate-700"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{nextUpcoming.title}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3 text-purple-400" /> {formatDate(nextUpcoming.date)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-purple-400 flex items-center gap-1">
                      Start <ArrowRight className="w-3.5 h-3.5" />
                    </span>
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
              <h3 className="text-lg font-bold text-white mb-4">
                Completed
                <span className="ml-2 text-sm font-normal text-gray-400">({completedMeetingsCount})</span>
              </h3>
              {loading ? (
                <div className="h-12 rounded-xl bg-slate-800 animate-pulse" />
              ) : completedMeetings.length === 0 ? (
                <div className="text-center py-5">
                  <p className="text-sm text-gray-400 mb-2">No completed meetings yet.</p>
                  <Link
                    to="/meetings"
                    className="text-xs text-purple-400 hover:text-purple-300 font-semibold inline-flex items-center gap-1"
                  >
                    <span>Create a new meeting to get started</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
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
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-purple-400" /> {formatDate(m.meeting_date)}
                        </p>
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
                <Link to="/meetings" className="text-sm text-purple-400 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3.5 h-3.5" />
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
                      <div className="shrink-0 w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white truncate">{m.title}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-purple-400" /> {formatDate(m.date)}
                        </p>
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
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {quickActions.map(({ icon: Icon, title, text, to }) => (
            <Link
              key={title}
              to={to}
              className="group bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-purple-500/40 hover:bg-slate-900/80 transition"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:scale-110 transition">
                <Icon className="w-5 h-5" />
              </span>
              <p className="font-semibold text-white mt-3">{title}</p>
              <p className="text-xs text-gray-400 mt-1">{text}</p>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
