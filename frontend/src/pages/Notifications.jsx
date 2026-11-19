import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  RefreshCw,
  X,
} from "lucide-react";
import Navbar from "../components/Navbar";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../services/notificationService";

const TYPE_LABELS = {
  task_assigned: "Task Assigned",
  task_due: "Task Due",
  summary_ready: "Summary Ready",
  meeting_invited: "Meeting Invited",
};

const TYPE_ICONS = {
  task_assigned: <Clock className="w-4 h-4 text-amber-400" />,
  task_due: <Clock className="w-4 h-4 text-red-400" />,
  summary_ready: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  meeting_invited: <Mail className="w-4 h-4 text-blue-400" />,
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getNotifications({ unread: "false" });
      setNotifications(res.data || []);
      setUnreadCount(res.unread_count || 0);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load notifications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      /* ignore */
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this notification?")) return;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />

      <main className="max-w-6xl mx-auto p-6 sm:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Notifications</h1>
            <p className="text-gray-400 mt-1">
              Stay on top of tasks, deadlines, and meeting updates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="text-sm text-purple-400 hover:text-purple-300 underline disabled:opacity-50 transition"
            >
              Mark all as read
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white px-3 py-2 rounded-xl font-semibold text-sm transition flex items-center gap-1"
            >
              {refreshing && <Loader2 className="w-3 h-3 animate-spin" />}
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">
            {unreadCount} unread
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-16 text-center">
            <Bell className="w-16 h-16 mx-auto text-gray-700 mb-3" />
            <h3 className="text-xl font-bold text-white">No notifications</h3>
            <p className="text-gray-400 mt-1">
              You're all caught up. Notifications appear here when tasks are assigned, summaries are ready, or meetings are shared.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 p-4 rounded-xl border transition ${!n.is_read ? "bg-slate-900/50 border-purple-500/30" : "bg-slate-900 border-slate-800/50 hover:border-slate-700"}`}
                onClick={() => !n.is_read && handleMarkRead(n.id)}
              >
                <div className="flex shrink-0 items-center p-1.5 rounded-lg bg-slate-800/50">
                  {TYPE_ICONS[n.type] || <Mail className="w-4 h-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className={`text-sm font-semibold ${!n.is_read ? "text-white" : "text-gray-300"}`}>
                      {TYPE_LABELS[n.type] || n.type}
                    </h4>
                    <span className="text-[10px] text-gray-500">
                      {new Date(n.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mb-2 line-clamp-2">{n.title}</p>
                  {n.message && (
                    <p className="text-xs text-gray-500 line-clamp-1 mb-3">{n.message}</p>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkRead(n.id);
                      }}
                      className={`text-xs font-semibold transition ${
                        !n.is_read
                          ? "text-purple-400"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {n.is_read ? "Read" : "Mark read"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(n.id);
                      }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
