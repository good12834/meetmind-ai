import api from "./api";

export const getNotifications = async (params = {}) => {
  const queryString = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const response = await api.get(`/notifications${queryString ? "?" + queryString : ""}`);
  return response.data;
};

export const markNotificationRead = async (notificationId) => {
  const response = await api.patch(`/notifications/${notificationId}/read`);
  return response.data;
};

export const markAllNotificationsRead = async () => {
  const response = await api.post("/notifications/read-all");
  return response.data;
};
