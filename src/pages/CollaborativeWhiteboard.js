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
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const isDrawing = useRef(false);
  const stageRef = useRef(null);
  const socketRef = useRef();
  const saveTimeoutRef = useRef(null);

  // Dynamically resize canvas based on screen size
  useEffect(() => {
    const updateSize = () => {
      const width = Math.min(window.innerWidth * 0.9, 900);
      const height = Math.min(window.innerHeight * 0.6, 600);
      setDimensions({ width, height });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const saveLinesToBackend = useCallback(
    (linesToSave) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        fetch(`${SOCKET_SERVER_URL}/api/whiteboard/${workspaceId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: linesToSave }),
        }).catch((err) => console.error('Failed to save whiteboard:', err));
      }, 1000);
    },
    [workspaceId]
  );

  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER_URL);
    socketRef.current.emit('joinRoom', { roomId: workspaceId, userName });

    fetch(`${SOCKET_SERVER_URL}/api/whiteboard/${workspaceId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.lines && Array.isArray(data.lines)) setLines(data.lines);
      })
      .catch((err) => console.error('Failed to load whiteboard:', err));

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
        const updatedLine = { ...lastLine, points: lastLine.points.concat([point.x, point.y]) };
        const updatedLines = [...prevLines.slice(0, -1), updatedLine];
        emitLineThrottled(updatedLine);
        return updatedLines;
      });
    },
    [emitLineThrottled]
  );

  const handleMouseUp = useCallback(() => (isDrawing.current = false), []);
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

  const handleSaveNow = useCallback(() => saveLinesToBackend(lines), [lines, saveLinesToBackend]);

  return (
    <div
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        {/* Color Palette */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <label style={{ fontWeight: '700', fontSize: 15 }}>Color</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setIsErasing(false);
                  setColor(c);
                }}
                style={{
                  backgroundColor: c,
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  border: c === color && !isErasing ? '2px solid #333' : '1px solid #ccc',
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
                borderRadius: 6,
                border: '1px solid #ccc',
              }}
              title="Pick color"
            />
          </div>
        </div>

        {/* Brush size */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <label style={{ fontWeight: '700' }}>Brush</label>
          <input
            type="range"
            min="1"
            max="20"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            style={{ width: 100 }}
          />
        </div>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'center',
          }}
        >
          <button onClick={handleUndo} style={{ ...buttonStyle, backgroundColor: '#d69e2e', color: 'white' }}>
            Undo
          </button>
          <button onClick={handleClear} style={{ ...buttonStyle, backgroundColor: '#e53e3e', color: 'white' }}>
            Clear
          </button>
          <button onClick={handleExport} style={{ ...buttonStyle, backgroundColor: '#38a169', color: 'white' }}>
            Export
          </button>
          <button onClick={handleSaveNow} style={{ ...buttonStyle, backgroundColor: '#3182ce', color: 'white' }}>
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
      <div style={{ width: '100%', overflow: 'hidden' }}>
        <Stage
          width={dimensions.width}
          height={dimensions.height}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          ref={stageRef}
          style={{
            width: '100%',
            border: '1px solid #ccc',
            background: 'white',
            borderRadius: 8,
          }}
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
    </div>
  );
};

export default CollaborativeWhiteboard;
