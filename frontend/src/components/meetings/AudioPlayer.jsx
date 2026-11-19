import { forwardRef, useImperativeHandle, useRef } from "react";

const AudioPlayer = forwardRef(function AudioPlayer({ src, title }, ref) {
  const audioRef = useRef(null);

  useImperativeHandle(ref, () => ({
    seek(time) {
      if (audioRef.current && Number.isFinite(time)) {
        audioRef.current.currentTime = Math.max(0, time);
        audioRef.current.play().catch(() => {});
      }
    },
  }));

  if (!src) {
    return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No recording available.</p>;
  }

  return (
    <div className="player-wrap">
      {title && <div style={{ fontSize: 13, marginBottom: 8, color: "var(--text-muted)" }}>{title}</div>}
      <audio ref={audioRef} controls src={src} preload="metadata" />
    </div>
  );
});

export default AudioPlayer;