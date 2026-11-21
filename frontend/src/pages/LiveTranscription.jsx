/**
 * LiveTranscription.jsx
 * Real-time speech-to-text via the Web Speech API (browser built-in).
 * Features: live captions, timestamped transcript, search, speaker toggle,
 * pause/resume, copy, save to meeting.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  Clipboard,
  Mic,
  Pause,
  Play,
  Plus,
  Radio,
  Save,
  Search,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import api from "../services/api";
import Navbar from "../components/Navbar";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatTimestamp(date) {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function hl(text, query) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded px-0.5">{p}</mark>
      : p
  );
}

// ─── component ──────────────────────────────────────────────────────────────

export default function LiveTranscription() {
  const { id: meetingIdParam } = useParams();
  const navigate = useNavigate();

  // meeting selection
  const [meetings, setMeetings] = useState([]);
  const [meetingId, setMeetingId] = useState(meetingIdParam || "");
  const [meeting, setMeeting] = useState(null);

  // transcription state
  const [lines, setLines] = useState([]);          // {id, text, timestamp, elapsed, speaker}
  const [interim, setInterim] = useState("");       // partial (not yet final) text
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");

  // speaker
  const [speakerName, setSpeakerName] = useState("Me");
  const [showSpeakerInput, setShowSpeakerInput] = useState(false);

  // search
  const [search, setSearch] = useState("");

  // timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const pausedAtRef = useRef(0);

  // speech recognition
  const recognitionRef = useRef(null);
  const lineIdRef = useRef(0);

  // save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveSuccessInfo, setSaveSuccessInfo] = useState(null);
  const [showNewMeetingModal, setShowNewMeetingModal] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  const bottomRef = useRef(null);

  // ── load meetings list ──
  useEffect(() => {
    api.get("/meetings").then((r) => {
      const list = r.data.meetings || [];
      setMeetings(list);
      if (meetingId) {
        const m = list.find((m) => String(m.id) === String(meetingId));
        if (m) setMeeting(m);
      }
    }).catch(() => {});
  }, [meetingId]);

  // ── auto-scroll ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, interim]);

  // ── cleanup on unmount ──
  useEffect(() => {
    return () => {
      stopRecognition();
      clearInterval(timerRef.current);
    };
  }, []);

  // ── browser support check ──
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) setSupported(false);
  }, []);

  // ── timer ──
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now() - pausedAtRef.current * 1000;
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  }, []);

  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current);
    pausedAtRef.current = elapsed;
  }, [elapsed]);

  // ── speech recognition ──
  const stopRecognition = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
  };

  const startRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let interimText = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText.trim()) {
        setLines((prev) => [
          ...prev,
          {
            id: lineIdRef.current++,
            text: finalText.trim(),
            timestamp: formatTimestamp(new Date()),
            elapsed: Math.floor((Date.now() - startTimeRef.current) / 1000),
            speaker: speakerName,
          },
        ]);
        setInterim("");
      } else {
        setInterim(interimText);
      }
    };

    recognition.onerror = (e) => {
      if (e.error === "not-allowed") {
        setError("Microphone permission denied. Please allow microphone access and try again.");
        setIsListening(false);
        stopTimer();
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(`Recognition error: ${e.error}`);
      }
    };

    recognition.onend = () => {
      // auto-restart unless paused or stopped
      if (isListening && !isPaused) {
        try { recognition.start(); } catch (_) {}
      }
    };

    recognition.start();
  }, [speakerName, isListening, isPaused, stopTimer]);

  const handleStart = () => {
    if (!supported) return;
    setError("");
    setSaved(false);
    setIsListening(true);
    setIsPaused(false);
    pausedAtRef.current = 0;
    setElapsed(0);
    startTimer();
    startRecognition();
  };

  const handlePause = () => {
    setIsPaused(true);
    stopTimer();
    setInterim("");
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
  };

  const handleResume = () => {
    setIsPaused(false);
    startTimer();
    startRecognition();
  };

  const handleStop = () => {
    setIsListening(false);
    setIsPaused(false);
    setInterim("");
    stopTimer();
    stopRecognition();
  };

  const handleClear = () => {
    setLines([]);
    setInterim("");
    setElapsed(0);
    pausedAtRef.current = 0;
    setSaved(false);
  };

  // ── save transcript to meeting ──
  const handleSave = async () => {
    if (lines.length === 0) return;
    if (!meetingId) {
      setNewMeetingTitle(
        `Live Meeting - ${new Date().toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`
      );
      setShowNewMeetingModal(true);
      return;
    }
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const fullText = lines
        .map((l) => `[${l.timestamp}] ${l.speaker}: ${l.text}`)
        .join("\n");
      await api.post(`/transcriptions/${meetingId}/save-text`, {
        transcript_text: fullText,
        segments: lines,
        duration: elapsed,
        source: "live",
      });
      setSaved(true);
      setSaveSuccessInfo({
        meetingId,
        meetingTitle: meeting?.title || "Meeting",
      });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save transcript.");
    } finally {
      setSaving(false);
    }
  };

  // ── create new meeting on the fly and save transcript ──
  const handleCreateMeetingAndSave = async (e) => {
    e?.preventDefault();
    if (lines.length === 0) {
      setError("No transcript lines to save.");
      return;
    }
    setCreatingMeeting(true);
    setError("");
    try {
      const title =
        newMeetingTitle.trim() ||
        `Live Meeting - ${new Date().toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`;

      const meetingRes = await api.post("/meetings", {
        title,
        meeting_date: new Date().toISOString(),
        status: "in-progress",
      });
      const created = meetingRes.data?.meeting || meetingRes.data;
      const newId = created.id;
      setMeetings((prev) => [created, ...prev]);
      setMeetingId(String(newId));
      setMeeting(created);

      const fullText = lines
        .map((l) => `[${l.timestamp}] ${l.speaker}: ${l.text}`)
        .join("\n");
      await api.post(`/transcriptions/${newId}/save-text`, {
        transcript_text: fullText,
        segments: lines,
        duration: elapsed,
        source: "live",
      });

      setSaved(true);
      setSaveSuccessInfo({
        meetingId: newId,
        meetingTitle: created.title || title,
      });
      setShowNewMeetingModal(false);
      setNewMeetingTitle("");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Failed to create meeting and save transcript."
      );
    } finally {
      setCreatingMeeting(false);
    }
  };

  const handleCopy = () => {
    const text = lines.map((l) => `[${l.timestamp}] ${l.speaker}: ${l.text}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {}).catch(() => {});
  };

  // ── filtered lines ──
  const filtered = search
    ? lines.filter((l) => l.text.toLowerCase().includes(search.toLowerCase()))
    : lines;

  const wordCount = lines.reduce((acc, l) => acc + l.text.split(/\s+/).length, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Mic className="w-6 h-6 text-purple-400" />
              Live Transcription
              {isListening && !isPaused && (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-400 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  LIVE
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Real-time speech-to-text with timestamped transcript
            </p>
          </div>

          {/* Timer */}
          <div className="text-3xl font-mono font-bold text-purple-400 tabular-nums">
            {formatTime(elapsed)}
          </div>
        </div>

        {/* ── Saved Success banner ── */}
        {saved && saveSuccessInfo && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-emerald-950/20">
            <div className="flex items-center gap-2.5">
              <Check className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-semibold text-white">Transcript saved successfully!</p>
                <p className="text-xs text-emerald-300/90 mt-0.5">
                  Attached to meeting: <strong>{saveSuccessInfo.meetingTitle}</strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to={`/meetings/${saveSuccessInfo.meetingId}`}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition inline-flex items-center gap-1.5 shadow"
              >
                <span>Open Meeting Details</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* ── Error banner ── */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </span>
            <button onClick={() => setError("")} className="ml-4 text-red-300 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Not supported ── */}
        {!supported && (
          <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <strong>Browser not supported.</strong> Live transcription requires Chrome, Edge, or Safari.
              Consider uploading an audio recording for Whisper-based transcription instead.
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          {/* ── Left: controls ── */}
          <div className="lg:col-span-1 space-y-4">

            {/* Meeting selector */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Target Meeting</h3>
                <button
                  type="button"
                  onClick={() => {
                    setNewMeetingTitle(
                      `Live Meeting - ${new Date().toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    );
                    setShowNewMeetingModal(true);
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 font-semibold inline-flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Meeting</span>
                </button>
              </div>
              <select
                value={meetingId}
                onChange={(e) => {
                  setMeetingId(e.target.value);
                  const m = meetings.find((m) => String(m.id) === e.target.value);
                  setMeeting(m || null);
                  setSaved(false);
                  setSaveSuccessInfo(null);
                }}
                disabled={isListening}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              >
                <option value="">— Select a meeting to attach —</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
              {meeting && (
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  {meeting.status === "in-progress" ? (
                    <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                  ) : (
                    <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  )}
                  {meeting.status === "in-progress" ? "In progress" : (meeting.meeting_date ? new Date(meeting.meeting_date).toLocaleDateString() : "No date")}
                </p>
              )}
            </div>

            {/* Speaker */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Speaker</h3>
                <button
                  onClick={() => setShowSpeakerInput((v) => !v)}
                  className="text-xs text-purple-400 hover:underline"
                >
                  {showSpeakerInput ? "Done" : "Edit"}
                </button>
              </div>
              {showSpeakerInput ? (
                <input
                  type="text"
                  value={speakerName}
                  onChange={(e) => setSpeakerName(e.target.value || "Me")}
                  placeholder="Your name"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-sm font-bold text-purple-300">
                    {speakerName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-white font-medium">{speakerName}</span>
                </div>
              )}
              <p className="text-xs text-gray-500">Speaker label shown on each transcribed line.</p>
            </div>

            {/* Controls */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Controls</h3>

              {!isListening ? (
                <button
                  onClick={handleStart}
                  disabled={!supported}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white px-4 py-3 rounded-xl font-semibold text-sm transition"
                >
                  <Mic className="w-4 h-4" /> Start Recording
                </button>
              ) : (
                <div className="space-y-2">
                  {isPaused ? (
                    <button
                      onClick={handleResume}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl font-semibold text-sm transition"
                    >
                      <Play className="w-4 h-4" /> Resume
                    </button>
                  ) : (
                    <button
                      onClick={handlePause}
                      className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-3 rounded-xl font-semibold text-sm transition"
                    >
                      <Pause className="w-4 h-4" /> Pause
                    </button>
                  )}
                  <button
                    onClick={handleStop}
                    className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-xl font-semibold text-sm transition"
                  >
                    <Square className="w-4 h-4" /> Stop
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleCopy}
                  disabled={lines.length === 0}
                  className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-xs font-medium transition"
                >
                  <Clipboard className="w-3.5 h-3.5" /> Copy
                </button>
                <button
                  onClick={handleClear}
                  disabled={lines.length === 0 && !interim}
                  className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-xs font-medium transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
              </div>

              <button
                onClick={handleSave}
                disabled={lines.length === 0 || saving}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition shadow-lg shadow-purple-600/20"
              >
                {saving ? (
                  "Saving…"
                ) : saved ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" /> Saved to Meeting!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{meetingId ? "Save to Meeting" : "Save to Meeting (Choose or Create)"}</span>
                  </>
                )}
              </button>

              {meetingId && (
                <Link
                  to={`/meetings/${meetingId}`}
                  className="block text-center text-xs text-purple-400 hover:underline mt-1 font-medium"
                >
                  Open meeting details →
                </Link>
              )}
            </div>

            {/* Stats */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Lines</span>
                  <span className="text-white font-semibold">{lines.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Words</span>
                  <span className="text-white font-semibold">{wordCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Duration</span>
                  <span className="text-white font-semibold">{formatTime(elapsed)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">WPM</span>
                  <span className="text-white font-semibold">
                    {elapsed > 10 ? Math.round((wordCount / elapsed) * 60) : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: live transcript ── */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search transcript…"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Transcript area */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl flex-1 min-h-[400px] max-h-[60vh] overflow-y-auto p-5 space-y-3 scroll-smooth">

              {/* Empty state */}
              {lines.length === 0 && !interim && !isListening && (
                <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4">
                    <Mic className="w-6 h-6" />
                  </div>
                  <p className="text-lg font-medium text-gray-400">Ready to transcribe</p>
                  <p className="text-sm mt-1">Select a meeting and click <strong>Start Recording</strong></p>
                  <p className="text-xs mt-3 text-gray-600">Requires Chrome, Edge, or Safari with microphone access</p>
                </div>
              )}

              {/* Filtered lines */}
              {filtered.map((line) => (
                <div key={line.id} className="flex gap-3 group">
                  <div className="shrink-0 mt-0.5">
                    <div className="w-7 h-7 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-300">
                      {line.speaker.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-purple-300">{line.speaker}</span>
                      <span className="text-xs text-gray-500">{line.timestamp}</span>
                      <span className="text-xs text-gray-600 font-mono">[{formatTime(line.elapsed)}]</span>
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed">
                      {hl(line.text, search)}
                    </p>
                  </div>
                </div>
              ))}

              {/* Search no results */}
              {search && filtered.length === 0 && lines.length > 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No results for "<strong>{search}</strong>"
                </p>
              )}

              {/* Live interim caption */}
              {interim && (
                <div className="flex gap-3 opacity-60">
                  <div className="shrink-0 mt-0.5">
                    <div className="w-7 h-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-gray-400">
                      {speakerName.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-gray-400">{speakerName}</span>
                      <span className="text-xs text-gray-600 italic">transcribing…</span>
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed italic">{interim}</p>
                  </div>
                </div>
              )}

              {/* Live pulsing indicator */}
              {isListening && !isPaused && (
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                  Listening…
                </div>
              )}

              {isPaused && (
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Paused — click Resume to continue
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Live caption bar */}
            {isListening && (
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-300 min-h-[48px] flex items-center">
                {interim ? (
                  <span className="italic text-white">{interim}</span>
                ) : (
                  <span className="text-gray-500">Live captions will appear here…</span>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Quick Create / Select Meeting Modal ── */}
      {showNewMeetingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <span>Save Transcript to Meeting</span>
              </h3>
              <button
                onClick={() => setShowNewMeetingModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Select an existing meeting or create a new one to save your live transcript.
            </p>

            {/* Existing meetings selection */}
            {meetings.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300">Choose existing meeting:</label>
                <select
                  value={meetingId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setMeetingId(id);
                    const m = meetings.find((item) => String(item.id) === id);
                    setMeeting(m || null);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">— Select an existing meeting —</option>
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
                {meetingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewMeetingModal(false);
                      handleSave();
                    }}
                    disabled={saving}
                    className="w-full mt-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save to Selected Meeting</span>
                  </button>
                )}
              </div>
            )}

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800" />
              <span className="flex-shrink mx-2 text-[11px] text-gray-500 uppercase tracking-wider">or create new</span>
              <div className="flex-grow border-t border-slate-800" />
            </div>

            {/* Quick create new meeting form */}
            <form onSubmit={handleCreateMeetingAndSave} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-300">New meeting title:</label>
                <input
                  type="text"
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  placeholder="e.g. Product Review & Sync"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 mt-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewMeetingModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingMeeting}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{creatingMeeting ? "Creating & Saving…" : "Create & Save Transcript"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
