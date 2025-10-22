import { useState } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';

export default function ResetPasswordPage() {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const { signIn } = useSignIn();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('');

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password,
      });

      if (result.status === 'complete') {
        setStatus('✅ Password reset successfully!');
        navigate('/login'); // redirect to login page
      } else {
        setStatus('Unexpected status. Please try again.');
      }
    } catch (err) {
      console.error(err);
      setStatus(err.errors?.[0]?.message || '❌ Reset failed.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-200 to-blue-200">
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-2xl p-8 rounded-lg w-full max-w-md"
      >
        <h2 className="text-3xl font-bold text-center mb-4 text-gray-900">
          Reset Password
        </h2>

        {status && (
          <p className="text-center text-blue-600 font-medium mb-4">{status}</p>
        )}

        <div className="mb-4">
          <label className="block text-md text-gray-700 mb-1">Verification Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter the code from your email"
            className="w-full px-4 py-1.5 border rounded-md focus:ring-2 focus:ring-blue-300"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-md text-gray-700 mb-1">New Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password"
            className="w-full px-4 py-1.5 border rounded-md focus:ring-2 focus:ring-blue-300"
            required
            minLength={6}
          />
        </div>

        <div className="flex justify-center">
          <button
            type="submit"
            className="bg-blue-500 text-white px-5 py-1.5 rounded-md"
          >
            Reset Password
          </button>
        </div>
      </form>
    </div>
  );
}