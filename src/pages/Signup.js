import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignUp } from '@clerk/clerk-react';

export default function Signup() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  const { isLoaded, signUp, setActive } = useSignUp();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!isLoaded) return;

    try {
      // 1️⃣ Create the user in Clerk
      const createdSignUp = await signUp.create({
        emailAddress: form.email,
        password: form.password,
        username: form.username,
      });

      // 2️⃣ Activate the session immediately (no verification)
      await setActive({ session: createdSignUp.createdSessionId });

      // 3️⃣ Optionally sync with your backend
      const clerkUserId = createdSignUp.createdUserId;
      const backendUrl = process.env.REACT_APP_BACKEND_URL;

      await fetch(`${backendUrl}/api/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clerkUserId,
          username: form.username,
          email: form.email,
        }),
      });

      // 4️⃣ Save locally and redirect
      const userData = {
        username: form.username,
        email: form.email,
        id: clerkUserId,
      };
      localStorage.setItem('user', JSON.stringify(userData));

      setSuccess('Signup successful! Redirecting...');
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err) {
      console.error('Signup error:', err);
      setError(err.errors?.[0]?.message || 'Signup failed.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-200 to-blue-200 flex justify-items-center">
      <form onSubmit={handleSubmit} className="bg-white shadow-2xl m-auto p-8 rounded-lg max-w-md w-full">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">Signup</h2>
  {success && (
    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4">
      <strong className="font-bold">Success!</strong>
      <span className="block sm:inline ml-1">{success}</span>
    </div>
  )}
  {error && (
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
      <strong className="font-bold">Error:</strong>
      <span className="block sm:inline ml-1">{error}</span>
    </div>
  )}

        <div className="mb-4">
          <label className="block text-md text-gray-700 mb-1">Username</label>
          <input
            name="username"
            value={form.username}
            onChange={handleChange}
            className="w-full px-4 py-1.5 border rounded-md focus:ring-2 focus:ring-blue-300"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-md text-gray-700 mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            className="w-full px-4 py-1.5 border rounded-md focus:ring-2 focus:ring-blue-300"
            required
          />
        </div>
        <div className="mb-6">
          <label className="block text-md text-gray-700 mb-1">Password</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            className="w-full px-4 py-1.5 border rounded-md focus:ring-2 focus:ring-blue-300"
            required
            minLength={6}
          />
        </div>
        <div className="flex justify-center">
          <button type="submit" className="bg-blue-500 text-white px-5 py-1.5 rounded-md">
            Sign Up
          </button>
        </div>
        <div className="text-center mt-6">
          <p className="text-gray-600 text-sm">
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} className="text-blue-600 hover:underline font-medium">
              Login
            </button>
          </p>
        </div>
      </form>
    </div>
  );
}
