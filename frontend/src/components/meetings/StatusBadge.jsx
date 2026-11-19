export default function StatusBadge({ status }) {
  const map = {
    scheduled: { label: "Scheduled", className: "status-scheduled" },
    live: { label: "Live", className: "status-live" },
    "in-progress": { label: "Live", className: "status-live" },
    recorded: { label: "Recorded", className: "status-recorded" },
    transcribed: { label: "Transcribed", className: "status-transcribed" },
    summarized: { label: "Summarized", className: "status-summarized" },
    completed: { label: "Completed", className: "status-summarized" },
    cancelled: { label: "Cancelled", className: "status-scheduled" },
  };
  const item = map[status] || { label: status || "Unknown", className: "status-scheduled" };
  return (
    <span className={`status-badge ${item.className}`}>
      {(status === "live" || status === "in-progress") && <span className="live-dot" />}
      {item.label}
    </span>
  );
}