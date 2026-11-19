import api from "./api";

const transcriptionService = {
  /**
   * Request Whisper transcription for a meeting's audio recording
   * @param {number|string} meetingId
   * @param {Object} options { recordingId, modelSize, language }
   */
  async transcribeMeeting(meetingId, options = {}) {
    const response = await api.post(`/meetings/${meetingId}/transcribe`, {
      recording_id: options.recordingId || null,
      model_size: options.modelSize || "base",
      language: options.language || "auto",
    });
    return response.data;
  },

  /**
   * Fetch the transcript for a meeting
   * @param {number|string} meetingId
   */
  async getMeetingTranscript(meetingId) {
    const response = await api.get(`/meetings/${meetingId}/transcript`);
    return response.data;
  },

  /**
   * Poll transcript status for async transcription
   * @param {number|string} meetingId
   */
  async getTranscriptStatus(meetingId) {
    const response = await api.get(`/meetings/${meetingId}/transcript/status`);
    return response.data;
  },

  /**
   * Delete a transcript
   * @param {number|string} transcriptId
   */
  async deleteTranscript(transcriptId) {
    const response = await api.delete(`/transcripts/${transcriptId}`);
    return response.data;
  },
};

export default transcriptionService;

