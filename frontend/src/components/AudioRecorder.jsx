import { useState, useRef, useEffect } from "react";
import { AlertTriangle, Cloud, Hourglass, Mic, Pause, Play, RotateCcw, Square } from "lucide-react";
import recordingService from "../services/recordingService";

function AudioRecorder({ meetingId, onUploadSuccess, onCancel }) {
  const [recordingState, setRecordingState] = useState("idle"); // "idle" | "recording" | "paused" | "recorded"
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);

  // Supported MIME type detection
  const getSupportedMimeType = () => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/wav",
    ];
    for (const t of types) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return "";
  };

  // Timer effect
  useEffect(() => {
    if (recordingState === "recording") {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [recordingState]);

  // Clean up object URL and stream on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [audioUrl]);

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(mins)}:${pad(secs)}`;
  };

  const startRecording = async () => {
    setErrorMsg("");
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setTimerSeconds(0);
    audioChunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg("Microphone recording is not supported in this browser or environment.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const recordedBlob = new Blob(audioChunksRef.current, {
          type: mimeType || "audio/webm",
        });
        setAudioBlob(recordedBlob);
        const url = URL.createObjectURL(recordedBlob);
        setAudioUrl(url);
        setRecordingState("recorded");

        // Stop all audio hardware tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start(250); // Emit chunk every 250ms
      setRecordingState("recording");
    } catch (err) {
      console.error("Microphone access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErrorMsg("Microphone access was denied. Click below to open your browser settings and enable microphone permissions for this site.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setErrorMsg("No microphone was detected on this device.");
      } else {
        setErrorMsg(`Failed to start recording: ${err.message || err.name}`);
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
      setRecordingState("paused");
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
      setRecordingState("recording");
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      (mediaRecorderRef.current.state === "recording" || mediaRecorderRef.current.state === "paused")
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  const resetRecording = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioBlob(null);
    setTimerSeconds(0);
    setErrorMsg("");
    setRecordingState("idle");
  };

  // Open browser settings for microphone permissions
  const openBrowserSettings = () => {
    // chrome:// and about: URLs cannot be opened from web content (security restriction).
    // Guide the user to manage permissions via the site info icon instead.
    setErrorMsg(
      "Microphone access is blocked by your browser. Click the site information (lock) icon in the address bar, allow microphone permissions for this site, then refresh the page and try recording again."
    );
  };

  const handleUpload = async () => {
    if (!audioBlob) return;
    setIsUploading(true);
    setErrorMsg("");
    setUploadProgress(0);

    try {
      const ext = audioBlob.type.includes("wav") ? "wav" : "webm";
      const fileName = `meeting_${meetingId}_recorded_${Date.now()}.${ext}`;

      const response = await recordingService.uploadRecording(
        {
          file: audioBlob,
          meetingId,
          duration: timerSeconds,
          source: "browser",
          fileName,
        },
        (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        }
      );

      if (onUploadSuccess) {
        onUploadSuccess(response.recording);
      }
      resetRecording();
    } catch (err) {
      console.error("Upload error:", err);
      setErrorMsg(err.response?.data?.message || "Failed to upload recording to server.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center">
      <div className="w-full max-w-md">
        {/* Header Icon & Title */}
        <div className="mb-4">
          <div className="w-16 h-16 rounded-full bg-purple-600/10 border border-purple-500/20 flex items-center justify-center mx-auto text-2xl mb-3">
            <Mic className="text-2xl text-purple-400" />
          </div>
          <h3 className="text-xl font-bold text-white">Browser Audio Recorder</h3>
          <p className="text-sm text-gray-400 mt-1">
            Capture audio directly from your microphone with pause, resume, and preview.
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-left flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              {errorMsg}
              {errorMsg.includes("Microphone access was denied") && (
                <button
                  onClick={openBrowserSettings}
                  className="ml-2 text-blue-400 text-xs underline hover:text-blue-300"
                >
                  Open Settings
                </button>
              )}
            </div>
          </div>
        )}

        {/* Recording Visual Display */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6 my-4 flex flex-col items-center">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 mb-2">
            {recordingState === "recording" && (
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
            {recordingState === "paused" && (
              <span className="inline-flex rounded-full h-3 w-3 bg-amber-400"></span>
            )}
            {recordingState === "idle" && (
              <span className="inline-flex rounded-full h-3 w-3 bg-gray-500"></span>
            )}
            {recordingState === "recorded" && (
              <span className="inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
            )}

            <span className="text-xs uppercase tracking-wider font-semibold text-gray-400">
              {recordingState === "idle" && "Ready to Record"}
              {recordingState === "recording" && "Recording in Progress..."}
              {recordingState === "paused" && "Recording Paused"}
              {recordingState === "recorded" && "Recording Complete"}
            </span>
          </div>

          {/* Large Live Digital Timer */}
          <div className="text-4xl sm:text-5xl font-mono font-bold tracking-wider text-white my-2">
            {formatTime(timerSeconds)}
          </div>

          {/* Audio Waveform Animation (When recording) */}
          {recordingState === "recording" && (
            <div className="flex items-center gap-1.5 h-8 mt-3">
              {[40, 75, 55, 95, 60, 85, 45, 100, 70, 50, 90, 65].map((height, i) => (
                <div
                  key={i}
                  className="w-1 bg-purple-500 rounded-full animate-pulse"
                  style={{
                    height: `${height}%`,
                    animationDuration: `${0.4 + (i % 5) * 0.15}s`,
                  }}
                ></div>
              ))}
            </div>
          )}

          {/* Audio Preview Player (When recording stopped) */}
          {recordingState === "recorded" && audioUrl && (
            <div className="w-full mt-4 pt-4 border-t border-slate-800">
              <p className="text-xs text-gray-400 mb-2 font-medium">Preview Recording:</p>
              <audio controls src={audioUrl} className="w-full h-10 rounded-lg outline-none" />
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
          {recordingState === "idle" && (
            <button
              onClick={startRecording}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-purple-600/20 transition"
            >
              <span className="w-3 h-3 rounded-full bg-red-400"></span>
              Start Recording
            </button>
          )}

          {recordingState === "recording" && (
            <>
              <button
                onClick={pauseRecording}
                className="bg-amber-600/80 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition inline-flex items-center gap-1.5"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>
              <button
                onClick={stopRecording}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 shadow-lg shadow-red-600/20 transition"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Stop & Review</span>
              </button>
            </>
          )}

          {recordingState === "paused" && (
            <>
              <button
                onClick={resumeRecording}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition inline-flex items-center gap-1.5"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Resume</span>
              </button>
              <button
                onClick={stopRecording}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition inline-flex items-center gap-1.5"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Stop & Review</span>
              </button>
            </>
          )}

          {recordingState === "recorded" && (
            <>
              <button
                onClick={resetRecording}
                disabled={isUploading}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-gray-300 px-4 py-2.5 rounded-xl font-medium text-sm transition inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Discard & Record Again</span>
              </button>
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 shadow-lg shadow-purple-600/20 transition"
              >
                {isUploading ? (
                  <>
                    <Hourglass className="animate-spin text-current" />
                    <span>Uploading {uploadProgress}%</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-4 h-4" />
                    <span>Save & Attach Recording</span>
                  </>
                )}
              </button>
            </>
          )}

          {onCancel && (
            <button
              onClick={onCancel}
              disabled={isUploading || recordingState === "recording"}
              className="text-gray-400 hover:text-white px-3 py-2 text-sm transition"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="w-full bg-slate-800 rounded-full h-2 mt-4 overflow-hidden">
            <div
              className="bg-purple-500 h-2 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AudioRecorder;
