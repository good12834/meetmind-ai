import { useState } from "react";
import { Calendar } from "lucide-react";
import summaryService from "../../services/summaryService";

export default function ActionItemsList({ summary, onUpdate }) {
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const items = summary?.action_items || [];

  const toggle = async (item) => {
    const next = item.status === "completed" ? "pending" : "completed";
    const prev = items;
    setError("");
    setBusyId(item.id);
    const optimistic = items.map((it) => (it.id === item.id ? { ...it, status: next } : it));
    onUpdate?.({ ...summary, action_items: optimistic });
    try {
      const data = await summaryService.updateActionItem(item.id, { status: next });
      const merged = optimistic.map((it) => (it.id === item.id ? data.action_item : it));
      onUpdate?.({ ...summary, action_items: merged });
    } catch (err) {
      onUpdate?.({ ...summary, action_items: prev });
      setError(err.response?.data?.message || "Failed to update action item");
    } finally {
      setBusyId(null);
    }
  };

  if (!summary) {
    return <p style={{ color: "var(--text-muted)" }}>Generate an AI summary to extract action items.</p>;
  }
  if (items.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>No action items found.</p>;
  }

  const done = items.filter((i) => i.status === "completed").length;
  const pct = Math.round((done / items.length) * 100);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "var(--text-muted)", fontSize: 13 }}>
        <span>Progress</span><span>{done}/{items.length} completed</span>
      </div>
      <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--success)", transition: "width 200ms" }} />
      </div>
      <div>
        {items.map((item) => {
          const checked = item.status === "completed";
          return (
            <div key={item.id} className={`action-item ${checked ? "done" : ""}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={busyId === item.id}
                onChange={() => toggle(item)}
                style={{ marginTop: 4 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ textDecoration: checked ? "line-through" : "none" }}>{item.task}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>👤 {item.assignee || "Unassigned"}</span>
                  <span><Calendar className="text-current" /> {item.due_date || "No due date"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  );
}