import React, { useEffect, useState } from 'react';
import { useClerk, useUser, useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import Chat from './Chat';
import TaskBoard from './TaskBoard';
import CollaborativeEditor from './CollaborativeEditor';
import VideoCall from './VideoCall';
import CollaborativeWhiteboard from './CollaborativeWhiteboard';
import socket from '../socket';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function Dashboard() {
  const { signOut } = useClerk();
  const { user: clerkUser, isLoaded: clerkUserLoaded } = useUser();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [appUser, setAppUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [notifications, setNotifications] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const API_BASE=process.env.REACT_APP_BACKEND_URL

  useEffect(() => {
    const load = async () => {
      if (!clerkUserLoaded) return;

      if (!clerkUser) {
        navigate('/login');
        return;
      }

      try {
        const clerkId = clerkUser.id;
        const res = await fetch(`${API_BASE}/api/user/${clerkId}`);

        if (!res.ok) {
          const newUser = {
            id: clerkId,
            username: clerkUser.username || null,
            email:
              clerkUser.primaryEmailAddress?.emailAddress ||
              clerkUser.emailAddresses?.[0]?.emailAddress ||
              null,
          };
          setAppUser(newUser);
          localStorage.setItem('user', JSON.stringify(newUser));
        } else {
          const userData = await res.json();
          setAppUser(userData);
          socket.auth = { userId: clerkId };
          socket.connect();

          socket.on('connect', () => {
            console.log('✅ Connected to Socket.IO server');
          });

          socket.on('user-online', (userId) => {
            setOnlineUsers((prev) => new Set(prev).add(userId));
          });

          socket.on('user-offline', (userId) => {
            setOnlineUsers((prev) => {
              const updated = new Set(prev);
              updated.delete(userId);
              return updated;
            });
          });

          socket.on('notification', (notif) => {
            setNotifications((prev) => [notif, ...prev]);
            toast.info(`🔔 ${notif.type.replace('-', ' ')}`, {
              position: 'bottom-right',
            });
          });

          const fetchNotifications = async () => {
            try {
              const token = await getToken();
              const res = await fetch(`${API_BASE}/api/notifications`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
                credentials: 'include',
              });

              if (res.ok) {
                const data = await res.json();
                setNotifications(data);
              }
            } catch (err) {
              console.error('Error fetching notifications:', err);
            }
          };

          fetchNotifications();
          localStorage.setItem('user', JSON.stringify(userData));
        }

        const wsRes = await fetch(`${API_BASE}/api/workspace/user/${clerkId}`);
        if (wsRes.ok) {
          const wsData = await wsRes.json();
          setWorkspaces(wsData || []);
          if (wsData.length > 0) {
            setSelectedWorkspaceId(wsData[0]._id);
          }
        }
      } catch (err) {
        console.error('Error loading user:', err);
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => {
      socket.disconnect();
      socket.off('user-online');
      socket.off('user-offline');
      socket.off('notification');
    };
  }, [clerkUser, clerkUserLoaded, navigate, getToken, API_BASE]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setDocuments([]);
      setSelectedDocId(null);
      return;
    }

    const fetchDocuments = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/documents/workspace/${selectedWorkspaceId}`);
        if (res.ok) {
          const docs = await res.json();
          setDocuments(docs);
          if (docs.length > 0) {
            setSelectedDocId(docs[0].docId);
          } else {
            const createRes = await fetch(`${API_BASE}/api/documents/create`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                docId: `document-workspace-${selectedWorkspaceId}-default-${Date.now()}`,
                workspace: selectedWorkspaceId,
                name: 'Default Document',
                data: '',
              }),
            });

            if (createRes.ok) {
              const newDoc = await createRes.json();
              setDocuments([newDoc]);
              setSelectedDocId(newDoc.docId);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch documents', err);
      }
    };

    fetchDocuments();
  }, [selectedWorkspaceId, API_BASE]);

  const handleCreateDocument = async () => {
    const name = prompt('Enter new document name:');
    if (!name || !selectedWorkspaceId) return;

    try {
      const res = await fetch(`${API_BASE}/api/documents/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: `doc-${Date.now()}`,
          workspace: selectedWorkspaceId,
          name,
          data: '',
        }),
      });

      if (res.ok) {
        const newDoc = await res.json();
        setDocuments((prev) => [...prev, newDoc]);
        setSelectedDocId(newDoc.docId);
      }
    } catch (err) {
      console.error('Error creating document:', err);
    }
  };

  const handleDocumentUpdate = (updatedDoc) => {
    setDocuments((prevDocs) =>
      prevDocs.map((doc) => (doc.docId === updatedDoc.docId ? updatedDoc : doc))
    );
  };

  const handleLogout = async () => {
    try {
      await signOut({ redirectUrl: '/login' });
      localStorage.clear();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleCreateWorkspace = async () => {
    const clerkId = clerkUser?.id || appUser?.id;
    if (!clerkId) return;

    const name = prompt('Enter workspace name:');
    if (!name) return;

    try {
      const res = await fetch(`${API_BASE}/api/workspace/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerkUserId: clerkId, name }),
      });

      if (res.ok) {
        const wsRes = await fetch(`${API_BASE}/api/workspace/user/${clerkId}`);
        if (wsRes.ok) {
          const wsData = await wsRes.json();
          setWorkspaces(wsData || []);
          if (wsData.length > 0) setSelectedWorkspaceId(wsData[0]._id);
        }
      }
    } catch (err) {
      console.error('Error creating workspace:', err);
    }
  };

  const handleJoinWorkspace = async () => {
    const clerkId = clerkUser?.id;
    if (!clerkId) return;

    const input = prompt('Enter Workspace ID or Name to join:');
    if (!input) return;

    try {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(input);
      const payload = isObjectId
        ? { clerkUserId: clerkId, workspaceId: input }
        : { clerkUserId: clerkId, workspaceName: input };

      const res = await fetch(`${API_BASE}/api/workspace/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const wsRes = await fetch(`${API_BASE}/api/workspace/user/${clerkId}`);
        if (wsRes.ok) {
          const wsData = await wsRes.json();
          setWorkspaces(wsData || []);
          if (wsData.length > 0) setSelectedWorkspaceId(wsData[0]._id);
        }
      }
    } catch (err) {
      console.error('Error joining workspace:', err);
    }
  };

  const sendInvite = async () => {
    const workspace = workspaces.find((ws) => ws._id === selectedWorkspaceId);
    if (!workspace) return;

    const email = prompt('Enter user email to invite:');
    if (!email) return;

    try {
      const res = await fetch(`${API_BASE}/api/workspace/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace._id,
          inviteeEmail: email,
        }),
      });

      if (res.ok) toast.success('Invitation sent!');
      else toast.error('Failed to send invitation');
    } catch (err) {
      console.error('Error sending invite:', err);
    }
  };

  const renderTabContent = () => {
  switch (activeTab) {
    case 'chat':
      return <Chat workspaceId={selectedWorkspaceId} user={appUser} />;
    case 'tasks':
      return <TaskBoard workspaceId={selectedWorkspaceId} user={appUser} />;

    case 'document':
      return selectedDocId ? (
        <div className="bg-white rounded shadow-md p-4 flex flex-col md:flex-row gap-4">
          {/* Sidebar */}
          <div className="w-full md:w-1/4 border-r md:border-r-gray-300 pr-4 max-h-[600px] overflow-y-auto">
            <h3 className="font-semibold text-gray-700 mb-3">📄 Documents</h3>
            <ul className="space-y-1">
              {documents.map((doc) => (
                <li
                  key={doc.docId}
                  onClick={() => setSelectedDocId(doc.docId)}
                  className={`p-2 rounded cursor-pointer ${
                    selectedDocId === doc.docId
                      ? 'bg-blue-500 text-white'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  {doc.name || doc.docId}
                </li>
              ))}
            </ul>
            <button
              onClick={handleCreateDocument}
              className="mt-4 w-full px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              + New Document
            </button>
          </div>

          {/* Editor */}
          <div className="flex-1">
            <h3 className="font-semibold text-gray-700 mb-2">📝 Editor</h3>
            <div className="border rounded p-2 bg-gray-50">
              <CollaborativeEditor
                docId={selectedDocId}
                user={appUser}
                workspaceId={selectedWorkspaceId}
                onDocumentUpdate={handleDocumentUpdate}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-4 rounded shadow-md">
          <p className="text-gray-600">No document selected or available.</p>
        </div>
      );

    case 'video':
      return (
        <div className="bg-white p-4 rounded shadow-md">
          <h3 className="font-semibold text-gray-700 mb-4">🎥 Video Call</h3>
          <VideoCall workspaceId={selectedWorkspaceId} user={appUser} />
        </div>
      );

    case 'whiteboard':
      return (
        <div className="bg-white p-4 rounded shadow-md">
          <h3 className="font-semibold text-gray-700 mb-4">🧑‍🎨 Collaborative Whiteboard</h3>
          <CollaborativeWhiteboard workspaceId={selectedWorkspaceId} username={appUser?.username} />
        </div>
      );

    default:
      return null;
  }
};

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside
  className={`${
    sidebarOpen ? 'block' : 'hidden'
  } md:block w-full md:w-64 bg-white border-b md:border-b-0 md:border-r p-4 overflow-y-auto`}
