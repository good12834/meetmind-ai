import { Mic, MicOff, Video, VideoOff, Monitor, MessageSquare, PhoneOff, Square, Radio } from "lucide-react";

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
    <div className="vcontrols flex items-center justify-center gap-2">
      <button
        className={`vbtn ${!micOn ? 'off' : ''} flex items-center justify-center`}
        onClick={onMic}
        title={micOn ? 'Mute microphone' : 'Unmute microphone'}
        aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
      >
        {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>
      <button
        className={`vbtn ${!camOn ? 'off' : ''} flex items-center justify-center`}
        onClick={onCam}
        title={camOn ? 'Turn off camera' : 'Turn on camera'}
        aria-label={camOn ? 'Turn off camera' : 'Turn on camera'}
      >
        {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </button>
      <button
        className={`vbtn ${sharing ? 'active' : ''} flex items-center justify-center`}
        onClick={onShare}
        title={sharing ? 'Stop sharing screen' : 'Share screen'}
        aria-label={sharing ? 'Stop sharing screen' : 'Share screen'}
      >
        <Monitor className="w-5 h-5" />
      </button>
      {onRecord && (
        <button
          className={`vbtn ${recording ? 'off' : ''} flex items-center gap-1.5`}
          onClick={onRecord}
          title={recording ? 'Stop recording & transcribe' : 'Record & transcribe call'}
        >
          {recording ? (
            <>
              <Square className="w-4 h-4 fill-current" />
              <span>Recording</span>
            </>
          ) : (
            <>
              <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              <span>Record</span>
            </>
          )}
        </button>
      )}
      <button
        className={`vbtn ${chatOpen ? 'active' : ''} flex items-center justify-center`}
        onClick={onChat}
        title="Chat"
        aria-label="Chat"
      >
        <MessageSquare className="w-5 h-5" />
      </button>
      <button className="vbtn danger flex items-center gap-1.5" onClick={onLeave} title="Leave">
        <PhoneOff className="w-4 h-4" />
        <span>Leave</span>
      </button>
    </div>
  );
}
