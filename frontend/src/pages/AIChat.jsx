import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, FileText, Loader2, Mic, Send, Sparkles, Trash2 } from "lucide-react";
import Navbar from "../components/Navbar";
import { chatWithMeetings, getMeetingHistory } from "../services/aiChatService";

function truncate(str, len = 120) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

function formatDate(isoString) {
  if (!isoString) return "Unknown";
  try {
    return new Date(isoString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

export default function AIChatPage() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [selectedMeetingIds, setSelectedMeetingIds] = useState([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const submitRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getMeetingHistory({ page: 1, per_page: 100 });
        setMeetings(res.meetings || []);
      } catch {
        /* ignore - chat still works with empty meeting list */
      }
    };
    load();
  }, []);

  const handleSelect = (id) => {
    setSelectedMeetingIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    const entry = { id: Date.now(), question: q, answer: "", sources: [], model: "", timestamp: new Date().toISOString() };
    setHistory([entry, ...history]);
    setQuestion("");
    try {
      const res = await chatWithMeetings(q, selectedMeetingIds, model || undefined);
      entry.answer = res.answer || "No answer.";
      entry.sources = res.sources || [];
      entry.model = res.model_used || "unknown";
      setHistory([{ ...entry }, ...history.slice(1)]);
      setAnswer(res.answer || "");
      setSources(res.sources || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to get an answer.");
      setHistory(history.map((h) => (h.id === entry.id ? { ...h, answer: "Error: " + (err.response?.data?.message || "Unknown error") } : h)));
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setHistory([]);
    setAnswer("");
    setSources([]);
    setError("");
  };

  const recentMeetings = useMemo(() => {
    return [...meetings].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 10);
  }, [meetings]);

  const isSelected = (id) => selectedMeetingIds.includes(id);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />

      <main className="max-w-6xl mx-auto p-6 sm:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Chat with Meetings</h1>
            <p className="text-gray-400 mt-1">
              Ask questions across your transcripts. Get answers with citations and timestamps.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">Default model</option>
              <option value="llama3.2:3b">Llama 3.2 (3B)</option>
              <option value="llama3.1:8b">Llama 3.1 (8B)</option>
            </select>
            <button
              onClick={clearChat}
              className="text-xs text-gray-400 hover:text-white underline"
            >
              Clear chat
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left: Meeting selector */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">
                Select meetings
              </h3>
              {meetings.length === 0 ? (
                <p className="text-xs text-gray-500">No meetings found. Record or transcribe some first.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {recentMeetings.map((m) => (
                    <label
                      key={m.id}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition hover:bg-slate-800/50 border border-transparent ${isSelected(m.id) ? "border-purple-500/30 bg-purple-500/5" : "border-transparent"}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected(m.id)}
                        onChange={() => handleSelect(m.id)}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm text-white truncate">{m.title}</span>
                        <span className="text-[10px] text-gray-500">{formatDate(m.created_at)}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-3 text-xs text-gray-400">
                {selectedMeetingIds.length} selected • {selectedMeetingIds.length ? "Ask about these meetings" : "Ask about recent meetings"}
              </div>
            </div>
          </div>

          {/* Right: Chat */}
          <div className="lg:col-span-8 flex flex-col h-[600px]">
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 bg-slate-900/30 rounded-xl border border-slate-800 p-4">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Mic className="w-16 h-16 mx-auto text-gray-700 mb-3" />
                  <h3 className="text-white font-semibold">Ask about your meetings</h3>
                  <p className="text-sm text-gray-400 max-w-xs mt-2">
                    Try: "What decisions were made in the last meeting?" or "Who promised to follow up with the client?"
                  </p>
                </div>
              ) : (
                history.map((msg) => (
                  <div key={msg.id} className="flex flex-col gap-2">
                    <div className="flex justify-end">
                      <div className="max-w-[80%] bg-slate-800 border border-slate-700 rounded-2xl p-3 text-right">
                        <p className="text-sm text-gray-300">{msg.question}</p>
                        <span className="text-[10px] text-gray-500 mt-1 block">{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[85%] bg-purple-900/40 border border-purple-500/30 rounded-2xl p-3">
                        {msg.answer ? (
                          <p className="text-sm text-gray-200 whitespace-pre-wrap">{msg.answer}</p>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                          </div>
                        )}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-800/50">
                            <p className="text-xs font-semibold text-purple-400 mb-1">Sources:</p>
                            <div className="flex flex-wrap gap-2">
                              {msg.sources.map((s) => (
                                <span key={s.meeting_id} className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-purple-300">
                                  {s.title}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {msg.model && (
                          <span className="text-[10px] text-gray-500 mt-1 block">Model: {msg.model}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              {loading && history.length > 0 && !history[0].answer && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] bg-purple-900/40 border border-purple-500/30 rounded-2xl p-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="w-3 h-3 animate-spin" /> Generating answer…
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleAsk} className="mt-3 flex gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800">
              <input
                ref={submitRef}
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about your meetings…"
                disabled={loading}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="hidden sm:inline">{loading ? "Thinking…" : "Ask"}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Tips */}
        <div className="bg-gradient-to-r from-purple-900/20 to-slate-900 border border-purple-500/20 rounded-2xl p-4">
          <h3 className="text-xs uppercase tracking-wider text-purple-400 font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Example questions
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <button
              onClick={() => setQuestion("What were the key decisions in my last meeting?")}
              className="text-left p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white transition text-xs"
            >
              Key decisions in last meeting
            </button>
            <button
              onClick={() => setQuestion("Who said they would send the follow-up email?")}
              className="text-left p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white transition text-xs"
            >
              Who promised follow-up?
            </button>
            <button
              onClick={() => setQuestion("What are the top 3 risks mentioned this week?")}
              className="text-left p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white transition text-xs"
            >
              Top risks this week
            </button>
            <button
              onClick={() => setQuestion("Summarize the project kickoff meeting.")}
              className="text-left p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white transition text-xs"
            >
              Summarize kickoff
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