>
        <h2 className="text-xl font-bold mb-4">Workspaces</h2>
        <ul className="space-y-2">
          {workspaces.map((ws) => (
            <li
  key={ws._id}
  onClick={() => {
    setSelectedWorkspaceId(ws._id);
    setSidebarOpen(false); // 👈 this closes sidebar on mobile
  }}
              className={`p-2 rounded cursor-pointer ${
                selectedWorkspaceId === ws._id ? 'bg-blue-100 font-semibold' : 'hover:bg-gray-100'
              }`}
            >
              {ws.name}
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-2">
          <button onClick={handleCreateWorkspace} className="w-full bg-blue-500 text-white p-2 rounded">
            + New Workspace
          </button>
          <button onClick={handleJoinWorkspace} className="w-full bg-green-500 text-white p-2 rounded">
            + Join Workspace
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden bg-blue-600 text-white px-3 py-2 rounded mb-2"
          >
            ☰ Menu
          </button>
          <h1 className="text-3xl font-bold text-center flex-1">
            {workspaces.find((ws) => ws._id === selectedWorkspaceId)?.name || 'Dashboard'}
          </h1>
          <div className="flex items-center gap-4">
            {appUser?.username && (
    <span className="text-gray-700 font-semibold">👤 {appUser.username}</span>
  )}
            <button onClick={() => setShowNotificationPanel(!showNotificationPanel)}>🔔</button>
            <button onClick={handleLogout} className="bg-red-500 text-white px-4 py-2 rounded">
              Logout
            </button>
          </div>
        </header>

        {showNotificationPanel && (
          <div className="mb-4 p-4 bg-white border rounded">
            <h3 className="font-semibold mb-2">Notifications</h3>
            <ul className="space-y-1 text-sm">
              {notifications.map((n) => (
                <li key={n._id} className="text-gray-800">
                  📌 {n.type}
                </li>
              ))}
            </ul>
          </div>
        )}

        {selectedWorkspaceId && (
          <>
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="text-blue-600 hover:underline mb-2"
            >
              {showInvite ? '▼ Hide' : '▶ Show'} Invite Options
            </button>

            {showInvite && (
              <div className="bg-blue-50 p-4 border border-blue-200 rounded mb-4">
                <p className="text-sm text-gray-700">
                  Invite Link:{' '}
                  <code className="bg-white px-2 py-1 rounded text-blue-600">
                    {`${window.location.origin}/join/${
                      workspaces.find((ws) => ws._id === selectedWorkspaceId)?.inviteCode
                    }`}
                  </code>
                </p>
                <button
                  onClick={() => {
                    const link = `${window.location.origin}/join/${
                      workspaces.find((ws) => ws._id === selectedWorkspaceId)?.inviteCode
                    }`;
                    navigator.clipboard.writeText(link);
                    toast.success('Invite link copied!');
                  }}
                  className="text-sm text-blue-600 hover:underline mr-4"
                >
                  Copy Invite Link
                </button>
                <button onClick={sendInvite} className="text-sm text-green-600 hover:underline">
                  Send Email Invite
                </button>
              </div>
            )}
          </>
        )}

        <div className="mb-4 flex gap-2 overflow-x-auto whitespace-nowrap px-1">
          {['chat', 'tasks', 'document', 'video', 'whiteboard'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {onlineUsers.size > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-green-700">Online Users:</h3>
            <ul className="flex flex-wrap gap-2 text-sm text-green-600">
              {[...onlineUsers].map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          </div>
        )}

        {renderTabContent()}
      </main>
      <ToastContainer />
    </div>
  );
}
