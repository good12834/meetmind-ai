import { LayoutGrid, List } from "lucide-react";

export default function SearchFilterBar({
  query, onQueryChange, onSearch,
  status, onStatusChange, statusOptions = ["all", "scheduled", "live", "recorded", "transcribed", "summarized"],
  sort, onSortChange, sortOptions = [{ value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" }, { value: "title", label: "Title" }],
  view, onViewChange,
  dateRange, onDateRangeChange,
  placeholder = "Search…",
}) {
  return (
    <div className="meetings-toolbar">
      <form onSubmit={(e) => { e.preventDefault(); onSearch?.(); }} style={{ display: "flex", gap: 8, flex: 1, minWidth: 240 }}>
        <input className="input" placeholder={placeholder} value={query} onChange={(e) => onQueryChange?.(e.target.value)} />
        {onSearch && <button type="submit" className="btn btn-secondary">Search</button>}
      </form>
      {onStatusChange && (
        <select className="select" value={status} onChange={(e) => onStatusChange(e.target.value)} style={{ width: 160 }}>
          {statusOptions.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      )}
      {onDateRangeChange && (
        <select className="select" value={dateRange || "all"} onChange={(e) => onDateRangeChange(e.target.value)} style={{ width: 160 }}>
          <option value="all">Any time</option>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>
      )}
      {onSortChange && (
        <select className="select" value={sort} onChange={(e) => onSortChange(e.target.value)} style={{ width: 150 }}>
          {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {onViewChange && (
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" className={`btn btn-secondary ${view === "grid" ? "active" : ""}`} onClick={() => onViewChange("grid")} aria-label="Grid view">
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button type="button" className={`btn btn-secondary ${view === "list" ? "active" : ""}`} onClick={() => onViewChange("list")} aria-label="List view">
            <List className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
