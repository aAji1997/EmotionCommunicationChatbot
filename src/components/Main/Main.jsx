import React, { useContext, useEffect, useState, useRef } from 'react'
import './Main.css'
import { assets } from '../../assets/assets'
import { Context } from '../../context/context'
import { useNavigate } from 'react-router-dom';
import { preInitialize, checkInitializationStatus, logout } from '../../services/api';


const Main = () => {
    const {
        onSent,
        chatHistory,
        recentPrompt,
        showResult,
        loading,
        resultData,
        setInput,
        input,
        user,
        setUser,
        emotions
    } = useContext(Context);

    // Add state for initialization
    const [initializing, setInitializing] = useState(false);
    const [initStatus, setInitStatus] = useState('');
    const [systemReady, setSystemReady] = useState(false);
    const [initProgress, setInitProgress] = useState(0);
    const pollingIntervalRef = useRef(null);

    const navigate = useNavigate();

    // Function to check initialization status
    const checkStatus = async (userId) => {
        try {
            const status = await checkInitializationStatus(userId);
            console.log('Initialization status:', status);

            // Track audio readiness
            const audioReady = status.audio_ready || false;

            if (status.is_initialized) {
                // System is fully initialized
                setInitStatus(audioReady ?
                    'System ready!' :
                    'System ready! (Audio components will be prepared when needed)');
                setSystemReady(true);

                // Set a timeout to stop initializing even if audio isn't ready
                // This prevents the user from being stuck if audio initialization fails
                const audioInitTimeout = 5000; // 5 seconds
                const initStartTime = Date.now();

                if (audioReady) {
                    // Audio is ready, stop initializing immediately
                    setInitializing(false);

                    // Clear the polling interval
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                    }
                } else if (window.audioInitStartTime && (Date.now() - window.audioInitStartTime > audioInitTimeout)) {
                    // We've been waiting for audio for too long, proceed anyway
                    console.log('Audio initialization timeout reached, proceeding anyway');
                    setInitializing(false);

                    // Clear the polling interval
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                    }
                } else {
                    // Keep initializing until audio is ready or timeout is reached
                    if (!window.audioInitStartTime) {
                        window.audioInitStartTime = Date.now();
                    }
                    setInitializing(true);
                    setInitProgress(prev => Math.min(prev + 1, 98)); // Slower progress when waiting for audio
                }
            } else if (status.is_initializing) {
                // System is still initializing
                setInitStatus('Preparing your experience...');
                setInitializing(true);

                // Increment progress to show activity
                setInitProgress(prev => {
                    const newProgress = prev + 5;
                    return newProgress > 95 ? 95 : newProgress; // Cap at 95% until fully initialized
                });
            } else {
                // System hasn't started initializing yet
                setInitStatus('Starting initialization...');
                setInitializing(true);
                setInitProgress(5);
            }
        } catch (error) {
            console.error('Error checking initialization status:', error);
        }
    };

    // Check if user is logged in and initialize system
    useEffect(() => {
        const initializeSystem = async (userData) => {
            setInitializing(true);
            setInitStatus('Starting initialization...');
            setInitProgress(0);

            try {
                // Call pre-initialize endpoint to start the process
                const initResponse = await preInitialize(userData.user_id, userData.username);
                console.log('Pre-initialization started:', initResponse);

                // Set up polling to check initialization status
                if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                }

                // Check status immediately
                await checkStatus(userData.user_id);

                // Then set up polling every 5 seconds to reduce load
                pollingIntervalRef.current = setInterval(() => {
                    checkStatus(userData.user_id);
                }, 5000);

            } catch (error) {
                console.error('Error during pre-initialization:', error);
                setInitStatus('System ready (with limited optimization)');
                setSystemReady(true);
                setInitializing(false);
            }
        };

        if (!user) {
            // Try to get user from localStorage
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                // Parse and set user in context
                try {
                    const userData = JSON.parse(storedUser);
                    setUser(userData);

                    // Initialize system for the loaded user
                    initializeSystem(userData);
                } catch (error) {
                    console.error('Error parsing stored user data:', error);
                    navigate('/signin');
                }
            } else {
                // Redirect to signin if no user is found
                navigate('/signin');
            }
        } else if (!systemReady && !initializing) {
            // If we have a user but system is not ready and not currently initializing
            initializeSystem(user);
        }

        // Clean up interval on unmount
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };
    }, [user, navigate, setUser, systemReady, initializing]);

    const goToLiveTranscription = () => {
        navigate('/audio');
    };

    const goToSignin = async () => {
        if (user) {
            try {
                // Call logout API to properly clean up on the server
                await logout(user.user_id);
                console.log("User logged out successfully");
            } catch (error) {
                console.error("Error logging out:", error);
                // Continue with local cleanup even if server logout fails
            }
        }

        // Clear user data and reset state before navigating to signin
        setUser(null);
        localStorage.removeItem('user');
        setSystemReady(false);
        setInitializing(false);
        setInitProgress(0);

        // Clear any polling interval
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }

        // Navigate to signin page
        navigate('/signin');
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSent();
        }
    };

    // Function to render emotion data if available
    const renderEmotionData = () => {
        if (!emotions || !emotions.user || Object.keys(emotions.user).length === 0) {
            return null;
        }

        // Get the top emotion for user and assistant
        const topUserEmotion = Object.entries(emotions.user)
            .sort((a, b) => b[1] - a[1])[0];

        const topAssistantEmotion = Object.entries(emotions.assistant)
            .sort((a, b) => b[1] - a[1])[0];

        return (
            <div className="emotion-summary">
                <p>
                    You seem to be feeling <strong>{topUserEmotion[0]}</strong>
                    while the assistant is expressing <strong>{topAssistantEmotion[0]}</strong>
                </p>
            </div>
        );
    };

  return (
    <div className='main'>
        <div className="nav">
            <img src={assets.logo_icon} alt="" />
            <div className="user-info">
                {user && (
                    <>
                        <span className="username">{user.username}</span>
                        {initializing && <span className="init-badge">Initializing...</span>}
                    </>
                )}
                <img
                    src={assets.user_icon}
                    alt="Account"
                    style={{ cursor: 'pointer' }}
                    onClick={goToSignin}
                />
            </div>
        </div>

        <div className="main-container">

        {initializing && (
            <div className="init-overlay">
                <div className="init-status-container">
                    <div className="init-spinner"></div>
                    <p>{initStatus}</p>
                    <div className="init-progress-container">
                        <div
                            className="init-progress-bar"
                            style={{ width: `${initProgress}%` }}
                        ></div>
                    </div>
                    <p className="init-progress-text">{initProgress}% complete</p>
                </div>
            </div>
        )}

        {chatHistory.length === 0 ? (
            <>
                <div className="greet">
                <p><span>Hello, {user ? user.username : 'friend'}!</span></p>
                <p>Want to talk about your day?</p>
                </div>

                <div className="cards">
                {[
                    {
                    text: "I'm having trouble understanding how I feel right now. Can you help me make sense of it?",
                    icon: assets.message_icon
                    },
                    {
                    text: "I’ve been thinking about something and could use a safe space to talk it out.",
                    icon: assets.idea_icon
                    },
                    {
                    text: "Can you share something comforting or kind that might help me feel more at ease?",
                    icon: assets.peace_icon
                    },
                    {
                    text: "I want to write about how I’m feeling, but I don’t know how to start. Can you guide me?",
                    icon: assets.journal_icon
                    }
                ].map((card, index) => (
                    <div
                        key={index}
                        className={`card ${initializing ? 'disabled' : ''}`}
                        onClick={() => {
                            if (!initializing) {
                                setInput(card.text);
                                onSent(card.text);
                            }
                        }}
                    >
                        <p>{card.text}</p>
                        <img src={card.icon} alt="icon" />
                    </div>
                ))}
                </div>
            </>
            ) : (
                <div className="result">
                    {renderEmotionData()}

                    {chatHistory.map((msg, index) => (
                        <div key={index} className="result-title">
                        <img src={msg.sender === "user" ? assets.user_icon : assets.logo_icon} alt="avatar" />
                        <p>{msg.message}</p>
                        </div>
                    ))}

                    {/* Only show this block if typing effect is happening */}
                    {resultData && (
                        <div className="result-title">
                        <img src={assets.logo_icon} alt="avatar" />
                        <p>{resultData}</p>
                        </div>
                    )}
                </div>
        )}


            <div className="main-bottom">
                <div className="search-box">
                    <input
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        value={input}
                        placeholder={initializing ? 'System initializing...' : 'Enter your message here'}
                        disabled={loading || initializing}
                    />
                    <div>

                        {/* <img src={assets.mic_icon} alt="" /> */}
                        <div title="Start live transcription" className="tooltip-wrapper">
                            <img
                            src={assets.mic_icon}
                            alt="Mic"
                            onClick={goToLiveTranscription}
                            />
                            <span className="tooltip-text">Audio Mode</span>
                        </div>
                        <img
                            onClick={() => !initializing && onSent()}
                            src={assets.send_icon}
                            alt=""
                            style={{
                                opacity: loading || initializing ? 0.5 : 1,
                                cursor: loading || initializing ? 'not-allowed' : 'pointer'
                            }}
                        />
                    </div>
                </div>
                <p className='bottom-info'> This is your space. Let’s take a moment together. </p>
            </div>

        </div>
    </div>

  )
}

export default Main