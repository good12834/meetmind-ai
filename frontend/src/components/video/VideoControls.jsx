export default function VideoControls({
  micOn,
  camOn,
  sharing,
  chatOpen,
  recording = false,
  onMic,
  onCam,
  onShare,
  onChat,
  onRecord,
  onLeave,
}) {
  return (
    <div className="vcontrols">
      <button
        className={`vbtn ${!micOn ? 'off' : ''}`}
        onClick={onMic}
        title={micOn ? 'Mute microphone' : 'Unmute microphone'}
      >
        {micOn ? '🎤' : '🔇'}
      </button>
      <button
        className={`vbtn ${!camOn ? 'off' : ''}`}
        onClick={onCam}
        title={camOn ? 'Turn off camera' : 'Turn on camera'}
      >
        {camOn ? '📹' : '🚫'}
      </button>
      <button
        className={`vbtn ${sharing ? 'active' : ''}`}
        onClick={onShare}
        title={sharing ? 'Stop sharing screen' : 'Share screen'}
      >
        🖥
      </button>
      {onRecord && (
        <button
          className={`vbtn ${recording ? 'off' : ''}`}
          onClick={onRecord}
          title={recording ? 'Stop recording & transcribe' : 'Record & transcribe call'}
        >
          {recording ? '⏹ Recording' : '⏺ Record'}
        </button>
      )}
      <button
        className={`vbtn ${chatOpen ? 'active' : ''}`}
        onClick={onChat}
        title="Chat"
      >
        💬
      </button>
      <button className="vbtn danger" onClick={onLeave} title="Leave">
        📞 Leave
      </button>
    </div>
  );
}

