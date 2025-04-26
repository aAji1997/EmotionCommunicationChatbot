import React, { useState, useEffect } from 'react';
import { socket } from '../socket';

const DebugPanel = ({ userId }) => {
  const [connectionStatus, setConnectionStatus] = useState('unknown');
  const [openaiStatus, setOpenaiStatus] = useState('unknown');
  const [debugInfo, setDebugInfo] = useState({});
  const [showDebug, setShowDebug] = useState(false);
  const [isStreamInitialized, setIsStreamInitialized] = useState(false);
  const [socketStats, setSocketStats] = useState({
    reconnectionAttempts: 0,
    lastPing: null,
    lastPong: null
  });

  useEffect(() => {
    // Listen for connection status updates
    socket.on('connection_status', (data) => {
      console.log('Connection status update:', data);
      setConnectionStatus(data.status);
      if (data.details) {
        setDebugInfo(prev => ({ ...prev, connection: data.details }));
      }
    });

    // Listen for OpenAI connection test results
    socket.on('openai_connection_test', (data) => {
      console.log('OpenAI connection test result:', data);
      setOpenaiStatus(data.status);
      setDebugInfo(prev => ({ ...prev, openai: data }));
    });

    // Listen for stream initialization
    socket.on('stream_initialized', (data) => {
      console.log('Stream initialized:', data);
      setIsStreamInitialized(true);
      setDebugInfo(prev => ({ ...prev, stream: { initialized: true, timestamp: new Date().toISOString() } }));
    });

    // Track socket reconnection attempts
    socket.on('reconnect_attempt', (attemptNumber) => {
      setSocketStats(prev => ({
        ...prev,
        reconnectionAttempts: attemptNumber
      }));
    });

    // Track ping/pong for connection health
    socket.io.on('ping', () => {
      setSocketStats(prev => ({
        ...prev,
        lastPing: new Date().toISOString()
      }));
    });

    socket.io.on('pong', () => {
      setSocketStats(prev => ({
        ...prev,
        lastPong: new Date().toISOString()
      }));
    });

    // Clean up listeners on unmount
    return () => {
      socket.off('connection_status');
      socket.off('openai_connection_test');
      socket.off('stream_initialized');
      socket.off('reconnect_attempt');
      if (socket.io) {
        socket.io.off('ping');
        socket.io.off('pong');
      }
    };
  }, []);

  // Initialize the stream if needed
  const ensureStreamInitialized = () => {
    if (!isStreamInitialized && userId) {
      console.log('Initializing stream for debugging...');
      socket.emit('initialize_stream', {
        user_id: userId,
        username: 'Samantha Groves' // Use the preferred test username
      });

      // Set a timeout to wait for initialization
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log('Stream initialization timeout');
          resolve(false);
        }, 5000);

        const handleInitialized = () => {
          clearTimeout(timeout);
          socket.off('stream_initialized', handleInitialized);
          console.log('Stream initialized for debugging');
          resolve(true);
        };

        socket.on('stream_initialized', handleInitialized);
      });
    }

    return Promise.resolve(isStreamInitialized);
  };

  const checkConnection = async () => {
    await ensureStreamInitialized();
    // Our new server doesn't have a check_connection event, so we'll just check the socket status
    setConnectionStatus(socket.connected ? 'connected' : 'disconnected');
  };

  const testOpenAIConnection = async () => {
    const initialized = await ensureStreamInitialized();
    if (initialized) {
      socket.emit('test_openai_connection');
    } else {
      console.error('Failed to initialize stream for OpenAI test');
      setOpenaiStatus('initialization_failed');
      setDebugInfo(prev => ({
        ...prev,
        openai: {
          status: 'error',
          message: 'Failed to initialize stream before testing'
        }
      }));
    }
  };

  const reconnectSocket = () => {
    if (!socket.connected) {
      console.log('Manually reconnecting socket...');
      socket.connect();
    } else {
      console.log('Socket is already connected');
    }
  };

  const toggleDebug = () => {
    setShowDebug(!showDebug);
  };

  // Get connection status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'connected':
      case 'success':
        return '#4CAF50'; // Green
      case 'disconnected':
      case 'error':
      case 'failed':
        return '#F44336'; // Red
      case 'reconnecting':
      case 'testing':
      case 'waiting_for_initialization':
        return '#FFC107'; // Yellow
      default:
        return '#9E9E9E'; // Gray
    }
  };

  return (
    <div className="debug-panel" style={{ position: 'fixed', bottom: '10px', right: '10px', zIndex: 1000 }}>
      <button
        onClick={toggleDebug}
        style={{
          backgroundColor: '#333',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        {showDebug ? 'Hide Debug' : 'Show Debug'}
      </button>

      {showDebug && (
        <div
          style={{
            backgroundColor: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '10px',
            borderRadius: '4px',
            marginTop: '5px',
            maxWidth: '300px',
            maxHeight: '400px',
            overflowY: 'auto'
          }}
        >
          <h4 style={{ margin: '0 0 10px 0' }}>Debug Panel</h4>

          <div style={{ marginBottom: '10px' }}>
            <div>
              Socket.IO:
              <span style={{ color: socket.connected ? '#4CAF50' : '#F44336', marginLeft: '5px' }}>
                {socket.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div>
              WebSocket:
              <span style={{ color: getStatusColor(connectionStatus), marginLeft: '5px' }}>
                {connectionStatus}
              </span>
            </div>
            <div>
              OpenAI:
              <span style={{ color: getStatusColor(openaiStatus), marginLeft: '5px' }}>
                {openaiStatus}
              </span>
            </div>
            <div>
              Stream:
              <span style={{ color: isStreamInitialized ? '#4CAF50' : '#F44336', marginLeft: '5px' }}>
                {isStreamInitialized ? 'Initialized' : 'Not Initialized'}
              </span>
            </div>
            <div>
              Reconnection Attempts: {socketStats.reconnectionAttempts}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '5px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={checkConnection}
              style={{
                backgroundColor: '#555',
                color: 'white',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Check Connection
            </button>

            <button
              onClick={testOpenAIConnection}
              style={{
                backgroundColor: '#555',
                color: 'white',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Test OpenAI
            </button>

            <button
              onClick={reconnectSocket}
              style={{
                backgroundColor: '#555',
                color: 'white',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Reconnect Socket
            </button>
          </div>

          <div>
            <h5 style={{ margin: '10px 0 5px 0', fontSize: '14px' }}>Debug Info:</h5>
            <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify({
                ...debugInfo,
                socket: {
                  connected: socket.connected,
                  id: socket.id,
                  reconnectionAttempts: socketStats.reconnectionAttempts,
                  lastPing: socketStats.lastPing,
                  lastPong: socketStats.lastPong
                }
              }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebugPanel;
