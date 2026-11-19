import { useState, useRef, useEffect } from "react";
import { Hourglass } from "lucide-react";
import recordingService from "../services/recordingService";

function AudioUploader({ meetingId, onUploadSuccess, onCancel }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileDuration, setFileDuration] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef(null);

  const ALLOWED_EXTENSIONS = ["mp3", "wav", "m4a", "webm"];
  const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

  // Clean up preview object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDuration = (totalSeconds) => {
    if (!totalSeconds || isNaN(totalSeconds)) return "Unknown";
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const validateAndSetFile = (file) => {
    setErrorMsg("");

    if (!file) return;

    // Check extension
    const ext = file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setErrorMsg(
        `Unsupported audio format (.${ext}). Please select an MP3, WAV, M4A, or WebM file.`
      );
      return;
    }

    // Check size
    if (file.size > MAX_SIZE_BYTES) {
      setErrorMsg("File is too large. The maximum permitted file size is 100 MB.");
      return;
    }

    if (file.size === 0) {
      setErrorMsg("The selected file is empty.");
      return;
    }

    // Create preview URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setSelectedFile(file);

    // Read audio duration using temporary Audio element
    const tempAudio = new Audio();
    tempAudio.src = url;
    tempAudio.onloadedmetadata = () => {
      if (tempAudio.duration && !isNaN(tempAudio.duration)) {
        setFileDuration(tempAudio.duration);
      } else {
        setFileDuration(0);
      }
    };
    tempAudio.onerror = () => {
      setFileDuration(0);
    };
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleClear = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setSelectedFile(null);
    setFileDuration(0);
    setErrorMsg("");
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setErrorMsg("");
    setUploadProgress(0);

    try {
      const response = await recordingService.uploadRecording(
        {
          file: selectedFile,
          meetingId,
          duration: fileDuration,
          source: "upload",
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
      handleClear();
    } catch (err) {
      console.error("Upload error:", err);
      setErrorMsg(err.response?.data?.message || "Failed to upload audio file.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center">
      <div className="w-full max-w-lg">
        {/* Header Icon & Title */}
        <div className="mb-4">
          <div className="w-16 h-16 rounded-full bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto text-2xl mb-3">
            📁
          </div>
          <h3 className="text-xl font-bold text-white">Upload Audio Recording</h3>
          <p className="text-sm text-gray-400 mt-1">
            Attach pre-recorded meeting audio in MP3, WAV, M4A, or WebM format (max 100 MB).
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-left">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.m4a,.webm,audio/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Drag and Drop Zone / Selected Preview */}
        {!selectedFile ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 cursor-pointer transition flex flex-col items-center justify-center ${
              isDragging
                ? "border-purple-500 bg-purple-500/10"
                : "border-slate-700 hover:border-slate-600 bg-slate-950/40"
            }`}
          >
            <div className="text-4xl mb-3">☁️</div>
            <p className="text-white font-semibold text-base">
              Drag and drop your audio file here, or{" "}
              <span className="text-purple-400 underline">browse</span>
            </p>
            <p className="text-gray-500 text-xs mt-2">
              Supports MP3, WAV, M4A, and WebM up to 100 MB
            </p>

            <div className="flex gap-2 mt-4">
              {["MP3", "WAV", "M4A", "WebM"].map((badge) => (
                <span
                  key={badge}
                  className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-gray-400 border border-slate-700"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 text-left">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center text-lg">
                  🎵
                </div>
                <div>
                  <h4 className="font-semibold text-white text-sm line-clamp-1">
                    {selectedFile.name}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                    <span>{formatFileSize(selectedFile.size)}</span>
                    {fileDuration > 0 && (
                      <>
                        <span>•</span>
                        <span>⏱ {formatDuration(fileDuration)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClear}
                disabled={isUploading}
                className="text-gray-400 hover:text-white p-1 text-sm font-bold"
                title="Remove file"
              >
                ✕
              </button>
            </div>

            {/* Audio Preview Player */}
            {previewUrl && (
              <div className="mt-3 pt-3 border-t border-slate-800">
                <p className="text-xs text-gray-400 mb-2 font-medium">Preview Audio:</p>
                <audio controls src={previewUrl} className="w-full h-10 rounded-lg outline-none" />
              </div>
            )}
          </div>
        )}

        {/* Action Controls */}
        {selectedFile && (
          <div className="flex items-center justify-center gap-3 mt-5">
            <button
              onClick={handleClear}
              disabled={isUploading}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-gray-300 px-4 py-2.5 rounded-xl font-medium text-sm transition"
            >
              Choose Different File
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
                  <span>⬆️</span>
                  <span>Upload & Attach Audio</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="w-full bg-slate-800 rounded-full h-2 mt-4 overflow-hidden">
            <div
              className="bg-purple-500 h-2 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        )}

        {onCancel && !selectedFile && (
          <div className="mt-4">
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-white text-sm transition"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AudioUploader;
