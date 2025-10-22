import React, { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const CollaborativeEditor = ({ user, workspaceId, docId, onDocumentUpdate }) => {
  const [docName, setDocName] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState('connecting');

  const backendUrl = process.env.REACT_APP_BACKEND_URL;

  const [ydoc, setYdoc] = useState(() => new Y.Doc());

useEffect(() => {
  setYdoc(new Y.Doc());
}, [docId]);

  // Load document content
  useEffect(() => {
    if (!docId) return;

    let cancelled = false;

    const fetchDoc = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/documents/${docId}`);
        const { data, name } = await res.json();

        if (!cancelled && data) {
          const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
          ydoc.transact(() => {
            Y.applyUpdate(ydoc, binary);
          });
        }

        if (!cancelled) {
          setDocName(name || 'Untitled Document');
          setIsReady(true);
        }
      } catch (err) {
        console.error('Error loading document:', err);
      }
    };

    setIsReady(false);
    fetchDoc();

    return () => {
      cancelled = true;
    };
  }, [docId, ydoc, backendUrl]);

  // WebSocket collaboration
  useEffect(() => {
    if (!docId || !isReady) return;

    const provider = new WebsocketProvider(
      `ws://localhost:1234/${docId}?workspaceId=${workspaceId}`,
      docId,
      ydoc
    );

    provider.awareness.setLocalStateField('user', {
      name: user?.username || user?.email || 'Anonymous',
      color: user?.color || '#ffa500',
    });

    provider.on('status', event => {
      setStatus(event.status);
    });

    return () => {
      provider.destroy();
      setStatus('disconnected');
    };
  }, [docId, isReady, user, ydoc, workspaceId]);

  // TipTap editor setup
  const editor = useEditor(
    {
      extensions: [StarterKit, Collaboration.configure({ document: ydoc })],
      content: '',
    },
    [ydoc]
  );

  // Save document to backend
  const saveDocument = async () => {
    if (!ydoc || !docId) return;

    const update = Y.encodeStateAsUpdate(ydoc);
    const base64Data = btoa(String.fromCharCode(...update));

    try {
      await fetch(`${backendUrl}/api/documents/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64Data, name: docName }),
      });
      console.log('✅ Document saved');
      if (onDocumentUpdate) {
      onDocumentUpdate({ docId, name: docName }); 
    }
    } catch (err) {
      console.error('❌ Failed to save document:', err);
    }
  };

  return (
    <div className="flex min-h-screen">
      <main className="flex-1 p-6 bg-white">
        {!isReady || !editor ? (
          <div className="text-center mt-10">
            <div className="loader mb-2 border-4 border-blue-400 border-t-transparent rounded-full w-8 h-8 animate-spin mx-auto"></div>
            <p className="text-gray-600">Loading document...</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <input
                type="text"
                value={docName}
                onChange={e => setDocName(e.target.value)}
                className="text-xl font-semibold text-gray-800 w-full border-b-2 focus:outline-none mb-2"
              />
              <span
                className={`text-sm px-3 py-1 rounded-full ${
                  status === 'connected'
                    ? 'bg-green-100 text-green-600'
                    : 'bg-red-100 text-red-600'
                }`}
              >
                {status}
              </span>
            </div>

            <EditorContent
              editor={editor}
              className="prose max-w-full border border-gray-200 rounded-md p-4 min-h-[300px] focus:outline-none"
            />

            <button
              onClick={saveDocument}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default CollaborativeEditor;