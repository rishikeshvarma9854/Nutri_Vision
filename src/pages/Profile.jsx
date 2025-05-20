import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  CircularProgress,
  TextField,
  Stack,
  MenuItem,
  Alert,
  Chip,
  Divider,
  Container
} from '@mui/material';
import {
  FitnessCenter as FitnessCenterIcon,
  Restaurant as RestaurantIcon,
  AccessTime as AccessTimeIcon,
  Warning as WarningIcon,
  LocalHospital as MedicalIcon,
  Notifications as NotificationsIcon
} from '@mui/icons-material';
import { db, auth } from '../firebase/config';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import NotificationSettings from '../components/NotificationSettings';

const dietaryTypes = [
  'Omnivore',
  'Vegetarian',
  'Vegan',
  'Pescatarian(no meat expect seafoods)',
  'Keto(low carb, high fat)',
  'Paleo(no grains, legumes, processed foods)',
  'Mediterranean(lots of fruits, vegetables, whole grains, fish, olive oil)'
];

const genderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' }
];

const activityLevels = [
  'Sedentary',
  'Lightly Active',
  'Moderately Active',
  'Very Active',
  'Extremely Active'
];

const goals = [
  'Weight Loss',
  'Weight Maintenance',
  'Weight Gain',
  'Muscle Gain',
  'Better Nutrition'
];

const mealPreferences = [
  { value: '3_meals', label: '3 Meals per Day' },
  { value: '5_meals', label: '5 Meals per Day' },
  { value: 'intermittent', label: 'Intermittent Fasting' }
];

