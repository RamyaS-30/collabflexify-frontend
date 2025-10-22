import { useState } from 'react';
import { useSignIn } from '@clerk/clerk-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const { signIn } = useSignIn();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('');

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });

      setStatus('✅ Check your email for password reset instructions.');
    } catch (err) {
      console.error(err);
      setStatus(err.errors?.[0]?.message || '❌ Failed to send reset email.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-200 to-blue-200 flex justify-items-center">
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-2xl m-auto p-8 rounded-lg max-w-md w-full"
      >
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">Forgot Password</h2>
        {status && (
          <p className="text-center text-blue-600 font-medium mb-4">{status}</p>
        )}

        <div className="mb-6">
          <label className="block text-md text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-1.5 border rounded-md focus:ring-2 focus:ring-blue-300"
            required
          />
        </div>
        <div className="flex justify-center">
          <button
            type="submit"
            className="bg-blue-500 text-white px-5 py-1.5 rounded-md"
          >
            Send Reset Link
          </button>
        </div>
      </form>
    </div>
  );
}
