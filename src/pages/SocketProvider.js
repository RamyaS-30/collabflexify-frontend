// SocketProvider.js
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const SOCKET_SERVER_URL = process.env.REACT_APP_BACKEND_URL;

const SocketContext = createContext();

export const SocketProvider = ({ user, children }) => {
  const socketRef = useRef(null);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    if (!user) return;

    socketRef.current = io(SOCKET_SERVER_URL, {
      auth: {
        userId: user.id || user.userId || user.sub,
      },
    });

    socketRef.current.on('connect', () => {
      setSocketConnected(true);
      console.log('Socket connected:', socketRef.current.id);
    });

    socketRef.current.on('disconnect', () => {
      setSocketConnected(false);
      console.log('Socket disconnected');
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, socketConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  return useContext(SocketContext);
};