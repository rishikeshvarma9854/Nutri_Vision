import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  FormGroup,
  FormControlLabel,
  TextField,
  Button,
  Alert,
  Stack,
  Divider
} from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { parseISO, format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import {
  getNotificationSettings,
  saveNotificationSettings,
  requestNotificationPermission,
  initializeNotifications
} from '../firebase/services/notificationService';

const NotificationSettings = () => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [currentUser]);

  const loadSettings = async () => {
    try {
      if (!currentUser) return;
      const userSettings = await getNotificationSettings(currentUser.uid);
      setSettings(userSettings);
    } catch (err) {
      setError('Failed to load notification settings');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchChange = (category, subcategory = null) => (event) => {
    setSettings(prev => ({
      ...prev,
      [category]: subcategory
        ? { ...prev[category], [subcategory]: event.target.checked }
        : { ...prev[category], enabled: event.target.checked }
    }));
  };

  const handleTimeChange = (category, timeField) => (newValue) => {
    const formattedTime = format(newValue, 'HH:mm');
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [timeField]: formattedTime
      }
    }));
  };

  const handleIntervalChange = (category) => (event) => {
    const value = parseInt(event.target.value);
    if (isNaN(value) || value < 30) return; // Minimum 30 minutes interval

    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        interval: value
      }
    }));
  };

  const handleSave = async () => {
    try {
      setError(null);
      setSuccess(false);

      if (!currentUser) {
        setError('Please log in to save settings');
        return;
      }

      const permission = await requestNotificationPermission();
      if (!permission) {
        setError('Notification permission is required');
        return;
      }

      await saveNotificationSettings(currentUser.uid, settings);
      await initializeNotifications(currentUser.uid);
      setSuccess(true);
    } catch (err) {
      setError('Failed to save settings');
      console.error(err);
    }
  };

  if (loading) {
    return <Typography>Loading settings...</Typography>;
  }

  if (!settings) {
    return <Typography>No settings available</Typography>;
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Notification Settings
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Settings saved successfully!
            </Alert>
          )}

          <Stack spacing={3}>
            {/* Profile Update Notifications */}
            <Box>
              <Typography variant="h6" gutterBottom>
                Profile Updates
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.profileUpdate.enabled}
                      onChange={handleSwitchChange('profileUpdate', 'enabled')}
                    />
                  }
                  label="Monthly profile update reminders"
                />
              </FormGroup>
            </Box>

            <Divider />

            {/* Meal Reminders */}
            <Box>
              <Typography variant="h6" gutterBottom>
                Meal Reminders
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.mealReminders.enabled}
                      onChange={handleSwitchChange('mealReminders', 'enabled')}
                    />
                  }
                  label="Enable meal reminders"
                />
                {settings.mealReminders.enabled && (
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    {['breakfast', 'lunch', 'snacks', 'dinner'].map((meal) => (
                      <TimePicker
                        key={meal}
                        label={`${meal.charAt(0).toUpperCase() + meal.slice(1)} time`}
                        value={parseISO(`2000-01-01T${settings.mealReminders[meal]}`)}
                        onChange={handleTimeChange('mealReminders', meal)}
                        textField={(params) => <TextField {...params} />}
                      />
                    ))}
                  </Stack>
                )}
              </FormGroup>
            </Box>

            <Divider />

            {/* Water Reminders */}
            <Box>
              <Typography variant="h6" gutterBottom>
                Water Reminders
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.waterReminders.enabled}
                      onChange={handleSwitchChange('waterReminders', 'enabled')}
                    />
                  }
                  label="Enable water reminders"
                />
                {settings.waterReminders.enabled && (
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    <TextField
                      type="number"
                      label="Reminder interval (minutes)"
                      value={settings.waterReminders.interval}
                      onChange={handleIntervalChange('waterReminders')}
                      inputProps={{ min: 30 }}
                    />
                    <TimePicker
                      label="Start time"
                      value={parseISO(`2000-01-01T${settings.waterReminders.startTime}`)}
                      onChange={handleTimeChange('waterReminders', 'startTime')}
                      textField={(params) => <TextField {...params} />}
                    />
                    <TimePicker
                      label="End time"
                      value={parseISO(`2000-01-01T${settings.waterReminders.endTime}`)}
                      onChange={handleTimeChange('waterReminders', 'endTime')}
                      textField={(params) => <TextField {...params} />}
                    />
                  </Stack>
                )}
              </FormGroup>
            </Box>

            <Divider />

            {/* Movement Reminders */}
            <Box>
              <Typography variant="h6" gutterBottom>
                Movement Reminders
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.movementReminders.enabled}
                      onChange={handleSwitchChange('movementReminders', 'enabled')}
                    />
                  }
                  label="Enable movement reminders"
                />
                {settings.movementReminders.enabled && (
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    <TextField
                      type="number"
                      label="Reminder interval (minutes)"
                      value={settings.movementReminders.interval}
                      onChange={handleIntervalChange('movementReminders')}
                      inputProps={{ min: 30 }}
                    />
                    <TimePicker
                      label="Start time"
                      value={parseISO(`2000-01-01T${settings.movementReminders.startTime}`)}
                      onChange={handleTimeChange('movementReminders', 'startTime')}
                      textField={(params) => <TextField {...params} />}
                    />
                    <TimePicker
                      label="End time"
                      value={parseISO(`2000-01-01T${settings.movementReminders.endTime}`)}
                      onChange={handleTimeChange('movementReminders', 'endTime')}
                      textField={(params) => <TextField {...params} />}
                    />
                  </Stack>
                )}
              </FormGroup>
            </Box>
          </Stack>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              disabled={loading}
            >
              Save Settings
            </Button>
          </Box>
        </CardContent>
      </Card>
    </LocalizationProvider>
  );
};

export default NotificationSettings; 