import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, Clock, MoreHorizontal, Video } from "lucide-react";
import StatusBadge from "./StatusBadge";
import api from "../../services/api";

function formatDate(iso) {
  if (!iso) return "No date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function deriveStatus(meeting) {
  if (meeting.status === "in-progress" || meeting.live) return "live";
  if (meeting.has_summary || meeting.status === "summarized") return "summarized";
  if (meeting.has_transcript || meeting.transcripts_count > 0) return "transcribed";
  if (meeting.recordings_count > 0 || meeting.has_recording) return "recorded";
  return meeting.status || "scheduled";
}

export default function MeetingCard({ meeting, onRename, onDelete, onDownload, onJoinVideo }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [videoActive, setVideoActive] = useState(false);
  const [videoCount, setVideoCount] = useState(0);
  const ref = useRef(null);
  const status = deriveStatus(meeting);
  const isLive = status === "live" || videoActive;

  useEffect(() => {
    // Check if video room is currently active
    let mounted = true;
    api.get(`/meetings/${meeting.id}/video-status`)
      .then((res) => {
        if (mounted && res.data?.active) {
          setVideoActive(true);
          setVideoCount(res.data.count || 0);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [meeting.id]);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className={`meeting-card card-surface hoverable ${isLive ? "is-live" : ""}`}>
      <div className="meeting-card-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Link to={`/meetings/${meeting.id}`} className="meeting-card-title">{meeting.title || "Untitled meeting"}</Link>
            {videoActive && (
              <span className="video-live-badge">
                <span className="video-live-dot" />
                <span>Video Live ({videoCount})</span>
              </span>
            )}
          </div>
          <div className="meeting-card-meta" style={{ marginTop: 6 }}>
            <span><Calendar className="text-current w-3.5 h-3.5 inline mr-1" /> {formatDate(meeting.meeting_date || meeting.created_at)}</span>
            {meeting.duration ? <span><Clock className="w-3.5 h-3.5 inline mr-1" /> {meeting.duration}</span> : null}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="meeting-card-actions">
        {onJoinVideo ? (
          <button className="btn btn-secondary flex items-center gap-1" onClick={(e) => { e.stopPropagation(); onJoinVideo(meeting); }}>
            <Video className="w-3.5 h-3.5" /> Join
          </button>
        ) : (
          <button
            className="btn-video flex items-center gap-1"
            onClick={() => navigate(`/meetings/${meeting.id}/video`)}
          >
            <Video className="w-3.5 h-3.5" /> Join
          </button>
        )}
        <Link to={`/meetings/${meeting.id}`} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }}>Open</Link>
        <div className="meeting-card-menu" ref={ref}>
          <button className="btn btn-secondary flex items-center justify-center" style={{ padding: "6px 10px" }} onClick={() => setOpen((v) => !v)} aria-label="More actions"><MoreHorizontal className="w-4 h-4" /></button>
          {open && (
            <div className="menu-popover">
              {onRename && <button className="menu-item" onClick={() => { setOpen(false); onRename(meeting); }}>Rename</button>}
              {onDownload && <button className="menu-item" onClick={() => { setOpen(false); onDownload(meeting); }}>Download recording</button>}
              {onDelete && <button className="menu-item danger" onClick={() => { setOpen(false); onDelete(meeting); }}>Delete</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}