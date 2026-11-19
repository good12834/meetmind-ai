export default function SkeletonCard() {
  return (
    <div className="card-surface meeting-card">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div className="skeleton" style={{ height: 18, width: "60%" }} />
        <div className="skeleton" style={{ height: 22, width: 70, borderRadius: 999 }} />
      </div>
      <div className="skeleton" style={{ height: 14, width: "40%", marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: "30%", marginBottom: 16 }} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div className="skeleton" style={{ height: 32, width: 70 }} />
        <div className="skeleton" style={{ height: 32, width: 36 }} />
      </div>
    </div>
  );
}