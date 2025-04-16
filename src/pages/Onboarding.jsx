import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Stepper,
  Step,
  StepLabel,
  Button,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
  Slider,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Grid,
  Divider,
  Chip,
  OutlinedInput
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/config';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const steps = ['Personal Info', 'Health Details', 'Dietary Preferences'];

const activityLevels = [
  { value: 'sedentary', label: 'Sedentary (little or no exercise)' },
  { value: 'lightly_active', label: 'Lightly Active (light exercise 1-3 days/week)' },
  { value: 'moderately_active', label: 'Moderately Active (moderate exercise 3-5 days/week)' },
  { value: 'very_active', label: 'Very Active (hard exercise 6-7 days/week)' },
  { value: 'super_active', label: 'Super Active (very hard exercise & physical job)' }
];

const dietaryTypes = [
  { value: 'omnivore', label: 'Omnivore (Everything)' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'keto', label: 'Ketogenic' },
  { value: 'paleo', label: 'Paleo' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'other', label: 'Other (Specify in notes)' }
];

const commonAllergies = [
  'Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 
  'Peanuts', 'Wheat', 'Soy', 'Other'
];

const commonConditions = [
  'Diabetes', 'Hypertension', 'Celiac Disease', 'Lactose Intolerance',
  'IBS', 'GERD', 'Other'
];

const goals = [
  { value: 'weight_loss', label: 'Weight Loss' },
  { value: 'weight_gain', label: 'Weight Gain' },
  { value: 'maintain', label: 'Maintain Weight' },
  { value: 'muscle_gain', label: 'Build Muscle' },
  { value: 'health_improvement', label: 'Improve Overall Health' }
];

const genderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' }
];

