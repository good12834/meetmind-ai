import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Meetings from "./pages/Meetings";
import MeetingHistory from "./pages/MeetingHistory";
import MeetingDetails from "./pages/MeetingDetails";
import RecordMeeting from "./pages/RecordMeeting";
import VideoMeeting from "./pages/VideoMeeting";
import ActionItems from "./pages/ActionItems";
import Analytics from "./pages/Analytics";
import AIChat from "./pages/AIChat";
import Team from "./pages/Team";
import Notifications from "./pages/Notifications";
import LiveTranscription from "./pages/LiveTranscription";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/meetings"
          element={
            <ProtectedRoute>
              <Meetings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/meetings/:id/video"
          element={
            <ProtectedRoute>
              <VideoMeeting />
            </ProtectedRoute>
          }
        />
        <Route
          path="/meetings/:id"
          element={
            <ProtectedRoute>
              <MeetingDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/meetings/:id/transcript"
          element={
            <ProtectedRoute>
              <MeetingDetails initialTab="transcript" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/meetings/:id/summary"
          element={
            <ProtectedRoute>
              <MeetingDetails initialTab="summary" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/meetings/:id/record"
          element={
            <ProtectedRoute>
              <RecordMeeting />
            </ProtectedRoute>
          }
        />
        <Route
          path="/record"
          element={
            <ProtectedRoute>
              <RecordMeeting />
            </ProtectedRoute>
          }
        />
        <Route
          path="/meeting-history"
          element={
            <ProtectedRoute>
              <MeetingHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/action-items"
          element={
            <ProtectedRoute>
              <ActionItems />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai-chat"
          element={
            <ProtectedRoute>
              <AIChat />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team"
          element={
            <ProtectedRoute>
              <Team />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <Notifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/live-transcription"
          element={
            <ProtectedRoute>
              <LiveTranscription />
            </ProtectedRoute>
          }
        />
        <Route
          path="/meetings/:id/live-transcription"
          element={
            <ProtectedRoute>
              <LiveTranscription />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
