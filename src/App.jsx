import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

const AppContent = () => {
  const { currentUser, loading } = useAuth();

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
      {currentUser && <ChatBot />}
    </Box>
  );
};

const App = () => {
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