const Onboarding = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    gender: '',
    dateOfBirth: '',
    age: '',
    height: '',
    weight: '',
    targetWeight: '',
    goal: '',
    activityLevel: '',
    dietaryType: '',
    foodAllergies: [],
    otherAllergies: '',
    medicalConditions: [],
    otherConditions: '',
    dietaryNotes: ''
  });
  const navigate = useNavigate();

  useEffect(() => {
    const checkUserProfile = async () => {
      if (!auth.currentUser) {
        navigate('/login');
        return;
      }

      try {
        // Get user's display name from Google Sign-in
        setFormData(prev => ({
          ...prev,
          name: auth.currentUser.displayName || ''
        }));

        const userProfileDoc = await getDoc(doc(db, 'userProfiles', auth.currentUser.uid));
        if (userProfileDoc.exists()) {
          // User already has a profile, redirect to dashboard
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('Error checking user profile:', error);
        setError('Failed to check user profile. Please try again.');
      }
    };

    checkUserProfile();
  }, [navigate]);

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleMultiSelect = (event, field) => {
    const { value } = event.target;
    setFormData(prev => ({
      ...prev,
      [field]: typeof value === 'string' ? value.split(',') : value
    }));
  };

  const handleSubmit = async () => {
    if (!auth.currentUser) {
      setError('You must be logged in to complete onboarding');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const userId = auth.currentUser.uid;
      
      // Calculate age from date of birth
      let age = '';
      if (formData.dateOfBirth) {
        const birthDate = new Date(formData.dateOfBirth);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      }

      // Prepare the data including custom allergies and conditions
      const userData = {
        ...formData,
        age: age.toString(),
        foodAllergies: [
          ...formData.foodAllergies.filter(a => a !== 'Other'),
          ...(formData.otherAllergies ? [formData.otherAllergies] : [])
        ],
        medicalConditions: [
          ...formData.medicalConditions.filter(c => c !== 'Other'),
          ...(formData.otherConditions ? [formData.otherConditions] : [])
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Remove temporary fields
      delete userData.otherAllergies;
      delete userData.otherConditions;

      await setDoc(doc(db, 'userProfiles', userId), userData);

      // Calculate daily targets based on user profile
      const dailyTargets = calculateDailyTargets(userData);
      
      // Create and save diet plan
      const dietPlan = createDietPlan(dailyTargets);
      await setDoc(doc(db, 'dietPlans', userId), dietPlan);

      // Initialize user progress
      await setDoc(doc(db, 'userProgress', userId), {
        dailyProgress: {
          calories: { current: 0, target: dailyTargets.calories },
          protein: { current: 0, target: dailyTargets.protein },
          carbs: { current: 0, target: dailyTargets.carbs },
          fats: { current: 0, target: dailyTargets.fats }
        },
        streak: 0,
        mealStatus: {
          breakfast: false,
          lunch: false,
          dinner: false,
          snacks: false
        },
        createdAt: new Date()
      });

      // Navigate to dashboard and force a reload
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Error saving profile:', error);
      setError('Failed to save profile. Please try again.');
      setLoading(false);
    }
  };

  const calculateDailyTargets = (profile) => {
    // Calculate BMR using Mifflin-St Jeor Equation
    let bmr;
    if (profile.gender === 'male') {
      bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5;
    } else {
      bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;
    }

    // Activity level multipliers
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      veryActive: 1.9
    };

    // Calculate TDEE (Total Daily Energy Expenditure)
    const tdee = bmr * activityMultipliers[profile.activityLevel || 'moderate'];

    // Adjust calories based on goal
    let targetCalories;
    switch (profile.goal) {
      case 'lose':
        targetCalories = tdee - 500; // 500 calorie deficit
        break;
      case 'gain':
        targetCalories = tdee + 500; // 500 calorie surplus
        break;
      default:
        targetCalories = tdee; // maintain weight
    }

    // Calculate macronutrient targets
    const proteinPerKg = profile.goal === 'gain' ? 2.2 : 2.0; // Higher protein for muscle gain
    const targetProtein = Math.round(profile.weight * proteinPerKg);
    const targetFats = Math.round((targetCalories * 0.25) / 9); // 25% of calories from fats
    const targetCarbs = Math.round((targetCalories - (targetProtein * 4 + targetFats * 9)) / 4);

    return {
      calories: Math.round(targetCalories),
      protein: targetProtein,
      carbs: targetCarbs,
      fats: targetFats
    };
  };

  const createDietPlan = (baseTargets) => ({
    recommendations: {
      dailyTargets: {
        breakfast: {
          calories: Math.round(baseTargets.calories * 0.25),
          protein: Math.round(baseTargets.protein * 0.25),
          carbs: Math.round(baseTargets.carbs * 0.25),
          fats: Math.round(baseTargets.fats * 0.25)
        },
        lunch: {
          calories: Math.round(baseTargets.calories * 0.35),
          protein: Math.round(baseTargets.protein * 0.35),
          carbs: Math.round(baseTargets.carbs * 0.35),
          fats: Math.round(baseTargets.fats * 0.35)
        },
        snacks: {
          calories: Math.round(baseTargets.calories * 0.15),
          protein: Math.round(baseTargets.protein * 0.15),
          carbs: Math.round(baseTargets.carbs * 0.15),
          fats: Math.round(baseTargets.fats * 0.15)
        },
        dinner: {
          calories: Math.round(baseTargets.calories * 0.25),
          protein: Math.round(baseTargets.protein * 0.25),
          carbs: Math.round(baseTargets.carbs * 0.25),
          fats: Math.round(baseTargets.fats * 0.25)
        }
      }
    },
    createdAt: new Date()
  });

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Card sx={{ bgcolor: 'white', boxShadow: 2 }}>
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Your Name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    helperText={
                      formData.name === auth.currentUser?.displayName
                        ? "This name was imported from your Google account. You can change it if you'd like."
                        : "Enter the name you'd like to be called"
                    }
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    select
                    fullWidth
                    label="Gender"
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    helperText="Select your gender"
                  >
                    {genderOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Date of Birth"
                    name="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={handleInputChange}
                    helperText="Enter your date of birth"
                    InputLabelProps={{
                      shrink: true,
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Height (cm)"
                    name="height"
                    type="number"
                    value={formData.height}
                    onChange={handleInputChange}
                    inputProps={{ min: 0 }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Current Weight (kg)"
                    name="weight"
                    type="number"
                    value={formData.weight}
                    onChange={handleInputChange}
                    inputProps={{ min: 0 }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Target Weight (kg)"
                    name="targetWeight"
                    type="number"
                    value={formData.targetWeight}
                    onChange={handleInputChange}
                    inputProps={{ min: 0 }}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        );
      case 1:
        return (
          <Card sx={{ bgcolor: 'white', boxShadow: 2 }}>
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Activity Level</InputLabel>
                    <Select
                      name="activityLevel"
                      value={formData.activityLevel}
                      onChange={handleInputChange}
                      label="Activity Level"
                    >
                      {activityLevels.map((level) => (
                        <MenuItem key={level.value} value={level.value}>
                          {level.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Medical Conditions</InputLabel>
                    <Select
                      multiple
                      name="medicalConditions"
                      value={formData.medicalConditions}
                      onChange={(e) => handleMultiSelect(e, 'medicalConditions')}
                      input={<OutlinedInput label="Medical Conditions" />}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value) => (
                            <Chip key={value} label={value} />
                          ))}
                        </Box>
                      )}
                    >
                      {commonConditions.map((condition) => (
                        <MenuItem key={condition} value={condition}>
                          {condition}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {formData.medicalConditions.includes('Other') && (
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Other Medical Conditions"
                      name="otherConditions"
                      value={formData.otherConditions}
                      onChange={handleInputChange}
                      multiline
                      rows={2}
                      helperText="Please specify any other medical conditions"
                    />
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        );
      case 2:
        return (
          <Card sx={{ bgcolor: 'white', boxShadow: 2 }}>
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Goal</InputLabel>
                    <Select
                      name="goal"
                      value={formData.goal}
                      onChange={handleInputChange}
                      label="Goal"
                    >
                      {goals.map((goal) => (
                        <MenuItem key={goal.value} value={goal.value}>
                          {goal.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Dietary Type</InputLabel>
                    <Select
                      name="dietaryType"
                      value={formData.dietaryType}
                      onChange={handleInputChange}
                      label="Dietary Type"
                    >
                      {dietaryTypes.map((type) => (
                        <MenuItem key={type.value} value={type.value}>
                          {type.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Food Allergies</InputLabel>
                    <Select
                      multiple
                      name="foodAllergies"
                      value={formData.foodAllergies}
                      onChange={(e) => handleMultiSelect(e, 'foodAllergies')}
                      input={<OutlinedInput label="Food Allergies" />}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value) => (
                            <Chip key={value} label={value} />
                          ))}
                        </Box>
                      )}
                    >
                      {commonAllergies.map((allergy) => (
                        <MenuItem key={allergy} value={allergy}>
                          {allergy}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {formData.foodAllergies.includes('Other') && (
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Other Allergies"
                      name="otherAllergies"
                      value={formData.otherAllergies}
                      onChange={handleInputChange}
                      multiline
                      rows={2}
                      helperText="Please specify any other food allergies"
                    />
                  </Grid>
                )}

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Additional Dietary Notes"
                    name="dietaryNotes"
                    value={formData.dietaryNotes}
                    onChange={handleInputChange}
                    multiline
                    rows={3}
                    helperText="Any additional information about your dietary preferences or restrictions"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Welcome to Nutri Vision, {formData.name}!
      </Typography>
      <Typography variant="subtitle1" gutterBottom align="center" sx={{ mb: 4 }}>
        Let's set up your personalized nutrition plan
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      
      {renderStepContent(activeStep)}
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
        >
          Back
        </Button>
        <Button
          variant="contained"
          onClick={activeStep === steps.length - 1 ? handleSubmit : handleNext}
          disabled={loading}
        >
          {loading ? (
            <CircularProgress size={24} />
          ) : activeStep === steps.length - 1 ? (
            'Complete Setup'
          ) : (
            'Next'
          )}
        </Button>
      </Box>
    </Container>
  );
};

export default Onboarding; 