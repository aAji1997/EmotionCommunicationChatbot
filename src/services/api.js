/**
 * API service for communicating with the backend server.
 */

// Base URL for API requests
const API_BASE_URL = 'http://localhost:5000/api';

/**
 * Login or register a user
 * @param {string} username - The username to login with
 * @returns {Promise<Object>} - User data including user_id
 */
export const login = async (username) => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Login failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

/**
 * Pre-initialize the system for a user
 * @param {string} userId - The user ID
 * @param {string} username - The username
 * @returns {Promise<Object>} - Status of initialization
 */
export const preInitialize = async (userId, username) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pre-initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        username
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Pre-initialization failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Pre-initialization error:', error);
    throw error;
  }
};

/**
 * Send a chat message to the backend
 * @param {string} message - The message to send
 * @param {string} userId - The user ID
 * @param {string} username - The username
 * @returns {Promise<Object>} - Response data including the assistant's response
 */
export const sendChatMessage = async (message, userId, username) => {
  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        user_id: userId,
        username,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send message');
    }

    return await response.json();
  } catch (error) {
    console.error('Chat error:', error);
    throw error;
  }
};

/**
 * Send audio data to the backend
 * @param {Blob} audioBlob - The audio data to send
 * @param {string} userId - The user ID
 * @param {string} username - The username
 * @returns {Promise<Object>} - Response data including the assistant's response
 */
export const sendAudioData = async (audioBlob, userId, username) => {
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob);
    formData.append('user_id', userId);
    formData.append('username', username);

    const response = await fetch(`${API_BASE_URL}/audio`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to process audio');
    }

    return await response.json();
  } catch (error) {
    console.error('Audio processing error:', error);
    throw error;
  }
};

/**
 * Get current emotion data
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} - Emotion data for user and assistant
 */
export const getEmotions = async (userId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/emotions?user_id=${userId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get emotions');
    }

    return await response.json();
  } catch (error) {
    console.error('Emotions error:', error);
    throw error;
  }
};

/**
 * Get memories for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} - User memories
 */
export const getMemories = async (userId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/memories?user_id=${userId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get memories');
    }

    return await response.json();
  } catch (error) {
    console.error('Memories error:', error);
    throw error;
  }
};

/**
 * Store a memory for a user
 * @param {string} memory - The memory content
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} - Success status
 */
export const storeMemory = async (memory, userId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/store-memory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        memory,
        user_id: userId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to store memory');
    }

    return await response.json();
  } catch (error) {
    console.error('Memory storage error:', error);
    throw error;
  }
};

/**
 * Check API health
 * @returns {Promise<Object>} - Health status
 */
export const checkHealth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);

    if (!response.ok) {
      throw new Error('API health check failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Health check error:', error);
    throw error;
  }
};

/**
 * Cache for initialization status to prevent multiple API calls
 */
const initStatusCache = {
  lastCheck: 0,
  status: null,
  cacheTimeout: 5000 // 5 seconds cache timeout
};

/**
 * Check initialization status for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} - Initialization status
 */
export const checkInitializationStatus = async (userId) => {
  // Check if we have a cached result that's still valid
  const now = Date.now();
  if (initStatusCache.status && now - initStatusCache.lastCheck < initStatusCache.cacheTimeout) {
    console.log('Using cached initialization status');
    return initStatusCache.status;
  }

  try {
    console.log('Fetching fresh initialization status');
    const response = await fetch(`${API_BASE_URL}/initialization-status?user_id=${userId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to check initialization status');
    }

    // Cache the result
    const result = await response.json();
    initStatusCache.status = result;
    initStatusCache.lastCheck = now;

    return result;
  } catch (error) {
    console.error('Initialization status check error:', error);
    throw error;
  }
};

/**
 * Logout the current user
 * @param {string} userId - The user ID to logout
 * @returns {Promise<Object>} - Success status
 */
export const logout = async (userId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Logout failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};
