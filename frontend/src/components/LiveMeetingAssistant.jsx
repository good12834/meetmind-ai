import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, StopCircle, Activity, CheckCircle2, Bot, ClipboardList, Circle, Calendar } from "lucide-react";
import liveService from "../services/liveService";

const DEFAULT_MODEL_SIZE = "base";

export default function LiveMeetingAssistant({ meetingId }) {
  const [session, setSession] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [segments, setSegments] = useState([]);
  const [insights, setInsights] = useState({ key_points: [], decisions: [], action_items: [] });
  const [error, setError] = useState("");
  const [modelSize, setModelSize] = useState(DEFAULT_MODEL_SIZE);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const sessionIdRef = useRef(null);
  const chunkIntervalRef = useRef(null);

  const [token, setToken] = useState(() => localStorage.getItem("access_token"));

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === "access_token") {
        setToken(e.newValue || localStorage.getItem("access_token"));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!token) return;
    liveService.connectLiveSocket(token);

    const unsubStarted = liveService.onSessionStarted((data) => {
      setSession(data.session);
      setIsActive(true);
      setError("");
    });
    const unsubStopped = liveService.onSessionStopped(() => {
      setIsActive(false);
      stopMediaRecorder();
    });
    const unsubSegment = liveService.onTranscriptSegment((seg) => {
      setSegments((prev) => [...prev, seg]);
    });
    const unsubInsight = liveService.onAiInsight((payload) => {
      setInsights((prev) => ({
        key_points: [...new Set([...prev.key_points, ...(payload.insights.key_points || [])])],
        decisions: [...new Set([...prev.decisions, ...(payload.insights.decisions || [])])],
        action_items: [...prev.action_items, ...(payload.insights.action_items || [])],
      }));
    });
    const unsubError = liveService.onError((err) => {
      setError(err.message || "Live session error");
    });

    return () => {
      unsubStarted();
      unsubStopped();
      unsubSegment();
      unsubInsight();
      unsubError();
      stopMediaRecorder();
    };
  }, [token]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const startMediaRecorder = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Microphone recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = "audio/webm;codecs=opus";
      const options = MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.start(1000);
      chunkIntervalRef.current = setInterval(async () => {
        if (!sessionIdRef.current) return;
        if (audioChunksRef.current.length === 0) return;
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        liveService.sendAudioChunk(sessionIdRef.current, base64, { modelSize });
      }, 1000);
      setError("");
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Microphone access was denied. Click below to open your browser settings and enable microphone permissions for this site.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setError("No microphone was detected on this device.");
      } else {
        setError(`Failed to access microphone: ${err.message || err.name}`);
      };
    }
  };

  const stopMediaRecorder = useCallback(() => {
    if (chunkIntervalRef.current) { clearInterval(chunkIntervalRef.current); chunkIntervalRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  }, []);

  
  // Open browser settings for microphone permissions
  const openBrowserSettings = () => {
    // chrome:// and about: URLs cannot be opened from web content (security restriction).
    setError(
      "Microphone access is blocked by your browser. Click the site information (lock) icon in the address bar, allow microphone permissions for this site, then refresh the page and try again."
    );
  };

const handleStartSession = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await liveService.startLiveSession(meetingId);
      if (response.success) {
        setSession(response.session);
        sessionIdRef.current = response.session.id;
        liveService.joinLiveSession(response.session.id);
        await startMediaRecorder();
      } else {
        setError(response.message || "Failed to start live session");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to start live session");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopSession = async () => {
    setIsLoading(true);
    try {
      if (sessionIdRef.current) {
        liveService.endLiveSession(sessionIdRef.current);
      }
      stopMediaRecorder();
      if (sessionIdRef.current) {
        const response = await liveService.stopLiveSession(sessionIdRef.current);
        if (response.success) {
          setSession(response.session);
          setIsActive(false);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to stop live session");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyTranscript = () => {
    const text = segments.map((s) => s.text).join("\n");
    navigator.clipboard.writeText(text);
  };

  const handleCopyInsights = () => {
    const lines = [
      "Live Meeting AI Insights",
      "",
      "KEY POINTS",
      ...insights.key_points.map((p, i) => `${i + 1}. ${p}`),
      "",
      "DECISIONS",
      ...insights.decisions.map((d, i) => `${i + 1}. ${d}`),
      "",
      "ACTION ITEMS",
      ...insights.action_items.map((item, i) => `${i + 1}. [ ] ${item.task} — ${item.assignee} (due: ${item.due_date})`),
    ];
    navigator.clipboard.writeText(lines.join("\n"));
  };

  if (!session && !isActive && !error) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mic className="w-8 h-8 text-purple-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Live Meeting Assistant</h3>
        <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
          Start a live session to transcribe your meeting in real time and get AI-powered insights as the conversation happens.
        </p>
        <button
          onClick={handleStartSession}
          disabled={isLoading}
          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-semibold flex items-center gap-2 mx-auto transition shadow-lg shadow-purple-600/20"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
              Starting...
            </span>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              Start Live Session
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white"><Circle className="text-current" /> Live Meeting Assistant</h3>
          <p className="text-xs text-gray-400 mt-1">Session {session?.id} • {session?.status || "active"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${isActive ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-800 text-gray-400 border border-slate-700"}`}>
            {isActive ? "● LIVE" : "● IDLE"}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-950/50 border border-slate-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-white">
              <Activity className="w-4 h-4 text-purple-400 mr-2" /> Live Transcript
            </h4>
            <select
              value={modelSize}
              onChange={(e) => setModelSize(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
            >
              <option value="tiny">Tiny</option>
              <option value="base">Base</option>
              <option value="small">Small</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {segments.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm">
                <p>Waiting for speech...</p>
                <p className="text-xs mt-1">Speak into your microphone to begin live transcription.</p>
              </div>
            )}
            {segments.map((seg, idx) => (
              <div key={idx} className={`p-3 rounded-lg border-l-2 ${seg.is_final ? "bg-slate-800 border-purple-500/30" : "bg-slate-800/50 border-gray-500/20"}`}>
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-xs font-semibold text-purple-400">{seg.speaker}</span>
                  <span className="text-xs text-gray-500">{formatTime(seg.start_time || 0)}</span>
                  {seg.is_final && <span className="ml-auto text-xs text-green-400"><CheckCircle2 className="w-3 h-3" /> final</span>}
                </div>
                <p className="text-sm text-white leading-relaxed">{seg.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
            <span className="text-xs text-gray-400">{segments.length} segment{segments.length !== 1 ? "s" : ""} captured</span>
            <button onClick={handleCopyTranscript} disabled={segments.length === 0} className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50">Copy Transcript</button>
          </div>
        </div>

        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-white"><Bot className="w-4 h-4 text-purple-400 mr-2" /> AI Insights</h4>
          </div>
          <div className="space-y-4">
            <div>
              <h5 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Key Points</h5>
              {insights.key_points.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No key points detected yet.</p>
              ) : (
                <ul className="space-y-2 text-sm text-gray-300">
                  {insights.key_points.map((p, i) => (
                    <li key={i} className="flex items-start gap-2"><span className="text-purple-400">{i + 1}.</span><span>{p}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h5 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Decisions</h5>
              {insights.decisions.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No decisions detected yet.</p>
              ) : (
                <ul className="space-y-2 text-sm text-gray-300">
                  {insights.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2"><span className="text-blue-400">{i + 1}.</span><span>{d}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h5 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Action Items</h5>
              {insights.action_items.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No action items detected yet.</p>
              ) : (
                <ul className="space-y-2">
                  {insights.action_items.map((item, i) => (
                    <li key={i} className="p-2 rounded bg-slate-800/50 border border-slate-800">
                      <p className="text-sm text-gray-300">{item.task}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500"><span>👤 {item.assignee}</span><span><Calendar className="text-current" /> {item.due_date}</span></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-auto pt-4 border-t border-slate-800">
            <button onClick={handleCopyInsights} disabled={insights.key_points.length === 0 && insights.decisions.length === 0 && insights.action_items.length === 0} className="w-full text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50 py-2"><ClipboardList className="w-3 h-3 mr-1" /> Copy Insights</button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          onClick={handleStopSession}
          disabled={isLoading}
          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-semibold flex items-center gap-2 transition shadow-lg shadow-red-600/20"
        >
          <StopCircle className="w-4 h-4" />
          {isLoading ? "Stopping..." : "Stop Live Session"}
        </button>
      </div>
    </div>
  );
}
