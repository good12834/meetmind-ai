import { useEffect, useRef, useMemo } from "react";

function formatTime(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return "00:00";
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function TranscriptView({
  transcript,
  query = "",
  onSeek,
  polling = false,
  onRefresh,
  pollInterval = 5000,
}) {
  const segments = transcript?.segments || [];
  const q = query.trim().toLowerCase();
  const status = transcript?.status || (transcript ? "completed" : null);
  const isProcessing = status === "processing";

  const pollActive = Boolean(polling && isProcessing && onRefresh);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!pollActive) return;
    timerRef.current = setInterval(() => {
      onRefresh();
    }, pollInterval);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pollActive, onRefresh, pollInterval]);

  const filtered = useMemo(() => {
    if (!q) return segments;
    return segments.filter((s) => (s.text || "").toLowerCase().includes(q));
  }, [segments, q]);

  if (!transcript) return null;

  return (
    <div className="card-surface" style={{ padding: 16 }}>
      {isProcessing && (
        <div className="mb-4 p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <p className="text-sm text-purple-300 font-medium">Transcribing…</p>
          <p className="text-xs text-purple-400 mt-1">
            Polling for completion… updates appear automatically.
          </p>
        </div>
      )}
      {filtered.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No matching transcript segments.</p>
      ) : (
        filtered.map((seg, idx) => (
          <div key={seg.id ?? idx} className="transcript-segment">
            <span
              className="transcript-time"
              title="Seek audio"
              onClick={() => onSeek?.(seg.start ?? 0)}
              role={onSeek ? "button" : undefined}
            >
              {formatTime(seg.start)} – {formatTime(seg.end)}
            </span>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{seg.text}</p>
          </div>
        ))
      )}
      {segments.length === 0 && transcript.full_text && (
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, margin: 0 }}>{transcript.full_text}</p>
      )}
    </div>
  );
}
