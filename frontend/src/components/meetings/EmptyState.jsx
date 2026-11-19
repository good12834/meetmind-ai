import { Calendar } from "lucide-react";

export default function EmptyState({ icon = <Calendar className="text-3xl" />, title, description, action }) {
  return (
    <div className="card-surface" style={{ padding: 40, textAlign: "center", maxWidth: 520, margin: "32px auto" }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
      <h3 style={{ margin: "0 0 6px 0", fontSize: 18 }}>{title}</h3>
      {description && <p style={{ color: "var(--text-muted)", margin: "0 0 16px 0" }}>{description}</p>}
      {action}
    </div>
  );
}