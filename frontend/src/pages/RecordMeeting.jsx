import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Box, Calendar, Check, Clock, FolderUp, Mic, Plus } from "lucide-react";
import api from "../services/api";
import recordingService from "../services/recordingService";
import AudioRecorder from "../components/AudioRecorder";
import AudioUploader from "../components/AudioUploader";

function RecordMeeting() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [meeting, setMeeting] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeMode, setActiveMode] = useState("record"); // "record" | "upload"
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg("");

      // Fetch meeting info
      const meetingRes = await api.get(`/meetings/${id}`);
      setMeeting(meetingRes.data.meeting);

      // Fetch existing recordings for this meeting
      const recRes = await recordingService.getMeetingRecordings(id);
      setRecordings(recRes.recordings || []);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate("/login");
      } else {
        setErrorMsg(err.response?.data?.message || "Failed to load meeting details");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchData();
    } else {
      setErrorMsg("No meeting specified. Please open a meeting first.");
      setLoading(false);
    }
  }, [id]);

  const handleUploadSuccess = (newRecording) => {
    setRecordings((prev) => [newRecording, ...prev]);
    setSuccessMsg("Audio recording successfully uploaded and attached to this meeting!");
    setTimeout(() => {
      setSuccessMsg("");
    }, 6000);
  };

  const handleDeleteRecording = async (recordingId) => {
    if (!window.confirm("Are you sure you want to delete this recording?")) {
      return;
    }

    try {
      await recordingService.deleteRecording(recordingId);
      setRecordings((prev) => prev.filter((r) => r.id !== recordingId));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete recording");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDuration = (totalSeconds) => {
    if (!totalSeconds || isNaN(totalSeconds)) return "00:00";
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const formatDate = (isoString) => {
    if (!isoString) return "";
    try {
      return new Date(isoString).toLocaleDateString("en-US", {
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

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Navbar */}
      <nav className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-8">
          <Link to="/dashboard" className="text-2xl font-bold text-purple-400">
            MeetMind AI
          </Link>
          <div className="hidden sm:flex items-center gap-4 text-sm font-medium">
            <Link to="/dashboard" className="text-gray-400 hover:text-white transition">
              Dashboard
            </Link>
            <Link to="/meetings" className="text-purple-400">
              Meetings
            </Link>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          Logout
        </button>
      </nav>

      <main className="max-w-5xl mx-auto w-full p-6 sm:p-8 flex-1">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link to="/meetings" className="hover:text-white transition">
            Meetings
          </Link>
          <span>/</span>
          {meeting ? (
            <Link to={`/meetings/${meeting.id}`} className="hover:text-white transition line-clamp-1">
              {meeting.title}
            </Link>
          ) : (
            <span>Meeting</span>
          )}
          <span>/</span>
          <span className="text-purple-400 font-medium">Audio Capture & Upload</span>
        </div>

        {/* Global Alerts */}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span><Check className="text-current" /></span>
              <span>{successMsg}</span>
            </div>
            <Link
              to={`/meetings/${id}`}
              className="underline text-emerald-300 hover:text-white text-xs font-semibold ml-4"
            >
              Go to Meeting Details →
            </Link>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-gray-400">Loading meeting audio workspace...</div>
        ) : meeting ? (
          <div className="space-y-8">
            {/* Meeting Header Summary */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-purple-400">
                  Target Meeting
                </span>
                <h1 className="text-2xl font-bold text-white mt-1">{meeting.title}</h1>
                <p className="text-gray-400 text-xs mt-1 flex items-center gap-1.5 flex-wrap">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  <span>{formatDate(meeting.meeting_date || meeting.created_at)}</span>
                  <span>•</span>
                  <span>Status: <span className="capitalize text-gray-300">{meeting.status}</span></span>
                </p>
              </div>

              <Link
                to={`/meetings/${meeting.id}`}
                className="bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white px-4 py-2 rounded-xl text-sm font-semibold transition self-start sm:self-auto flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>View Meeting Details</span>
              </Link>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex border-b border-slate-800">
              <button
                onClick={() => setActiveMode("record")}
                className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm transition border-b-2 ${
                  activeMode === "record"
                    ? "border-purple-500 text-purple-400"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>Record via Browser</span>
              </button>
              <button
                onClick={() => setActiveMode("upload")}
                className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm transition border-b-2 ${
                  activeMode === "upload"
                    ? "border-purple-500 text-purple-400"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                <FolderUp className="w-4 h-4" />
                <span>Upload Audio File</span>
              </button>
            </div>

            {/* Active Component */}
            <div>
              {activeMode === "record" ? (
                <AudioRecorder
                  meetingId={meeting.id}
                  onUploadSuccess={handleUploadSuccess}
                />
              ) : (
                <AudioUploader
                  meetingId={meeting.id}
                  onUploadSuccess={handleUploadSuccess}
                />
              )}
            </div>

            {/* Attached Recordings Section */}
            <div className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">
                  Attached Audio Recordings ({recordings.length})
                </h3>
                {recordings.length > 0 && (
                  <span className="text-xs text-gray-400">
                    Recordings ready for Whisper AI Transcription
                  </span>
                )}
              </div>

              {recordings.length === 0 ? (
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8 text-center text-gray-400">
                  <p>No audio recordings attached to this meeting yet.</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Record audio with your microphone above or upload an MP3/WAV/M4A/WebM file.
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
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-semibold text-white">
                              {recording.original_filename}
                            </span>
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full capitalize bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              {recording.source}
                            </span>
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full capitalize bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {recording.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            {recording.duration > 0 && (
                              <span><Clock className="text-current" /> Duration: {formatDuration(recording.duration)}</span>
                            )}
                            <span>•</span>
                            <span><Box className="text-current" /> Size: {formatFileSize(recording.file_size)}</span>
                            <span>•</span>
                            <span><Calendar className="text-current" /> {formatDate(recording.created_at)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleDeleteRecording(recording.id)}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-3 py-2 rounded-xl transition font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Embedded Audio Stream Player */}
                      <div className="mt-4 pt-3 border-t border-slate-800">
                        <audio
                          controls
                          src={recordingService.getAudioStreamUrl(recording.id)}
                          className="w-full h-10 rounded-lg outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-xl mx-auto">
            <Calendar className="w-12 h-12 mx-auto text-purple-400 mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">No meeting selected</h2>
            <p className="text-gray-400 text-sm mb-6">
              Create a new meeting to get started with recording and transcription.
            </p>
            <Link
              to="/meetings"
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create a new meeting to get started</span>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

export default RecordMeeting;
