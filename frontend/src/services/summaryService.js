import api from "./api";

const DEFAULT_MODEL = "llama3.2:3b";

const summaryService = {
  /**
   * Ask the backend to generate (or regenerate) an AI summary for a meeting.
   * Requires Ollama to be running and a transcript to exist.
   */
  generateSummary: async (meetingId, model = DEFAULT_MODEL, template = "general") => {
    const response = await api.post(`/meetings/${meetingId}/summarize`, { model, template });
    return response.data; // { success, message, summary }
  },

  /**
   * Fetch the latest AI summary for a meeting.
   * Returns { success, summary } where summary may be null.
   */
  getMeetingSummary: async (meetingId) => {
    const response = await api.get(`/meetings/${meetingId}/summary`);
    return response.data;
  },

  /**
   * Generate a professional post-meeting follow-up email.
   */
  generateFollowUpEmail: async (meetingId, model = DEFAULT_MODEL) => {
    const response = await api.post(`/meetings/${meetingId}/follow-up-email`, { model });
    return response.data; // { success, subject, email_body }
  },

  /**
   * Export structured meeting notes and transcript as Markdown / text.
   */
  exportMeetingNotes: async (meetingId) => {
    const response = await api.get(`/meetings/${meetingId}/export`);
    return response.data; // { success, meeting, markdown }
  },

  /**
   * Delete a summary by its ID (its action items go with it).
   */
  deleteSummary: async (summaryId) => {
    const response = await api.delete(`/summaries/${summaryId}`);
    return response.data;
  },

  /**
   * Update an action item, e.g. mark it completed.
   * Returns { success, action_item }.
   */
  updateActionItem: async (itemId, updates) => {
    const response = await api.patch(`/action-items/${itemId}`, updates);
    return response.data;
  },

  /**
   * Check if Ollama is running and which models are installed.
   * Returns { running, models, default_model, error }.
   */
  checkOllamaHealth: async () => {
    try {
      const response = await api.get("/ollama/health");
      return response.data;
    } catch (err) {
      return {
        running: false,
        models: [],
        default_model: DEFAULT_MODEL,
        error:
          err.response?.data?.error ||
          err.response?.data?.message ||
          "Cannot reach the backend or Ollama",
      };
    }
  },
};

export { DEFAULT_MODEL };
export default summaryService;
