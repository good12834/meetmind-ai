import { io } from "socket.io-client";
import api from "./api";

const SOCKET_URL = "http://localhost:5000";

let socket = null;

export const connectLiveSocket = (token) => {
  if (socket?.connected || socket?.active) return socket;

  if (socket) {
    try {
      socket.auth = { token };
      if (!socket.connected) socket.connect();
    } catch {
      socket = null;
    }
  }

  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
    });
  }

  return socket;
};

export const disconnectLiveSocket = () => {
  if (!socket) return;
  try {
    socket.removeAllListeners();
    if (socket.connected || socket.active) {
      socket.disconnect();
    } else {
      socket.close();
    }
  } catch {
    // ignore close errors
  } finally {
    socket = null;
  }
};

export const getSocket = () => socket;

export const startLiveSession = async (meetingId) => {
  const response = await api.post("/live/sessions", { meeting_id: meetingId });
  return response.data;
};

export const stopLiveSession = async (sessionId) => {
  const response = await api.post(`/live/sessions/${sessionId}/stop`);
  return response.data;
};

export const getLiveSegments = async (sessionId) => {
  const response = await api.get(`/live/sessions/${sessionId}/segments`);
  return response.data;
};

export const getLiveInsights = async (sessionId) => {
  const response = await api.get(`/live/sessions/${sessionId}/insights`);
  return response.data;
};

export const onTranscriptSegment = (callback) => {
  if (!socket) return () => {};
  socket.on("transcript_segment", callback);
  return () => socket.off("transcript_segment", callback);
};

export const onAiInsight = (callback) => {
  if (!socket) return () => {};
  socket.on("ai_insight", callback);
  return () => socket.off("ai_insight", callback);
};

export const onSessionStarted = (callback) => {
  if (!socket) return () => {};
  socket.on("session_started", callback);
  return () => socket.off("session_started", callback);
};

export const onSessionStopped = (callback) => {
  if (!socket) return () => {};
  socket.on("session_stopped", callback);
  return () => socket.off("session_stopped", callback);
};

export const onError = (callback) => {
  if (!socket) return () => {};
  socket.on("error", callback);
  return () => socket.off("error", callback);
};

export const joinLiveSession = (sessionId) => {
  if (!socket) return;
  socket.emit("join_session", { session_id: sessionId });
};

export const leaveLiveSession = (sessionId) => {
  if (!socket) return;
  socket.emit("leave_session", { session_id: sessionId });
};

export const sendAudioChunk = (sessionId, audioBase64, options = {}) => {
  if (!socket) return;
  socket.emit("audio_chunk", {
    session_id: sessionId,
    audio_base64: audioBase64,
    model_size: options.modelSize || "base",
    language: options.language || "auto",
  });
};

export const endLiveSession = (sessionId) => {
  if (!socket) return;
  socket.emit("end_session", { session_id: sessionId });
};

export default {
  connectLiveSocket,
  disconnectLiveSocket,
  getSocket,
  startLiveSession,
  stopLiveSession,
  getLiveSegments,
  getLiveInsights,
  onTranscriptSegment,
  onAiInsight,
  onSessionStarted,
  onSessionStopped,
  onError,
  joinLiveSession,
  leaveLiveSession,
  sendAudioChunk,
  endLiveSession,
};
