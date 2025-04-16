import React from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Stack,
} from '@mui/material';
import {
  RestaurantMenu as RestaurantMenuIcon,
  PhotoCamera as PhotoCameraIcon,
  Timeline as TimelineIcon,
  Psychology as PsychologyIcon,
  MonitorHeart as MonitorHeartIcon,
  Notifications as NotificationsIcon
} from '@mui/icons-material';

const featureCards = [
  {
    icon: <PhotoCameraIcon sx={{ fontSize: 40, color: '#4CAF50' }} />,
    title: 'AI Food Detection',
    description: 'Simply take a photo of your meal and let our AI identify and analyze it for you'
  },
  {
    icon: <RestaurantMenuIcon sx={{ fontSize: 40, color: '#FF9800' }} />,
    title: 'Personalized Diet Plans',
    description: 'Get customized meal plans based on your goals and preferences'
  },
  {
    icon: <TimelineIcon sx={{ fontSize: 40, color: '#2196F3' }} />,
    title: 'Progress Tracking',
    description: 'Monitor your nutrition goals and track your progress over time'
  },
  {
    icon: <PsychologyIcon sx={{ fontSize: 40, color: '#9C27B0' }} />,
    title: 'AI Nutrition Assistant',
    description: 'Get real-time advice and answers to your nutrition questions'
  },
  {
    icon: <MonitorHeartIcon sx={{ fontSize: 40, color: '#F44336' }} />,
    title: 'Health Monitoring',
    description: 'Track calories, macros, and other important health metrics'
  },
  {
    icon: <NotificationsIcon sx={{ fontSize: 40, color: '#FF5722' }} />,
    title: 'Smart Reminders',
    description: 'Get timely reminders for meals and water intake'
  }
];

const Welcome = () => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'url(/images/healthy-food-bg.jpg) no-repeat center center fixed',
        backgroundSize: 'cover',
        py: 6
      }}
    >
      <Container maxWidth="lg">
        {/* Logo and Welcome Text Section */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <img 
            src="/images/logo.png" 
            alt="Nutri Vision Logo" 
            style={{ 
              height: '120px',
              marginBottom: '24px'
            }} 
          />
          <Typography 
            variant="h2" 
            component="h1" 
            gutterBottom
            sx={{ 
              color: '#fff',
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
              fontWeight: 'bold'
            }}
          >
            Welcome to Nutri Vision
          </Typography>
          <Typography 
            variant="h5" 
            sx={{ 
              color: '#fff',
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
              mb: 4,
              maxWidth: '800px',
              mx: 'auto'
            }}
          >
            Your AI-powered nutrition assistant for a healthier lifestyle
          </Typography>
          <Button
            component={Link}
            to="/signin"
            variant="contained"
            size="large"
            sx={{
              px: 6,
              py: 2,
              fontSize: '1.2rem',
              backgroundColor: '#4CAF50',
              '&:hover': {
                backgroundColor: '#388E3C',
              },
            }}
          >
            Get Started
          </Button>
        </Box>

        {/* Feature Cards Grid */}
        <Grid container spacing={3}>
          {featureCards.map((feature, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Card 
                sx={{ 
                  height: '100%',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'translateY(-5px)',
                    boxShadow: 6
                  }
                }}
              >
                <CardContent>
                  <Stack spacing={2} alignItems="center" textAlign="center">
                    {feature.icon}
                    <Typography variant="h6" component="h3">
                      {feature.title}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                      {feature.description}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
};

export default Welcome; 