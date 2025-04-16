import React, { useState } from 'react';
import {
  AppBar,
  Box,
  Toolbar,
  IconButton,
  Typography,
  Menu,
  MenuItem,
  Avatar,
} from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { signOut } from 'firebase/auth';

const Navbar = () => {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/signin');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <AppBar position="static" sx={{ backgroundColor: '#4CAF50' }}>
      <Toolbar>
        <Box component={Link} to="/" sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
          <img src="/images/logo.png" alt="Nutri Vision Logo" style={{ height: '40px', marginRight: '10px' }} />
          <Typography variant="h6" component="div">
            Nutri Vision
          </Typography>
        </Box>

        <Box sx={{ flexGrow: 1, display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Typography
            component={Link}
            to="/dashboard"
            sx={{ color: 'white', textDecoration: 'none' }}
          >
            Dashboard
          </Typography>
          <Typography
            component={Link}
            to="/diet-plan"
            sx={{ color: 'white', textDecoration: 'none' }}
          >
            Diet Plan
          </Typography>
          <Typography
            component={Link}
            to="/meal-log"
            sx={{ color: 'white', textDecoration: 'none' }}
          >
            Meal Log
          </Typography>
          <Typography
            component={Link}
            to="/progress"
            sx={{ color: 'white', textDecoration: 'none' }}
          >
            Progress
          </Typography>
        </Box>

        <IconButton onClick={handleMenu} sx={{ ml: 2 }}>
          <Avatar src={auth.currentUser?.photoURL} />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
        >
          <MenuItem component={Link} to="/profile" onClick={handleClose}>Profile</MenuItem>
          <MenuItem onClick={handleSignOut}>Sign Out</MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar; 