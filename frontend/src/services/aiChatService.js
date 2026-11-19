import api from "./api";

export const chatWithMeetings = async (question, meetingIds = [], model = null) => {
  const response = await api.post("/ai/chat", {
    question,
    meeting_ids: meetingIds,
    ...(model ? { model } : {}),
  });
  return response.data;
};

export const getMeetingDecisions = async (meetingId) => {
  const response = await api.get(`/meetings/${meetingId}/decisions`);
  return response.data;
};

export const addDecision = async (meetingId, data) => {
  const response = await api.post(`/meetings/${meetingId}/decisions`, data);
  return response.data;
};

export const deleteDecision = async (decisionId) => {
  const response = await api.delete(`/decisions/${decisionId}`);
  return response.data;
};

export const getMeetingHistory = async (page = 1, per_page = 10) => {
  const response = await api.get(`/meetings?page=${page}&per_page=${per_page}`);
  return response.data;
};
