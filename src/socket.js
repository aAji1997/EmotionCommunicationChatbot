import { io } from 'socket.io-client';

// Create a single socket instance that can be shared across components
export const socket = io('http://localhost:5000', {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 30000,  // Increased timeout
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['polling', 'websocket'], // Try polling first, then websocket
  autoConnect: true,
  forceNew: false,
  multiplex: true
});

// Add some debugging listeners
socket.on('connect', () => {
  console.log('Socket connected');

  // Reset connection attempts counter on successful connection
  socket.connectionAttempts = 0;
});

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason);

  // If the server closed the connection, try to reconnect manually
  if (reason === 'io server disconnect') {
    console.log('Server disconnected the socket, attempting to reconnect...');
    socket.connect();
  }
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);

  // Track connection attempts
  if (!socket.connectionAttempts) {
    socket.connectionAttempts = 1;
  } else {
    socket.connectionAttempts++;
  }

  // If we've tried too many times, try a different transport
  if (socket.connectionAttempts > 5) {
    console.log('Multiple connection failures, trying different transport...');
    // Force a reconnect with a different transport
    socket.io.opts.transports = ['polling', 'websocket'];
  }
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`Socket reconnected after ${attemptNumber} attempts`);

  // Reset connection attempts counter on successful reconnection
  socket.connectionAttempts = 0;
});

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log(`Socket reconnection attempt ${attemptNumber}`);
});

socket.on('reconnect_error', (error) => {
  console.error('Socket reconnection error:', error);
});

socket.on('reconnect_failed', () => {
  console.error('Socket reconnection failed after all attempts');
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});