const Profile = () => {
  const [profile, setProfile] = useState({
    name: '',
    gender: '',
    dateOfBirth: '',
    age: '',
    height: '',
    weight: '',
    goal: '',
    targetWeight: '',
    dietaryType: '',
    activityLevel: '',
    allergies: [],
    medicalConditions: [],
    mealPreference: '',
    email: '',
    photoURL: ''
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const userId = auth.currentUser.uid;
      const profileDoc = await getDoc(doc(db, 'userProfiles', userId));
      
      // Get user info from Google
      const googleUser = auth.currentUser;
      const googleData = {
        name: googleUser.displayName || '',
        email: googleUser.email || '',
        photoURL: googleUser.photoURL || '',
      };

      if (profileDoc.exists()) {
        const profileData = profileDoc.data();
        setProfile(prev => ({
          ...profileData,
          name: profileData.name || googleData.name,
          email: profileData.email || googleData.email,
          photoURL: profileData.photoURL || googleData.photoURL,
          // Keep existing gender and DOB if they exist
          gender: profileData.gender || '',
          dateOfBirth: profileData.dateOfBirth || ''
        }));
      } else {
        // Create new profile with Google data and empty gender/DOB
        const newProfile = {
          ...googleData,
          gender: '',
          dateOfBirth: '',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await setDoc(doc(db, 'userProfiles', userId), newProfile);
        setProfile(prev => ({
          ...prev,
          ...newProfile
        }));
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setError('Error loading profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setProfile(prev => ({
      ...prev,
      [name]: value
    }));
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError(null);
      const userId = auth.currentUser.uid;
      
      await updateDoc(doc(db, 'userProfiles', userId), {
        ...profile,
        updatedAt: new Date()
      });

      setSuccess(true);
      setEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Profile Settings</Typography>
        <Button
          variant="contained"
          onClick={() => editing ? handleSubmit() : setEditing(true)}
          disabled={saving}
        >
          {editing ? (saving ? 'Saving...' : 'Save Changes') : 'Edit Profile'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Profile updated successfully!
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Personal Information */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Personal Information
              </Typography>
              <Stack spacing={3}>
                <TextField
                  fullWidth
                  label="Full Name"
                  name="name"
                  value={profile.name}
                  onChange={handleChange}
                  disabled={!editing}
                  helperText={
                    profile.name === auth.currentUser?.displayName
                      ? "This name was imported from your Google account. You can change it if you'd like."
                      : "Enter the name you'd like to be called"
                  }
                />
                <TextField
                  select
                  fullWidth
                  label="Gender"
                  name="gender"
                  value={profile.gender}
                  onChange={handleChange}
                  disabled={!editing}
                  helperText="Select your gender"
                >
                  {genderOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  fullWidth
                  label="Date of Birth"
                  name="dateOfBirth"
                  type="date"
                  value={profile.dateOfBirth}
                  onChange={handleChange}
                  disabled={!editing}
                  helperText="Enter your date of birth"
                  InputLabelProps={{
                    shrink: true,
                  }}
                />
                <TextField
                  fullWidth
                  label="Age"
                  name="age"
                  type="number"
                  value={profile.age}
                  onChange={handleChange}
                  disabled={!editing}
                />
                <TextField
                  fullWidth
                  label="Height (cm)"
                  name="height"
                  type="number"
                  value={profile.height}
                  onChange={handleChange}
                  disabled={!editing}
                />
                <TextField
                  fullWidth
                  label="Current Weight (kg)"
                  name="weight"
                  type="number"
                  value={profile.weight}
                  onChange={handleChange}
                  disabled={!editing}
                />
                <TextField
                  fullWidth
                  label="Target Weight (kg)"
                  name="targetWeight"
                  type="number"
                  value={profile.targetWeight}
                  onChange={handleChange}
                  disabled={!editing}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Health & Diet Preferences */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Health & Diet Preferences
              </Typography>
              <Stack spacing={3}>
                <TextField
                  select
                  fullWidth
                  label="Goal"
                  name="goal"
                  value={profile.goal}
                  onChange={handleChange}
                  disabled={!editing}
                >
                  {goals.map((option) => (
                    <MenuItem key={option} value={option.toLowerCase().replace(' ', '_')}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  fullWidth
                  label="Activity Level"
                  name="activityLevel"
                  value={profile.activityLevel}
                  onChange={handleChange}
                  disabled={!editing}
                >
                  {activityLevels.map((option) => (
                    <MenuItem key={option} value={option.toLowerCase().replace(' ', '_')}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  fullWidth
                  label="Dietary Type"
                  name="dietaryType"
                  value={profile.dietaryType}
                  onChange={handleChange}
                  disabled={!editing}
                >
                  {dietaryTypes.map((option) => (
                    <MenuItem key={option} value={option.toLowerCase()}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  fullWidth
                  label="Meal Preference"
                  name="mealPreference"
                  value={profile.mealPreference}
                  onChange={handleChange}
                  disabled={!editing}
                >
                  {mealPreferences.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Health Conditions */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Health Conditions
              </Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Allergies"
                    name="allergies"
                    value={Array.isArray(profile.allergies) ? profile.allergies.join(', ') : profile.allergies}
                    onChange={(e) => handleChange({
                      target: {
                        name: 'allergies',
                        value: e.target.value.split(',').map(item => item.trim())
                      }
                    })}
                    disabled={!editing}
                    multiline
                    rows={2}
                    helperText="Separate multiple allergies with commas"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Medical Conditions"
                    name="medicalConditions"
                    value={Array.isArray(profile.medicalConditions) ? profile.medicalConditions.join(', ') : profile.medicalConditions}
                    onChange={(e) => handleChange({
                      target: {
                        name: 'medicalConditions',
                        value: e.target.value.split(',').map(item => item.trim())
                      }
                    })}
                    disabled={!editing}
                    multiline
                    rows={2}
                    helperText="Separate multiple conditions with commas"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Notification Settings Section */}
        <Grid item xs={12}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h4" gutterBottom display="flex" alignItems="center">
              <NotificationsIcon sx={{ mr: 1 }} />
              Notifications
            </Typography>
            <NotificationSettings />
          </Box>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Profile; 