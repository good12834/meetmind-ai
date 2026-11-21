import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Radio,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import Navbar from "../components/Navbar";
import MeetingCard from "../components/meetings/MeetingCard";
import SearchFilterBar from "../components/meetings/SearchFilterBar";
import EmptyState from "../components/meetings/EmptyState";
import SkeletonCard from "../components/meetings/SkeletonCard";
import ConfirmDialog from "../components/meetings/ConfirmDialog";
import useMeetings from "../hooks/useMeetings";
import "../styles/meetings.css";

const isLive = (m) => m.status === "in-progress" || m.live;
const hasTranscript = (m) => Boolean(m.has_transcript || m.transcripts_count > 0);
const getTime = (m) => new Date(m.meeting_date || m.created_at || 0).getTime();

const FILTER_LABELS = {
  live: "Live now",
  week: "This week",
  pendingai: "Pending AI summary",
  recorded: "Recorded",
  transcribed: "Transcribed",
  summarized: "Summarized",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

function matchesFilter(meeting, statusFilter) {
  if (statusFilter === "all") return true;
  if (statusFilter === "live") return isLive(meeting);
  if (statusFilter === "week") return getTime(meeting) >= Date.now() - 7 * 86400000;
  if (statusFilter === "pendingai") return hasTranscript(meeting) && !meeting.has_summary;
  if (statusFilter === "recorded") return meeting.recordings_count > 0 || meeting.has_recording;
  if (statusFilter === "transcribed") return hasTranscript(meeting);
  if (statusFilter === "summarized") return Boolean(meeting.has_summary);
  return meeting.status === statusFilter;
}

const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const datePresets = [
  { label: "Now", get: () => new Date() },
  { label: "In 1 hour", get: () => new Date(Date.now() + 60 * 60 * 1000) },
  {
    label: "Tomorrow 10:00",
    get: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      return d;
    },
  },
];

const emptyForm = { title: "", description: "", meeting_date: "", status: "scheduled" };

function getInitialView() {
  try {
    return localStorage.getItem("meetings_view") || "grid";
  } catch {
    return "grid";
  }
}

