import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Calendar, CheckCircle2, FileText, Trash2, User } from "lucide-react";
import api from "../services/api";
import {
  getActionItems,
  createActionItem,
  updateActionItem,
  deleteActionItem,
} from "../services/actionItemsService";
import Navbar from "../components/Navbar";

const PRIORITY_STYLES = {
  high: "bg-red-500/20 text-red-400 border border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  low: "bg-green-500/20 text-green-400 border border-green-500/30",
};

const STATUS_OPTIONS = ["pending", "in_progress", "completed"];

function PriorityBadge({ priority }) {
  const p = (priority || "medium").toLowerCase();
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${PRIORITY_STYLES[p] || PRIORITY_STYLES.medium}`}>
      {p}
    </span>
  );
}

export default function ActionItemsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [form, setForm] = useState({
    meetingId: "",
    task: "",
    assignee: "",
    due_date: "",
    priority: "medium",
  });
  const [adding, setAdding] = useState(false);

  const fetchItems = useCallback(async (statusFilter) => {
    setLoading(true);
    setError("");
    try {
      const filters = {};
      if (statusFilter && statusFilter !== "all") filters.status = statusFilter;
      const data = await getActionItems(filters);
      setItems(data.data || data.action_items || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load action items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems(filter);
  }, [filter, fetchItems]);

  const fetchMeetings = async () => {
    try {
      const res = await api.get("/meetings");
      setMeetings(res.data.meetings || []);
    } catch {
      setMeetings([]);
    }
  };

  const openModal = () => {
    fetchMeetings();
    setForm({ meetingId: "", task: "", assignee: "", due_date: "", priority: "medium" });
    setShowModal(true);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.meetingId || !form.task.trim()) return;
    setAdding(true);
    try {
      await createActionItem(form.meetingId, {
        task: form.task,
        assignee: form.assignee,
        due_date: form.due_date || null,
        priority: form.priority,
        status: "pending",
      });
      setShowModal(false);
      fetchItems(filter);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to add item");
    } finally {
      setAdding(false);
    }
  };

  const handleStatusChange = async (itemId, newStatus) => {
    try {
      await updateActionItem(itemId, { status: newStatus });
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, status: newStatus } : it))
      );
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm("Delete this action item?")) return;
    try {
      await deleteActionItem(itemId);
      setItems((prev) => prev.filter((it) => it.id !== itemId));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete");
    }
  };

  const displayed = items.filter((it) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (it.task || "").toLowerCase().includes(q) ||
      (it.assignee || "").toLowerCase().includes(q)
    );
  });

  const filterTabs = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar />
      <main className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-white">Action Items</h1>
            <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-sm px-3 py-0.5 rounded-full font-semibold">
              {items.length}
            </span>
          </div>
          <button
            onClick={openModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
          >
            + Add Task
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
            {filterTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                  filter === t.key
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 flex-1 min-w-[180px]"
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 mb-4 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No action items found</h3>
            <p className="text-gray-400 text-sm">
              {search ? "Try adjusting your search." : "Add a task to get started."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map((item) => (
              <div
                key={item.id}
                className="bg-gray-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 border border-gray-700 hover:border-gray-600 transition"
              >
                {/* Task info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium leading-snug">{item.task}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {item.assignee && (
                      <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <User className="w-3 h-3 text-purple-400" /> {item.assignee}
                      </span>
                    )}
                    {item.due_date && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-purple-400" /> {new Date(item.due_date).toLocaleDateString()}
                      </span>
                    )}
                    <PriorityBadge priority={item.priority} />
                    {item.meeting_id && (
                      <Link
                        to={`/meetings/${item.meeting_id}`}
                        className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" /> Meeting
                      </Link>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    value={item.status}
                    onChange={(e) => handleStatusChange(item.id, e.target.value)}
                    className="bg-gray-700 border border-gray-600 text-xs text-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/10 transition text-sm flex items-center justify-center"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Task Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => !adding && setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl"
          >
            <h2 className="text-xl font-bold text-white mb-5">Add Action Item</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Meeting *</label>
                <select
                  value={form.meetingId}
                  onChange={(e) => setForm({ ...form, meetingId: e.target.value })}
                  required
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select a meeting…</option>
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Task *</label>
                <input
                  type="text"
                  value={form.task}
                  onChange={(e) => setForm({ ...form, task: e.target.value })}
                  required
                  placeholder="Describe the task…"
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Assignee</label>
                  <input
                    type="text"
                    value={form.assignee}
                    onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                    placeholder="Name or email"
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition"
                >
                  {adding ? "Adding…" : "Add Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
