import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Stack,
  LinearProgress,
  Button,
  Drawer,
  Fab,
  Paper,
  Chip
} from '@mui/material';
import {
  Restaurant as RestaurantIcon,
  Schedule as ScheduleIcon,
  Chat as ChatIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  NoFood as NoFoodIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { generateDietRecommendations } from '../firebase/services/aiService';
import ChatBot from '../components/chat/ChatBot';

const MEAL_ORDER = ['breakfast', 'lunch', 'snacks', 'dinner'];

const DietPlan = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dietPlan, setDietPlan] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recommendedFoods, setRecommendedFoods] = useState('');
  const [foodsToAvoid, setFoodsToAvoid] = useState('');

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!currentUser) return;
      
      try {
        setLoading(true);
        const userProfileRef = doc(db, 'userProfiles', currentUser.uid);
        const userProfileDoc = await getDoc(userProfileRef);
        
        if (userProfileDoc.exists()) {
          const profile = userProfileDoc.data();
          setUserProfile(profile);

          // Check if we need to generate a new diet plan
          const dietPlanRef = doc(db, 'dietPlans', currentUser.uid);
          const dietPlanDoc = await getDoc(dietPlanRef);
          
          const shouldGenerateNewPlan = () => {
            if (!dietPlanDoc.exists()) return true;
            
            const lastGenerated = dietPlanDoc.data().lastGenerated?.toDate();
            if (!lastGenerated) return true;
            
            // Check if it's been a week since last generation
            const oneWeek = 7 * 24 * 60 * 60 * 1000;
            const timeSinceLastGen = Date.now() - lastGenerated.getTime();
            
            // Generate if profile changed or it's been a week
            return timeSinceLastGen >= oneWeek || 
                   JSON.stringify(dietPlanDoc.data().generatedForProfile) !== JSON.stringify(profile);
          };

          if (shouldGenerateNewPlan()) {
            await generateDietPlan(profile);
          } else {
            // Use existing diet plan
            const existingPlan = dietPlanDoc.data();
            setDietPlan(existingPlan.dietPlan);
            setRecommendedFoods(existingPlan.recommendedFoods);
            setFoodsToAvoid(existingPlan.foodsToAvoid);
          }
        } else {
          setError('No user profile found. Please complete your profile first.');
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
        setError('Failed to load user profile');
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [currentUser]);

  const generateDietPlan = async (profile) => {
    try {
      setIsGenerating(true);
      // Calculate daily targets based on profile (matching dashboard calculations)
      const calculateDailyTargets = (profile) => {
        // Base calorie calculation
        const bmr = profile.gender?.toLowerCase() === 'male'
          ? 88.362 + (13.397 * profile.weight) + (4.799 * profile.height) - (5.677 * profile.age)
          : 447.593 + (9.247 * profile.weight) + (3.098 * profile.height) - (4.330 * profile.age);

        const activityMultipliers = {
          'sedentary': 1.2,
          'lightly active': 1.375,
          'moderately active': 1.55,
          'very active': 1.725,
          'extra active': 1.9
        };

        const dailyCalories = Math.round(bmr * (activityMultipliers[profile.activityLevel?.toLowerCase()] || 1.2));
        
        // Calculate macros based on calorie goals
        const proteinGrams = Math.round(profile.weight * 1.8); // 1.8g per kg bodyweight
        const fatGrams = Math.round((dailyCalories * 0.25) / 9); // 25% of calories from fat
        const carbGrams = Math.round((dailyCalories * 0.45) / 4); // 45% of calories from carbs

        return {
          calories: dailyCalories,
          protein: proteinGrams,
          carbs: carbGrams,
          fats: fatGrams
        };
      };

      const dailyTargets = calculateDailyTargets(profile);

      // Generate personalized diet plan with specific targets
      const dietPlanPrompt = `Create a detailed daily diet plan for a person with the following profile and EXACT daily nutritional targets:

      Profile:
      Age: ${profile?.age || 'Not specified'}
      Gender: ${profile?.gender || 'Not specified'}
      Weight: ${profile?.weight || 'Not specified'} kg
      Height: ${profile?.height || 'Not specified'} cm
      Activity Level: ${profile?.activityLevel || 'Not specified'}
      Dietary Preferences: ${profile?.dietaryPreferences || 'Not specified'}
      Health Conditions: ${profile?.healthConditions || 'None'}
      Allergies: ${profile?.allergies || 'None'}
      Goals: ${profile?.goals || 'Not specified'}

      STRICT Daily Nutritional Targets (must match exactly):
      - Total Calories: ${dailyTargets.calories} kcal
      - Protein: ${dailyTargets.protein}g
      - Carbohydrates: ${dailyTargets.carbs}g
      - Fats: ${dailyTargets.fats}g

      Please provide a detailed meal plan that EXACTLY matches these daily targets, broken down into breakfast, lunch, dinner, and snacks. For each meal, specify the exact portion sizes and nutritional content that adds up to the daily targets above.`;

      const dietPlanResponse = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=AIzaSyBS--qFPRpUxyf1MQBcq2I0Gb8GRW7iUrk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: dietPlanPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        })
      });

      if (!dietPlanResponse.ok) {
        throw new Error('Failed to generate diet plan');
      }

      const dietPlanData = await dietPlanResponse.json();
      const generatedDietPlan = dietPlanData.candidates[0].content.parts[0].text;
      
      // Generate recommended foods
      const foodsPrompt = `Based on the following profile, list specific foods that would be beneficial:
      ${JSON.stringify(profile, null, 2)}
      
      Please provide a detailed list of recommended foods with explanations of why they are beneficial.`;

      const foodsResponse = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=AIzaSyBS--qFPRpUxyf1MQBcq2I0Gb8GRW7iUrk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: foodsPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        })
      });

      if (!foodsResponse.ok) {
        throw new Error('Failed to generate recommended foods');
      }

      const foodsData = await foodsResponse.json();
      const generatedRecommendedFoods = foodsData.candidates[0].content.parts[0].text;
      
      // Generate foods to avoid
      const avoidPrompt = `Based on the following profile, list specific foods that should be avoided:
      ${JSON.stringify(profile, null, 2)}
      
      Please provide a detailed list of foods to avoid with explanations of why they should be avoided.`;

      const avoidResponse = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=AIzaSyBS--qFPRpUxyf1MQBcq2I0Gb8GRW7iUrk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: avoidPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        })
      });

      if (!avoidResponse.ok) {
        throw new Error('Failed to generate foods to avoid');
      }

      const avoidData = await avoidResponse.json();
      const generatedFoodsToAvoid = avoidData.candidates[0].content.parts[0].text;

      // Extract nutritional values from the generated plan
      const extractNutritionalValues = (text) => {
        // Extract meal-specific values using regex
        const breakfastRegex = /Breakfast.*?(\d+)\s*kcal.*?(\d+)g\s*Protein.*?(\d+)g\s*Carbs.*?(\d+)g\s*Fat/s;
        const lunchRegex = /Lunch.*?(\d+)\s*kcal.*?(\d+)g\s*Protein.*?(\d+)g\s*Carbs.*?(\d+)g\s*Fat/s;
        const snacksRegex = /Snacks?.*?(\d+)\s*kcal.*?(\d+)g\s*Protein.*?(\d+)g\s*Carbs.*?(\d+)g\s*Fat/s;
        const dinnerRegex = /Dinner.*?(\d+)\s*kcal.*?(\d+)g\s*Protein.*?(\d+)g\s*Carbs.*?(\d+)g\s*Fat/s;

        const breakfastMatch = text.match(breakfastRegex);
        const lunchMatch = text.match(lunchRegex);
        const snacksMatch = text.match(snacksRegex);
        const dinnerMatch = text.match(dinnerRegex);

        if (breakfastMatch && lunchMatch && snacksMatch && dinnerMatch) {
          return {
            dailyTargets: {
              breakfast: {
                calories: parseInt(breakfastMatch[1]),
                protein: parseInt(breakfastMatch[2]),
                carbs: parseInt(breakfastMatch[3]),
                fats: parseInt(breakfastMatch[4])
              },
              lunch: {
                calories: parseInt(lunchMatch[1]),
                protein: parseInt(lunchMatch[2]),
                carbs: parseInt(lunchMatch[3]),
                fats: parseInt(lunchMatch[4])
              },
              snacks: {
                calories: parseInt(snacksMatch[1]),
                protein: parseInt(snacksMatch[2]),
                carbs: parseInt(snacksMatch[3]),
                fats: parseInt(snacksMatch[4])
              },
              dinner: {
                calories: parseInt(dinnerMatch[1]),
                protein: parseInt(dinnerMatch[2]),
                carbs: parseInt(dinnerMatch[3]),
                fats: parseInt(dinnerMatch[4])
              }
            }
          };
        }
        return null;
      };

      const nutritionalValues = extractNutritionalValues(generatedDietPlan);
      if (!nutritionalValues) {
        throw new Error('Failed to extract nutritional values from diet plan');
      }

      // Store the diet plan and its values in Firestore
      const dietPlanRef = doc(db, 'dietPlans', currentUser.uid);
      await setDoc(dietPlanRef, {
        dietPlan: generatedDietPlan,
        recommendedFoods: generatedRecommendedFoods,
        foodsToAvoid: generatedFoodsToAvoid,
        dailyTargets: nutritionalValues.dailyTargets,
        lastGenerated: serverTimestamp(),
        generatedForProfile: profile
      });

      setDietPlan(generatedDietPlan);
      setRecommendedFoods(generatedRecommendedFoods);
      setFoodsToAvoid(generatedFoodsToAvoid);

    } catch (error) {
      console.error('Error generating content:', error);
      setError('Failed to generate diet plan and recommendations');
    } finally {
      setIsGenerating(false);
    }
  };

  const renderMealTargets = (meal) => {
    if (!meal.targets) return null;
    
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Nutritional Targets
        </Typography>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={3}>
            <Stack alignItems="center">
              <Typography variant="caption">Calories</Typography>
              <Typography variant="body2">{meal.targets.calories}</Typography>
            </Stack>
          </Grid>
          <Grid item xs={3}>
            <Stack alignItems="center">
              <Typography variant="caption">Protein</Typography>
              <Typography variant="body2">{meal.targets.protein}g</Typography>
            </Stack>
          </Grid>
          <Grid item xs={3}>
            <Stack alignItems="center">
              <Typography variant="caption">Carbs</Typography>
              <Typography variant="body2">{meal.targets.carbs}g</Typography>
            </Stack>
          </Grid>
          <Grid item xs={3}>
            <Stack alignItems="center">
              <Typography variant="caption">Fats</Typography>
              <Typography variant="body2">{meal.targets.fats}g</Typography>
            </Stack>
          </Grid>
        </Grid>
      </Box>
    );
  };

  const renderMealSchedule = () => {
    if (!dietPlan?.mealSchedule) return null;

    return (
      <Box mt={4}>
        <Card sx={{ bgcolor: 'white' }}>
          <CardContent>
            <Box display="flex" alignItems="center" mb={3}>
              <ScheduleIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="h6">
                Meal Schedule
              </Typography>
            </Box>
            <Grid container spacing={3}>
              {(dietPlan.mealSchedule || []).map((meal, index) => (
                <Grid item xs={12} sm={6} key={index}>
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 2, 
                      bgcolor: 'grey.50',
                      height: '100%'
                    }}
                  >
                    <Typography 
                      variant="h6" 
                      color="primary" 
                      sx={{ mb: 1, fontSize: '1.1rem' }}
                    >
                      {meal.name}
                      <Typography 
                        component="span" 
                        color="text.secondary" 
                        sx={{ ml: 1, fontSize: '0.9rem' }}
                      >
                        ({meal.time})
                      </Typography>
                    </Typography>
                    
                    <List dense disablePadding>
                      {(meal.foods || []).map((food, idx) => (
                        <ListItem key={idx} disablePadding sx={{ py: 0.5 }}>
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <RestaurantIcon color="primary" fontSize="small" />
                          </ListItemIcon>
                          <ListItemText 
                            primary={food}
                            primaryTypographyProps={{
                              sx: { fontSize: '0.95rem' }
                            }}
                          />
                        </ListItem>
                      ))}
                      {(!meal.foods || meal.foods.length === 0) && (
                        <ListItem>
                          <ListItemText 
                            primary="No foods specified yet" 
                            secondary="Generate a diet plan to see meal details"
                          />
                        </ListItem>
                      )}
                    </List>

                    {renderMealTargets(meal)}
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      </Box>
    );
  };

  const renderRecommendations = () => {
    if (!dietPlan) return null;

    return (
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', bgcolor: 'white' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <RestaurantIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">
                  Recommended Foods
                </Typography>
              </Box>
              <List dense>
                {(dietPlan.recommendedFoods || []).map((food, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <CheckIcon color="success" />
                    </ListItemIcon>
                    <ListItemText 
                      primary={food}
                      primaryTypographyProps={{
                        sx: { fontSize: '1rem' }
                      }}
                    />
                  </ListItem>
                ))}
                {(!dietPlan.recommendedFoods || dietPlan.recommendedFoods.length === 0) && (
                  <ListItem>
                    <ListItemText 
                      primary="No recommended foods yet" 
                      secondary="Generate a diet plan to see recommendations"
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', bgcolor: 'white' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <NoFoodIcon color="error" sx={{ mr: 1 }} />
                <Typography variant="h6">
                  Foods to Avoid
                </Typography>
              </Box>
              <List dense>
                {(dietPlan.foodsToAvoid || []).map((food, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <CancelIcon color="error" />
                    </ListItemIcon>
                    <ListItemText 
                      primary={food}
                      primaryTypographyProps={{
                        sx: { fontSize: '1rem' }
                      }}
                    />
                  </ListItem>
                ))}
                {(!dietPlan.foodsToAvoid || dietPlan.foodsToAvoid.length === 0) && (
                  <ListItem>
                    <ListItemText 
                      primary="No foods to avoid yet" 
                      secondary="Generate a diet plan to see recommendations"
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Card sx={{ bgcolor: 'white', textAlign: 'center', py: 6 }}>
          <CardContent>
            <Typography variant="h5" gutterBottom color="primary">
              Please Sit Tight!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              We're generating your personalized diet plan based on your profile...
            </Typography>
            <CircularProgress size={60} thickness={4} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
              This may take a few moments as we analyze your preferences and create tailored recommendations.
            </Typography>
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Card sx={{ mb: 4, bgcolor: 'white' }}>
        <CardContent>
          <Typography variant="h4" component="h1" gutterBottom>
            Your Personalized Diet Plan
          </Typography>
          
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading && (
            <Box textAlign="center" py={4}>
              <CircularProgress />
              <Typography variant="body1" sx={{ mt: 2 }}>
                Generating your personalized diet plan...
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {!loading && !error && (
        <>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Your Personalized Diet Plan
                  </Typography>
                  <Box sx={{ 
                    maxHeight: '500px',
                    overflowY: 'auto',
                    pr: 1,
                    '& p': { mb: 2 },
                    '& h1, & h2, & h3, & h4': { mt: 3, mb: 2 },
                    '& ul, & ol': { mb: 2, pl: 3 },
                    '& li': { mb: 1 },
                    '& strong': { fontWeight: 'bold' }
                  }}>
                    <ReactMarkdown>
                      {dietPlan || 'Generating your personalized diet plan...'}
                    </ReactMarkdown>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <RestaurantIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant="h6">
                      Recommended Foods
                    </Typography>
                  </Box>
                  <Box sx={{ 
                    maxHeight: '400px',
                    overflowY: 'auto',
                    pr: 1,
                    '& p': { mb: 2 },
                    '& h1, & h2, & h3, & h4': { mt: 3, mb: 2 },
                    '& ul, & ol': { mb: 2, pl: 3 },
                    '& li': { mb: 1 },
                    '& strong': { fontWeight: 'bold' }
                  }}>
                    <ReactMarkdown>
                      {recommendedFoods || 'Generating recommended foods...'}
                    </ReactMarkdown>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <NoFoodIcon color="error" sx={{ mr: 1 }} />
                    <Typography variant="h6">
                      Foods to Avoid
                    </Typography>
                  </Box>
                  <Box sx={{ 
                    maxHeight: '400px',
                    overflowY: 'auto',
                    pr: 1,
                    '& p': { mb: 2 },
                    '& h1, & h2, & h3, & h4': { mt: 3, mb: 2 },
                    '& ul, & ol': { mb: 2, pl: 3 },
                    '& li': { mb: 1 },
                    '& strong': { fontWeight: 'bold' }
                  }}>
                    <ReactMarkdown>
                      {foodsToAvoid || 'Generating foods to avoid...'}
                    </ReactMarkdown>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}

      <Fab
        color="primary"
        aria-label="chat"
        onClick={() => setIsChatOpen(true)}
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
      >
        <ChatIcon />
      </Fab>

      <Drawer
        anchor="right"
        open={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 400 } }
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Nutrition Assistant
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <ChatBot context="diet" />
        </Box>
      </Drawer>
    </Container>
  );
};

export default DietPlan; 