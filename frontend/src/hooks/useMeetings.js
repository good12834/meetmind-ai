import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";

export default function useMeetings() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMeetings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/meetings");
      setMeetings(res.data.meetings || res.data || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || "Failed to load meetings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  const createMeeting = async (payload) => {
    const res = await api.post("/meetings", payload);
    await fetchMeetings();
    return res.data.meeting || res.data;
  };

  const updateMeeting = async (id, payload) => {
    const res = await api.put(`/meetings/${id}`, payload);
    await fetchMeetings();
    return res.data.meeting || res.data;
  };

  const deleteMeeting = async (id) => {
    await api.delete(`/meetings/${id}`);
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  };

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    const total = meetings.length;
    const thisWeek = meetings.filter((m) => {
      const d = new Date(m.meeting_date || m.created_at);
      return !Number.isNaN(d.getTime()) && d >= weekAgo;
    }).length;
    const liveNow = meetings.filter((m) => m.status === "in-progress" || m.live).length;
    const pendingAI = meetings.filter((m) => {
      const hasRecording = m.recordings_count > 0 || m.has_recording;
      const hasTranscript = m.has_transcript || m.transcripts_count > 0;
      const hasSummary = m.has_summary;
      return hasRecording && (!hasTranscript || !hasSummary);
    }).length;
    return { total, thisWeek, liveNow, pendingAI };
  }, [meetings]);

  return { meetings, loading, error, fetchMeetings, createMeeting, updateMeeting, deleteMeeting, stats, setMeetings };
}