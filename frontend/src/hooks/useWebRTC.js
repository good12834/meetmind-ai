import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Helper to generate a live virtual video track when no physical webcam is connected
function createVirtualCameraStream(label = 'User') {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  let angle = 0;

  function render() {
    angle = (angle + 1) % 360;

    // High-tech dark gradient
    const grad = ctx.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, '#111827');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    // Glowing circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(320, 200, 75, 0, Math.PI * 2);
    ctx.fillStyle = '#6366f1';
    ctx.shadowColor = '#818cf8';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.restore();

    // Initial avatar letter
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((label || '?').charAt(0).toUpperCase(), 320, 200);

    // User name
    ctx.font = '600 20px Inter, sans-serif';
    ctx.fillStyle = '#f3f4f6';
    ctx.fillText(label || 'You', 320, 310);

    // Virtual badge
    ctx.font = '13px Inter, sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Virtual Video Stream (No webcam detected)', 320, 340);

    requestAnimationFrame(render);
  }

  render();
  return canvas.captureStream(30);
}

export default function useWebRTC(meetingId, userName) {
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({});
  const [joined, setJoined] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const pcs = useRef({});
  const localRef = useRef(null);
  const screenRef = useRef(null);
  const isVirtualCamRef = useRef(false);

  // Acquire camera and mic
  const startLocalMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true,
      });
      localRef.current = stream;
      setLocalStream(stream);
      setCamOn(stream.getVideoTracks().some((t) => t.enabled));
      setMicOn(stream.getAudioTracks().some((t) => t.enabled));
      isVirtualCamRef.current = false;
      setError(null);
      return stream;
    } catch (err) {
      console.warn('Initial video+audio getUserMedia failed, trying fallbacks:', err);

      // Check if it's NotFoundError (no physical webcam found)
      const isNotFound = err.name === 'NotFoundError' || err.message?.includes('device not found');

      // Try video only (if mic is blocked/missing)
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        localRef.current = videoStream;
        setLocalStream(videoStream);
        setCamOn(true);
        setMicOn(false);
        isVirtualCamRef.current = false;
        setError(null);
        return videoStream;
      } catch (videoErr) {
        console.warn('Video also failed:', videoErr);
      }

      // Try audio only (if camera device is not found or busy)
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // If no physical webcam exists, provide a virtual test camera stream!
        if (isNotFound) {
          try {
            const vStream = createVirtualCameraStream(userName);
            const vTrack = vStream.getVideoTracks()[0];
            audioStream.addTrack(vTrack);
            isVirtualCamRef.current = true;
            localRef.current = audioStream;
            setLocalStream(new MediaStream(audioStream.getTracks()));
            setCamOn(true);
            setMicOn(true);
            setError('No physical webcam found on this PC. Virtual camera stream is active!');
            return audioStream;
          } catch (vErr) {
            console.warn('Virtual camera creation failed:', vErr);
          }
        }

        localRef.current = audioStream;
        setLocalStream(audioStream);
        setCamOn(false);
        setMicOn(true);
        setError('No camera found on this computer. You can use microphone or 🖥 Screen Share.');
        return audioStream;
      } catch (audioErr) {
        console.error('Camera and microphone both failed:', audioErr);
        setError('Camera and microphone access was denied or no devices were found. Please check browser permissions.');
        return null;
      }
    }
  }, [userName]);

  // Initialize media on mount
  useEffect(() => {
    let unmounted = false;
    startLocalMedia().then((stream) => {
      if (unmounted && stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    });

    return () => {
      unmounted = true;
    };
  }, [startLocalMedia]);

  const removePeer = useCallback((id) => {
    pcs.current[id]?.close();
    delete pcs.current[id];
    setPeers((p) => {
      const { [id]: _, ...rest } = p;
      return rest;
    });
  }, []);

  const createPC = useCallback(
    (id, name) => {
      const pc = new RTCPeerConnection(ICE);
      if (localRef.current) {
        localRef.current.getTracks().forEach((t) => pc.addTrack(t, localRef.current));
      }

      pc.onicecandidate = (e) =>
        e.candidate &&
        socketRef.current?.emit('video:signal', { to: id, signal: { candidate: e.candidate } });

      pc.ontrack = (e) => {
        const incomingStream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
        setPeers((prev) => {
          const currentPeer = prev[id];
          if (currentPeer?.stream) {
            if (!currentPeer.stream.getTracks().some((t) => t.id === e.track.id)) {
              currentPeer.stream.addTrack(e.track);
            }
            return {
              ...prev,
              [id]: {
                name: currentPeer.name || name,
                stream: new MediaStream(currentPeer.stream.getTracks()),
              },
            };
          }
          return {
            ...prev,
            [id]: {
              name: currentPeer?.name || name,
              stream: incomingStream,
            },
          };
        });
      };

      pc.onconnectionstatechange = () => {
        if (['failed', 'closed'].includes(pc.connectionState)) removePeer(id);
      };

      pcs.current[id] = pc;
      setPeers((p) => ({ ...p, [id]: { name, stream: null } }));
      return pc;
    },
    [removePeer]
  );

  const join = useCallback(async () => {
    let stream = localRef.current;
    if (!stream) {
      stream = await startLocalMedia();
    }

    const token = localStorage.getItem('access_token');
    const socket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
      auth: { token },
      query: { token },
    });
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('video:join', { meetingId, name: userName }));

    // Newcomer initiates offers to everyone already in the room
    socket.on('video:peers', async (list) => {
      for (const { id, name } of list) {
        const pc = createPC(id, name);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('video:signal', { to: id, signal: { description: pc.localDescription } });
      }
    });

    socket.on('video:signal', async ({ from, name, signal }) => {
      let pc = pcs.current[from];
      if (signal.description) {
        if (!pc) pc = createPC(from, name);
        await pc.setRemoteDescription(signal.description);
        if (signal.description.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('video:signal', { to: from, signal: { description: pc.localDescription } });
        }
      } else if (signal.candidate && pc) {
        try {
          await pc.addIceCandidate(signal.candidate);
        } catch {
          /* ignore late candidates */
        }
      }
    });

    socket.on('video:peer-left', ({ id }) => removePeer(id));
    socket.on('video:chat', (m) => setMessages((x) => [...x, { ...m, ts: Date.now() }]));
    socket.on('connect_error', () => setError('Cannot reach the meeting server.'));
    setJoined(true);
  }, [meetingId, userName, createPC, removePeer, startLocalMedia]);

  const stopScreen = useCallback(() => {
    const cam = localRef.current?.getVideoTracks()[0];
    Object.values(pcs.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && cam) sender.replaceTrack(cam);
    });
    screenRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    setSharing(false);
  }, []);

  const toggleShare = useCallback(async () => {
    if (sharing) return stopScreen();
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenRef.current = screen;
      const track = screen.getVideoTracks()[0];
      Object.values(pcs.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(track);
        } else {
          pc.addTrack(track, localRef.current || screen);
        }
      });
      track.onended = stopScreen;
      setSharing(true);
    } catch {
      /* user cancelled */
    }
  }, [sharing, stopScreen]);

  const toggleMic = useCallback(async () => {
    let stream = localRef.current;
    let track = stream?.getAudioTracks()[0];

    if (!track || track.readyState === 'ended') {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newTrack = micStream.getAudioTracks()[0];
        if (!newTrack) return;

        if (stream) {
          stream.getAudioTracks().forEach((t) => stream.removeTrack(t));
          stream.addTrack(newTrack);
        } else {
          stream = micStream;
          localRef.current = stream;
        }

        for (const pc of Object.values(pcs.current)) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) {
            sender.replaceTrack(newTrack);
          } else {
            pc.addTrack(newTrack, stream);
          }
        }

        const freshStream = new MediaStream(stream.getTracks());
        localRef.current = freshStream;
        setLocalStream(freshStream);
        setMicOn(true);
        setError(null);
      } catch (err) {
        console.error('Failed to access mic on toggle:', err);
        setError('Microphone access was denied or device not found.');
      }
    } else {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
      setLocalStream(new MediaStream(stream.getTracks()));
    }
  }, []);

  const toggleCam = useCallback(async () => {
    let stream = localRef.current;
    let track = stream?.getVideoTracks()[0];

    // If no video track exists, or it has ended: request camera!
    if (!track || track.readyState === 'ended') {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        });
        const newTrack = camStream.getVideoTracks()[0];
        if (!newTrack) return;

        if (stream) {
          stream.getVideoTracks().forEach((t) => stream.removeTrack(t));
          stream.addTrack(newTrack);
        } else {
          stream = camStream;
          localRef.current = stream;
        }

        for (const pc of Object.values(pcs.current)) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(newTrack);
          } else {
            pc.addTrack(newTrack, stream);
          }
        }

        isVirtualCamRef.current = false;
        const freshStream = new MediaStream(stream.getTracks());
        localRef.current = freshStream;
        setLocalStream(freshStream);
        setCamOn(true);
        setError(null);
      } catch (err) {
        console.error('Failed to access camera on toggle:', err);

        // If no physical camera hardware is found on this PC: activate virtual test camera!
        if (err.name === 'NotFoundError' || err.message?.includes('device not found')) {
          try {
            const vStream = createVirtualCameraStream(userName);
            const vTrack = vStream.getVideoTracks()[0];
            if (stream) {
              stream.getVideoTracks().forEach((t) => stream.removeTrack(t));
              stream.addTrack(vTrack);
            } else {
              stream = vStream;
              localRef.current = stream;
            }
            for (const pc of Object.values(pcs.current)) {
              const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
              if (sender) {
                sender.replaceTrack(vTrack);
              } else {
                pc.addTrack(vTrack, stream);
              }
            }
            isVirtualCamRef.current = true;
            const freshStream = new MediaStream(stream.getTracks());
            localRef.current = freshStream;
            setLocalStream(freshStream);
            setCamOn(true);
            setError('No physical webcam found. Virtual video stream active!');
            return;
          } catch (vErr) {
            console.error('Virtual camera fallback failed:', vErr);
          }
          setError('No camera found on this computer. Plug in a webcam or use 🖥 Screen Share.');
        } else {
          setError('Camera permission was denied or camera is in use by another app.');
        }
      }
    } else {
      // Toggle the active video track
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
      setLocalStream(new MediaStream(stream.getTracks()));
    }
  }, [userName]);

  const sendChat = useCallback((text) => socketRef.current?.emit('video:chat', { text }), []);

  const leave = useCallback(() => {
    socketRef.current?.emit('video:leave');
    socketRef.current?.disconnect();
    socketRef.current = null;
    Object.values(pcs.current).forEach((pc) => pc.close());
    pcs.current = {};
    screenRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setPeers({});
    setLocalStream(null);
    setJoined(false);
  }, []);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      socketRef.current?.emit('video:leave');
      socketRef.current?.disconnect();
      socketRef.current = null;
      Object.values(pcs.current).forEach((pc) => pc.close());
      pcs.current = {};
      screenRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    localStream, peers, joined, micOn, camOn, sharing, messages, error,
    join, leave, toggleMic, toggleCam, toggleShare, sendChat,
  };
}
