import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Clipboard,
  ClipboardList,
  Compass,
  Download,
  HelpCircle,
  Hourglass,
  Lightbulb,
  Mail,
  Mic,
  Rocket,
  RotateCcw,
  Scale,
  Sparkles,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import summaryService, { DEFAULT_MODEL } from "../services/summaryService";

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

const SUMMARY_TEMPLATES = [
  { id: "general", label: "General Meeting", icon: ClipboardList },
  { id: "standup", label: "Daily Standup", icon: Zap },
  { id: "sprint_review", label: "Sprint / Product Review", icon: Rocket },
  { id: "client_discovery", label: "Client Discovery / Sales", icon: Briefcase },
  { id: "retrospective", label: "Team Retrospective", icon: RotateCcw },
  { id: "one_on_one", label: "1-on-1 Sync", icon: Users },
];

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
  const [template, setTemplate] = useState("general");
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [itemError, setItemError] = useState("");
  const [copied, setCopied] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState(null);

  // Follow-up email modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailData, setEmailData] = useState({ subject: "", email_body: "" });
  const [emailCopied, setEmailCopied] = useState(false);

  // Export modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportContent, setExportContent] = useState("");

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
      if (summaryData.summary?.template) {
        setTemplate(summaryData.summary.template);
      }
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
      const data = await summaryService.generateSummary(meetingId, model, template);
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
    ];

    if ((summary.problems_identified || []).length > 0) {
      lines.push("PROBLEMS & RISKS IDENTIFIED");
      summary.problems_identified.forEach((p) => lines.push(`- [Risk] ${p}`));
      lines.push("");
    }

    if ((summary.important_questions || []).length > 0) {
      lines.push("OPEN QUESTIONS");
      summary.important_questions.forEach((q) => lines.push(`- [Question] ${q}`));
      lines.push("");
    }

    lines.push("ACTION ITEMS");
    if ((summary.action_items || []).length === 0) {
      lines.push("No action items assigned.");
    } else {
      summary.action_items.forEach((item) => {
        lines.push(
          `- [${item.status === "completed" ? "x" : " "}] ${item.task} (Owner: ${item.assignee || "Unassigned"}, Due: ${item.due_date || "Not set"}, Priority: ${item.priority || "medium"})`
        );
      });
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy notes to clipboard.");
    }
  };

  const handleOpenFollowUpEmail = async () => {
    setEmailModalOpen(true);
    setEmailLoading(true);
    try {
      const res = await summaryService.generateFollowUpEmail(meetingId, model);
      setEmailData({ subject: res.subject, email_body: res.email_body });
    } catch (err) {
      setEmailData({
        subject: "Meeting Follow-up",
        email_body: "Could not generate email draft automatically. Please ensure notes are generated.",
      });
    } finally {
      setEmailLoading(false);
    }
  };

  const handleOpenExport = async () => {
    setExportModalOpen(true);
    setExportLoading(true);
    try {
      const res = await summaryService.exportMeetingNotes(meetingId);
      setExportContent(res.markdown || "");
    } catch (err) {
      setExportContent("Failed to export notes.");
    } finally {
      setExportLoading(false);
    }
  };

  const downloadFile = (content, filename, type = "text/markdown") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 text-center">
        <Hourglass className="animate-spin text-purple-400 w-8 h-8" />
        <p className="text-sm text-gray-400">Loading AI meeting intelligence…</p>
      </div>
    );
  }

  const isBusy = generating || summary?.status === "generating";
  const hasContent = Boolean(
    summary &&
      summary.status === "completed" &&
      (summary.summary_text || (summary.key_points && summary.key_points.length > 0))
  );

  const actionItems = summary?.action_items || [];
  const completedCount = actionItems.filter((i) => i.status === "completed").length;
  const progress = actionItems.length ? (completedCount / actionItems.length) * 100 : 0;

  const statusPill = isBusy
    ? { label: "Thinking…", className: "bg-purple-500/10 text-purple-300 border-purple-500/30" }
    : summary?.status === "completed"
    ? { label: "Ready", className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" }
    : summary?.status === "failed"
    ? { label: "Failed", className: "bg-red-500/10 text-red-300 border-red-500/30" }
    : { label: "Not generated", className: "bg-gray-500/10 text-gray-400 border-gray-500/30" };

  return (
    <div className="space-y-6">
      {/* Header controls & template picker */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                <Brain className="w-6 h-6 text-purple-400" />
                <span>Smart AI Meeting Notes</span>
              </h3>
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold inline-flex items-center gap-1.5 ${statusPill.className}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {statusPill.label}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-2 max-w-xl leading-relaxed">
              Auto-extracts executive summary, discussion topics, key decisions, blockers, open questions, and tasks.
            </p>

            {/* Template selector pills */}
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider mr-1">
                Template:
              </span>
              {SUMMARY_TEMPLATES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTemplate(id)}
                  disabled={isBusy}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    template === id
                      ? "bg-purple-600/30 text-purple-300 border border-purple-500/50 shadow-sm"
                      : "bg-slate-800/80 text-gray-400 hover:text-white hover:bg-slate-800 border border-slate-700/60"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
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
                  {m.name} {m.parameter_size ? ` · ${m.parameter_size}` : ""}
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
                  <Hourglass className="animate-spin text-current w-4 h-4" />
                  <span>Analyzing transcript…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{summary ? "Regenerate Notes" : "Generate Notes"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Ollama not reachable */}
      {health.running === false && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 sm:p-6">
          <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Ollama is not reachable
          </h4>
          <p className="text-sm text-amber-200/80 mt-1">{health.error}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono text-amber-100">
            <code className="bg-slate-950/60 border border-amber-500/20 rounded px-2 py-1">ollama serve</code>
            <code className="bg-slate-950/60 border border-amber-500/20 rounded px-2 py-1">ollama pull {DEFAULT_MODEL}</code>
          </div>
          <button
            onClick={refreshHealth}
            className="mt-3 text-xs font-semibold text-amber-300 hover:text-amber-200 underline block"
          >
            Retry connection
          </button>
        </div>
      )}

      {/* No transcript yet */}
      {!hasTranscript && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mx-auto mb-4">
            <Mic className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-bold text-white">Transcript required first</h4>
          <p className="text-gray-400 text-sm max-w-md mx-auto mt-2 mb-6">
            MeetMind AI analyzes your meeting transcript. Record or transcribe this meeting's audio first.
          </p>
          <button
            onClick={onGoToTranscript}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition inline-flex items-center gap-2"
          >
            <span>Go to Transcript</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Generating progress indicator */}
      {isBusy && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-8 text-center animate-pulse">
          <Hourglass className="animate-spin text-purple-400 w-8 h-8 mx-auto" />
          <h4 className="text-base font-bold text-white mt-3">Synthesizing Meeting Notes…</h4>
          <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
            {model} is analyzing the transcript for decisions, blockers, open questions, and action items.
          </p>
          <p className="text-xs font-mono text-purple-300 mt-4">{elapsed}s elapsed</p>
        </div>
      )}

      {/* Content */}
      {!isBusy && hasContent && (
        <>
          {/* Action buttons toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400 bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-purple-300 font-medium flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-purple-400" />
                {summary.model_used}
              </span>
              {summary.template && (
                <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[11px] uppercase">
                  {summary.template}
                </span>
              )}
              <span>Generated {formatDate(summary.updated_at || summary.created_at)}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenFollowUpEmail}
                className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" /> Email Draft
              </button>
              <button
                onClick={handleOpenExport}
                className="bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              <button
                onClick={handleCopy}
                className="bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy Notes"}
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
              icon={<Compass className="w-5 h-5 text-purple-400" />}
              title="Executive Summary"
              subtitle="High-level synthesis of what was discussed and achieved"
            />
            <p className="text-gray-200 leading-relaxed text-[15px] whitespace-pre-wrap">
              {summary.summary_text || "No overview was returned by the model."}
            </p>
          </section>

          {/* Key Discussion Points & Decisions Made */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Key points */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <SectionHeading icon={<Lightbulb className="w-5 h-5 text-amber-400" />} title="Key Discussion Points" />
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
              <SectionHeading icon={<Scale className="w-5 h-5 text-emerald-400" />} title="Decisions Made" />
              {(summary.decisions || []).length === 0 ? (
                <p className="text-sm text-gray-500">No explicit decisions were recorded in this meeting.</p>
              ) : (
                <ul className="space-y-3">
                  {summary.decisions.map((decision, index) => (
                    <li key={`${index}-${decision}`} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      <p className="text-sm text-gray-200 leading-relaxed">{decision}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Problems Identified & Open Questions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Problems & Risks */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <SectionHeading
                icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
                title="Problems & Risks Identified"
                subtitle="Blockers, technical debt, and unresolved friction"
              />
              {(summary.problems_identified || []).length === 0 ? (
                <p className="text-sm text-gray-500">No blockers or risks were detected.</p>
              ) : (
                <ul className="space-y-3">
                  {summary.problems_identified.map((prob, index) => (
                    <li key={`${index}-${prob}`} className="flex items-start gap-3 p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15">
                      <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-sm text-gray-200 leading-relaxed">{prob}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Important Questions */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <SectionHeading
                icon={<HelpCircle className="w-5 h-5 text-sky-400" />}
                title="Important Open Questions"
                subtitle="Inquiries needing answers or follow-up"
              />
              {(summary.important_questions || []).length === 0 ? (
                <p className="text-sm text-gray-500">No unresolved open questions were flagged.</p>
              ) : (
                <ul className="space-y-3">
                  {summary.important_questions.map((q, index) => (
                    <li key={`${index}-${q}`} className="flex items-start gap-3 p-2.5 rounded-xl bg-sky-500/5 border border-sky-500/15">
                      <HelpCircle className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                      <p className="text-sm text-gray-200 leading-relaxed">{q}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Action Items */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <SectionHeading
                icon={<CheckCircle2 className="text-emerald-400 w-5 h-5" />}
                title="Smart Action Tracker"
                subtitle="Tasks extracted with assignees, deadlines, and urgency priorities"
              />
              {actionItems.length > 0 && (
                <span className="text-xs font-semibold text-gray-400 whitespace-nowrap">
                  {completedCount} of {actionItems.length} completed
                </span>
              )}
            </div>

            {actionItems.length === 0 ? (
              <p className="text-sm text-gray-500">No action items were found in this meeting.</p>
            ) : (
              <>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden mb-5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <ul className="space-y-2.5">
                  {actionItems.map((item) => {
                    const isCompleted = item.status === "completed";
                    const priorityStyle = {
                      urgent: "border-red-500/30 text-red-400 bg-red-500/10",
                      high: "border-amber-500/30 text-amber-400 bg-amber-500/10",
                      medium: "border-purple-500/30 text-purple-400 bg-purple-500/10",
                      low: "border-gray-700 text-gray-400 bg-slate-800",
                    }[(item.priority || "medium").toLowerCase()] || "border-gray-700 text-gray-400 bg-slate-800";

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
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition disabled:opacity-50 ${
                            isCompleted
                              ? "bg-emerald-500 border-emerald-500 text-slate-950"
                              : "border-slate-600 text-transparent hover:border-emerald-400"
                          }`}
                        >
                          <Check className="w-3 h-3" />
                        </button>

                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm leading-relaxed ${
                              isCompleted ? "text-gray-500 line-through" : "text-gray-100 font-medium"
                            }`}
                          >
                            {item.task}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-gray-300 flex items-center gap-1">
                              <User className="w-3 h-3 text-purple-400" /> {item.assignee || "Unassigned"}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-gray-300 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-purple-400" /> {item.due_date || "No deadline"}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full border font-semibold uppercase text-[10px] ${priorityStyle}`}>
                              {item.priority || "medium"}
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

                {itemError && <p className="text-xs text-red-400 mt-3">{itemError}</p>}
              </>
            )}
          </section>
        </>
      )}

      {/* Follow-up Email Modal */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-white text-lg">Follow-up Email Generator</h3>
              </div>
              <button
                onClick={() => setEmailModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {emailLoading ? (
                <div className="py-16 text-center space-y-3">
                  <Hourglass className="w-8 h-8 animate-spin text-purple-400 mx-auto" />
                  <p className="text-sm text-gray-400">Crafting follow-up email from meeting notes…</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={emailData.subject}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                      Email Body
                    </label>
                    <textarea
                      readOnly
                      rows={14}
                      value={emailData.email_body}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-gray-200 font-sans leading-relaxed resize-none focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500">Ready to send to meeting participants</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`Subject: ${emailData.subject}\n\n${emailData.email_body}`);
                    setEmailCopied(true);
                    setTimeout(() => setEmailCopied(false), 2000);
                  }}
                  disabled={emailLoading}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {emailCopied ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
                  {emailCopied ? "Copied!" : "Copy Email"}
                </button>
                <button
                  onClick={() => setEmailModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-gray-300 px-4 py-2 rounded-xl text-xs font-semibold transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Notes Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-white text-lg">Export Meeting Intelligence</h3>
              </div>
              <button
                onClick={() => setExportModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto">
              {exportLoading ? (
                <div className="py-16 text-center space-y-3">
                  <Hourglass className="w-8 h-8 animate-spin text-purple-400 mx-auto" />
                  <p className="text-sm text-gray-400">Preparing export bundle…</p>
                </div>
              ) : (
                <textarea
                  readOnly
                  rows={14}
                  value={exportContent}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-gray-300 font-mono leading-relaxed resize-none focus:outline-none"
                />
              )}
            </div>

            <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500">Supports Markdown, Text, and Notion/Obsidian import</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadFile(exportContent, `meeting-${meetingId}-notes.md`, "text/markdown")}
                  disabled={exportLoading}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Download className="w-4 h-4" /> Download .md
                </button>
                <button
                  onClick={() => downloadFile(exportContent, `meeting-${meetingId}-notes.txt`, "text/plain")}
                  disabled={exportLoading}
                  className="bg-slate-800 hover:bg-slate-700 text-gray-300 px-4 py-2 rounded-xl text-xs font-semibold transition"
                >
                  Download .txt
                </button>
                <button
                  onClick={() => setExportModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-gray-300 px-4 py-2 rounded-xl text-xs font-semibold transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AISummaryPanel;
