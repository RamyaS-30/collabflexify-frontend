import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer/simplepeer.min.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faVideo,
  faVideoSlash,
  faMicrophone,
  faMicrophoneSlash,
  faDesktop
} from '@fortawesome/free-solid-svg-icons';

const SOCKET_SERVER_URL = process.env.REACT_APP_BACKEND_URL;

const VideoCall = ({ workspaceId, user }) => {
  const [peers, setPeers] = useState([]);
  const [members, setMembers] = useState([]);
  const socketRef = useRef();
  const userVideo = useRef();
  const peersRef = useRef([]);

  const streamRef = useRef(null);
  const screenStreamRef = useRef(null);

  const [callActive, setCallActive] = useState(false);
  const [callInProgress, setCallInProgress] = useState(false);
  const [hasJoinedCall, setHasJoinedCall] = useState(false);
  const [callStartedBy, setCallStartedBy] = useState(null);

  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  // --- Socket connection on mount ---
  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER_URL, {
      auth: {
        userId: user.id || user.userId || user.sub,
      },
    });

    socketRef.current.on('connect', () => {
      setSocketConnected(true);
      setMembers([{ socketId: socketRef.current.id, userName: user.username || user.email }]);
      // Join room immediately
      socketRef.current.emit('joinRoom', {
        roomId: workspaceId,
        userName: user.username || user.email,
      });
    });

    socketRef.current.on('disconnect', () => {
      setSocketConnected(false);
      setMembers([]);
      setPeers([]);
      peersRef.current.forEach(({ peer }) => peer.destroy());
      peersRef.current = [];
      setCallActive(false);
      setCallInProgress(false);
      setHasJoinedCall(false);
      setCallStartedBy(null);
      setCamEnabled(true);
      setMicEnabled(true);
      setScreenSharing(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
    });

    // Video call event handlers that affect call state regardless of media
    socketRef.current.on('videoCall:started', ({ startedBy, timestamp }) => {
      setCallInProgress(true);
      setCallStartedBy(startedBy);
    });

    socketRef.current.on('videoCall:ended', () => {
      setCallInProgress(false);
      setHasJoinedCall(false);
      setCallActive(false);
      // Clean up media and peers
      peersRef.current.forEach(({ peer }) => peer.destroy());
      peersRef.current = [];
      setPeers([]);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      setCamEnabled(true);
      setMicEnabled(true);
      setScreenSharing(false);
      setCallStartedBy(null);
    });

    // Handle all-users - update members and create peers
    socketRef.current.on('all-users', (users) => {
      setMembers([
        { socketId: socketRef.current.id, userName: user.username || user.email },
        ...users,
      ]);

      // Create peers for existing users
      const peersArr = [];
      users.forEach(({ socketId }) => {
        const peer = createPeer(socketId, socketRef.current.id, streamRef.current);
        peersRef.current.push({ peerID: socketId, peer });
        peersArr.push({ peerID: socketId, peer });
      });

      setPeers(peersArr);
    });

    socketRef.current.on('user-connected', ({ socketId, userName }) => {
      setMembers((prev) => [...prev, { socketId, userName }]);
      if (streamRef.current) {
        const peer = addPeer(socketId, streamRef.current);
        peersRef.current.push({ peerID: socketId, peer });
        setPeers((prevPeers) => [...prevPeers, { peerID: socketId, peer }]);
      }
    });

    socketRef.current.on('signal', ({ from, signal }) => {
      const item = peersRef.current.find(p => p.peerID === from);
      if (item) {
        item.peer.signal(signal);
      }
    });

    socketRef.current.on('user-disconnected', (id) => {
      setMembers((prev) => prev.filter((m) => m.socketId !== id));
      const peerObj = peersRef.current.find(p => p.peerID === id);
      if (peerObj) peerObj.peer.destroy();
      peersRef.current = peersRef.current.filter(p => p.peerID !== id);
      setPeers((prevPeers) => prevPeers.filter(p => p.peerID !== id));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      }
    };
  }, [workspaceId, user]);

  // --- Media & Peer setup when callActive changes ---
  useEffect(() => {
    if (!callActive) return;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (userVideo.current) userVideo.current.srcObject = stream;

        // After media stream is ready, emit joinRoom again (if needed)
        socketRef.current.emit('joinRoom', {
          roomId: workspaceId,
          userName: user.username || user.email,
        });

        if (!hasJoinedCall) {
          setHasJoinedCall(true);
        }

        // When 'all-users' or 'user-connected' events fire,
        // peers will be created (handled by socket event handlers)

      })
      .catch((err) => {
        console.error('❌ Error accessing media devices:', err);
        alert('Could not access camera/microphone. Check your browser permissions.');
        setCallActive(false);
      });

    return () => {
      peersRef.current.forEach(({ peer }) => peer.destroy());
      peersRef.current = [];
      setPeers([]);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }

      setCamEnabled(true);
      setMicEnabled(true);
      setScreenSharing(false);
      setHasJoinedCall(false);
    };
  }, [callActive, workspaceId, user, hasJoinedCall]);

  const createPeer = (userToSignal, callerID, stream) => {
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on('signal', signal => {
      socketRef.current.emit('signal', { to: userToSignal, from: callerID, signal });
    });

    return peer;
  };

  const addPeer = (incomingSignalId, stream) => {
    const peer = new SimplePeer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on('signal', signal => {
      socketRef.current.emit('signal', { to: incomingSignalId, from: socketRef.current.id, signal });
    });

    return peer;
  };

  const toggleCamera = () => {
    const videoTrack = streamRef.current?.getVideoTracks()?.[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCamEnabled(videoTrack.enabled);
    }
  };

  const toggleMic = () => {
    const audioTrack = streamRef.current?.getAudioTracks()?.[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicEnabled(audioTrack.enabled);
    }
  };

  const toggleScreenSharing = async () => {
    if (!screenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        setScreenSharing(true);

        // Replace video tracks sent by peers with the screen track
        peersRef.current.forEach(({ peer }) => {
          const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenStream.getVideoTracks()[0]);
        });

        // Show screen stream locally
        if (userVideo.current) {
          const combinedStream = new MediaStream([
            ...streamRef.current.getAudioTracks(),
            ...screenStream.getVideoTracks(),
          ]);
          userVideo.current.srcObject = combinedStream;
        }

        screenStream.getVideoTracks()[0].onended = () => {
          stopScreenSharing();
        };

      } catch (err) {
        console.error('Screen sharing failed:', err);
        alert('Failed to share screen');
      }
    } else {
      stopScreenSharing();
    }
  };

  const stopScreenSharing = () => {
    if (!screenSharing) return;

    const videoTrack = streamRef.current.getVideoTracks()[0];

    peersRef.current.forEach(({ peer }) => {
      const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(videoTrack);
    });

    if (userVideo.current) {
      userVideo.current.srcObject = streamRef.current;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    setScreenSharing(false);
  };

  const isFirstUser = () => {
    const totalMembers = members.some(m => m.socketId === socketRef.current?.id)
      ? members.length
      : members.length + 1;
    return totalMembers === 1 && !callInProgress;
  };

  const canEndCall = () => {
    return socketRef.current?.id === callStartedBy;
  };

  return (
    <div className="video-call-wrapper flex flex-col md:flex-row gap-6 p-6 bg-gray-50 rounded-lg shadow max-w-7xl mx-auto min-h-[400px]">

      {/* Members panel */}
      <aside className="members-column w-full md:w-60 bg-white border border-gray-200 rounded-lg p-5 shadow-md flex flex-col">
        <h3 className="text-xl font-semibold mb-5 border-b border-gray-200 pb-3 text-gray-800">Members</h3>
        <ul className="space-y-3 flex-grow overflow-y-auto">
          <li key="me" className="flex items-center space-x-3 font-semibold text-blue-700">
            <UserAvatar name={user.username || user.email} />
            <span>{user.username || user.email}</span>
            <span className="text-sm text-gray-400">(You)</span>
          </li>
          {members
            .filter(m => m.socketId !== socketRef.current?.id)
            .map(({ socketId, userName }) => (
              <li key={socketId} className="flex items-center space-x-3 text-gray-700 hover:bg-gray-100 rounded p-1 transition">
                <UserAvatar name={userName} />
                <span>{userName}</span>
              </li>
            ))}
        </ul>
      </aside>

      {/* Video & controls section */}
      <section className="video-area flex-1 flex flex-col gap-4">

        {!callInProgress && !callActive && isFirstUser() ? (
          <div className="flex flex-col items-center justify-center w-full h-96 md:h-auto bg-white rounded-lg shadow p-10 text-center space-y-6">
            <h2 className="text-4xl font-extrabold text-indigo-700">Welcome to Your Video Call</h2>
            <p className="text-lg text-gray-600 max-w-md">
              No active call detected. As the first member, you can start the call when you’re ready.
            </p>
            <button disabled={!socketConnected}
              className="px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                socketRef.current.emit('videoCall:start', { workspaceId });
                setCallActive(true);
                setHasJoinedCall(true);
                setCallStartedBy(socketRef.current.id);
              }}
            >
              Start Call
            </button>
          </div>
        ) : !callInProgress && !callActive && !isFirstUser() ? (
          <div className="flex flex-col items-center justify-center w-full h-96 md:h-auto bg-white rounded-lg shadow p-10 text-center space-y-6">
            <h2 className="text-4xl font-extrabold text-gray-700">No Active Call</h2>
            <p className="text-lg text-gray-600 max-w-md">
              Please wait for the call to start.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="local-video-wrapper w-full max-h-[360px] rounded-lg overflow-hidden shadow-lg bg-black relative">
              <video
                ref={userVideo}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
            <div className="remote-videos grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 overflow-auto max-h-[500px]">
              {peers.map(({ peerID, peer }) => (
                <Video key={peerID} peer={peer} />
              ))}
            </div>

            <div className="controls flex items-center space-x-5 mt-4">
              <button
                onClick={toggleCamera}
                title={camEnabled ? 'Turn Camera Off' : 'Turn Camera On'}
                className={`rounded-full p-3 transition ${
                  camEnabled ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
              >
                <FontAwesomeIcon icon={camEnabled ? faVideo : faVideoSlash} size="lg" />
              </button>

              <button
                onClick={toggleMic}
                title={micEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
                className={`rounded-full p-3 transition ${
                  micEnabled ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
              >
                <FontAwesomeIcon icon={micEnabled ? faMicrophone : faMicrophoneSlash} size="lg" />
              </button>

              <button
                onClick={toggleScreenSharing}
                title={screenSharing ? 'Stop Screen Sharing' : 'Start Screen Sharing'}
                className={`rounded-full p-3 transition ${
                  screenSharing ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
              >
                <FontAwesomeIcon icon={faDesktop} size="lg" />
              </button>

              {canEndCall() && (
                <button
                  onClick={() => {
                    socketRef.current.emit('videoCall:end', { workspaceId });
                    setCallActive(false);
                    setCallInProgress(false);
                    setHasJoinedCall(false);
                    setPeers([]);
                    peersRef.current.forEach(({ peer }) => peer.destroy());
                    peersRef.current = [];
                    if (streamRef.current) {
                      streamRef.current.getTracks().forEach(track => track.stop());
                      streamRef.current = null;
                    }
                    if (screenStreamRef.current) {
                      screenStreamRef.current.getTracks().forEach(track => track.stop());
                      screenStreamRef.current = null;
                    }
                    setCamEnabled(true);
                    setMicEnabled(true);
                    setScreenSharing(false);
                    setCallStartedBy(null);
                  }}
                  className="ml-auto bg-red-600 hover:bg-red-700 text-white rounded-lg px-6 py-3 font-semibold transition"
                >
                  End Call
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

const Video = ({ peer }) => {
  const ref = useRef();

  useEffect(() => {
    peer.on('stream', stream => {
      if (ref.current) {
        ref.current.srcObject = stream;
      }
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
    });

    return () => {
      peer.destroy();
    };
  }, [peer]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      className="w-64 h-48 rounded-lg shadow-md object-cover bg-black"
    />
  );
};

const UserAvatar = ({ name }) => {
  // Generate initials from name/email
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold">
      {initials}
    </div>
  );
};

export default VideoCall;