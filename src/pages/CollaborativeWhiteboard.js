import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import io from 'socket.io-client';

const SOCKET_SERVER_URL = process.env.REACT_APP_BACKEND_URL;

const COLORS = [
  '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FFA500',
  '#800080', '#00FFFF', '#FFC0CB', '#A52A2A', '#808080', '#008000',
];

const buttonStyle = {
  padding: '8px 14px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: 14,
  boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
  transition: 'background-color 0.25s ease',
  userSelect: 'none',
};

const CollaborativeWhiteboard = ({ workspaceId, userName }) => {
  const [lines, setLines] = useState([]);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(2);
  const [isErasing, setIsErasing] = useState(false);
  const isDrawing = useRef(false);
  const stageRef = useRef(null);
  const socketRef = useRef();
  const saveTimeoutRef = useRef(null);

  const saveLinesToBackend = useCallback(
    (linesToSave) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        fetch(`${SOCKET_SERVER_URL}/api/whiteboard/${workspaceId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: linesToSave }),
        }).catch((err) => {
          console.error('Failed to save whiteboard:', err);
        });
      }, 1000);
    },
    [workspaceId]
  );

  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER_URL);
    socketRef.current.emit('joinRoom', {
    roomId: workspaceId,
    userName: userName,
  });


    fetch(`${SOCKET_SERVER_URL}/api/whiteboard/${workspaceId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.lines && Array.isArray(data.lines)) {
          setLines(data.lines);
        }
      })
      .catch((err) => {
        console.error('Failed to load whiteboard:', err);
      });

    const handleNewLine = (line) => setLines((prev) => [...prev, line]);
    const handleClear = () => setLines([]);
    const handleUndo = () => setLines((prev) => prev.slice(0, -1));

    socketRef.current.on('whiteboard:new-line', handleNewLine);
    socketRef.current.on('whiteboard:clear', handleClear);
    socketRef.current.on('whiteboard:undo', handleUndo);

    return () => {
      socketRef.current.emit('leaveRoom', workspaceId);
      socketRef.current.off('whiteboard:new-line', handleNewLine);
      socketRef.current.off('whiteboard:clear', handleClear);
      socketRef.current.off('whiteboard:undo', handleUndo);
      socketRef.current.disconnect();
    };
  }, [workspaceId, userName]);

  const lastEmitRef = useRef(0);
  const emitLineThrottled = useCallback((line) => {
    const now = Date.now();
    if (now - lastEmitRef.current > 50) {
      socketRef.current.emit('whiteboard:new-line', line);
      lastEmitRef.current = now;
    }
  }, []);

  const handleMouseDown = useCallback(
    (e) => {
      isDrawing.current = true;
      const pos = e.target.getStage().getPointerPosition();
      const newLine = {
        points: [pos.x, pos.y],
        stroke: isErasing ? 'white' : color,
        strokeWidth: brushSize,
        lineCap: 'round',
        lineJoin: 'round',
        id: Date.now(),
        globalCompositeOperation: isErasing ? 'destination-out' : 'source-over',
      };
      setLines((prev) => [...prev, newLine]);
      socketRef.current.emit('whiteboard:new-line', { workspaceId, line: newLine });
    },
    [color, brushSize, isErasing, workspaceId]
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDrawing.current) return;

      const stage = e.target.getStage();
      const point = stage.getPointerPosition();

      setLines((prevLines) => {
        if (prevLines.length === 0) return prevLines;

        const lastLine = prevLines[prevLines.length - 1];
        const updatedLine = {
          ...lastLine,
          points: lastLine.points.concat([point.x, point.y]),
        };

        const updatedLines = [...prevLines.slice(0, -1), updatedLine];
        emitLineThrottled(updatedLine);

        return updatedLines;
      });
    },
    [emitLineThrottled]
  );

  const handleMouseUp = useCallback(() => {
    isDrawing.current = false;
  }, []);

  const handleClear = useCallback(() => {
    setLines([]);
    socketRef.current.emit('whiteboard:clear', { workspaceId });
  }, [workspaceId]);

  const handleUndo = useCallback(() => {
    setLines((prev) => {
      const updated = prev.slice(0, -1);
      socketRef.current.emit('whiteboard:undo', { workspaceId });
      return updated;
    });
  }, [workspaceId]);

  const handleExport = useCallback(() => {
    const uri = stageRef.current.toDataURL({ pixelRatio: 3 });
    const link = document.createElement('a');
    link.download = 'whiteboard.png';
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleSaveNow = useCallback(() => {
    saveLinesToBackend(lines);
  }, [lines, saveLinesToBackend]);

  return (
    <div style={{ maxWidth: 960, margin: '20px auto', padding: 16 }}>
      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 24 }}>
        {/* Color Palette */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontWeight: '700', fontSize: 16 }}>Color Palette</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setIsErasing(false);
                  setColor(c);
                }}
                style={{
                  backgroundColor: c,
                  width: 34,
                  height: 34,
                  borderRadius: 6,
                  border: c === color && !isErasing ? '3px solid #333' : '1px solid #ccc',
                  cursor: 'pointer',
                }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setIsErasing(false);
                setColor(e.target.value);
              }}
              style={{
                width: 34,
                height: 34,
                padding: 0,
                borderRadius: 6,
                border: '1px solid #ccc',
                cursor: 'pointer',
              }}
              title="Pick custom color"
            />
          </div>
        </div>

        {/* Brush Size */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontWeight: '700' }}>Brush Size</label>
          <input
            type="range"
            min="1"
            max="20"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            style={{ cursor: 'pointer' }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handleUndo}
            style={{ ...buttonStyle, backgroundColor: '#d69e2e', color: 'white' }}
          >
            Undo
          </button>
          <button
            onClick={handleClear}
            style={{ ...buttonStyle, backgroundColor: '#e53e3e', color: 'white' }}
          >
            Clear
          </button>
          <button
            onClick={handleExport}
            style={{ ...buttonStyle, backgroundColor: '#38a169', color: 'white' }}
          >
            Export
          </button>
          <button
            onClick={handleSaveNow}
            style={{ ...buttonStyle, backgroundColor: '#3182ce', color: 'white' }}
          >
            Save
          </button>
          <button
            onClick={() => setIsErasing((prev) => !prev)}
            style={{
              ...buttonStyle,
              backgroundColor: isErasing ? '#805ad5' : '#a0aec0',
              color: 'white',
            }}
          >
            {isErasing ? 'Eraser On' : 'Eraser Off'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <Stage
        width={window.innerWidth * 0.8}
        height={window.innerHeight * 0.6}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
        ref={stageRef}
        style={{ border: '1px solid #ccc', background: 'white', borderRadius: 8 }}
      >
        <Layer>
          {lines.map((line) => (
            <Line
              key={line.id}
              points={line.points}
              stroke={line.stroke}
              strokeWidth={line.strokeWidth}
              lineCap={line.lineCap}
              lineJoin={line.lineJoin}
              tension={0.5}
              globalCompositeOperation={line.globalCompositeOperation || 'source-over'}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
};

export default CollaborativeWhiteboard;