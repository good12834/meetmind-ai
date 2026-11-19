import api from "./api";

const recordingService = {
  /**
   * Upload an audio file or recorded Blob to a meeting
   * Supports either an object: { file, meetingId, duration, source, fileName }
   * or positional arguments: (meetingId, file, duration, source)
   */
  async uploadRecording(arg1, arg2, ...rest) {
    let file, meetingId, duration = 0, source = "upload", fileName = null, onUploadProgress;
    if (arg1 && typeof arg1 === "object" && ("file" in arg1 || "meetingId" in arg1)) {
      ({ file, meetingId, duration = 0, source = "upload", fileName = null } = arg1);
      onUploadProgress = arg2;
    } else {
      meetingId = arg1;
      file = arg2;
      duration = rest[0] || 0;
      source = rest[1] || "upload";
      onUploadProgress = rest[2];
    }

    const formData = new FormData();
    const finalName = fileName || file?.name || `recording_${Date.now()}.webm`;
    formData.append("file", file, finalName);
    formData.append("meeting_id", meetingId);
    formData.append("duration", duration);
    formData.append("source", source);

    const response = await api.post("/recordings/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress,
    });
    return response.data;
  },

  /**
   * Fetch all recordings for a specific meeting
   */
  async getMeetingRecordings(meetingId) {
    const response = await api.get(`/recordings/meeting/${meetingId}`);
    return response.data;
  },

  /**
   * Fetch single recording metadata
   */
  async getRecording(recordingId) {
    const response = await api.get(`/recordings/${recordingId}`);
    return response.data;
  },

  /**
   * Delete a recording
   */
  async deleteRecording(recordingId) {
    const response = await api.delete(`/recordings/${recordingId}`);
    return response.data;
  },

  /**
   * Build direct authenticated audio streaming URL for HTML5 <audio> tags
   */
  getAudioStreamUrl(recordingId) {
    const token = localStorage.getItem("access_token");
    const baseUrl = api.defaults.baseURL || "http://localhost:5000/api";
    return `${baseUrl}/recordings/${recordingId}/audio?token=${encodeURIComponent(token || "")}`;
  },
};

export default recordingService;

