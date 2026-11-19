import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { chatWithMeetings } from "../services/aiChatService";
import summaryService from "../services/summaryService";
import Navbar from "../components/Navbar";

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export default function AIChatPage() {
  const [meetings, setMeetings] = useState([]);
  const [meetingSearch, setMeetingSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [allSelected, setAllSelected] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    api.get("/meetings").then((res) => {
      setMeetings(res.data.meetings || []);
    }).catch(() => {});

    summaryService.checkOllamaHealth().then((data) => {
      const available = data.models || [];
      setModels(available);
      if (available.length > 0) setSelectedModel(available[0].name || available[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const toggleAllSelected = () => {
    if (allSelected) {
      setAllSelected(false);
      setSelectedIds([]);
    } else {
      setAllSelected(true);
      setSelectedIds([]);
    }
  };

  const toggleMeeting = (id) => {
    setAllSelected(false);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSend = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setError("");

    const userMsg = { role: "user", content: q, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const meetingIds = allSelected ? [] : selectedIds;
      const data = await chatWithMeetings(q, meetingIds, selectedModel || null);
      const aiMsg = {
        role: "assistant",
        content: data.answer || "No response.",
        sources: data.sources || [],
        model: data.model_used,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || "Failed to get a response.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, allSelected, selectedIds, selectedModel]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredMeetings = meetings.filter((m) =>
    (m.title || "").toLowerCase().includes(meetingSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Navbar />
      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 65px)" }}>
        {/* Sidebar */}
        <aside className="w-72 flex-shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h2 className="font-bold text-white mb-3 text-sm uppercase tracking-wider">Meeting Context</h2>
            <input
              type="search"
              value={meetingSearch}
              onChange={(e) => setMeetingSearch(e.target.value)}
              placeholder="Search meetings…"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {/* All meetings toggle */}
            <label className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAllSelected}
                className="accent-blue-500"
              />
              <span className="text-sm font-semibold text-white">All meetings</span>
            </label>
            {filteredMeetings.map((m) => (
              <label
                key={m.id}
                className={`flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-gray-700 cursor-pointer transition ${
                  allSelected ? "opacity-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={allSelected || selectedIds.includes(m.id)}
                  onChange={() => toggleMeeting(m.id)}
                  disabled={allSelected}
                  className="accent-blue-500 mt-0.5"
                />
                <div>
                  <p className="text-sm text-white leading-snug">{m.title}</p>
                  {m.meeting_date && (
                    <p className="text-xs text-gray-400">
                      {new Date(m.meeting_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </label>
            ))}
            {filteredMeetings.length === 0 && (
              <p className="text-xs text-gray-500 px-2 py-4 text-center">No meetings found</p>
            )}
          </div>

          {/* Model selector */}
          {models.length > 0 && (
            <div className="p-3 border-t border-gray-700">
              <label className="block text-xs text-gray-400 mb-1">AI Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {models.map((m) => {
                  const name = m.name || m;
                  return <option key={name} value={name}>{name}</option>;
                })}
              </select>
            </div>
          )}
        </aside>

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Error banner */}
          {error && (
            <div className="bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm px-4 py-2 flex justify-between items-center">
              {error}
              <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-200">✕</button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-5xl mb-4">🤖</div>
                <h2 className="text-2xl font-bold text-white mb-2">Ask anything about your meetings</h2>
                <p className="text-gray-400 text-sm max-w-sm">
                  Select meetings from the sidebar and ask questions about transcripts, decisions, action items, and more.
                </p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "user" ? (
                  <div className="max-w-[70%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[75%] bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed">
                    <p className="text-gray-100 whitespace-pre-wrap">{msg.content}</p>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-gray-700">
                        <p className="text-xs text-gray-500 mb-1">Sources:</p>
                        <div className="flex flex-wrap gap-1">
                          {msg.sources.map((s) => (
                            <Link
                              key={s.meeting_id}
                              to={`/meetings/${s.meeting_id}`}
                              className="text-xs bg-gray-700 hover:bg-gray-600 text-blue-300 px-2 py-0.5 rounded-full transition"
                            >
                              📋 {s.title}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.model && (
                      <p className="text-xs text-gray-600 mt-2">via {msg.model}</p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-gray-700 p-4 bg-gray-900">
            <div className="flex gap-3 items-end max-w-4xl mx-auto">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your meetings… (Enter to send, Shift+Enter for newline)"
                rows={2}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500 leading-relaxed"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-semibold text-sm transition flex-shrink-0"
              >
                {loading ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
