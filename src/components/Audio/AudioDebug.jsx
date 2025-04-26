import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../../socket';

const AudioDebug = () => {
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState(0);
  const [responses, setResponses] = useState([]);

  const streamRef = useRef(null);
  const audioContextRef = useRef(null);

  // Add a log entry with timestamp
  const addLog = (message) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    setLogs(prev => [`${timestamp} - ${message}`, ...prev.slice(0, 99)]);
  };

  useEffect(() => {
    // Set up socket event listeners
    socket.on('connect', () => {
      setIsConnected(true);
      addLog('Socket connected');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      addLog('Socket disconnected');
    });

    socket.on('error', (data) => {
      addLog(`Error: ${data.message}`);
    });

    socket.on('stream_initialized', (data) => {
      addLog(`Stream initialized: ${JSON.stringify(data)}`);
    });

    socket.on('text_response', (data) => {
      addLog(`Text response: ${data.delta}`);
      setResponses(prev => [...prev, { type: 'text', content: data.delta }]);
    });

    socket.on('audio_response', (data) => {
      addLog(`Audio response received: ${data.delta ? data.delta.length : 0} bytes`);
      setResponses(prev => [...prev, { type: 'audio', content: data.delta }]);
    });

    socket.on('response_complete', () => {
      addLog('Response complete');
    });

    socket.on('transcript', (data) => {
      addLog(`Transcript: ${data.text}`);
    });

    // Clean up on unmount
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('error');
      socket.off('stream_initialized');
      socket.off('text_response');
      socket.off('audio_response');
      socket.off('response_complete');
      socket.off('transcript');

      // Stop recording if active
      if (isRecording) {
        stopRecording();
      }
    };
  }, [isRecording]);

  // Initialize stream with user ID
  const initializeStream = () => {
    const userId = '1cd51eec-8d9c-4f3e-be33-49a2e363073e'; // Hardcoded for testing
    const username = 'Samantha Groves';

    addLog(`Initializing stream for user ${username} (${userId})`);
    socket.emit('initialize_stream', {
      user_id: userId,
      username: username
    });
  };

  // Start recording audio
  const startRecording = async () => {
    try {
      addLog('Starting recording...');

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);

      // Create processor node
      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);

      // Rate limiting
      let lastChunkTime = 0;
      const CHUNK_INTERVAL = 100; // ms

      processorNode.onaudioprocess = (e) => {
        // Rate limit
        const now = Date.now();
        if (now - lastChunkTime < CHUNK_INTERVAL) return;
        lastChunkTime = now;

        try {
          // Get audio data
          const inputData = e.inputBuffer.getChannelData(0);

          // Check if audio is silent
          const isAudible = inputData.some(sample => Math.abs(sample) > 0.01);
          if (!isAudible) return;

          // Convert to 16-bit PCM
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
          }

          // Convert to buffer
          const buffer = new ArrayBuffer(pcmData.length * 2);
          const view = new DataView(buffer);
          for (let i = 0; i < pcmData.length; i++) {
            view.setInt16(i * 2, pcmData[i], true);
          }

          // Convert to base64
          let binary = '';
          const bytes = new Uint8Array(buffer);
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Data = btoa(binary);

          // Send to server
          socket.emit('audio_chunk', { audio: base64Data });
          addLog(`Sent audio chunk: ${base64Data.length} bytes`);
          setAudioChunks(prev => prev + 1);
        } catch (err) {
          addLog(`Error processing audio: ${err.message}`);
        }
      };

      // Connect processor
      source.connect(processorNode);
      processorNode.connect(audioContext.destination);

      // Store for cleanup
      audioContextRef.current.processorNode = processorNode;

      setIsRecording(true);
      addLog('Recording started');
    } catch (err) {
      addLog(`Error starting recording: ${err.message}`);
    }
  };

  // Stop recording
  const stopRecording = () => {
    try {
      addLog('Stopping recording...');

      // Stop tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Clean up audio context
      if (audioContextRef.current) {
        if (audioContextRef.current.processorNode) {
          audioContextRef.current.processorNode.disconnect();
        }
        audioContextRef.current.close().catch(err => {
          addLog(`Error closing audio context: ${err.message}`);
        });
      }

      // Commit audio buffer
      addLog('Committing audio buffer...');
      socket.emit('commit_audio');
      addLog('Audio buffer commit event sent');

      setIsRecording(false);
      addLog('Recording stopped');
    } catch (err) {
      addLog(`Error stopping recording: ${err.message}`);
    }
  };

  // Test connection
  const testConnection = () => {
    socket.emit('test_openai_connection');
    addLog('Testing OpenAI connection...');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>Audio Debug Panel</h2>

      <div style={{ marginBottom: '20px' }}>
        <div>
          Socket Status: <span style={{ color: isConnected ? 'green' : 'red' }}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div>
          Recording Status: <span style={{ color: isRecording ? 'green' : 'red' }}>
            {isRecording ? 'Recording' : 'Not Recording'}
          </span>
        </div>
        <div>
          Audio Chunks Sent: {audioChunks}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={initializeStream}
          style={{
            padding: '10px',
            marginRight: '10px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          Initialize Stream
        </button>

        <button
          onClick={isRecording ? stopRecording : startRecording}
          style={{
            padding: '10px',
            marginRight: '10px',
            backgroundColor: isRecording ? '#F44336' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>

        <button
          onClick={testConnection}
          style={{
            padding: '10px',
            backgroundColor: '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          Test Connection
        </button>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <h3>Logs</h3>
          <div
            style={{
              height: '400px',
              overflowY: 'auto',
              border: '1px solid #ccc',
              padding: '10px',
              backgroundColor: '#f5f5f5'
            }}
          >
            {logs.map((log, index) => (
              <div key={index} style={{ marginBottom: '5px' }}>{log}</div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h3>Responses</h3>
          <div
            style={{
              height: '400px',
              overflowY: 'auto',
              border: '1px solid #ccc',
              padding: '10px',
              backgroundColor: '#f5f5f5'
            }}
          >
            {responses.map((response, index) => (
              <div key={index} style={{ marginBottom: '5px' }}>
                {response.type === 'text' ? (
                  <span>{response.content}</span>
                ) : (
                  <span>[Audio: {response.content ? response.content.length : 0} bytes]</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioDebug;
