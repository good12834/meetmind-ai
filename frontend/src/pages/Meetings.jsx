import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import MeetingCard from "../components/meetings/MeetingCard";
import SearchFilterBar from "../components/meetings/SearchFilterBar";
import EmptyState from "../components/meetings/EmptyState";
import SkeletonCard from "../components/meetings/SkeletonCard";
import ConfirmDialog from "../components/meetings/ConfirmDialog";
import useMeetings from "../hooks/useMeetings";
import "../styles/meetings.css";

const isLive = (m) => m.status === "in-progress" || m.live;

function matchesFilter(meeting, statusFilter) {
  if (statusFilter === "all") return true;
  if (statusFilter === "live") return isLive(meeting);
  if (statusFilter === "recorded") return meeting.recordings_count > 0 || meeting.has_recording;
  if (statusFilter === "transcribed") return meeting.has_transcript || meeting.transcripts_count > 0;
  if (statusFilter === "summarized") return meeting.has_summary;
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
  const { meetings, loading, error, stats, createMeeting, updateMeeting, deleteMeeting } = useMeetings();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState(getInitialView);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [startVideo, setStartVideo] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((type, text) => setToast({ type, text, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
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
      const da = new Date(a.meeting_date || a.created_at || 0).getTime();
      const db = new Date(b.meeting_date || b.created_at || 0).getTime();
      if (sort === "oldest") return da - db;
      if (sort === "title") return (a.title || "").localeCompare(b.title || "");
      return db - da;
    });
  }, [meetings, query, statusFilter, sort]);

  const liveMeetings = useMemo(() => filtered.filter(isLive), [filtered]);
  const otherMeetings = useMemo(() => filtered.filter((m) => !isLive(m)), [filtered]);
  const hasFilters = query.trim() !== "" || statusFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };

  const openCreate = useCallback(() => {
    setStartVideo(false);
    setEditTarget(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  }, []);

  const openRename = (meeting) => {
    setStartVideo(false);
    setEditTarget(meeting);
    setForm({
      title: meeting.title || "",
      description: meeting.description || "",
      meeting_date: meeting.meeting_date ? meeting.meeting_date.slice(0, 16) : "",
      status: meeting.status || "scheduled",
    });
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = useCallback(() => {
    if (!saving) setModalOpen(false);
  }, [saving]);

  // Escape closes the modal, N opens it, body scroll locks while open
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
    if (!form.title.trim()) {
      setFormError("Title is required");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (editTarget) {
        await updateMeeting(editTarget.id, form);
        showToast("success", "Meeting updated");
      } else {
        const { status: _ignored, ...rest } = form;
        const created = await createMeeting({ ...rest, status: startVideo ? "in-progress" : "scheduled" });
        if (created?.id) {
          setModalOpen(false);
          navigate(startVideo ? `/meetings/${created.id}/video` : `/meetings/${created.id}`);
          return;
        }
        showToast("success", "Meeting created");
      }
      setModalOpen(false);
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

  const downloadRecording = (meeting) => {
    // Recordings live on the details page
    navigate(`/meetings/${meeting.id}`);
  };

  const renderCards = (list) => (
    <div className={view === "grid" ? "meetings-grid" : "meetings-list"}>
      {list.map((m) => (
        <MeetingCard
          key={m.id}
          meeting={m}
          onRename={openRename}
          onDelete={setDeleteTarget}
          onDownload={downloadRecording}
          onJoinVideo={(meeting) => navigate(`/meetings/${meeting.id}/video`)}
        />
      ))}
    </div>
  );

  const statCards = [
    { key: "all", label: "Total", icon: "📅", value: stats.total, filter: "all" },
    { key: "week", label: "This week", icon: "🗓️", value: stats.thisWeek },
    { key: "live", label: "Live now", icon: "🔴", value: stats.liveNow, filter: "live" },
    { key: "ai", label: "Pending AI", icon: "✨", value: stats.pendingAI, filter: "transcribed" },
  ];

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
            <button
              className="btn btn-secondary"
              onClick={() => {
                openCreate();
                setStartVideo(true);
              }}
            >
              📹 Start video meeting
            </button>
            <button className="btn btn-primary" onClick={openCreate} title="Shortcut: N">
              + New Meeting
            </button>
          </div>
        </div>

        <div className="meetings-stats">
          {statCards.map((s) => {
            const clickable = Boolean(s.filter);
            const active = clickable && statusFilter === s.filter && s.key !== "all"
              ? true
              : s.key === "all" && statusFilter === "all" && !query;
            const Tag = clickable ? "button" : "div";
            return (
              <Tag
                key={s.key}
                type={clickable ? "button" : undefined}
                className={`card-surface stat-card${clickable ? " clickable" : ""}${active ? " active" : ""}`}
                onClick={clickable ? () => setStatusFilter(s.filter) : undefined}
              >
                <div className="stat-top">
                  <div className="section-label">{s.label}</div>
                  <span className="stat-icon">{s.icon}</span>
                </div>
                {loading ? <div className="stat-skeleton" /> : <div className="stat-value">{s.value}</div>}
              </Tag>
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
            <span>
              {filtered.length} {filtered.length === 1 ? "meeting" : "meetings"}
              {hasFilters ? " match your filters" : ""}
            </span>
            {hasFilters && (
              <button type="button" className="link-btn" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="card-surface error-banner" role="alert">
            <span>⚠️ {error}</span>
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
                <button className="btn btn-primary" onClick={openCreate}>+ New Meeting</button>
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
              <button type="button" className="btn btn-secondary" onClick={closeModal} aria-label="Close">
                ✕
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
                  <span className="video-option-icon">📹</span>
                  <span>
                    <strong>Start video meeting now</strong>
                    <small>Creates the meeting as live and opens the video room.</small>
                  </span>
                </label>
              )}

              {formError && (
                <div role="alert" className="form-error">{formError}</div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving
                    ? "Saving…"
                    : editTarget
                    ? "Save"
                    : startVideo
                    ? "📹 Start Video Meeting"
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
        <div key={toast.id} className={`toast toast-${toast.type}`} role="status">
          {toast.type === "success" ? "✓" : "⚠️"} {toast.text}
        </div>
      )}
    </div>
  );
}