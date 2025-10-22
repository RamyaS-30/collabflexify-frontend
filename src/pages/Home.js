import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-300 to-blue-200 px-4">
      <div className="bg-white shadow-2xl rounded-xl p-10 max-w-xl w-full text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Welcome to CollabFlexify 🚀</h1>
        <p className="text-gray-600 mb-6">
          A real-time collaborative workspace with chat, docs, tasks, and more.
        </p>

        <div className="flex justify-center gap-4">
          <button
            onClick={() => navigate("/login")}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition"
          >
            Login
          </button>
          <button
            onClick={() => navigate("/signup")}
            className="bg-purple-600 text-white px-6 py-2 rounded hover:bg-purple-700 transition"
          >
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}