export default function Meetings() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { meetings, loading, error, stats, createMeeting, updateMeeting, deleteMeeting } = useMeetings();

  // Filters live in the URL so refresh, back and shared links keep them
  const query = params.get("q") || "";
  const statusFilter = params.get("status") || "all";
  const sort = params.get("sort") || "newest";

  const setParam = useCallback(
    (key, value, def) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!value || value === def) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );
  const setQuery = (v) => setParam("q", v, "");
  const setStatusFilter = (v) => setParam("status", v, "all");
  const setSort = (v) => setParam("sort", v, "newest");

  const [view, setView] = useState(getInitialView);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [startVideo, setStartVideo] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [toast, setToast] = useState(null);

  const initialFormRef = useRef(emptyForm);
  const triggerRef = useRef(null);

  const showToast = useCallback((type, text) => setToast({ type, text, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.type === "error" ? 5000 : 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const changeView = (v) => {
    setView(v);
    try {
      localStorage.setItem("meetings_view", v);
    } catch {
      /* storage unavailable */
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = meetings.filter((m) => matchesFilter(m, statusFilter));
    if (q) {
      list = list.filter(
        (m) =>
          (m.title || "").toLowerCase().includes(q) ||
          (m.description || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (isLive(a) !== isLive(b)) return isLive(a) ? -1 : 1;
      if (sort === "oldest") return getTime(a) - getTime(b);
      if (sort === "title") return (a.title || "").localeCompare(b.title || "");
      return getTime(b) - getTime(a);
    });
  }, [meetings, query, statusFilter, sort]);

  const liveMeetings = useMemo(() => filtered.filter(isLive), [filtered]);
  const otherMeetings = useMemo(() => filtered.filter((m) => !isLive(m)), [filtered]);
  const hasFilters = query.trim() !== "" || statusFilter !== "all";

  // Stats computed here so "Pending AI" and "This week" match their filters exactly
  const counts = useMemo(
    () => ({
      week: meetings.filter((m) => matchesFilter(m, "week")).length,
      pendingai: meetings.filter((m) => matchesFilter(m, "pendingai")).length,
    }),
    [meetings]
  );

  const clearFilters = () => setParams({}, { replace: true });

  const isDirty = useMemo(
    () => modalOpen && JSON.stringify(form) !== JSON.stringify(initialFormRef.current),
    [form, modalOpen]
  );

  const openModal = (target, nextForm, video = false) => {
    triggerRef.current = document.activeElement;
    initialFormRef.current = nextForm;
    setStartVideo(video);
    setEditTarget(target);
    setForm(nextForm);
    setFormError("");
    setDiscardPrompt(false);
    setModalOpen(true);
  };

  const openCreate = useCallback((video = false) => openModal(null, emptyForm, video === true), []);

  const openRename = (meeting) =>
    openModal(meeting, {
      title: meeting.title || "",
      description: meeting.description || "",
      meeting_date: meeting.meeting_date ? meeting.meeting_date.slice(0, 16) : "",
      status: meeting.status || "scheduled",
    });

  const forceClose = useCallback(() => {
    setModalOpen(false);
    setDiscardPrompt(false);
    // Return focus to whatever opened the modal
    setTimeout(() => triggerRef.current?.focus?.(), 0);
  }, []);

  const closeModal = useCallback(() => {
    if (saving) return;
    if (isDirty) setDiscardPrompt(true);
    else forceClose();
  }, [saving, isDirty, forceClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && modalOpen) {
        closeModal();
        return;
      }
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = ["input", "textarea", "select"].includes(tag) || e.target.isContentEditable;
      if (e.key.toLowerCase() === "n" && !typing && !modalOpen && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openCreate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal, openCreate]);

  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  const save = async (e) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setFormError("Title is required");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (editTarget) {
        // Send only what changed
        const changes = {};
        Object.keys(form).forEach((k) => {
          if (form[k] !== initialFormRef.current[k]) changes[k] = form[k];
        });
        if ("title" in changes) changes.title = title;
        if (Object.keys(changes).length) await updateMeeting(editTarget.id, changes);
        showToast("success", "Meeting updated");
      } else {
        const { status: _ignored, ...rest } = form;
        const created = await createMeeting({
          ...rest,
          title,
          status: startVideo ? "in-progress" : "scheduled",
        });
        if (created?.id) {
          setModalOpen(false);
          navigate(startVideo ? `/meetings/${created.id}/video` : `/meetings/${created.id}`);
          return;
        }
        showToast("success", "Meeting created");
      }
      forceClose();
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to save meeting");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMeeting(deleteTarget.id);
      showToast("success", "Meeting deleted");
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to delete meeting");
    } finally {
      setDeleteTarget(null);
    }
  };

  const downloadRecording = (meeting) => navigate(`/meetings/${meeting.id}`);
  const joinVideo = (meeting) => navigate(`/meetings/${meeting.id}/video`);

  const renderCards = (list) => (
    <div className={view === "grid" ? "meetings-grid" : "meetings-list"}>
      {list.map((m) => (
        <MeetingCard
          key={m.id}
          meeting={m}
          onRename={openRename}
          onDelete={setDeleteTarget}
          onDownload={downloadRecording}
          onJoinVideo={joinVideo}
        />
      ))}
    </div>
  );

  const statCards = [
    { key: "all", label: "Total", icon: Calendar, value: stats.total, filter: "all" },
    { key: "week", label: "This week", icon: Clock, value: counts.week, filter: "week" },
    { key: "live", label: "Live now", icon: Radio, value: stats.liveNow, filter: "live" },
    { key: "pendingai", label: "Pending AI", icon: Sparkles, value: counts.pendingai, filter: "pendingai" },
  ];

  const pastDate =
    !editTarget && !startVideo && form.meeting_date && new Date(form.meeting_date).getTime() < Date.now() - 60000;

  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-main">
        <div className="meetings-header">
          <div>
            <h1 className="page-title">Meetings</h1>
            <p className="meetings-subtitle">
              {stats.total} total · {stats.liveNow} live
            </p>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary flex items-center gap-1.5" onClick={() => openCreate(true)}>
              <Video className="w-4 h-4" /> Start video meeting
            </button>
            <button className="btn btn-primary" onClick={() => openCreate()} title="Shortcut: N">
              + New Meeting
            </button>
          </div>
        </div>

        <div className="meetings-stats">
          {statCards.map((s) => {
            const active = statusFilter === s.filter && !(s.key === "all" && query);
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={active}
                className={`card-surface stat-card clickable${active ? " active" : ""}`}
                onClick={() => setStatusFilter(active && s.filter !== "all" ? "all" : s.filter)}
              >
                <div className="stat-top">
                  <div className="section-label">{s.label}</div>
                  <span className="stat-icon"><Icon className="w-4 h-4 text-purple-400" /></span>
                </div>
                {loading ? <div className="stat-skeleton" /> : <div className="stat-value">{s.value}</div>}
              </button>
            );
          })}
        </div>

        <SearchFilterBar
          query={query} onQueryChange={setQuery}
          status={statusFilter} onStatusChange={setStatusFilter}
          sort={sort} onSortChange={setSort}
          view={view} onViewChange={changeView}
          placeholder="Search meetings…"
        />

        {!loading && (
          <div className="results-bar">
            <span className="flex items-center gap-2 flex-wrap">
              {filtered.length} {filtered.length === 1 ? "meeting" : "meetings"}
              {statusFilter !== "all" && (
                <span className="filter-pill">
                  {FILTER_LABELS[statusFilter] || statusFilter}
                  <button type="button" aria-label="Remove status filter" onClick={() => setStatusFilter("all")}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {query.trim() && (
                <span className="filter-pill">
                  “{query.trim()}”
                  <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </span>
            {hasFilters && (
              <button type="button" className="link-btn" onClick={clearFilters}>
                Clear all
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="card-surface error-banner" role="alert">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              {error}
            </span>
            <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        )}

        {loading ? (
          <div className={view === "grid" ? "meetings-grid" : "meetings-list"}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No meetings found"
            description={hasFilters ? "Try adjusting your search or filters." : "Create your first meeting to get started."}
            action={
              hasFilters ? (
                <button className="btn btn-secondary" onClick={clearFilters}>Clear filters</button>
              ) : (
                <button className="btn btn-primary" onClick={() => openCreate()}>+ New Meeting</button>
              )
            }
          />
        ) : statusFilter === "live" || liveMeetings.length === 0 ? (
          renderCards(filtered)
        ) : (
          <>
            <section className="meetings-section live-section">
              <div className="section-head">
                <span className="live-dot" />
                <h2>Live now</h2>
                <span className="count-pill">{liveMeetings.length}</span>
                {liveMeetings.length === 1 && (
                  <button
                    type="button"
                    className="btn btn-primary live-join"
                    onClick={() => joinVideo(liveMeetings[0])}
                  >
                    <Video className="w-4 h-4" /> Join video
                  </button>
                )}
              </div>
              {renderCards(liveMeetings)}
            </section>

            {otherMeetings.length > 0 && (
              <section className="meetings-section">
                <div className="section-head">
                  <h2>All meetings</h2>
                  <span className="count-pill">{otherMeetings.length}</span>
                </div>
                {renderCards(otherMeetings)}
              </section>
            )}
          </>
        )}
      </main>

      {modalOpen && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="meeting-modal-title" style={{ margin: 0 }}>
                {editTarget ? "Edit Meeting" : "New Meeting"}
              </h3>
              <button
                type="button"
                className="btn btn-secondary flex items-center justify-center p-2"
                onClick={closeModal}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={save} className="form-grid">
              <div>
                <label className="section-label" htmlFor="mt-title">Title</label>
                <input
                  id="mt-title"
                  className="input"
                  autoFocus
                  maxLength={120}
                  placeholder="e.g. Sprint planning"
                  value={form.title}
                  onChange={(e) => {
                    setForm({ ...form, title: e.target.value });
                    if (formError) setFormError("");
                  }}
                  required
                />
                <div className="field-hint">{form.title.length}/120</div>
              </div>

              <div>
                <label className="section-label" htmlFor="mt-desc">Description</label>
                <textarea
                  id="mt-desc"
                  className="textarea"
                  rows={3}
                  placeholder="Agenda, goals, attendees…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div>
                <label className="section-label" htmlFor="mt-date">Date & time</label>
                <input
                  id="mt-date"
                  className="input"
                  type="datetime-local"
                  value={form.meeting_date}
                  onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
                />
                <div className="preset-row">
                  {datePresets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="chip"
                      onClick={() => setForm({ ...form, meeting_date: toLocalInput(p.get()) })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {pastDate && <div className="field-hint warn">This date is in the past.</div>}
              </div>

              {editTarget && (
                <div>
                  <label className="section-label" htmlFor="mt-status">Status</label>
                  <select
                    id="mt-status"
                    className="input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="in-progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}

              {!editTarget && (
                <label className={`video-option${startVideo ? " selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={startVideo}
                    onChange={(e) => setStartVideo(e.target.checked)}
                  />
                  <span className="video-option-icon"><Video className="w-4 h-4 text-purple-400" /></span>
                  <span>
                    <strong>Start video meeting now</strong>
                    <small>Creates the meeting as live and opens the video room.</small>
                  </span>
                </label>
              )}

              {formError && <div role="alert" className="form-error">{formError}</div>}

              {discardPrompt && (
                <div role="alert" className="discard-bar">
                  <span>Discard your unsaved changes?</span>
                  <span className="discard-actions">
                    <button type="button" className="link-btn" onClick={() => setDiscardPrompt(false)}>
                      Keep editing
                    </button>
                    <button type="button" className="link-btn danger" onClick={forceClose}>
                      Discard
                    </button>
                  </span>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || (editTarget && !isDirty)}
                >
                  {saving
                    ? "Saving…"
                    : editTarget
                    ? "Save"
                    : startVideo
                    ? "Start Video Meeting"
                    : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete meeting"
        message={deleteTarget ? `Delete "${deleteTarget.title}"? This cannot be undone.` : ""}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && (
        <div key={toast.id} className={`toast toast-${toast.type} flex items-center gap-1.5`} role="status">
          {toast.type === "success" ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          )}
          <span>{toast.text}</span>
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setToast(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}