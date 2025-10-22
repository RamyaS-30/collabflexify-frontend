import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';

export default function JoinWorkspace() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const [message, setMessage] = useState('Joining workspace...');
  const API_BASE=process.env.REACT_APP_BACKEND_URL

  useEffect(() => {
    if (!isLoaded) return;

    const join = async () => {
      if (!user) {
        setMessage('Please log in to join workspace.');
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/workspace/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clerkUserId: user.id,
            inviteCode,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }

        setMessage('Successfully joined workspace! Redirecting...');
        setTimeout(() => navigate('/dashboard'), 1500);
      } catch (err) {
        setMessage('Failed to join workspace. ' + err.message);
      }
    };

    join();
  }, [inviteCode, user, isLoaded, navigate, API_BASE]);

  return (
    <div className="p-6 text-center">
      <h2 className="text-xl font-semibold mb-2">Workspace Invitation</h2>
      <p>{message}</p>
    </div>
  );
}