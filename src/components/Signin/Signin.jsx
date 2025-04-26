import React, { useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import './Signin.css'
import { assets } from '../../assets/assets'
import { login, preInitialize } from '../../services/api'
import { Context } from '../../context/context'

const Signin = () => {
  const [username, setUsername] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [initStatus, setInitStatus] = useState('') // Track initialization status
  const navigate = useNavigate()
  const { setUser } = useContext(Context)

  const handleSubmit = async () => {
    if (!username.trim()) {
      setError('Please enter a username')
      return
    }

    setIsLoading(true)
    setError('')
    setInitStatus('Signing in...')

    try {
      // Clear any existing user data first
      setUser(null)
      localStorage.removeItem('user')

      // Login the user with retry logic
      let userData = null;
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          userData = await login(username);
          break; // Success, exit the retry loop
        } catch (loginError) {
          console.error(`Login attempt ${retryCount + 1} failed:`, loginError);
          retryCount++;

          if (retryCount > maxRetries) {
            throw loginError; // Rethrow after max retries
          }

          // Wait a bit before retrying
          setInitStatus(`Connection issue. Retrying (${retryCount}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!userData) {
        throw new Error('Failed to login after multiple attempts');
      }

      // Store user data in localStorage for persistence
      localStorage.setItem('user', JSON.stringify(userData))

      // Set user in context
      setUser(userData)

      // Start pre-initialization but don't wait for it to complete
      // The Main component will handle showing the loading screen
      setInitStatus('Starting initialization...')
      try {
        await preInitialize(userData.user_id, userData.username)
        setInitStatus('Initialization started! Redirecting...')
      } catch (initError) {
        console.error('Pre-initialization error:', initError)
        setInitStatus('Initialization started with errors. Redirecting...')
      }

      // Short delay before navigation to ensure the user sees the status
      setTimeout(() => {
        // Navigate to home page
        navigate('/')
      }, 1000)
    } catch (error) {
      console.error('Sign in error:', error);
      setError(error.message || 'Failed to sign in. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="signin-container">
      <div className="header">
        <div className="text"><span>Sign in</span></div>
        <div className="underline"></div>
      </div>
      <div className="inputs">
        <div className="input">
          <img src={assets.person_icon} alt="" />
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {initStatus && <div className="init-status">{initStatus}</div>}

      <div className="submit-container">
        <button
          className="submit"
          onClick={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? 'Please wait...' : 'Submit'}
        </button>
      </div>
    </div>
  );
};

export default Signin;
