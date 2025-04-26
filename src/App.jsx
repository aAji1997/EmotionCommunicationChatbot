import React, { useContext, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar/Sidebar';
import Main from './components/Main/Main';
import AudioPage from './components/Audio/Audio';
import AudioDebug from './components/Audio/AudioDebug';
import Signin from './components/Signin/Signin';
import { Context } from './context/context';
import { checkHealth } from './services/api';

const Home = () => (
  <>
    <Sidebar />
    <Main />
  </>
);

const App = () => {
  const { setUser } = useContext(Context);

  // Check API health and load user from localStorage on startup
  useEffect(() => {
    const checkApiAndLoadUser = async () => {
      try {
        // Check if API is available
        await checkHealth();

        // Try to load user from localStorage
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          setUser(userData);
          console.log('User loaded from localStorage:', userData.username);
        }
      } catch (error) {
        console.error('API health check failed or user loading error:', error);
      }
    };

    checkApiAndLoadUser();
  }, [setUser]);

  return (
    <Router>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/signin' element={<Signin />} />
        <Route path='/audio' element={<AudioPage />} />
        <Route path='/debug' element={<AudioDebug />} />
      </Routes>
    </Router>
  );
};

export default App;
