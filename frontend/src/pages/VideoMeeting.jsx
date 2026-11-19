import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import recordingService from '../services/recordingService';
import transcriptionService from '../services/transcriptionService';
import useWebRTC from '../hooks/useWebRTC';
import VideoTile from '../components/video/VideoTile';
import VideoControls from '../components/video/VideoControls';
import ChatPanel from '../components/video/ChatPanel';
import '../styles/video-meeting.css';

const getUserName = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.name || user.email || 'Guest';
  } catch {
    return 'Guest';
  }
};

const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function VideoMeeting() {
  const { id } = useParams();
  const navigate = useNavigate();
  const userName = getUserName();
  const rtc = useWebRTC(id, userName);
  const [chatOpen, setChatOpen] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [meetingTitle, setMeetingTitle] = useState(`Meeting #${id}`);

  // Recording & Transcribing pipeline
  const [isRecording, setIsRecording] = useState(false);
  const [recordStatus, setRecordStatus] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    // Fetch meeting details for title
    api.get(`/meetings/${id}`)
      .then((res) => {
        if (res.data?.meeting?.title) {
          setMeetingTitle(res.data.meeting.title);
        }
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!rtc.joined) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rtc.joined]);

  // Handle Recording of local mic stream
  const handleToggleRecord = async () => {
    if (!rtc.localStream) return;

    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      setRecordStatus('Saving & transcribing…');
    } else {
      // Start recording
      try {
        audioChunksRef.current = [];
        const audioStream = new MediaStream(rtc.localStream.getAudioTracks());
        const recorder = new MediaRecorder(audioStream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '',
        });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const file = new File([blob], `video_meeting_${id}_${Date.now()}.webm`, {
            type: 'audio/webm',
          });

          try {
            setRecordStatus('Uploading audio…');
            const uploadRes = await recordingService.uploadRecording({
              file,
              meetingId: id,
              source: 'video',
              fileName: file.name,
            });
            setRecordStatus('Transcribing audio…');
            if (uploadRes?.recording?.id) {
              await transcriptionService.transcribeMeeting(id, {
                recordingId: uploadRes.recording.id,
              });
            }
            setRecordStatus('Recorded & transcribed! Saved to meeting.');
            setTimeout(() => setRecordStatus(''), 4000);
          } catch (err) {
            console.error('Failed to process recording:', err);
            setRecordStatus('Saved recording to meeting.');
            setTimeout(() => setRecordStatus(''), 4000);
          }
        };

        recorder.start(1000);
        setIsRecording(true);
        setRecordStatus('Recording meeting audio…');
      } catch (err) {
        console.error('Could not start recording:', err);
        setRecordStatus('Recording not supported on this browser.');
        setTimeout(() => setRecordStatus(''), 3000);
      }
    }
  };

  const handleLeave = () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    rtc.leave();
    navigate(`/meetings/${id}`);
  };

  const peerList = Object.entries(rtc.peers);
  const count = peerList.length + 1;

  if (!rtc.joined) {
    return (
      <div className="vlobby">
        <div className="vlobby-card">
          <h1>Ready to join?</h1>
          <p className="vlobby-sub">{meetingTitle}</p>
          <div className="vlobby-preview">
            <VideoTile stream={rtc.localStream} name={userName} muted camOff={!rtc.camOn} />
          </div>
          {rtc.error && <p className="verror">{rtc.error}</p>}
          <div className="vlobby-actions">
            <button
              className={`vbtn ${!rtc.micOn ? 'off' : ''}`}
              onClick={rtc.toggleMic}
              title={rtc.micOn ? 'Mute' : 'Unmute'}
            >
              {rtc.micOn ? '🎤' : '🔇'}
            </button>
            <button
              className={`vbtn ${!rtc.camOn ? 'off' : ''}`}
              onClick={rtc.toggleCam}
              title={rtc.camOn ? 'Stop Video' : 'Start Video'}
            >
              {rtc.camOn ? '📹' : '🚫'}
            </button>
          </div>
          <button className="vjoin" onClick={rtc.join}>
            Join meeting
          </button>
          <button className="vlink" onClick={() => navigate(`/meetings/${id}`)}>
            ← Back to meeting
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vroom">
      <header className="vroom-header">
        <h1>{meetingTitle}</h1>
        <div className="vroom-meta">
          <span className="vlive">● {fmt(seconds)}</span>
          <span>👥 {count} {count === 1 ? 'person' : 'people'}</span>
          {recordStatus && (
            <span style={{ color: 'var(--warning)', fontSize: '12px' }}>
              {recordStatus}
            </span>
          )}
        </div>
      </header>

      <div className="vroom-body">
        <div className="vgrid" data-count={count}>
          <VideoTile
            stream={rtc.localStream}
            name={`${userName} (You)`}
            muted
            camOff={!rtc.camOn}
          />
          {peerList.map(([pid, p]) => (
            <VideoTile key={pid} stream={p.stream} name={p.name} />
          ))}
        </div>
        {chatOpen && <ChatPanel messages={rtc.messages} onSend={rtc.sendChat} />}
      </div>

      {rtc.error && <p className="verror">{rtc.error}</p>}

      <VideoControls
        micOn={rtc.micOn}
        camOn={rtc.camOn}
        sharing={rtc.sharing}
        chatOpen={chatOpen}
        recording={isRecording}
        onMic={rtc.toggleMic}
        onCam={rtc.toggleCam}
        onShare={rtc.toggleShare}
        onRecord={handleToggleRecord}
        onChat={() => setChatOpen((o) => !o)}
        onLeave={handleLeave}
      />
    </div>
  );
}

