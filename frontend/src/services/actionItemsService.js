import api from "./api";

export const getActionItems = async (filters = {}) => {
  const params = new URLSearchParams(filters).toString();
  const response = await api.get(`/action-items${params ? "?" + params : ""}`);
  return response.data;
};

export const getMeetingActionItems = async (meetingId) => {
  const response = await api.get(`/meetings/${meetingId}/action-items`);
  return response.data;
};

export const createActionItem = async (meetingId, data) => {
  const response = await api.post(`/meetings/${meetingId}/action-items`, data);
  return response.data;
};

export const updateActionItem = async (itemId, data) => {
  const response = await api.patch(`/action-items/${itemId}`, data);
  return response.data;
};

export const deleteActionItem = async (itemId) => {
  const response = await api.delete(`/action-items/${itemId}`);
  return response.data;
};
