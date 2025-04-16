import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Container,
  Card,
  CardContent,
  CircularProgress,
  Alert
} from '@mui/material';
import { Google as GoogleIcon } from '@mui/icons-material';
import { auth, db } from '../firebase/config';
import { signInWithPopup, GoogleAuthProvider, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const SignIn = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    // Check if user is already signed in
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const profileDoc = await getDoc(doc(db, 'userProfiles', user.uid));
          if (profileDoc.exists()) {
            navigate('/dashboard', { replace: true });
          } else {
            navigate('/onboarding', { replace: true });
          }
        } catch (error) {
          console.error('Error checking user profile:', error);
        }
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user profile exists
      const profileDoc = await getDoc(doc(db, 'userProfiles', user.uid));
      
      if (profileDoc.exists()) {
        // Update last login
        await setDoc(doc(db, 'userProfiles', user.uid), {
          lastLogin: new Date()
        }, { merge: true });
        
        // Navigate to the page they tried to visit or dashboard
        navigate(from, { replace: true });
      } else {
        // New user - redirect to onboarding
        navigate('/onboarding', { replace: true });
      }
    } catch (error) {
      console.error('Sign-in error:', error);
      setError('Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'url(/images/healthy-food-bg.jpg) no-repeat center center fixed',
        backgroundSize: 'cover',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Container maxWidth="sm">
        <Card sx={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Box sx={{ mb: 4 }}>
              <img src="/images/logo.png" alt="Nutri Vision Logo" style={{ height: '80px', marginBottom: '20px' }} />
              <Typography variant="h4" component="h1" gutterBottom>
                Welcome to Nutri Vision
              </Typography>
              <Typography variant="subtitle1" color="text.secondary">
                Your personal AI-powered nutrition assistant
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              fullWidth
              variant="contained"
              startIcon={loading ? <CircularProgress size={20} /> : <GoogleIcon />}
              onClick={handleGoogleSignIn}
              disabled={loading}
              sx={{ mt: 2 }}
            >
              {loading ? 'Signing in...' : 'Sign in with Google'}
            </Button>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
};

export default SignIn; 