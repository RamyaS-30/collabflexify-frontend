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

  const username = user.username || user.email;

  // --- Socket connection ---
  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER_URL, {
      auth: { userId: user.id || user.userId || user.sub },
    });

    socketRef.current.on('connect', () => {
      setSocketConnected(true);
      setMembers([{ socketId: socketRef.current.id, userName: username }]);
      socketRef.current.emit('joinRoom', { roomId: workspaceId, userName: username });
    });

    socketRef.current.on('disconnect', () => {
      setSocketConnected(false);
      cleanupCall();
    });

    socketRef.current.on('videoCall:started', ({ startedBy }) => {
      setCallInProgress(true);
      setCallStartedBy(startedBy);
    });

    socketRef.current.on('videoCall:ended', () => {
      cleanupCall();
    });

    socketRef.current.on('all-users', (users) => {
      setMembers([{ socketId: socketRef.current.id, userName: username }, ...users]);
      if (streamRef.current) {
        const peersArr = [];
        users.forEach(({ socketId }) => {
          if (socketId === socketRef.current.id) return;
          const peer = createPeer(socketId, socketRef.current.id, streamRef.current);
          peersRef.current.push({ peerID: socketId, peer });
          peersArr.push({ peerID: socketId, peer });
        });
        setPeers(peersArr);
      }
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
      if (item) item.peer.signal(signal);
    });

    socketRef.current.on('user-disconnected', (id) => {
      setMembers((prev) => prev.filter((m) => m.socketId !== id));
      const peerObj = peersRef.current.find(p => p.peerID === id);
      if (peerObj) peerObj.peer.destroy();
      peersRef.current = peersRef.current.filter(p => p.peerID !== id);
      setPeers((prevPeers) => prevPeers.filter(p => p.peerID !== id));
    });

    return () => {
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
    };
  }, [workspaceId, username, user.id, user.userId, user.sub]);

  // --- Setup user media ---
  useEffect(() => {
    if (!callActive) return;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (userVideo.current) userVideo.current.srcObject = stream;
        setHasJoinedCall(true);
      })
      .catch((err) => {
        console.error('❌ Error accessing media devices:', err);
        alert('Could not access camera/microphone. Check your browser permissions.');
        setCallActive(false);
      });

    return () => cleanupCall();
  }, [callActive]);

  const cleanupCall = () => {
    setCallInProgress(false);
    setHasJoinedCall(false);
    setCallActive(false);
    setCallStartedBy(null);

    peersRef.current.forEach(({ peer }) => peer.destroy());
    peersRef.current = [];
    setPeers([]);

    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    screenStreamRef.current = null;

    setCamEnabled(true);
    setMicEnabled(true);
    setScreenSharing(false);
  };

  const createPeer = (userToSignal, callerID, stream) => {
    const peer = new SimplePeer({ initiator: true, trickle: false, stream });
    peer.on('signal', signal => {
      socketRef.current.emit('signal', { to: userToSignal, from: callerID, signal });
    });
    return peer;
  };

  const addPeer = (incomingSignalId, stream) => {
    const peer = new SimplePeer({ initiator: false, trickle: false, stream });
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

        peersRef.current.forEach(({ peer }) => {
          const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenStream.getVideoTracks()[0]);
        });

        if (userVideo.current) {
          const combinedStream = new MediaStream([...streamRef.current.getAudioTracks(), ...screenStream.getVideoTracks()]);
          userVideo.current.srcObject = combinedStream;
        }

        screenStream.getVideoTracks()[0].onended = () => stopScreenSharing();
      } catch (err) {
        console.error('Screen sharing failed:', err);
        alert('Failed to share screen. Make sure you allow permission and your browser supports it.');
      }
    } else stopScreenSharing();
  };

  const stopScreenSharing = () => {
    if (!screenSharing) return;

    const videoTrack = streamRef.current?.getVideoTracks()[0];

    peersRef.current.forEach(({ peer }) => {
      const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(videoTrack);
    });

    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    screenStreamRef.current = null;

    if (userVideo.current) userVideo.current.srcObject = streamRef.current;

    setScreenSharing(false);
  };

  const isFirstUser = () => members.length === 1 && members[0].socketId === socketRef.current.id;
  const canEndCall = () => hasJoinedCall;

  const startCall = () => {
    setCallActive(true);
    setCallInProgress(true);
    setCallStartedBy(socketRef.current.id);
    socketRef.current.emit('videoCall:start', { workspaceId, startedBy: socketRef.current.id });
  };

  const endCall = () => {
    socketRef.current.emit('videoCall:end', { workspaceId });
    cleanupCall();
  };

  return (
    <div className="flex flex-col w-full max-w-screen-xl mx-auto space-y-4 p-4">
      {!callInProgress && !callActive ? (
        <div className="flex flex-col items-center justify-center w-full h-96 md:h-auto bg-white rounded-lg shadow p-10 text-center space-y-6">
          {isFirstUser() ? (
            <>
              <h2 className="text-4xl font-extrabold text-gray-700">Start Call</h2>
              <p className="text-lg text-gray-600 max-w-md">Click below to start a video call for this workspace.</p>
              <button
                disabled={!socketConnected}
                className="px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={startCall}
              >
                Start Call
              </button>
            </>
          ) : (
            <>
              <h2 className="text-4xl font-extrabold text-gray-700">Call Not Started</h2>
              <p className="text-lg text-gray-600 max-w-md">Waiting for someone to start the call.</p>
              <button
                disabled={!socketConnected}
                className="px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setCallActive(true)}
              >
                Join Call
              </button>
            </>
          )}
        </div>
      ) : !hasJoinedCall && callInProgress ? (
        <div className="flex flex-col items-center justify-center w-full h-96 md:h-auto bg-white rounded-lg shadow p-10 text-center space-y-6">
          <h2 className="text-4xl font-extrabold text-gray-700">Call in Progress</h2>
          <p className="text-lg text-gray-600 max-w-md">A call is already in progress. Click below to join.</p>
          <button
            disabled={!socketConnected}
            className="px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setCallActive(true)}
          >
            Join Call
          </button>
        </div>
      ) : (
        <div className="flex flex-col w-full rounded-lg shadow-lg bg-white p-4 space-y-4">
          <div className="flex flex-wrap justify-center space-x-4 space-y-4">
            <div className="relative w-48 h-36 bg-black rounded-md overflow-hidden">
              <video ref={userVideo} autoPlay muted playsInline className="w-full h-full object-cover" />
              <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 rounded px-2 py-1 text-white text-sm flex items-center space-x-2">
                <span>{username || 'You'}</span>
                <FontAwesomeIcon icon={camEnabled ? faVideo : faVideoSlash} className={camEnabled ? 'text-green-400' : 'text-red-400'} />
                <FontAwesomeIcon icon={micEnabled ? faMicrophone : faMicrophoneSlash} className={micEnabled ? 'text-green-400' : 'text-red-400'} />
                {screenSharing && <FontAwesomeIcon icon={faDesktop} className="ml-2 text-blue-400" title="Screen Sharing" />}
              </div>
            </div>

            {peers.map(({ peerID, peer }) => (
              <Video key={peerID} peer={peer} peerID={peerID} members={members} />
            ))}
          </div>

          {callStartedBy && (
            <div className="text-sm text-gray-500 mt-2 text-center">
              Call started by: {members.find(m => m.socketId === callStartedBy)?.userName || 'Unknown'}
            </div>
          )}

          <div className="flex space-x-4 justify-center mt-4">
            <button onClick={toggleCamera} className={`px-4 py-2 rounded-md font-semibold ${camEnabled ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-400'} text-white`} title={camEnabled ? 'Turn off camera' : 'Turn on camera'}>
              <FontAwesomeIcon icon={camEnabled ? faVideo : faVideoSlash} />
            </button>

            <button onClick={toggleMic} className={`px-4 py-2 rounded-md font-semibold ${micEnabled ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-400'} text-white`} title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}>
              <FontAwesomeIcon icon={micEnabled ? faMicrophone : faMicrophoneSlash} />
            </button>

            <button onClick={toggleScreenSharing} className={`px-4 py-2 rounded-md font-semibold ${screenSharing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-500 hover:bg-gray-600'} text-white`} title={screenSharing ? 'Stop screen sharing' : 'Start screen sharing'}>
              <FontAwesomeIcon icon={faDesktop} />
            </button>

            {canEndCall() && (
              <button onClick={endCall} className="ml-auto px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold" title="End Call">
                End Call
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Video = ({ peer, peerID, members }) => {
  const ref = useRef();

  useEffect(() => {
    peer.on('stream', stream => {
      if (ref.current) ref.current.srcObject = stream;
    });
  }, [peer]);

  const username = members.find(m => m.socketId === peerID)?.userName || 'User';

  return (
    <div className="relative w-48 h-36 bg-black rounded-md overflow-hidden">
      <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />
      <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 rounded px-2 py-1 text-white text-sm">{username}</div>
    </div>
  );
};

export default VideoCall;
