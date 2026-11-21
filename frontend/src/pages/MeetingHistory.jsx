import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Mic,
  Search,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import Navbar from "../components/Navbar";
import { getMeetingHistory, deleteMeeting } from "../services/historyService";

const DEBOUNCE_MS = 300;
const PER_PAGE = 15;

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in-progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_STYLE = {
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "in-progress": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
};

const DOT_STYLE = {
  completed: "bg-emerald-500",
  scheduled: "bg-blue-500",
  "in-progress": "bg-amber-500",
  cancelled: "bg-red-500",
};

function formatDate(dateString) {
  if (!dateString) return "Not specified";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function getDateLabel(dateString) {
  if (!dateString) return "Undated";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "Undated";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dStart = new Date(d);
  dStart.setHours(0, 0, 0, 0);

  if (dStart.getTime() === today.getTime()) return "Today";
  if (dStart.getTime() === yesterday.getTime()) return "Yesterday";

  const diffDays = Math.abs((dStart.getTime() - today.getTime()) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const prettyStatus = (s) =>
  (s || "unknown").replace("-", " ").replace(/^\w/, (c) => c.toUpperCase());

function Highlight({ text, term }) {
  if (!term) return text;
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text)
    .split(new RegExp(`(${safe})`, "gi"))
    .map((p, i) =>
      p.toLowerCase() === term.toLowerCase() ? (
        <mark key={i} className="bg-purple-500/30 text-white rounded px-0.5">
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      )
    );
}

function ProgressStrip({ meeting }) {
  const steps = [
    { label: "Recorded", done: (meeting.recordings_count || 0) > 0 },
    { label: "Transcribed", done: Boolean(meeting.has_transcript) || (meeting.transcripts_count || 0) > 0 },
    { label: "Summarized", done: Boolean(meeting.has_summary) },
  ];
  return (
    <ol className="flex items-center gap-1.5 text-[11px]">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${
              s.done
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-slate-800/60 text-slate-500 border-slate-700"
            }`}
          >
            {s.done ? <Check className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />}
            {s.label}
          </span>
          {i < steps.length - 1 && <span className={`h-px w-3 ${s.done ? "bg-emerald-500/40" : "bg-slate-700"}`} />}
        </li>
      ))}
    </ol>
  );
}

function RowSkeleton() {
  return (
    <div className="ml-8 h-32 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
  );
}

export default function MeetingHistory() {
  const [meetings, setMeetings] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage] = useState(PER_PAGE);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [effectiveSearch, setEffectiveSearch] = useState("");
  const [status, setStatus] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const searchTimerRef = useRef(null);
  const replacingRef = useRef(true);
  const requestIdRef = useRef(0);

  const showToast = useCallback((type, text) => setToast({ type, text, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchHistory = useCallback(async () => {
    const replace = replacingRef.current;
    replacingRef.current = true; // default back to "replace" for the next fetch
    const requestId = ++requestIdRef.current;

    if (replace) {
      setInitialLoading(true);
      setLoadMoreLoading(false);
    } else {
      setLoadMoreLoading(true);
    }
    setError("");

    try {
      const response = await getMeetingHistory({
        search: effectiveSearch,
        status,
        page,
        per_page: perPage,
      });
      if (requestId !== requestIdRef.current) return; // stale response

      const fetched = response.data.meetings || [];
      const pagination = response.data.pagination || { page: 1, per_page: perPage, total: 0, pages: 1 };

      setMeetings((prev) => {
        if (replace) return fetched;
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...fetched.filter((m) => !seen.has(m.id))];
      });
      setTotal(pagination.total ?? fetched.length);
      setHasMore(pagination.page < pagination.pages);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(
        err.response?.data?.message || err.response?.data?.error || "Could not load meeting history."
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setInitialLoading(false);
        setLoadMoreLoading(false);
      }
    }
  }, [effectiveSearch, status, page, perPage]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Escape closes the confirm dialog
  useEffect(() => {
    if (!confirmTarget) return;
    const onKey = (e) => e.key === "Escape" && setConfirmTarget(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [confirmTarget]);

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setEffectiveSearch(value), DEBOUNCE_MS);
  };

  const clearSearch = () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearch("");
    setEffectiveSearch("");
    setPage(1);
  };

  const handleStatusChange = (value) => {
    setStatus(value);
    setPage(1);
  };

  const clearFilters = () => {
    clearSearch();
    setStatus("");
  };

  const handleLoadMore = () => {
    if (loadMoreLoading || !hasMore) return;
    replacingRef.current = false;
    setPage((prev) => prev + 1);
  };

  const handleDeleteMeeting = async () => {
    if (!confirmTarget) return;
    const meetingId = confirmTarget.id;
    setConfirmTarget(null);
    setDeletingId(meetingId);
    try {
      await deleteMeeting(meetingId);
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
      setTotal((t) => Math.max(0, t - 1));
      showToast("success", "Meeting deleted");
    } catch (err) {
      showToast("error", err.response?.data?.message || err.response?.data?.error || "Failed to delete meeting");
    } finally {
      setDeletingId(null);
    }
  };

  const grouped = useMemo(() => {
    const list = [...meetings].sort(
      (a, b) =>
        new Date(b.meeting_date || b.created_at || 0).getTime() -
        new Date(a.meeting_date || a.created_at || 0).getTime()
    );
    const map = new Map();
    for (const meeting of list) {
      const label = getDateLabel(meeting.meeting_date || meeting.created_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(meeting);
    }
    return Array.from(map.entries());
  }, [meetings]);

  const summary = useMemo(
    () => ({
      loaded: meetings.length,
      summarized: meetings.filter((m) => m.has_summary).length,
      transcribed: meetings.filter((m) => m.has_transcript || (m.transcripts_count || 0) > 0).length,
      recordings: meetings.reduce((n, m) => n + (m.recordings_count || 0), 0),
    }),
    [meetings]
  );

  const hasFilters = effectiveSearch.trim() !== "" || status !== "";
  const term = effectiveSearch.trim();

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <Navbar />

      <main className="max-w-5xl mx-auto w-full p-4 sm:p-8 flex-1">
        <header className="flex flex-wrap justify-between items-end gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">Meeting History</h1>
            <p className="text-slate-400 mt-1">Revisit your meetings in a timeline grouped by date.</p>
          </div>
          <Link
            to="/meetings"
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-purple-600/20 transition"
          >
            + New Meeting
          </Link>
        </header>

        {/* Summary strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {[
            { label: "Meetings", value: hasFilters || !hasMore ? total : `${total}`, icon: Calendar },
            { label: "Recordings", value: summary.recordings, icon: Mic },
            { label: "Transcribed", value: summary.transcribed, icon: FileText },
            { label: "Summarized", value: summary.summarized, icon: Sparkles },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs uppercase tracking-wider font-semibold">{s.label}</span>
                  <Icon className="w-4 h-4" />
                </div>
                {initialLoading && meetings.length === 0 ? (
                  <div className="h-7 w-12 mt-2 rounded-lg bg-slate-800 animate-pulse" />
                ) : (
                  <p className="text-2xl font-bold text-purple-400 mt-1">{s.value}</p>
                )}
              </div>
            );
          })}
        </div>
        {hasMore && meetings.length > 0 && (
          <p className="text-xs text-slate-500 -mt-3 mb-6">
            Recordings, transcribed and summarized counts cover the {summary.loaded} meetings loaded so far.
          </p>
        )}

        {/* Filters */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 space-y-3">
          <div className="relative">
            <Search className=" w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search meetings..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-11 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition"
            />
            {search && (
              <button
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 overflow-x-auto" role="group" aria-label="Filter by status">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value || "all"}
                  onClick={() => handleStatusChange(f.value)}
                  aria-pressed={status === f.value}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition ${
                    status === f.value
                      ? "bg-purple-600 border-purple-500 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-purple-400 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 bg-red-500/10 text-red-300 border border-red-500/20 p-4 rounded-xl mb-5 text-sm"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </span>
            <button
              onClick={() => {
                replacingRef.current = page === 1;
                fetchHistory();
              }}
              className="bg-red-500/20 hover:bg-red-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            >
              Retry
            </button>
          </div>
        )}

        {initialLoading && meetings.length === 0 ? (
          <div className="space-y-4" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        ) : meetings.length === 0 && !error ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center">
            <Calendar className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <h2 className="text-xl font-semibold">No meetings found</h2>
            <p className="text-slate-400 mt-2 mb-6">
              {hasFilters ? "Try adjusting your search or filters." : "Create a new meeting to get started."}
            </p>
            {hasFilters ? (
              <button
                onClick={clearFilters}
                className="bg-slate-800 hover:bg-slate-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
              >
                Clear filters
              </button>
            ) : (
              <Link
                to="/meetings"
                className="bg-purple-600 hover:bg-purple-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition inline-block"
              >
                Create a new meeting to get started
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([label, groupMeetings]) => (
              <section key={label}>
                <div className="sticky top-0 z-10 py-2 bg-slate-950/90 backdrop-blur flex items-center gap-3">
                  <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-300">{label}</h3>
                  <span className="text-[11px] px-2 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                    {groupMeetings.length}
                  </span>
                  <span className="flex-1 h-px bg-slate-800" />
                </div>

                {/* Timeline */}
                <div className="relative mt-3 space-y-4 pl-8">
                  <span className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-800" aria-hidden="true" />
                  {groupMeetings.map((meeting) => {
                    const isLive = meeting.status === "in-progress";
                    const hadVideo = meeting.had_video || meeting.has_video;
                    return (
                      <article key={meeting.id} className="relative group">
                        <span
                          className={`absolute -left-8 top-5 flex h-[23px] w-[23px] items-center justify-center rounded-full bg-slate-950`}
                          aria-hidden="true"
                        >
                          <span className={`relative flex h-3 w-3 rounded-full ${DOT_STYLE[meeting.status] || "bg-slate-500"}`}>
                            {isLive && (
                              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75 animate-ping" />
                            )}
                          </span>
                        </span>

                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 hover:border-slate-700 hover:-translate-y-0.5 transition">
                          <div className="flex flex-wrap justify-between items-start gap-2">
                            <div className="min-w-0">
                              <Link
                                to={`/meetings/${meeting.id}`}
                                className="font-semibold text-white hover:text-purple-400 transition break-words"
                              >
                                <Highlight text={meeting.title} term={term} />
                              </Link>
                              <p className="text-xs text-slate-500 mt-1">
                                {formatTime(meeting.meeting_date) && `${formatTime(meeting.meeting_date)} · `}
                                {formatDate(meeting.meeting_date)} · #{meeting.id}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {(hadVideo || isLive) && (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                  title={isLive ? "Meeting in progress" : "Had video call"}
                                >
                                  <Video className="w-3 h-3" /> {isLive ? "Live" : "Video"}
                                </span>
                              )}
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                  STATUS_STYLE[meeting.status] || "bg-slate-700 text-slate-300 border-slate-600"
                                }`}
                              >
                                {prettyStatus(meeting.status)}
                              </span>
                            </div>
                          </div>

                          {meeting.description && (
                            <p className="text-sm text-slate-400 mt-3 line-clamp-2">
                              <Highlight text={meeting.description} term={term} />
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
                            <ProgressStrip meeting={meeting} />
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span className="flex items-center gap-1" title="Recordings">
                                <Mic className="w-3.5 h-3.5" /> {meeting.recordings_count || 0}
                              </span>
                              <span className="flex items-center gap-1" title="Transcripts">
                                <FileText className="w-3.5 h-3.5" /> {meeting.transcripts_count || 0}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-800 flex-wrap">
                            <Link
                              to={`/meetings/${meeting.id}`}
                              className="text-xs font-semibold text-purple-400 hover:text-purple-300 inline-flex items-center gap-0.5"
                            >
                              Open <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                            <Link
                              to={`/meetings/${meeting.id}/video`}
                              className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                            >
                              <Video className="w-3.5 h-3.5" /> Join Video
                            </Link>
                            {meeting.has_transcript && (
                              <Link
                                to={`/meetings/${meeting.id}/transcript`}
                                className="text-xs text-slate-300 hover:text-white"
                              >
                                Transcript
                              </Link>
                            )}
                            {meeting.has_summary && (
                              <Link
                                to={`/meetings/${meeting.id}/summary`}
                                className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Summary
                              </Link>
                            )}
                            <button
                              onClick={() => setConfirmTarget(meeting)}
                              disabled={deletingId === meeting.id}
                              className="ml-auto text-xs text-red-400 hover:text-red-300 disabled:opacity-50 inline-flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition"
                            >
                              {deletingId === meeting.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              {deletingId === meeting.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}

            <div className="flex flex-col items-center gap-2 pt-2">
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={loadMoreLoading}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 rounded-xl text-sm font-semibold transition flex items-center gap-2"
                >
                  {loadMoreLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loadMoreLoading ? "Loading more…" : "Load more"}
                </button>
              )}
              <p className="text-xs text-slate-500">
                Showing {meetings.length}
                {total > meetings.length ? ` of ${total}` : ""} {meetings.length === 1 ? "meeting" : "meetings"}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Confirm delete */}
      {confirmTarget && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setConfirmTarget(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </span>
              <div>
                <h3 id="del-title" className="font-bold text-white">Delete meeting</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Delete “{confirmTarget.title}”? Its recordings, transcript and summary will be removed. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmTarget(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMeeting}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
              >
                Delete meeting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className={`fixed bottom-5 right-5 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border shadow-2xl bg-slate-900 ${
            toast.type === "success" ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}
