import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clipboard,
  Clock,
  Download,
  FileText,
  LayoutGrid,
  ListChecks,
  Loader2,
  LogOut,
  Mic,
  Package,
  Pencil,
  Play,
  Radio,
  Search,
  Sparkles,
  Trash2,
  Video,
  X,
  Zap,
} from "lucide-react";
import api from "../services/api";
import recordingService from "../services/recordingService";
import transcriptionService from "../services/transcriptionService";
import LiveMeetingAssistant from "../components/LiveMeetingAssistant";
import AISummaryPanel from "../components/AISummaryPanel";

const STATUS_STYLES = {
  scheduled: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "in-progress": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const INPUT =
  "w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition";

const formatFileSize = (bytes) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatDuration = (totalSeconds) => {
  if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const formatDate = (isoString) => {
  if (!isoString) return "No date set";
  try {
    return new Date(isoString).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
};

function Highlight({ text, term }) {
  if (!term) return text;
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = String(text).split(new RegExp(`(${safe})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === term.toLowerCase() ? (
      <mark key={i} className="bg-purple-500/30 text-white rounded px-0.5">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function LiveBadge({ label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 font-semibold">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
      {label}
    </span>
  );
}

function PipelineStepper({ steps }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3 overflow-x-auto">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center justify-center w-7 h-7 rounded-full border text-xs font-bold transition ${
                s.done
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                  : s.active
                  ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                  : "bg-slate-800 border-slate-700 text-gray-500"
              }`}
            >
              {s.done ? (
                <Check className="w-4 h-4" />
              ) : s.active ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                i + 1
              )}
            </span>
            <span className={`text-sm font-medium ${s.done || s.active ? "text-white" : "text-gray-500"}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <span className={`h-px w-6 sm:w-12 ${s.done ? "bg-emerald-500/40" : "bg-slate-700"}`} />
          )}
        </li>
      ))}
    </ol>
  );
}

function MeetingDetails({ initialTab }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const [meeting, setMeeting] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [transcript, setTranscript] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab || "overview");

  // Transcription controls
  const [transcriptionStatus, setTranscriptionStatus] = useState("idle"); // idle | processing | completed | failed
  const [transcribeModel, setTranscribeModel] = useState("base");
  const [transcribeLanguage] = useState("auto");
  const [selectedRecordingId, setSelectedRecordingId] = useState("");
  const [transcriptViewMode, setTranscriptViewMode] = useState("segments");
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const pollIntervalRef = useRef(null);
  const audioRef = useRef(null);

  // Video room
  const [videoStatus, setVideoStatus] = useState({ active: false, count: 0 });

  // Edit modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", meeting_date: "", status: "scheduled" });
  const [saving, setSaving] = useState(false);

  // Toast + confirm dialog (replace alert / window.confirm)
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const showToast = useCallback((type, text) => setToast({ type, text, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    let attempts = 0;
    const maxAttempts = 120; // ~10 minutes at 5s intervals
    pollIntervalRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await transcriptionService.getTranscriptStatus(id);
        const status = res.status || res.transcript?.status || "processing";
        if (status === "completed") {
          stopPolling();
          setTranscriptionStatus("completed");
          if (res.transcript) setTranscript(res.transcript);
          setActiveTab("transcript");
          showToast("success", "Transcript is ready");
        } else if (status === "failed") {
          stopPolling();
          setTranscriptionStatus("failed");
          setErrorMessage("Transcription failed. Please try again.");
        } else if (attempts >= maxAttempts) {
          stopPolling();
          setTranscriptionStatus("failed");
          setErrorMessage("Transcription is taking longer than expected. Check the status below.");
        }
      } catch (err) {
        console.warn("Transcript status poll error:", err);
      }
    }, 5000);
  }, [id, stopPolling, showToast]);

  const fetchVideoStatus = useCallback(async () => {
    try {
      const res = await api.get(`/meetings/${id}/video-status`);
      setVideoStatus({ active: Boolean(res.data?.active), count: res.data?.count || 0 });
    } catch {
      /* video status is optional */
    }
  }, [id]);

  const fetchMeetingData = useCallback(async () => {
    try {
      setLoading(true);
      const [meetingRes, recRes, transRes] = await Promise.all([
        api.get(`/meetings/${id}`),
        recordingService.getMeetingRecordings(id).catch(() => ({ recordings: [] })),
        transcriptionService.getMeetingTranscript(id).catch(() => ({ transcript: null })),
      ]);

      setMeeting(meetingRes.data.meeting);
      const recs = recRes.recordings || [];
      setRecordings(recs);
      setSelectedRecordingId((prev) => prev || (recs[0]?.id ?? ""));
      const t = transRes.transcript || null;
      setTranscript(t);
      setErrorMessage("");

      // Resume polling if a transcription is still running in the background
      if (t?.status === "processing") {
        setTranscriptionStatus("processing");
        startPolling();
      }
    } catch (err) {
      if (err.response?.status === 401) {
        navigate("/login");
      } else {
        setErrorMessage(err.response?.data?.message || "Meeting not found or failed to load");
      }
    } finally {
      setLoading(false);
    }
  }, [id, navigate, startPolling]);

  useEffect(() => {
    fetchMeetingData();
    fetchVideoStatus();
    const videoTimer = setInterval(fetchVideoStatus, 15000);
    return () => {
      clearInterval(videoTimer);
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Escape closes modals; body scroll lock while one is open
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (confirm) setConfirm(null);
      else if (isEditModalOpen && !saving) setIsEditModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, isEditModalOpen, saving]);

  useEffect(() => {
    if (!isEditModalOpen && !confirm) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isEditModalOpen, confirm]);

  const askConfirm = (opts) => setConfirm(opts);

  const handleTranscribe = async () => {
    if (recordings.length === 0) {
      showToast("error", "Upload or record meeting audio before transcribing.");
      return;
    }
    setTranscriptionStatus("processing");
    setErrorMessage("");
    try {
      const response = await transcriptionService.transcribeMeeting(id, {
        recordingId: selectedRecordingId ? Number(selectedRecordingId) : null,
        modelSize: transcribeModel,
        language: transcribeLanguage,
      });
      setTranscript(response.transcript || null);
    } catch (err) {
      console.error("Transcription error:", err);
      setTranscriptionStatus("failed");
      setErrorMessage(err.response?.data?.message || "Transcription failed to start. Please check backend logs.");
      return;
    }
    startPolling();
  };

  const handleCopyTranscript = async () => {
    if (!transcript?.full_text) return;
    try {
      await navigator.clipboard.writeText(transcript.full_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("error", "Could not copy to clipboard");
    }
  };

  const handleDownloadTranscript = () => {
    if (!transcript?.full_text) return;
    const blob = new Blob([transcript.full_text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${meeting?.title || "meeting"}_transcript.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteTranscript = () =>
    askConfirm({
      title: "Delete transcript",
      message: "This transcript will be permanently removed.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await transcriptionService.deleteTranscript(transcript.id);
          setTranscript(null);
          setTranscriptionStatus("idle");
          showToast("success", "Transcript deleted");
        } catch (err) {
          showToast("error", err.response?.data?.message || "Failed to delete transcript");
        }
      },
    });

  const handleDeleteRecording = (recId) =>
    askConfirm({
      title: "Delete recording",
      message: "This recording will be permanently removed.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await recordingService.deleteRecording(recId);
          setRecordings((prev) => prev.filter((r) => r.id !== recId));
          showToast("success", "Recording deleted");
        } catch (err) {
          showToast("error", err.response?.data?.message || "Failed to delete recording");
        }
      },
    });

  const handleDelete = () =>
    askConfirm({
      title: "Delete meeting",
      message: `Delete "${meeting?.title}"? This cannot be undone.`,
      confirmLabel: "Delete meeting",
      onConfirm: async () => {
        try {
          await api.delete(`/meetings/${id}`);
          navigate("/meetings");
        } catch (err) {
          showToast("error", err.response?.data?.message || "Failed to delete meeting");
        }
      },
    });

  const handleOpenEdit = () => {
    if (!meeting) return;
    setForm({
      title: meeting.title || "",
      description: meeting.description || "",
      meeting_date: meeting.meeting_date ? meeting.meeting_date.slice(0, 16) : "",
      status: meeting.status || "scheduled",
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const response = await api.put(`/meetings/${id}`, form);
      setMeeting(response.data.meeting);
      setIsEditModalOpen(false);
      showToast("success", "Meeting updated");
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to update meeting");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const seekTo = (seconds) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds || 0;
    el.play().catch(() => {});
  };

  const hasSummary = Boolean(meeting?.has_summary);
  const isLive = meeting?.status === "in-progress";

  const steps = [
    { label: "Audio", done: recordings.length > 0 },
    {
      label: "Transcript",
      done: Boolean(transcript?.full_text) && transcriptionStatus !== "processing",
      active: transcriptionStatus === "processing",
    },
    { label: "AI Summary", done: hasSummary },
  ];

  const nextStep = !recordings.length
    ? {
        title: "Add meeting audio",
        text: "Record with your microphone or upload a file to get started.",
        cta: <Link to={`/meetings/${id}/record`} className="btn-next">Record or upload</Link>,
      }
    : !transcript
    ? {
        title: "Transcribe the audio",
        text: "Run local Whisper to generate a timed transcript.",
        cta: <button onClick={() => setActiveTab("transcript")} className="btn-next">Go to transcript</button>,
      }
    : !hasSummary
    ? {
        title: "Generate the AI summary",
        text: "Extract key points, decisions and action items with Ollama.",
        cta: <button onClick={() => setActiveTab("summary")} className="btn-next">Open AI summary</button>,
      }
    : {
        title: "All set",
        text: "Audio, transcript and summary are complete.",
        cta: null,
      };

  const filteredSegments = useMemo(() => {
    const segs = transcript?.segments || [];
    const q = transcriptSearch.trim().toLowerCase();
    if (!q) return segs;
    return segs.filter((s) => (s.text || "").toLowerCase().includes(q));
  }, [transcript, transcriptSearch]);

  const tabs = [
    { id: "overview", label: "Overview", icon: LayoutGrid },
    { id: "recording", label: "Recordings", icon: Mic, count: recordings.length },
    { id: "transcript", label: "Transcript", icon: FileText, done: Boolean(transcript) },
    { id: "summary", label: "AI Summary", icon: Sparkles, done: hasSummary },
    { id: "action_items", label: "Action Items", icon: ListChecks },
    { id: "live", label: "Live", icon: Radio, live: true },
  ];

  const selectedRecording = recordings.find((r) => String(r.id) === String(selectedRecordingId)) || recordings[0];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Navbar */}
      <nav className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-8">
          <Link to="/dashboard" className="text-2xl font-bold text-purple-400">
            MeetMind AI
          </Link>
          <div className="hidden sm:flex items-center gap-4 text-sm font-medium">
            <Link to="/dashboard" className="text-gray-400 hover:text-white transition">
              Dashboard
            </Link>
            <Link to="/meetings" className="text-purple-400 border-b-2 border-purple-500 pb-1">
              Meetings
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-purple-600/20 border border-purple-500/30 text-purple-300 flex items-center justify-center font-semibold">
              {(user.name || "U").charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-gray-300">{user.name || "User"}</span>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto w-full p-6 sm:p-8 flex-1">
        <Link
          to="/meetings"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to All Meetings
        </Link>

        {loading ? (
          <div className="space-y-6" aria-busy="true">
            <div className="h-44 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
            <div className="h-10 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
            <div className="grid md:grid-cols-3 gap-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
              ))}
            </div>
          </div>
        ) : errorMessage && !meeting ? (
          <div className="p-8 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-center space-y-4">
            <AlertTriangle className="w-8 h-8 mx-auto" />
            <p>{errorMessage}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={fetchMeetingData}
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
              >
                Try again
              </button>
              <Link
                to="/meetings"
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
              >
                All meetings
              </Link>
            </div>
          </div>
        ) : meeting ? (
          <div className="space-y-8">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                <span className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {errorMessage}
                </span>
                <button onClick={() => setErrorMessage("")} aria-label="Dismiss">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Header card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 mb-3 flex-wrap">
                    <span
                      className={`text-xs px-3 py-1 rounded-full font-semibold capitalize border ${
                        STATUS_STYLES[meeting.status] || "bg-purple-500/15 text-purple-400 border-purple-500/30"
                      }`}
                    >
                      {meeting.status}
                    </span>
                    {videoStatus.active && <LiveBadge label={`Video live · ${videoStatus.count}`} />}
                    <span className="text-sm text-gray-400 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" /> {formatDate(meeting.meeting_date)}
                    </span>
                    {recordings.length > 0 && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                        <Mic className="w-3 h-3" /> {recordings.length} {recordings.length === 1 ? "Audio" : "Audios"}
                      </span>
                    )}
                    {transcript && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Transcribed
                      </span>
                    )}
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white break-words">{meeting.title}</h1>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <Link
                    to={`/meetings/${meeting.id}/video`}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
                  >
                    <Video className="w-4 h-4" />
                    <span>{videoStatus.active ? "Join Video" : "Start Video"}</span>
                  </Link>
                  <Link
                    to={`/meetings/${meeting.id}/record`}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-purple-600/20 transition"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Record / Upload</span>
                  </Link>
                  <button
                    onClick={handleOpenEdit}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2"
                  >
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="bg-red-600/80 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>

              {/* Pipeline */}
              <div className="mt-6 pt-6 border-t border-slate-800">
                <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Progress</h4>
                <PipelineStepper steps={steps} />
              </div>

              {/* Description */}
              <div className="mt-6 pt-6 border-t border-slate-800">
                <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">
                  Description & Agenda
                </h4>
                <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {meeting.description || "No description provided for this meeting."}
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div
              role="tablist"
              className="border-b border-slate-800 flex gap-1 text-sm font-medium overflow-x-auto sticky top-[73px] bg-slate-950/90 backdrop-blur z-10 -mx-2 px-2"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-3 whitespace-nowrap transition flex items-center gap-2 border-b-2 -mb-px ${
                      active
                        ? "text-purple-400 border-purple-500 font-semibold"
                        : "text-gray-400 border-transparent hover:text-white"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${tab.live ? "text-red-500" : ""}`} />
                    {tab.label}
                    {typeof tab.count === "number" && (
                      <span className="text-[11px] px-1.5 rounded-full bg-slate-800 border border-slate-700 text-gray-400">
                        {tab.count}
                      </span>
                    )}
                    {tab.done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                );
              })}
            </div>

            {/* Overview */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-sm font-medium text-gray-400">Status</h3>
                    <p className="text-xl font-bold capitalize mt-2 text-white">{meeting.status}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-sm font-medium text-gray-400">Scheduled Date</h3>
                    <p className="text-xl font-bold mt-2 text-purple-400">{formatDate(meeting.meeting_date)}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-sm font-medium text-gray-400">Audio & Transcription</h3>
                    <p className="text-xl font-bold mt-2 text-gray-300">
                      {recordings.length} {recordings.length === 1 ? "Recording" : "Recordings"} •{" "}
                      {transcript ? "Transcribed" : "No Transcript"}
                    </p>
                  </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Next step */}
                  <div className="bg-gradient-to-br from-purple-900/30 to-slate-900 border border-purple-500/30 rounded-2xl p-6 flex flex-col justify-between gap-4">
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-purple-300 font-semibold mb-2">Next step</h4>
                      <p className="text-lg font-bold text-white">{nextStep.title}</p>
                      <p className="text-sm text-gray-400 mt-1">{nextStep.text}</p>
                    </div>
                    {nextStep.cta && <div>{nextStep.cta}</div>}
                  </div>

                  {/* Video room */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 shrink-0 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                        <Video className="w-6 h-6 text-purple-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-white">WebRTC Video Room</h4>
                          {videoStatus.active && <LiveBadge label="Live" />}
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
                          {videoStatus.active
                            ? `Video room active · ${videoStatus.count} in call`
                            : "Host a multi-peer video call with in-room chat and screen sharing."}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/meetings/${meeting.id}/video`)}
                      className="self-start py-2.5 px-5 rounded-xl font-semibold text-sm bg-purple-600/20 text-purple-200 hover:bg-purple-600 hover:text-white transition flex items-center gap-2"
                    >
                      <Video className="w-4 h-4" />
                      {videoStatus.active ? "Join Video Room" : "Start Video Call"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Recordings */}
            {activeTab === "recording" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-xl font-bold text-white">Attached Meeting Recordings</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Play audio directly, or add new microphone recordings and audio files.
                    </p>
                  </div>
                  <Link
                    to={`/meetings/${meeting.id}/record`}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 transition"
                  >
                    <Mic className="w-4 h-4" /> Record or Upload Audio
                  </Link>
                </div>

                {recordings.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
                    <Mic className="w-12 h-12 mx-auto text-gray-500 mb-3" />
                    <h4 className="text-lg font-bold text-white">No Audio Recordings Yet</h4>
                    <p className="text-gray-400 text-sm max-w-md mx-auto mt-2">
                      Capture this meeting using your browser microphone or upload an audio file (MP3, WAV, M4A, WebM).
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recordings.map((recording) => (
                      <div
                        key={recording.id}
                        className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-white break-all">{recording.original_filename}</span>
                              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full capitalize bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                {recording.source}
                              </span>
                              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full capitalize bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {recording.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-400 mt-1.5 flex-wrap">
                              {recording.duration > 0 && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {formatDuration(recording.duration)}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Package className="w-3 h-3" /> {formatFileSize(recording.file_size)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> {formatDate(recording.created_at)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedRecordingId(recording.id);
                                setActiveTab("transcript");
                              }}
                              className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs px-3 py-1.5 rounded-xl font-medium transition"
                            >
                              Transcribe this Audio →
                            </button>
                            <button
                              onClick={() => handleDeleteRecording(recording.id)}
                              className="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-500/10 transition"
                              title="Delete recording"
                              aria-label="Delete recording"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800">
                          <audio
                            controls
                            preload="metadata"
                            src={recordingService.getAudioStreamUrl(recording.id)}
                            className="w-full h-10 rounded-lg outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Transcript */}
            {activeTab === "transcript" && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2 flex-wrap">
                      <span>Whisper AI Transcript</span>
                      {transcript && (
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          {transcript.language ? `Lang: ${transcript.language.toUpperCase()}` : "Ready"}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      High-accuracy automatic speech recognition with timed segments powered by faster-whisper.
                    </p>
                  </div>

                  {recordings.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {recordings.length > 1 && (
                        <select
                          value={selectedRecordingId}
                          onChange={(e) => setSelectedRecordingId(e.target.value)}
                          className="bg-slate-900 border border-slate-700 text-xs rounded-xl px-3 py-2 text-gray-300 focus:outline-none focus:border-purple-500"
                        >
                          {recordings.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.original_filename} ({formatDuration(r.duration)})
                            </option>
                          ))}
                        </select>
                      )}

                      <select
                        value={transcribeModel}
                        onChange={(e) => setTranscribeModel(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-xs rounded-xl px-3 py-2 text-gray-300 focus:outline-none focus:border-purple-500"
                        title="Whisper Model Size"
                      >
                        <option value="base">Model: Base (Fast & Balanced)</option>
                        <option value="tiny">Model: Tiny (Fastest)</option>
                        <option value="small">Model: Small (High Accuracy)</option>
                      </select>

                      <button
                        onClick={handleTranscribe}
                        disabled={transcriptionStatus === "processing"}
                        className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-purple-600/20 transition"
                      >
                        {transcriptionStatus === "processing" ? (
                          <>
                            <Loader2 className="animate-spin w-4 h-4" />
                            <span>Transcribing Audio...</span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-4 h-4" />
                            <span>{transcript ? "Re-Transcribe" : "Transcribe Audio"}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {transcriptionStatus === "processing" && (
                  <div className="p-8 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-center">
                    <div className="mb-3 flex items-center justify-center gap-4 animate-pulse">
                      <Mic className="w-8 h-8 text-purple-400" />
                      <span className="text-3xl">→</span>
                      <FileText className="w-8 h-8 text-emerald-400" />
                    </div>
                    <h4 className="text-lg font-bold text-white">Transcribing Meeting Audio with Whisper</h4>
                    <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
                      AI is analyzing the audio and generating timestamps. This may take a few moments depending on
                      recording length.
                    </p>
                    <div className="mt-5 h-1.5 max-w-xs mx-auto rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full w-1/3 rounded-full bg-purple-500 animate-[slide_1.4s_ease-in-out_infinite]" />
                    </div>
                    <p className="text-xs text-purple-400 mt-3">Status: processing — checking every 5 seconds</p>
                  </div>
                )}

                {transcriptionStatus === "failed" && (
                  <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between gap-3 flex-wrap">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Transcription did not complete.
                    </span>
                    <button
                      onClick={handleTranscribe}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {transcriptionStatus !== "processing" && recordings.length === 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
                    <Mic className="w-12 h-12 mx-auto text-gray-500 mb-3" />
                    <h4 className="text-lg font-bold text-white">No Audio to Transcribe</h4>
                    <p className="text-gray-400 text-sm max-w-md mx-auto mt-2 mb-6">
                      Whisper requires an audio recording to transcribe. Record or upload an audio file first.
                    </p>
                    <Link
                      to={`/meetings/${meeting.id}/record`}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 transition"
                    >
                      <Mic className="w-4 h-4" /> Record or Upload Audio
                    </Link>
                  </div>
                )}

                {transcriptionStatus !== "processing" && recordings.length > 0 && !transcript && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
                    <FileText className="w-12 h-12 mx-auto text-gray-500 mb-3" />
                    <h4 className="text-lg font-bold text-white">Ready for Transcription</h4>
                    <p className="text-gray-400 text-sm max-w-md mx-auto mt-2 mb-6">
                      You have {recordings.length} audio {recordings.length === 1 ? "file" : "files"} attached. Click
                      below to run local Whisper speech-to-text.
                    </p>
                    <button
                      onClick={handleTranscribe}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold text-sm inline-flex items-center gap-2 shadow-lg shadow-purple-600/20 transition"
                    >
                      <Zap className="w-4 h-4" /> Transcribe Meeting Now
                    </button>
                  </div>
                )}

                {transcriptionStatus !== "processing" && transcript && (
                  <div className="space-y-4">
                    {/* Synced audio player */}
                    {selectedRecording && (
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                          <Play className="w-3.5 h-3.5" />
                          <span>Click any timestamp below to jump to that moment</span>
                        </div>
                        <audio
                          ref={audioRef}
                          controls
                          preload="metadata"
                          src={recordingService.getAudioStreamUrl(selectedRecording.id)}
                          className="w-full h-10 rounded-lg outline-none"
                        />
                      </div>
                    )}

                    {/* Toolbar */}
                    <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                      <div className="flex items-center gap-2">
                        {[
                          { key: "segments", label: "Timed Segments" },
                          { key: "full", label: "Full Text" },
                        ].map((m) => (
                          <button
                            key={m.key}
                            onClick={() => setTranscriptViewMode(m.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                              transcriptViewMode === m.key
                                ? "bg-purple-600 text-white"
                                : "text-gray-400 hover:text-white"
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>

                      <div className="relative flex-1 min-w-[160px] max-w-xs">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        <input
                          type="search"
                          value={transcriptSearch}
                          onChange={(e) => setTranscriptSearch(e.target.value)}
                          placeholder="Search transcript…"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopyTranscript}
                          className="bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Clipboard className="w-4 h-4 text-gray-400" />
                          )}
                          <span>{copied ? "Copied!" : "Copy"}</span>
                        </button>
                        <button
                          onClick={handleDownloadTranscript}
                          className="bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
                        >
                          <Download className="w-4 h-4" />
                          <span className="hidden sm:inline">Download .txt</span>
                        </button>
                        <button
                          onClick={handleDeleteTranscript}
                          className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/10 transition"
                          title="Delete transcript"
                          aria-label="Delete transcript"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Summary callout */}
                    {!hasSummary && (
                      <div className="bg-gradient-to-r from-purple-900/30 to-slate-900 border border-purple-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Sparkles className="w-6 h-6 text-purple-300 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-white">
                              Transcript is ready — turn it into meeting notes
                            </p>
                            <p className="text-xs text-gray-400">
                              Use your local Ollama model to extract a summary, key points, decisions and action items.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveTab("summary")}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition self-start sm:self-auto"
                        >
                          Generate AI Summary →
                        </button>
                      </div>
                    )}

                    {transcriptViewMode === "segments" && (
                      <div className="space-y-1 bg-slate-900/40 border border-slate-800 rounded-2xl p-4 sm:p-6">
                        {transcript.segments && transcript.segments.length > 0 ? (
                          filteredSegments.length > 0 ? (
                            filteredSegments.map((seg, idx) => (
                              <div
                                key={seg.id || idx}
                                className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-800/40 transition"
                              >
                                <button
                                  onClick={() => seekTo(seg.start)}
                                  disabled={!selectedRecording}
                                  title="Jump to this moment"
                                  className="font-mono text-xs text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/20 whitespace-nowrap mt-0.5 transition disabled:cursor-default"
                                >
                                  {formatDuration(seg.start)} - {formatDuration(seg.end)}
                                </button>
                                <p className="text-sm text-gray-200 leading-relaxed">
                                  <Highlight text={seg.text} term={transcriptSearch.trim()} />
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-gray-400 text-center py-6">
                              No segments match “{transcriptSearch}”.
                            </p>
                          )
                        ) : (
                          <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                            <Highlight text={transcript.full_text || ""} term={transcriptSearch.trim()} />
                          </p>
                        )}
                      </div>
                    )}

                    {transcriptViewMode === "full" && (
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">
                          <Highlight text={transcript.full_text || ""} term={transcriptSearch.trim()} />
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* AI Summary */}
            {activeTab === "summary" && (
              <AISummaryPanel
                meetingId={meeting.id}
                hasTranscript={Boolean(transcript?.full_text)}
                onGoToTranscript={() => setActiveTab("transcript")}
              />
            )}

            {/* Action Items */}
            {activeTab === "action_items" && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
                <ListChecks className="w-12 h-12 mx-auto text-amber-400 mb-3" />
                <h3 className="text-xl font-bold">Action Items & Decisions</h3>
                <p className="text-gray-400 text-sm max-w-md mx-auto mt-2 mb-6">
                  Extract actionable tasks, assignees, and key decisions automatically from the transcript.
                </p>
                <div className="inline-block px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
                  Ready for Milestone 7: Action Items and Decisions
                </div>
              </div>
            )}

            {/* Live */}
            {activeTab === "live" && <LiveMeetingAssistant meetingId={id} />}
          </div>
        ) : null}
      </main>

      {/* Edit modal */}
      {isEditModalOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => !saving && setIsEditModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-meeting-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h2 id="edit-meeting-title" className="text-2xl font-bold text-white">
                Edit Meeting
              </h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-400 hover:text-white transition"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="edit-title" className="block text-sm font-medium text-gray-300 mb-1">
                  Meeting Title *
                </label>
                <input
                  id="edit-title"
                  type="text"
                  name="title"
                  autoFocus
                  maxLength={120}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  className={INPUT}
                />
              </div>

              <div>
                <label htmlFor="edit-desc" className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  id="edit-desc"
                  name="description"
                  rows="3"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={INPUT}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-date" className="block text-sm font-medium text-gray-300 mb-1">
                    Meeting Date & Time
                  </label>
                  <input
                    id="edit-date"
                    type="datetime-local"
                    name="meeting_date"
                    value={form.meeting_date}
                    onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label htmlFor="edit-status" className="block text-sm font-medium text-gray-300 mb-1">
                    Status
                  </label>
                  <select
                    id="edit-status"
                    name="status"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className={INPUT}
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="in-progress">In-Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
          onClick={() => setConfirm(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </span>
              <div>
                <h3 className="font-bold text-white">{confirm.title}</h3>
                <p className="text-sm text-gray-400 mt-1">{confirm.message}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const run = confirm.onConfirm;
                  setConfirm(null);
                  await run();
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
              >
                {confirm.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className={`fixed bottom-5 right-5 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border shadow-2xl bg-slate-900 ${
            toast.type === "success"
              ? "border-emerald-500/40 text-emerald-300"
              : "border-red-500/40 text-red-300"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}

export default MeetingDetails;
