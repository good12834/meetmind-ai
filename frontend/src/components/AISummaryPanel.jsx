import { useEffect, useState } from "react";
import { Hourglass, Sparkles, Clipboard, Calendar, Check } from "lucide-react";
import summaryService, { DEFAULT_MODEL } from "../services/summaryService";

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

function formatDate(isoString) {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function SectionHeading({ icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span className="text-xl leading-none">{icon}</span>
      <div>
        <h4 className="text-base font-bold text-white">{title}</h4>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function AISummaryPanel({ meetingId, hasTranscript, onGoToTranscript }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState({
    running: null,
    models: [],
    default_model: DEFAULT_MODEL,
    error: "",
  });
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [itemError, setItemError] = useState("");
  const [copied, setCopied] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState(null);

  const localModels = (health.models || []).filter((m) => !m.is_cloud);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [summaryData, healthData] = await Promise.all([
        summaryService.getMeetingSummary(meetingId).catch((err) => {
          if (!cancelled) {
            setError(
              err.response?.data?.message || "Could not load the saved summary."
            );
          }
          return { summary: null };
        }),
        summaryService.checkOllamaHealth(),
      ]);

      if (cancelled) return;

      setSummary(summaryData.summary || null);
      setHealth(healthData);

      const installed = (healthData.models || [])
        .filter((m) => !m.is_cloud)
        .map((m) => m.name);
      if (installed.length > 0) {
        if (installed.includes(DEFAULT_MODEL)) setModel(DEFAULT_MODEL);
        else if (healthData.default_model && installed.includes(healthData.default_model)) {
          setModel(healthData.default_model);
        } else {
          setModel(installed[0]);
        }
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  useEffect(() => {
    if (!generating) return undefined;
    const timer = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [generating]);

  const refreshHealth = async () => {
    const healthData = await summaryService.checkOllamaHealth();
    setHealth(healthData);
    const installed = (healthData.models || [])
      .filter((m) => !m.is_cloud)
      .map((m) => m.name);
    if (installed.length > 0 && !installed.includes(model)) {
      setModel(installed.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : installed[0]);
    }
  };

  const handleGenerate = async () => {
    if (generating || !hasTranscript) return;

    setElapsed(0);
    setGenerating(true);
    setError("");
    setItemError("");

    try {
      const data = await summaryService.generateSummary(meetingId, model);
      setSummary(data.summary);
    } catch (err) {
      const data = err.response?.data;
      if (data?.summary) setSummary(data.summary);
      setError(
        data?.message ||
          "Summary generation failed. Check that Ollama is running and try again."
      );
      if (err.response?.status === 503) refreshHealth();
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleActionItem = async (item) => {
    const nextStatus = item.status === "completed" ? "pending" : "completed";
    const previousItems = summary.action_items;
    setItemError("");
    setUpdatingItemId(item.id);

    setSummary((prev) => ({
      ...prev,
      action_items: prev.action_items.map((current) =>
        current.id === item.id ? { ...current, status: nextStatus } : current
      ),
    }));

    try {
      const data = await summaryService.updateActionItem(item.id, {
        status: nextStatus,
      });
      setSummary((prev) => ({
        ...prev,
        action_items: prev.action_items.map((current) =>
          current.id === item.id ? data.action_item : current
        ),
      }));
    } catch (err) {
      setSummary((prev) => ({ ...prev, action_items: previousItems }));
      setItemError(
        err.response?.data?.message || "Could not update that task. Please try again."
      );
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleDelete = async () => {
    if (!summary || !window.confirm("Delete this AI summary and its action items?")) {
      return;
    }
    try {
      await summaryService.deleteSummary(summary.id);
      setSummary(null);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete the summary.");
    }
  };

  const handleCopy = async () => {
    if (!summary) return;

    const lines = [
      `AI Meeting Summary (${summary.model_used})`,
      "",
      "OVERVIEW",
      summary.summary_text || "—",
      "",
      "KEY DISCUSSION POINTS",
      ...(summary.key_points || []).map((point, index) => `${index + 1}. ${point}`),
      "",
      "DECISIONS",
      ...(summary.decisions || []).map((decision) => `- ${decision}`),
      "",
      "ACTION ITEMS",
      ...(summary.action_items || []).map(
        (item) =>
          `- [${item.status === "completed" ? "x" : " "}] ${item.task} — ${item.assignee} (due: ${item.due_date})`
      ),
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setItemError("Could not copy to the clipboard.");
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-gray-400">
        Loading AI summary...
      </div>
    );
  }

  const actionItems = summary?.action_items || [];
  const completedCount = actionItems.filter((item) => item.status === "completed").length;
  const progress = actionItems.length
    ? Math.round((completedCount / actionItems.length) * 100)
    : 0;
  const isBusy = generating || summary?.status === "generating";
  const hasContent =
    summary && (summary.summary_text || (summary.key_points || []).length > 0);

  const statusPill = (() => {
    if (health.running === null) {
      return { label: "Checking Ollama…", className: "bg-slate-500/10 text-gray-400 border-slate-500/20" };
    }
    if (!health.running) {
      return { label: "Ollama offline", className: "bg-red-500/10 text-red-400 border-red-500/20" };
    }
    if (localModels.length === 0) {
      return { label: "No local model", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
    }
    return { label: "Ollama connected", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-2xl font-bold text-white">AI Meeting Notes</h3>
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold ${statusPill.className}`}
              >
                ● {statusPill.label}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-2 max-w-xl leading-relaxed">
              Summary, key points, decisions and action items generated locally with
              Ollama — your transcript never leaves this computer.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isBusy || localModels.length === 0}
              className="bg-slate-900 border border-slate-700 text-xs rounded-xl px-3 py-2 text-gray-300 focus:outline-none focus:border-purple-500 disabled:opacity-50"
              title="Ollama model"
            >
              {localModels.length === 0 && (
                <option value={DEFAULT_MODEL}>{DEFAULT_MODEL} (not installed)</option>
              )}
              {localModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                  {m.parameter_size ? ` · ${m.parameter_size}` : ""}
                </option>
              ))}
            </select>

            <button
              onClick={handleGenerate}
              disabled={isBusy || !hasTranscript || !health.running || localModels.length === 0}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-purple-600/20 transition"
            >
              {isBusy ? (
                <>
                  <Hourglass className="animate-spin text-current" />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <Sparkles />
                  <span>{summary ? "Regenerate Summary" : "Generate Summary"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Ollama not reachable */}
      {health.running === false && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 sm:p-6">
          <h4 className="text-sm font-bold text-amber-300">Ollama is not reachable</h4>
          <p className="text-sm text-amber-200/80 mt-1">{health.error}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono text-amber-100">
            <code className="bg-slate-950/60 border border-amber-500/20 rounded px-2 py-1">
              ollama serve
            </code>
            <code className="bg-slate-950/60 border border-amber-500/20 rounded px-2 py-1">
              ollama pull {DEFAULT_MODEL}
            </code>
          </div>
          <button
            onClick={refreshHealth}
            className="mt-3 text-xs font-semibold text-amber-300 hover:text-amber-200 underline"
          >
            Retry connection
          </button>
        </div>
      )}

      {/* Ollama running but empty */}
      {health.running === true && localModels.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 sm:p-6">
          <h4 className="text-sm font-bold text-amber-300">No local model installed</h4>
          <p className="text-sm text-amber-200/80 mt-1">
            Download a model once, then generate summaries offline:
          </p>
          <code className="inline-block mt-3 text-[11px] font-mono bg-slate-950/60 border border-amber-500/20 rounded px-2 py-1 text-amber-100">
            ollama pull {DEFAULT_MODEL}
          </code>
          <button
            onClick={refreshHealth}
            className="ml-3 text-xs font-semibold text-amber-300 hover:text-amber-200 underline"
          >
            Refresh models
          </button>
        </div>
      )}

      {/* No transcript yet */}
      {!hasTranscript && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3"><File className="text-4xl" /></div>
          <h4 className="text-lg font-bold text-white">Transcript required first</h4>
          <p className="text-gray-400 text-sm max-w-md mx-auto mt-2 mb-6">
            MeetMind AI summarises the Whisper transcript. Transcribe this meeting&apos;s
            audio and come back to generate the notes.
          </p>
          <button
            onClick={onGoToTranscript}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition"
          >
            Go to Transcript →
          </button>
        </div>
      )}

      {/* Error from generation */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Generating */}
      {isBusy && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3 animate-pulse">🧠</div>
          <h4 className="text-lg font-bold text-white">
            Reading the transcript and taking notes
          </h4>
          <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
            {model} is running locally. This usually takes 20–90 seconds depending on
            transcript length and your hardware.
          </p>
          <p className="text-xs font-mono text-purple-300 mt-4">
            {elapsed}s elapsed
          </p>
        </div>
      )}

      {/* Failed summary with no usable content */}
      {!isBusy && summary?.status === "failed" && !hasContent && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h4 className="text-lg font-bold text-white">Summary generation failed</h4>
          <p className="text-sm text-gray-400 mt-2 max-w-lg mx-auto">
            {summary.error_message || "The AI model could not process this transcript."}
          </p>
        </div>
      )}

      {/* Content */}
      {!isBusy && hasContent && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-gray-300 font-medium">
                🤖 {summary.model_used}
              </span>
              <span>Generated {formatDate(summary.updated_at || summary.created_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
              >
                {copied ? "✓ Copied" : (
                  <>
                    <Clipboard className="text-current" />
                    Copy notes
                  </>
                )}
              </button>
              <button
                onClick={handleDelete}
                className="text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-500/10 transition"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Overview */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8">
            <SectionHeading
              icon="🧭"
              title="Overview"
              subtitle="What happened during this meeting"
            />
            <p className="text-gray-200 leading-relaxed text-[15px] whitespace-pre-wrap">
              {summary.summary_text || "No overview was returned by the model."}
            </p>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Key points */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <SectionHeading icon="💡" title="Key Discussion Points" />
              {(summary.key_points || []).length === 0 ? (
                <p className="text-sm text-gray-500">No key points were extracted.</p>
              ) : (
                <ol className="space-y-3">
                  {summary.key_points.map((point, index) => (
                    <li key={`${index}-${point}`} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/15 border border-purple-500/25 text-[10px] font-bold text-purple-300">
                        {index + 1}
                      </span>
                      <p className="text-sm text-gray-200 leading-relaxed">{point}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Decisions */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <SectionHeading icon="⚖️" title="Decisions" />
              {(summary.decisions || []).length === 0 ? (
                <p className="text-sm text-gray-500">
                  No explicit decisions were recorded in this meeting.
                </p>
              ) : (
                <ul className="space-y-3">
                  {summary.decisions.map((decision, index) => (
                    <li key={`${index}-${decision}`} className="flex items-start gap-3">
                      <span className="mt-0.5 text-emerald-400 text-sm">✓</span>
                      <p className="text-sm text-gray-200 leading-relaxed">{decision}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Action items */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <SectionHeading
                icon={<Check className="text-current" />}
                title="Action Items"
                subtitle="Tick a task once it is done — status is saved to the database"
              />
              {actionItems.length > 0 && (
                <span className="text-xs font-semibold text-gray-400 whitespace-nowrap">
                  {completedCount} of {actionItems.length} completed
                </span>
              )}
            </div>

            {actionItems.length === 0 ? (
              <p className="text-sm text-gray-500">
                No action items were found in this meeting.
              </p>
            ) : (
              <>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden mb-5">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <ul className="space-y-2">
                  {actionItems.map((item) => {
                    const isCompleted = item.status === "completed";
                    return (
                      <li
                        key={item.id}
                        className={`flex items-start gap-3 rounded-xl border p-3.5 transition ${
                          isCompleted
                            ? "bg-emerald-500/5 border-emerald-500/20"
                            : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <button
                          onClick={() => handleToggleActionItem(item)}
                          disabled={updatingItemId === item.id}
                          aria-label={
                            isCompleted ? "Mark task as pending" : "Mark task as completed"
                          }
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition disabled:opacity-50 ${
                            isCompleted
                              ? "bg-emerald-500 border-emerald-500 text-slate-950"
                              : "border-slate-600 text-transparent hover:border-emerald-400"
                          }`}
                        >
                          ✓
                        </button>

                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm leading-relaxed ${
                              isCompleted
                                ? "text-gray-500 line-through"
                                : "text-gray-100"
                            }`}
                          >
                            {item.task}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-gray-300">
                              👤 {item.assignee}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-gray-300">
                              <span><Calendar className="text-current" /> {item.due_date}</span>
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full border font-medium ${
                                isCompleted
                                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                                  : item.status === "in_progress"
                                  ? "bg-amber-500/10 border-amber-500/25 text-amber-400"
                                  : "bg-slate-500/10 border-slate-500/25 text-gray-400"
                              }`}
                            >
                              {STATUS_LABELS[item.status] || "Pending"}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {itemError && (
                  <p className="text-xs text-red-400 mt-3">{itemError}</p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default AISummaryPanel;
