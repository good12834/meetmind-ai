import { useEffect, useRef } from 'react';

export default function VideoTile({ stream, name, muted = false, camOff = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If browser autoplay policy blocks unmuted video, mute and retry
          if (!muted) {
            video.muted = true;
            video.play().catch(() => {});
          }
        });
      }
    } else {
      video.srcObject = null;
    }
  }, [stream, muted]);

  const hasLiveVideoTrack =
    Boolean(stream) &&
    stream.getVideoTracks().length > 0 &&
    stream.getVideoTracks().some((t) => t.readyState === 'live') &&
    !camOff;

  return (
    <div className="vtile">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={muted ? { transform: 'scaleX(-1)' } : undefined}
        className={!hasLiveVideoTrack ? 'vtile-hidden' : ''}
      />
      {!hasLiveVideoTrack && (
        <div className="vtile-avatar">{(name || '?').charAt(0).toUpperCase()}</div>
      )}
      <span className="vtile-name">{name}</span>
    </div>
  );
}

