import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  Loader2,
  Plus,
  Trash2,
  User,
  X,
} from "lucide-react";
import Navbar from "../components/Navbar";
import {
  getActionItems,
  createActionItem,
  updateActionItem,
  deleteActionItem,
} from "../services/actionItemsService";
import { getMeetingHistory } from "../services/historyService";

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

const STATUS_STYLE = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  in_progress: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const PRIORITY_STYLE = {
  low: "text-gray-400",
  medium: "text-purple-400",
  high: "text-amber-400",
  urgent: "text-red-400",
};

const PRIORITY_LABEL = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function formatDate(dateString) {
  if (!dateString) return "Not set";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

function prettyStatus(s) {
  return STATUS_LABELS[s] || s;
}

export default function ActionItemsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMeeting, setFilterMeeting] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [openItemId, setOpenItemId] = useState(null);
  const createTimerRef = useRef(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((type, text) => setToast({ type, text, id: Date.now() }), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [itemsRes, meetingsRes] = await Promise.all([
        getActionItems({ status: filterStatus || undefined, meeting_id: filterMeeting || undefined }),
        getMeetingHistory({ page: 1, per_page: 50 }),
      ]);
      setItems(itemsRes.data || itemsRes.items || []);
      setMeetings((meetingsRes.meetings || []).map((m) => ({ id: m.id, title: m.title })));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load action items.");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterMeeting]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const meetingId = formData.get("meeting_id");
    const task = (formData.get("task") || "").trim();
    const assignee = (formData.get("assignee") || "Unassigned").trim();
    const dueDate = formData.get("due_date") || "Not specified";
    const priority = formData.get("priority") || "medium";

    if (!task) {
      showToast("error", "Task description is required.");
      return;
    }
    if (!meetingId) {
      showToast("error", "Please select a meeting.");
      return;
    }

    setLoading(true);
    try {
      await createActionItem(Number(meetingId), { task, assignee, due_date: dueDate, status: "pending", priority });
      showToast("success", "Action item created.");
      e.target.reset();
      loadData();
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to create action item.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (item) => {
    const next = item.status === "completed" ? "pending" : "completed";
    const prev = items;
    setItems(items.map((it) => (it.id === item.id ? { ...it, status: next } : it)));
    try {
      const data = await updateActionItem(item.id, { status: next });
      setItems(items.map((it) => (it.id === item.id ? data.data : it)));
      showToast("success", `Marked as ${prettyStatus(next)}.`);
    } catch (err) {
      setItems(prev);
      showToast("error", err.response?.data?.message || "Failed to update action item.");
    }
  };

  const handleUpdate = async (item, field, value) => {
    const prev = items;
    setItems(items.map((it) => (it.id === item.id ? { ...it, [field]: value } : it)));
    try {
      const data = await updateActionItem(item.id, { [field]: value });
      setItems(items.map((it) => (it.id === item.id ? data.data : it)));
    } catch (err) {
      setItems(prev);
      showToast("error", `Failed to update ${field}.`);
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm("Delete this action item?")) return;
    setLoading(true);
    try {
      await deleteActionItem(itemId);
      setItems(items.filter((i) => i.id !== itemId));
      showToast("success", "Action item deleted.");
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to delete action item.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterStatus && it.status !== filterStatus) return false;
      if (filterMeeting && String(it.meeting_id) !== filterMeeting) return false;
      if (filterPriority && it.priority !== filterPriority) return false;
      return true;
    });
  }, [items, filterStatus, filterMeeting, filterPriority]);

  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.status === "completed").length;
    const pending = items.filter((i) => i.status === "pending").length;
    const inProgress = items.filter((i) => i.status === "in_progress").length;
    return { total, completed, pending, in_progress: inProgress, pct: total ? Math.round((completed / total) * 100) : 0 };
  }, [items]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />

      <main className="max-w-6xl mx-auto p-6 sm:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Smart Action Tracker</h1>
            <p className="text-gray-400 mt-1">
              Track, assign, and complete tasks extracted from your meetings.
            </p>
          </div>
          <Link
            to="/meetings"
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-purple-600/20 transition inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Create Meeting
          </Link>
        </div>

        {toast && (
          <div
            role="status"
            className={`fixed bottom-5 right-5 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border shadow-2xl bg-slate-900 ${
              toast.type === "success"
                ? "border-emerald-500/40 text-emerald-300"
                : "border-red-500/40 text-red-300"
            }`}
          >
            {toast.type === "success" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {toast.text}
          </div>
        )}

        {/* Stats strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-2">
          {[
            { label: "Total", value: stats.total, icon: <Calendar className="w-5 h-5" />, color: "text-slate-400" },
            { label: "Completed", value: stats.completed, icon: <Check className="w-5 h-5 text-emerald-400" />, color: "text-emerald-400" },
            { label: "Pending", value: stats.pending, icon: <Clock className="w-5 h-5 text-amber-400" />, color: "text-amber-400" },
            { label: "In Progress", value: stats.in_progress, icon: <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />, color: "text-blue-400" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">{s.label}</h3>
                <span className={s.color}>{s.icon}</span>
              </div>
              {loading ? (
                <div className="h-9 w-16 rounded-lg bg-slate-800 animate-pulse" />
              ) : (
                <p className="text-3xl font-bold text-white">{s.value}</p>
              )}
              {s.label === "Total" && stats.total && (
                <p className="text-xs text-gray-500 mt-1">{stats.pct}% completion</p>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Filters + Create */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
            <div className="col-span-1 sm:col-span-2">
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    name="meeting_id"
                    className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">Select a meeting</option>
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                  <input
                    name="task"
                    placeholder="What needs to be done?"
                    className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    name="assignee"
                    placeholder="Assignee (optional)"
                    className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                  <input
                    name="due_date"
                    type="date"
                    className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                  <select
                    name="priority"
                    className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="medium">Medium priority</option>
                    <option value="low">Low</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </form>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
>
                <option value="">All statuses</option>
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                value={filterMeeting}
                onChange={(e) => setFilterMeeting(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
>
              
                <option value="">All meetings</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
              
>
                <option value="">All priorities</option>
                {["low", "medium", "high", "urgent"].map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  setFilterStatus("");
                  setFilterMeeting("");
                  setFilterPriority("");
                }}
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition"
>
                Clear
              </button>
            </div>
          </div>
        </div>
        {/* Items list */}
        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">No action items</h3>
              <p className="text-gray-400 mt-1">
                {filterStatus || filterMeeting || filterPriority
                  ? "Try adjusting your filters."
                  : "Create your first action item above or let AI extract tasks from your transcripts."}
              </p>
            </div>
          ) : (
            filtered.map((item) => {
              const meeting = meetings.find((m) => m.id === item.meeting_id);
              const isEditing = openItemId === item.id;
              return (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={item.status === "completed"}
                        onChange={() => handleToggle(item)}
                        className="w-5 h-5 rounded border-slate-600 text-purple-600 focus:ring-purple-500 transition"
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm ${item.status === "completed" ? "line-through text-gray-500" : "font-medium text-white truncate"}`}
                          title={item.task}
                        >
                          {item.task}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full border ${STATUS_STYLE[item.status] || "bg-slate-700 text-slate-300 border-slate-600"}`}>
                            {prettyStatus(item.status)}
                          </span>
                          <span className={`text-xs ${PRIORITY_STYLE[item.priority] || "text-gray-400"} font-medium`}>
                            {PRIORITY_LABEL[item.priority] || item.priority}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-purple-400" />
                            {item.assignee || "Unassigned"}
                          </span>
                          <span>
                            <Calendar className="w-3 h-3 inline" /> {formatDate(item.due_date)}
                          </span>
                          {meeting && (
                            <span>
                              • <Link to={`/meetings/${meeting.id}`} className="text-purple-400 hover:text-purple-300">{meeting.title}</Link>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setOpenItemId(openItemId === item.id ? null : item.id)}
                        className="text-gray-400 hover:text-white p-1.5 transition"
                        title="Edit"
                      >
                        <ChevronRight className={`w-4 h-4 ${isEditing ? "text-purple-400 rotate-180" : ""}`} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-red-400 hover:text-red-300 p-1.5 transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <input
                          value={item.task}
                          onChange={(e) => handleUpdate(item, "task", e.target.value)}
                          placeholder="Task"
                          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        />
                        <input
                          value={item.assignee || ""}
                          onChange={(e) => handleUpdate(item, "assignee", e.target.value)}
                          placeholder="Assignee"
                          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        />
                        <input
                          type="date"
                          value={item.due_date && item.due_date !== "Not specified" ? item.due_date : ""}
                          onChange={(e) => handleUpdate(item, "due_date", e.target.value || "Not specified")}
                          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        />
                        <select
                          value={item.priority}
                          onChange={(e) => handleUpdate(item, "priority", e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          {["low", "medium", "high", "urgent"].map((p) => (
                            <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                          ))}
                        </select>
                        <select
                          value={item.status}
                          onChange={(e) => handleUpdate(item, "status", e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          {Object.entries(STATUS_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => setOpenItemId(null)}
                        className="text-xs text-gray-400 hover:text-white underline"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
       