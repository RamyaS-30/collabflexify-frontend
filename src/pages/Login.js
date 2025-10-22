// src/pages/Login.js
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignIn, useAuth } from '@clerk/clerk-react';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();

  // If already signed in (explicit true), go to dashboard
  useEffect(() => {
    if (isSignedIn === true) {
      navigate('/dashboard');
    }
  }, [isSignedIn, navigate]);

  const handleChange = (e) => {
    setForm((s) => ({ ...s, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // create sign-in attempt
      const result = await signIn.create({
        identifier: form.email,
        password: form.password,
      });

      // If the sign-in flow completed, activate the session and navigate
      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });

        // Don't fetch backend user here — let Dashboard do it after the session is active.
        navigate('/dashboard');
      } else {
        // If result.status !== 'complete', Clerk may require multi-step (MFA/email verification, etc.)
        console.warn('Sign-in requires additional steps:', result);
        setError('Sign-in requires additional steps. Check your email / MFA flow.');
      }
    } catch (err) {
      console.error('Login error:', err);
      // Friendly extraction of message
      const message = err?.errors?.[0]?.message || err?.message || 'Login failed.';
      setError(message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-200 to-blue-200 flex justify-items-center">
      <form onSubmit={handleSubmit} className="bg-white shadow-2xl m-auto p-8 rounded-lg max-w-md w-full">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">Login</h2>
        {error && <p className="text-red-600 mb-4">{error}</p>}

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
          />
        </div>

        <div className="flex justify-center">
          <button type="submit" className="bg-blue-500 text-white px-5 py-1.5 rounded-md hover:bg-blue-600">
            Login
          </button>
        </div>

        <div className="text-center mt-6">
          <p className="text-gray-600 text-sm">
            Don't have an account?{' '}
            <button type="button" onClick={() => navigate('/signup')} className="text-blue-600 hover:underline font-medium">
              Sign up
            </button>
          </p>
        </div>

        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => navigate('/forgot-password')}
            className="text-blue-600 hover:underline text-sm"
          >
            Forgot Password?
          </button>
        </div>
      </form>
    </div>
  );
}