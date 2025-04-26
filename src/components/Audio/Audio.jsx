import React, { useState, useEffect, useRef, useContext } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { sendAudioData, getEmotions, checkInitializationStatus } from '../../services/api';
import './Audio.css';
import { assets } from '../../assets/assets';
import { Context } from '../../context/context';
import DebugPanel from '../DebugPanel';
import { socket } from '../../socket';
import EmotionWheel from '../EmotionWheel/EmotionWheel';

const Audiovisualizer = ({ analyser, recording }) => {
  const [levels, setLevels] = useState(new Array(16).fill(10));

  useEffect(() => {
    let animationFrameId;

    if (recording && analyser) {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevels = () => {
        analyser.getByteFrequencyData(dataArray);
        const newLevels = Array.from(dataArray.slice(0, 16)).map(
          (val) => (val / 255) * 40 + 5
        );
        setLevels(newLevels);
        animationFrameId = requestAnimationFrame(updateLevels);
      };

      updateLevels();
    } else {
      // Subtle idle animation using sine waves
      let t = 0;
      const idlePulse = () => {
        const newLevels = Array(16)
          .fill(0)
          .map((_, i) => 10 + Math.sin(t + i * 0.5) * 4); // soft idle wave
        setLevels(newLevels);
        t += 0.1;
        animationFrameId = requestAnimationFrame(idlePulse);
      };
      idlePulse();
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [analyser, recording]);

  return (
    <div
      className="soundwave-container"
      style={{
        display: 'flex',
        gap: '6px',
        height: '60px',
        alignItems: 'center',
        marginTop: '20px',
        justifyContent: 'center'
      }}
    >
      {levels.map((h, i) => (
        <motion.div
          key={i}
          animate={{ height: h }}
          transition={{ duration: 0.2 }}
          style={{
            width: '6px',
            backgroundColor: 'grey',
            borderRadius: '3px',
            textAlign: 'center'
          }}
        />
      ))}
    </div>
  );
};

// Legacy EmotionWheel component is now replaced by the imported EmotionWheel component

const AudioPage = () => {
  const { user, emotions } = useContext(Context);
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);
  const [analyser, setAnalyser] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isStreamInitialized, setIsStreamInitialized] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioBufferRef = useRef([]);

  // Audio playback
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);

  // Check if user is logged in
  useEffect(() => {
    if (!user) {
      // Try to get user from localStorage
      const storedUser = localStorage.getItem('user');
      if (!storedUser) {
        // Redirect to signin if no user is found
        navigate('/signin');
      }
    }
  }, [user, navigate]);

  // Check if audio is ready
  const [isAudioReady, setIsAudioReady] = useState(false);

  // Track if we've already checked audio status to prevent multiple checks
  const hasCheckedAudioStatusRef = React.useRef(false);

  // Check initialization status to see if audio is ready
  useEffect(() => {
    if (user && !hasCheckedAudioStatusRef.current) {
      // Mark that we've started checking audio status
      hasCheckedAudioStatusRef.current = true;

      const checkAudioStatus = async () => {
        try {
          // Check if we've already set audio as ready
          if (isAudioReady) {
            console.log('Audio already marked as ready, skipping status check');
            return;
          }

          const status = await checkInitializationStatus(user.user_id);
          console.log('Audio initialization status:', status);

          if (status.audio_ready) {
            console.log('Audio components are ready');
            setIsAudioReady(true);
            setError(''); // Clear any previous errors
          } else {
            console.log('Audio components are not ready yet');

            // Set a timeout to proceed even if audio isn't ready
            // This prevents the user from being stuck if audio initialization fails
            if (!window.audioCheckStartTime) {
              window.audioCheckStartTime = Date.now();
            }

            const audioCheckTimeout = 15000; // 15 seconds (increased from 10)
            if (Date.now() - window.audioCheckStartTime > audioCheckTimeout) {
              console.log('Audio initialization timeout reached, proceeding anyway');
              setIsAudioReady(true); // Proceed anyway
              setError('Audio components could not be initialized. Voice quality may be affected. You may need to refresh the page if voice service does not connect.');

              // Try to reconnect the socket if it's not connected
              if (socket && !socket.connected) {
                console.log('Attempting to reconnect socket...');
                socket.connect();
              }
            } else {
              // Poll again in 1 second, but only if we haven't already set audio as ready
              if (!isAudioReady) {
                setTimeout(checkAudioStatus, 1000);
              }
            }
          }
        } catch (error) {
          console.error('Error checking audio status:', error);

          // Set a timeout to proceed even if audio status check fails
          if (!window.audioCheckStartTime) {
            window.audioCheckStartTime = Date.now();
          }

          const audioCheckTimeout = 15000; // 15 seconds (increased from 10)
          if (Date.now() - window.audioCheckStartTime > audioCheckTimeout) {
            console.log('Audio status check timeout reached, proceeding anyway');
            setIsAudioReady(true); // Proceed anyway
            setError('Could not verify audio components. Voice quality may be affected. You may need to refresh the page if voice service does not connect.');

            // Try to reconnect the socket if it's not connected
            if (socket && !socket.connected) {
              console.log('Attempting to reconnect socket after error...');
              socket.connect();
            }
          } else {
            // Try again after a delay, but only if we haven't already set audio as ready
            if (!isAudioReady) {
              setTimeout(checkAudioStatus, 2000);
            }
          }
        }
      };

      checkAudioStatus();

      // Cleanup
      return () => {
        window.audioCheckStartTime = null;
        hasCheckedAudioStatusRef.current = false;
      };
    }
  }, [user, isAudioReady]);

  // We'll define initializeStream after debouncedInitializeStream to avoid circular dependencies

  // Track if we've already initialized the stream to prevent multiple initializations
  const hasInitializedStreamRef = React.useRef(false);

  // Track the last time we sent an initialization request to prevent spamming
  const lastInitTimeRef = React.useRef(0);

  // Track if we've already committed audio to prevent multiple commits
  const hasCommittedAudioRef = React.useRef(false);

  // Force stream initialization on mic click
  const forceInitializeStreamRef = React.useRef(false);

  // Debounced version of initializeStream to prevent multiple rapid calls
  const debouncedInitializeStream = React.useCallback(() => {
    // Check if we've already initialized the stream
    if (hasInitializedStreamRef.current) {
      console.log('Stream already initialized, skipping duplicate initialization');
      return;
    }

    // Check if we've sent an initialization request recently (within 5 seconds)
    const now = Date.now();
    if (now - lastInitTimeRef.current < 5000) {
      console.log('Initialization request sent recently, skipping duplicate request');
      return;
    }

    if (!user) return;

    console.log('Initializing stream (debounced)');
    hasInitializedStreamRef.current = true;
    lastInitTimeRef.current = now;

    try {
      console.log('Sending initialization request with user:', user.user_id, user.username);
      socket.emit('initialize_stream', {
        user_id: user.user_id,
        username: user.username
      });
      console.log('Initialization request sent');
    } catch (error) {
      console.error('Error sending initialization request:', error);
      setError('Failed to initialize voice service. Please refresh the page and try again.');
      hasInitializedStreamRef.current = false;
    }
  }, [user]);

  // Function to initialize the stream - now just a wrapper around debouncedInitializeStream
  const initializeStream = () => {
    // This function is kept for backward compatibility
    // All actual initialization is now handled by debouncedInitializeStream
    if (!user) return; // Safety check

    console.log('initializeStream called, delegating to debouncedInitializeStream');
    debouncedInitializeStream();
  };

  // Track if we've already initialized the stream on mount
  const hasInitializedOnMountRef = React.useRef(false);

  // Track if we've already initialized on connect
  const hasInitializedOnConnectRef = React.useRef(false);

  // Track if we've already initialized on connection status update
  const hasInitializedOnStatusUpdateRef = React.useRef(false);

  // Track if we've already initialized on reconnect
  const hasInitializedOnReconnectRef = React.useRef(false);

  // Use a variable to track if we've already handled the stream_initialized event
  const streamInitializedHandledRef = React.useRef(false);

  // Set up WebSocket connection - only run once when component mounts
  useEffect(() => {
    if (!user || !isAudioReady) return;

    console.log('Setting up WebSocket connection (audio is ready)');

    // Use the shared socket instance
    socketRef.current = socket;
    console.log('Using shared Socket.io connection');

    // Reset initialization flags at component mount
    hasInitializedStreamRef.current = false;
    lastInitTimeRef.current = 0;
    hasCommittedAudioRef.current = false;

    console.log('Reset all initialization and commit flags at component mount');

    // Check if socket is already connected
    if (socket.connected) {
      console.log('Socket is already connected');
      setIsConnected(true);

      // Initialize the streaming session with a delay to ensure component is fully mounted
      // But only do this once per component mount
      if (!hasInitializedOnMountRef.current) {
        hasInitializedOnMountRef.current = true;
        console.log('First time initialization on mount');

        setTimeout(() => {
          debouncedInitializeStream();
        }, 1000);
      } else {
        console.log('Already initialized on mount, skipping duplicate initialization');
      }
    } else {
      console.log('Socket is not connected, waiting for connect event');

      // Connection timeout - longer timeout to allow for reconnection attempts
      const connectionTimeout = setTimeout(() => {
        if (!isConnected) {
          console.error('WebSocket connection timeout after 15 seconds');
          setError('Connection to voice service timed out. Please refresh the page and try again.');
        }
      }, 15000);

      // Clean up function to clear the timeout
      return () => {
        clearTimeout(connectionTimeout);
      };
    }

    // Clean up on unmount
    return () => {
      // Reset all flags on unmount
      hasInitializedStreamRef.current = false;
      lastInitTimeRef.current = 0;
      hasCommittedAudioRef.current = false;
      hasInitializedOnMountRef.current = false;

      console.log('Reset all initialization and commit flags on component unmount');

      if (recording) {
        try {
          stopRecording();
        } catch (error) {
          console.error('Error stopping recording during cleanup:', error);
        }
      }
    };
  }, [user, isAudioReady, debouncedInitializeStream]); // Only run once when these dependencies change

  // Set up event listeners - separate from the connection setup
  useEffect(() => {
    if (!user || !isAudioReady || !socketRef.current) return;

    const socket = socketRef.current;

    // Set up event listeners

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setIsConnected(true);
      setError(''); // Clear any previous errors

      // Initialize the streaming session when connected, but only once
      if (!hasInitializedOnConnectRef.current) {
        hasInitializedOnConnectRef.current = true;
        console.log('First time initialization on connect');
        debouncedInitializeStream();
      } else {
        console.log('Already initialized on connect, skipping duplicate initialization');
      }
    });



    socket.on('connection_status', (data) => {
      console.log('Connection status update:', data);
      if (data.status === 'connected') {
        setIsConnected(true);
        setError(''); // Clear any previous errors

        // If we're not already initialized, initialize the stream, but only once
        if (!hasInitializedStreamRef.current &&
            Date.now() - lastInitTimeRef.current > 5000 &&
            !hasInitializedOnStatusUpdateRef.current) {
          console.log('Connected but not initialized, initializing stream');
          hasInitializedOnStatusUpdateRef.current = true;
          debouncedInitializeStream();
        } else {
          console.log('Already initialized or recently initialized, skipping initialization');
        }
      } else if (data.status === 'reconnected') {
        console.log('Connection reestablished');
        setIsConnected(true);
        setError(''); // Clear any previous errors

        // Reset initialization flags to allow re-initialization
        hasInitializedStreamRef.current = false;
        lastInitTimeRef.current = 0;
        hasInitializedOnStatusUpdateRef.current = false;

        // Reset commit flag
        hasCommittedAudioRef.current = false;

        console.log('Reset all initialization and commit flags due to reconnection status');

        // Re-initialize the stream after reconnection with a delay, but only once
        setTimeout(() => {
          if (!hasInitializedOnStatusUpdateRef.current) {
            console.log('Initializing stream after reconnection');
            hasInitializedOnStatusUpdateRef.current = true;
            debouncedInitializeStream();
          } else {
            console.log('Already initialized after reconnection, skipping initialization');
          }
        }, 1000); // Add a delay to ensure the connection is stable
      }
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setError('Connection error: ' + (error.message || 'Unknown error'));
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setIsConnected(false);
      setIsStreamInitialized(false);

      // Reset all initialization flags on disconnect
      hasInitializedStreamRef.current = false;
      lastInitTimeRef.current = 0;
      hasInitializedOnConnectRef.current = false;
      hasInitializedOnStatusUpdateRef.current = false;
      hasInitializedOnReconnectRef.current = false;
      streamInitializedHandledRef.current = false;

      // Reset commit flag
      hasCommittedAudioRef.current = false;

      console.log('Reset all initialization and commit flags due to disconnect');

      // Don't show an error immediately, try to reconnect first
      setTimeout(() => {
        if (!isConnected) {
          setError('Connection to voice service lost. Attempting to reconnect...');
        }
      }, 2000);
    });



    socket.on('reconnect', (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`);
      setError(''); // Clear any previous errors

      // Reset initialization flags to allow re-initialization
      hasInitializedStreamRef.current = false;
      lastInitTimeRef.current = 0;

      // Reset commit flag
      hasCommittedAudioRef.current = false;

      // Reset status update flag but keep reconnect flag
      hasInitializedOnStatusUpdateRef.current = false;

      console.log('Reset all initialization and commit flags due to reconnection');

      // Re-initialize the stream after reconnection, but only once
      setTimeout(() => {
        if (!hasInitializedOnReconnectRef.current) {
          console.log('Initializing stream after reconnection');
          hasInitializedOnReconnectRef.current = true;
          debouncedInitializeStream();
        } else {
          console.log('Already initialized after reconnection, skipping initialization');
        }
      }, 1000); // Add a delay to ensure the connection is stable
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Reconnection attempt ${attemptNumber}`);
      setError(`Reconnecting to voice service (attempt ${attemptNumber})...`);
    });

    socket.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error);
      setError('Error reconnecting: ' + (error.message || 'Unknown error'));
    });

    socket.on('reconnect_failed', () => {
      console.error('Failed to reconnect');
      setError('Failed to reconnect to voice service. Please refresh the page.');
    });

    socket.on('error', (data) => {
      console.error('WebSocket error:', data.message);
      setError(data.message || 'Unknown error from voice service');
    });



    socket.on('stream_initialized', (data) => {
      console.log('Stream initialized:', data);

      // Always set the state variables first to ensure they're updated
      setIsStreamInitialized(true);
      setError(''); // Clear any previous errors

      // Mark the stream as initialized in our ref
      hasInitializedStreamRef.current = true;

      // Update the last initialization time
      const now = Date.now();
      lastInitTimeRef.current = now;

      // Log the initialization status
      console.log('Stream initialization confirmed by server');

          // Always start recording after initialization - this makes it truly real-time
      // Use a short timeout to ensure state is updated
      setTimeout(() => {
        try {
          console.log('Starting recording after initialization');
          // Directly call the inner part of startRecording to bypass the isStreamInitialized check
          startRecordingDirectly();
        } catch (error) {
          console.error('Error starting recording after initialization:', error);
          setError('Failed to start recording: ' + error.message);
        }
      }, 100);

      // Reset the force flag if it was set
      if (forceInitializeStreamRef.current) {
        forceInitializeStreamRef.current = false;
      }

      // Mark that we've handled this event
      streamInitializedHandledRef.current = true;

      // Reset the handled flag after a delay
      setTimeout(() => {
        streamInitializedHandledRef.current = false;
      }, 5000);
    });

    socket.on('text_response', (data) => {
      console.log('Text response received:', data);
      setResponseText(prev => prev + (data.delta || ''));
    });

    socket.on('text_response_delta', (data) => {
      console.log('Text response delta received:', data);
      // Also handle text_response_delta events in case the server is using this name
      setResponseText(prev => prev + (data.delta || ''));
    });

    socket.on('audio_response', (data) => {
      console.log('Audio response received, length:', data && data.delta ? data.delta.length : 0);
      // Add audio chunk to queue for playback
      if (data && data.delta) {
        audioQueueRef.current.push(data.delta);
        // Start playing if not already playing
        if (!isPlayingRef.current) {
          playNextAudioChunk();
        }
      }
    });

    socket.on('audio_response_delta', (data) => {
      console.log('Audio response delta received, length:', data && data.delta ? data.delta.length : 0);
      // Also handle audio_response_delta events in case the server is using this name
      if (data && data.delta) {
        audioQueueRef.current.push(data.delta);
        // Start playing if not already playing
        if (!isPlayingRef.current) {
          playNextAudioChunk();
        }
      }
    });

    socket.on('transcript', (data) => {
      console.log('Transcript received:', data);
      // You can add transcript handling here if needed
    });

    // Add listener for audio debug events
    socket.on('audio_debug', (data) => {
      console.log('Audio debug event received:', data);
      // Display a small notification to the user that audio is being received
      setError(''); // Clear any previous errors
      setResponseText(prev => {
        // Only add the debug message if it's not already there
        if (!prev.includes('Audio received')) {
          return prev + (prev ? '\n' : '') + 'Audio received by server ✓';
        }
        return prev;
      });
    });

    // Add listener for general debug events
    socket.on('debug', (data) => {
      console.log('Debug event received:', data);
      // Display the debug message to the user
      setError(''); // Clear any previous errors
      setResponseText(prev => prev + (prev ? '\n' : '') + `Debug: ${data.message || JSON.stringify(data)}`);
    });

    socket.on('response_complete', () => {
      console.log('Response complete');
      setIsProcessing(false);

      // Reset the commit flag so we can commit audio again for the next utterance
      hasCommittedAudioRef.current = false;

      // For real-time conversation, automatically start recording again
      // This creates a truly continuous conversation experience
      setTimeout(() => {
        if (!recording) {
          console.log('Auto-starting recording for continuous conversation');
          startRecordingDirectly().catch(err => {
            console.error('Error auto-starting recording:', err);
          });
        }
      }, 500);
    });

    // Handle processing status updates
    socket.on('processing', (data) => {
      console.log('Processing status:', data);
      setIsProcessing(true);
    });

    // Clean up on unmount
    return () => {
      // Reset all flags
      hasInitializedStreamRef.current = false;
      lastInitTimeRef.current = 0;
      hasCommittedAudioRef.current = false;
      streamInitializedHandledRef.current = false;
      hasInitializedOnConnectRef.current = false;
      hasInitializedOnStatusUpdateRef.current = false;
      hasInitializedOnReconnectRef.current = false;

      // Reset global window flags
      window.lastMicClickTime = 0;
      window.lastTestClickTime = 0;

      console.log('Reset all flags during event listener cleanup');

      // Remove all event listeners but don't disconnect the socket
      try {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('connection_status');
        socket.off('audio_response');
        socket.off('text_response');
        socket.off('response_complete');
        socket.off('transcript');
        socket.off('error');
        socket.off('stream_initialized');
        socket.off('openai_connection_test');
        socket.off('reconnect');
        socket.off('reconnect_attempt');
        socket.off('reconnect_error');
        socket.off('reconnect_failed');
        console.log('Removed event listeners from shared socket');
      } catch (error) {
        console.error('Error removing socket event listeners during cleanup:', error);
      }
    };
  }, [user, isAudioReady, debouncedInitializeStream, isConnected]); // Only run once when these dependencies change

  // Function to play audio chunks
  const playNextAudioChunk = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const audioChunk = audioQueueRef.current.shift();

    try {
      // Create audio context if it doesn't exist
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Resume audio context if it's suspended
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      // Convert base64 to ArrayBuffer
      const binaryString = atob(audioChunk);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create audio element and play it (simpler approach)
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        playNextAudioChunk();
      };

      audio.onerror = (err) => {
        console.error('Error playing audio:', err);
        URL.revokeObjectURL(url);
        playNextAudioChunk();
      };

      audio.play().catch(err => {
        console.error('Error playing audio:', err);
        playNextAudioChunk();
      });
    } catch (err) {
      console.error('Error in audio playback:', err);
      // Continue with next chunk
      setTimeout(playNextAudioChunk, 100);
    }
  };

  // This function contains the core recording logic without the initialization checks
  const startRecordingDirectly = async () => {
    try {
      // Check if already recording
      if (recording) {
        console.log('Already recording, ignoring duplicate start request');
        return;
      }

      // Clear previous state
      setError('');
      setResponseText(''); // Clear previous response

      console.log('Starting recording directly...');

      try {
        // Get microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        console.log('Microphone access granted');

        // Set up audio context and analyser for visualization
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 64;
        source.connect(analyserNode);
        setAnalyser(analyserNode);
        console.log('Audio context and analyser set up');

        // Create processor node to get raw audio data
        const processorNode = audioContext.createScriptProcessor(4096, 1, 1); // Increased buffer size

        // Add rate limiting for audio chunks
        let lastChunkTime = 0;
        const CHUNK_INTERVAL = 50; // Reduced from 100ms to 50ms for more responsive real-time conversation

        processorNode.onaudioprocess = (e) => {
          // Only process if recording
          if (!recording) return;

          // Rate limit audio chunks
          const now = Date.now();
          if (now - lastChunkTime < CHUNK_INTERVAL) return;
          lastChunkTime = now;

          try {
            // Get audio data
            const inputData = e.inputBuffer.getChannelData(0);

            // Check if audio is silent (to avoid sending empty chunks)
            const isAudible = inputData.some(sample => Math.abs(sample) > 0.01);
            if (!isAudible) {
              // Skip silent chunks
              return;
            }

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

            // Send to server if socket is still connected
            if (socketRef.current && isConnected) {
              // Send each audio chunk immediately to the server
              // This matches the approach in our successful test
              socketRef.current.emit('audio_chunk', { audio: base64Data });
              console.log(`Sent audio chunk: ${base64Data.length} bytes`);

              // For truly real-time conversation with server-side VAD,
              // we don't need to explicitly commit after each chunk.
              // The server will automatically detect speech and respond.
              // We'll just send the audio chunks and let the server handle the rest.

              // However, we'll still commit periodically to ensure the server processes the audio
              // This helps in case the VAD doesn't trigger properly
              if (!isProcessing) {
                // Throttle the commit calls to avoid overwhelming the server
                // Reduced from 2000ms to 500ms for more responsive conversation
                const now = Date.now();
                if (!window.lastCommitTime || now - window.lastCommitTime > 500) {
                  window.lastCommitTime = now;
                  socketRef.current.emit('commit_audio');
                  console.log('Auto-committed audio for real-time processing');
                }
              }
            }
          } catch (err) {
            console.error('Error processing audio chunk:', err);
          }
        };

        // Connect processor node
        source.connect(processorNode);
        processorNode.connect(audioContext.destination);

        // Store processor node for cleanup
        audioContextRef.current.processorNode = processorNode;

        setIsProcessing(true);
        setRecording(true);
        console.log('Recording started successfully');
      } catch (micError) {
        console.error('Error accessing microphone:', micError);
        setError(`Failed to access microphone: ${micError.message}. Please check permissions and try again.`);
      }
    } catch (error) {
      console.error('Error in startRecordingDirectly:', error);
      setError(`Error starting recording: ${error.message}. Please try again.`);
    }
  };

  // Main startRecording function with initialization checks
  const startRecording = async () => {
    try {
      // If already recording, stop recording instead
      if (recording) {
        console.log('Already recording, stopping recording instead');
        stopRecording();
        return;
      }

      // Check if WebSocket is connected and stream is initialized
      if (!isConnected) {
        console.error('WebSocket not connected');
        setError('WebSocket not connected. Please refresh the page and try again.');
        return;
      }

      if (!isStreamInitialized) {
        console.error('Stream not initialized');

        // Set the force flag to true so we start recording after initialization
        forceInitializeStreamRef.current = true;

        // Try to initialize the stream
        console.log('Attempting to initialize stream with force flag...');
        initializeStream();

        setError('Initializing voice service. Please wait a moment...');
        return;
      }

      if (!socketRef.current) {
        console.error('Socket reference is null');
        setError('Socket connection issue. Please refresh the page and try again.');
        return;
      }

      // If we passed all checks, call the direct recording function
      await startRecordingDirectly();
    } catch (error) {
      console.error('Error in startRecording:', error);
      setError(`Error starting recording: ${error.message}. Please try again.`);
    }
  };

  // We're using the hasCommittedAudioRef defined at the top level of the component

  // Debounced version of commit_audio to prevent multiple rapid calls
  const debouncedCommitAudio = React.useCallback(() => {
    if (hasCommittedAudioRef.current) {
      console.log('Audio already committed, skipping duplicate commit');
      return;
    }

    if (!socketRef.current || !isConnected || !isStreamInitialized) {
      console.error('Cannot commit audio: socket not connected or stream not initialized');
      return;
    }

    console.log('Committing audio (debounced)');
    hasCommittedAudioRef.current = true;

    try {
      socketRef.current.emit('commit_audio');
      console.log('Audio buffer committed');

      // Reset the commit flag after a delay to allow for future commits
      setTimeout(() => {
        hasCommittedAudioRef.current = false;
      }, 2000);
    } catch (err) {
      console.error('Error committing audio buffer:', err);
      setError('Error processing audio. Please try again.');
      hasCommittedAudioRef.current = false;
    }
  }, [isConnected, isStreamInitialized]);

  const stopRecording = () => {
    try {
      console.log('Stopping recording...');

      // Check if we're actually recording
      if (!recording) {
        console.log('Not recording, ignoring stop request');
        return;
      }

      // Stop recording state first
      setRecording(false);

      // Instead of committing audio and processing, we'll just clean up and return to main screen
      console.log('Returning to main screen without processing...');

      // Reset state
      setIsProcessing(false);
      setResponseText('');

      // Optionally, navigate back to main screen if needed
      // For now, we'll just reset the state to be ready for the next recording

      // Clean up audio context
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach(track => track.stop());
          console.log('Audio tracks stopped');
        } catch (err) {
          console.error('Error stopping audio tracks:', err);
        }
      }

      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.processorNode) {
            audioContextRef.current.processorNode.disconnect();
            console.log('Processor node disconnected');
          }

          audioContextRef.current.close()
            .then(() => console.log('Audio context closed successfully'))
            .catch(err => console.error('Error closing audio context:', err));
        } catch (err) {
          console.error('Error cleaning up audio context:', err);
        }
      }

      setAnalyser(null);
      console.log('Recording stopped successfully');
    } catch (error) {
      console.error('Error in stopRecording:', error);
      setError(`Error stopping recording: ${error.message}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="container">
      <div className="left-section" style={{ backgroundImage: `url(${assets.speak})`, height: "100%" }}></div>
      <div className='right-section'>
        {/* Add Debug Panel */}
        {user && <DebugPanel userId={user.user_id} />}
        {!isAudioReady ? (
          <div className="audio">
            <h1 className="title">Emotional Agent</h1>
            <div className="init-status-container" style={{ marginTop: '40px' }}>
              <div className="init-spinner"></div>
              <p>Preparing audio components...</p>
              <p className="init-progress-text">Please wait a moment</p>
            </div>
          </div>
        ) : (
          <div className="audio">
            <h1 className="title">Emotional Agent</h1>

            <div className="status-indicator">
              <div className={`status-dot ${recording ? 'recording' : isProcessing ? 'processing' : ''}`}></div>
              <span>{recording ? 'Listening...' : isProcessing ? 'Processing...' : 'Ready'}</span>
            </div>

            <Audiovisualizer analyser={analyser} recording={recording} />

            {responseText && (
              <div className="response-text">
                <p>{responseText}</p>
              </div>
            )}

            {error && (
              <div className="error-message">
                <p>{error}</p>
              </div>
            )}

            <motion.div
            animate={{
              scale: [1, 1.05, 1.15, 1],
              boxShadow: [
                "0 0 10px rgba(100, 100, 100, 0.3)",
                "0 0 20px rgba(100, 100, 100, 0.5)",
                "0 0 10px rgba(100, 100, 100, 0.3)",
              ],
              borderColor: recording ? "red" : "#646464", // Red when recording, gray otherwise
              background: recording ? "white" : "#646464",
              color: recording ? "#646464" : "white"
            }}
            whileHover={{
              scale: 1.05,
              boxShadow: "0 0 20px rgba(100, 100, 100, 0.3)",
            }}
            whileTap={{ scale: 0.95 }}
            transition={{
              duration: 2,
              repeat: Infinity,  // Continuous breathing effect
              repeatType: "loop",
              ease: "easeInOut",
            }}
            style={{
              borderRadius: "50px",
              display: "inline-block",
              marginTop: "40px",
              cursor: "pointer",
              borderWidth: "2px", // Add border width to see the color change
              borderStyle: "solid", // Solid border for visibility
            }}
            className="elevated-button"
            onClick={() => {
              // Prevent multiple rapid clicks
              const now = Date.now();
              if (window.lastMicClickTime && now - window.lastMicClickTime < 1000) {
                console.log("Mic button clicked too soon, ignoring");
                return;
              }
              window.lastMicClickTime = now;

              // Just call startRecording which now handles both starting and stopping
              console.log(recording ? "Stop button clicked" : "Speak button clicked");
              startRecording();
            }}
            disabled={isProcessing && !recording}
          >
            {recording ? "Stop" : isProcessing ? "Processing..." : "Speak"}
          </motion.div>

          {/* Debug button */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              backgroundColor: "#333",
              color: "white",
              padding: "10px 20px",
              borderRadius: "50px",
              display: "inline-block",
              marginTop: "20px",
              cursor: "pointer",
              fontSize: "14px"
            }}
            className="elevated-button"
            onClick={() => {
              // Prevent multiple rapid clicks
              const now = Date.now();
              if (window.lastTestClickTime && now - window.lastTestClickTime < 5000) {
                console.log("Test button clicked too soon, ignoring");
                return;
              }
              window.lastTestClickTime = now;

              console.log("Test connection button clicked");

              // Make sure stream is initialized first
              if (!isStreamInitialized) {
                console.log("Initializing stream before testing...");
                if (socketRef.current && user) {
                  // Use the initializeStream function we defined
                  initializeStream();

                  // Wait for initialization before testing
                  const timeout = setTimeout(() => {
                    console.log("Stream initialization timeout");
                    setError("Stream initialization timeout. Please try again.");
                    window.lastTestClickTime = 0; // Reset click time on error
                  }, 5000);

                  // Use a one-time event listener to avoid multiple handlers
                  const handleInitialized = (data) => {
                    clearTimeout(timeout);
                    socketRef.current.off('stream_initialized', handleInitialized);
                    console.log("Stream initialized, now testing connection");
                    socketRef.current.emit('test_openai_connection');
                  };

                  // Remove any existing listeners first
                  socketRef.current.off('stream_initialized', handleInitialized);
                  // Then add the new one
                  socketRef.current.once('stream_initialized', handleInitialized);
                }
              } else if (socketRef.current) {
                // Stream already initialized, test directly
                console.log("Testing connection...");
                socketRef.current.emit('test_openai_connection');
              }
            }}
          >
            Test Connection
          </motion.div>

          {/* Force Response button */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              backgroundColor: "#990000",
              color: "white",
              padding: "10px 20px",
              borderRadius: "50px",
              display: "inline-block",
              marginTop: "20px",
              marginLeft: "10px",
              cursor: "pointer",
              fontSize: "14px"
            }}
            className="elevated-button"
            onClick={() => {
              console.log("Force response button clicked");
              if (socketRef.current && isConnected && isStreamInitialized) {
                // Force commit audio and create response
                socketRef.current.emit('force_response');
                setResponseText(prev => prev + (prev ? '\n' : '') + 'Forcing response...');
              } else {
                setError('Socket not connected or stream not initialized');
              }
            }}
          >
            Force Response
          </motion.div>

          {/* Debug page link */}
          <div style={{ marginTop: '20px' }}>
            <a href="/debug" target="_blank" style={{ color: '#666', textDecoration: 'underline' }}>
              Open Debug Page
            </a>
          </div>
        </div>
        )}
      </div>
      {emotions && emotions.user && Object.keys(emotions.user).length > 0 && (
        <div className='emotion-wheel-direct'>
          <h3>Emotional State</h3>
          <div className="wheel-container">
            <EmotionWheel
              key={`emotion-wheel-${JSON.stringify(emotions)}`}
              emotions={emotions}
              height={500}
              width={500}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioPage;
