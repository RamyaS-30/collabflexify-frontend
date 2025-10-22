import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export default function Chat({ workspaceId, user }) {
  const socketRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [error, setError] = useState(null);

  const bottomRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Connect socket
  useEffect(() => {
    socketRef.current = io(API_BASE);
    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isAtBottom && bottomRef.current) {
      requestAnimationFrame(() => {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, [messages, isAtBottom]);

  // Track scroll position
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const isBottom =
        container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
      setIsAtBottom(isBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch and subscribe
  useEffect(() => {
    if (!workspaceId || !socketRef.current) return;

    const socket = socketRef.current;
    socket.emit('joinRoom', workspaceId);

    fetch(`${API_BASE}/api/chat/${workspaceId}`)
      .then((res) => res.json())
      .then(setMessages)
      .catch((err) => {
        console.error('Failed to fetch chat:', err);
        setError('Could not load chat history.');
      });

    const handleReceive = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    socket.on('receiveMessage', handleReceive);

    return () => {
      socket.emit('leaveRoom', workspaceId);
      socket.off('receiveMessage', handleReceive);
    };
  }, [workspaceId]);

  const sendMessage = async () => {
    if (!newMsg.trim()) return;

    const message = {
      workspaceId,
      sender: user.username,
      content: newMsg,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, message]);

    try {
      socketRef.current.emit('sendMessage', { workspaceId, message });

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!res.ok) throw new Error('Failed to save message');
    } catch (err) {
      console.error('Send failed:', err);
      setError('Failed to send message.');
    }

    setNewMsg('');
  };

  // Utils to group messages by day
  const groupMessagesByDate = (messages) => {
    const grouped = {};

    [...messages].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach((msg) => {
      const date = new Date(msg.timestamp);
      const dateKey = date.toDateString(); // "Mon Oct 13 2025"
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(msg);
    });

    return grouped;
  };

  const formatDateHeading = (dateStr) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const date = new Date(dateStr);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div className="bg-white rounded shadow-md p-4 mt-6 relative">
      <h3 className="text-xl font-semibold mb-4">Workspace Chat</h3>

      <div
        ref={chatContainerRef}
        className="h-64 overflow-y-auto border p-2 rounded bg-gray-50 flex flex-col space-y-2 relative"
      >
        {Object.entries(groupedMessages).map(([dateKey, msgs]) => (
          <React.Fragment key={dateKey}>
            <div className="text-center font-bold text-md text-gray-500 my-2">
              — {formatDateHeading(dateKey)} —
            </div>
            {msgs.map((msg, idx) => {
              const isOwnMessage = msg.sender === user.username;
              return (
                <div
                  key={idx}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs md:max-w-md px-3 py-2 rounded-lg shadow
                      ${isOwnMessage
                        ? 'bg-blue-500 text-white rounded-tl-lg rounded-bl-lg rounded-br-none'
                        : 'bg-gray-200 text-gray-800 rounded-tr-lg rounded-br-lg rounded-bl-none'
                      }`}
                  >
                    <p className="text-sm font-semibold">{msg.sender}</p>
                    <p className="text-sm">{msg.content}</p>
                    <p
                      className="text-xs text-right opacity-70 mt-1"
                      title={new Date(msg.timestamp).toLocaleString()}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      
                    </p>
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}

        {messages.length === 0 && (
          <div className="text-gray-500 text-sm text-center">No messages yet.</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {!isAtBottom && (
        <button
          onClick={() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="absolute bottom-24 right-4 bg-blue-500 text-white px-3 py-1 rounded-full text-sm shadow hover:bg-blue-600 z-10"
        >
          ↓ New messages
        </button>
      )}

      <div className="mt-4 flex gap-2">
        <input
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          className="border border-gray-300 px-4 py-2 w-full rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Type a message..."
        />
        <button
          onClick={sendMessage}
          disabled={!newMsg.trim()}
          className={`px-4 py-2 rounded text-white transition ${
            newMsg.trim()
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          Send
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}