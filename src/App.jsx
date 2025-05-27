import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider, Box, CircularProgress } from '@mui/material';
import theme from './theme';
import Navbar from './components/layout/Navbar';
import Welcome from './pages/Welcome';
import SignIn from './pages/SignIn';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import DietPlan from './pages/DietPlan';
import MealLog from './pages/MealLog';
import Progress from './pages/Progress';
import Profile from './pages/Profile';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ChatBot from './components/chat/ChatBot';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getApps, initializeApp } from 'firebase/app';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase/config'; // adjust path as needed

const firebaseConfig = {
  apiKey: "AIzaSyA6cUdhIJ7vuMrRPJMaVWTWtaIZ7T-0J2U",
  authDomain: "nutri-vision-704d5.firebaseapp.com",
  projectId: "nutri-vision-704d5",
  storageBucket: "nutri-vision-704d5.firebasestorage.app",
  messagingSenderId: "459313233457",
  appId: "1:459313233457:web:e8497090f2a65c09c65f10",
  measurementId: "G-5R7PH6HJ83"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const messaging = getMessaging(app);

export const requestPermissionAndSaveToken = async (userId) => {
  try {
    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);
    if (permission === 'granted') {
      const registration = await navigator.serviceWorker.ready;
      const token = await getToken(messaging, {
        vapidKey: 'BN0iITFIyGKPznLfINBns4uGVaVkifKi_ZIP1CT6UEjKbAkIvaXeMhrdY2CRqsJRzciTTznbqplS-R7W12hrdq8',
        serviceWorkerRegistration: registration
      });
      console.log('FCM token:', token);
      await updateDoc(doc(db, 'userProfiles', userId), { fcmToken: token });
      return token;
    }
  } catch (err) {
    console.error('Unable to get permission to notify or save token:', err);
  }
};

const AppContent = () => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (currentUser) {
      requestPermissionAndSaveToken(currentUser.uid);
    }
  }, [currentUser]);

  useEffect(() => {
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Message received. ', payload);
      const notificationTitle = payload.notification.title;
      const notificationOptions = {
        body: payload.notification.body,
        icon: '/logo192.png'
      };

      if (Notification.permission === 'granted') {
        new Notification(notificationTitle, notificationOptions);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'url(/images/healthy-food-bg.jpg) no-repeat center center fixed',
          backgroundSize: 'cover',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'url(/images/healthy-food-bg.jpg) no-repeat center center fixed',
        backgroundSize: 'cover',
      }}
    >
      {currentUser && <Navbar />}
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={!currentUser ? <Welcome /> : <Navigate to="/dashboard" />} />
          <Route path="/signin" element={!currentUser ? <SignIn /> : <Navigate to="/dashboard" />} />
          <Route path="/onboarding" element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          } />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/diet-plan" element={
            <ProtectedRoute>
              <DietPlan />
            </ProtectedRoute>
          } />
          <Route path="/meal-log" element={
            <ProtectedRoute>
              <MealLog />
            </ProtectedRoute>
          } />
          <Route path="/progress" element={
            <ProtectedRoute>
              <Progress />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {currentUser && location.pathname !== '/onboarding' && <ChatBot />}
    </Box>
  );
};

const App = () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration);
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });
  }

  return (
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
};

export default App; 