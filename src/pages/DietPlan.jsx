import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Chip,
  IconButton
} from '@mui/material';
import {
  Restaurant as RestaurantIcon,
  Schedule as ScheduleIcon,
  Chat as ChatIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  NoFood as NoFoodIcon,
  Info as InfoIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, setDoc, serverTimestamp, increment, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/config';
import { generateDietRecommendations } from '../firebase/services/aiService';
import ChatBot from '../components/chat/ChatBot';
import { useNavigate } from 'react-router-dom';

// Calculation functions for nutritional targets
const calculateDailyCalories = (profile) => {
  // Harris-Benedict BMR formula
  const { weight, height, age, gender, activityLevel, goal } = profile;
  
  // Base BMR calculation
  let bmr;
  if (gender === 'male') {
    bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
  } else {
    bmr = 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
  }

  // Activity multiplier
  const activityMultipliers = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extra_active: 1.9
  };
  
  let tdee = bmr * (activityMultipliers[activityLevel] || 1.2);

  // Adjust based on goal
  switch(goal) {
    case 'weight_loss':
      tdee -= 500; // Create a deficit
      break;
    case 'weight_gain':
      tdee += 500; // Create a surplus
      break;
    default: // maintenance
      break;
  }

  return Math.round(tdee);
};

const calculateProteinTarget = (profile, dailyCalories) => {
  // Higher protein for weight loss and muscle gain
  const proteinMultiplier = profile.goal === 'weight_loss' ? 2.0 : 
                           profile.goal === 'weight_gain' ? 1.8 : 1.6;
  return Math.round(profile.weight * proteinMultiplier);
};

const calculateCarbTarget = (profile, dailyCalories) => {
  // Adjust carbs based on goal
  let carbPercentage;
  switch(profile.goal) {
    case 'weight_loss':
      carbPercentage = 0.40; // Lower carbs for weight loss
      break;
    case 'weight_gain':
      carbPercentage = 0.50; // Higher carbs for weight gain
      break;
    default:
      carbPercentage = 0.45; // Balanced for maintenance
  }
  return Math.round((dailyCalories * carbPercentage) / 4); // 4 calories per gram of carbs
};

const calculateFatTarget = (profile, dailyCalories) => {
  // Calculate fats as remaining calories after protein and carbs
  const proteinCalories = calculateProteinTarget(profile, dailyCalories) * 4;
  const carbCalories = calculateCarbTarget(profile, dailyCalories) * 4;
  const remainingCalories = dailyCalories - proteinCalories - carbCalories;
  return Math.round(remainingCalories / 9); // 9 calories per gram of fat
};

const MEAL_ORDER = ['breakfast', 'lunch', 'snacks', 'dinner'];

// Helper functions for generating diet plan content
const generateSuggestionsBasedOnProfile = (profile) => {
  const suggestions = [];
  
  // Goal-based suggestions
  if (profile.goal === 'weight_loss') {
    suggestions.push(
      "Create a caloric deficit through portion control",
      "Eat protein-rich foods to preserve muscle mass",
      "Include plenty of fiber-rich vegetables for satiety",
      "Choose complex carbs over simple sugars",
      "Stay hydrated with water throughout the day"
    );
  } else if (profile.goal === 'weight_gain') {
    suggestions.push(
      "Eat calorie-dense, nutritious foods",
      "Increase meal frequency",
      "Include protein with every meal",
      "Add healthy fats to increase caloric intake",
      "Consider protein shakes between meals"
    );
  } else {
    suggestions.push(
      "Maintain balanced portions",
      "Eat a variety of whole foods",
      "Include all food groups",
      "Stay consistent with meal timing",
      "Listen to your body's hunger cues"
    );
  }

  // Activity level suggestions
  if (profile.activityLevel === 'very_active' || profile.activityLevel === 'extra_active') {
    suggestions.push(
      "Time your meals around workouts",
      "Include post-workout protein and carbs",
      "Consider electrolyte replacement"
    );
  }

  return suggestions;
};

// Helper function to generate personalized recommended foods
const generateRecommendedFoods = (profile) => {
  let proteinSources = '';
  let carbSources = '';
  let fatSources = '';
  let timing = '';

  // Protein sources based on dietary preferences
  if (profile.dietaryPreferences?.includes('vegan')) {
    proteinSources = `- Tofu and tempeh
- Lentils and beans
- Quinoa
- Plant-based protein powder
- Seitan
- Chickpeas
- Edamame
- Nutritional yeast`;
  } else if (profile.dietaryPreferences?.includes('vegetarian')) {
    proteinSources = `- Eggs
- Greek yogurt
- Cottage cheese
- Lentils and beans
- Tofu
- Whey protein
- Quinoa
- Plant-based protein sources`;
  } else {
    proteinSources = `- Lean chicken breast
- Fish (salmon, tuna)
- Lean beef
- Turkey
- Eggs
- Greek yogurt
- Whey protein
- Lean pork`;
  }

  // Carb sources based on goal
  if (profile.goal === 'weight_loss') {
    carbSources = `- High-fiber vegetables
- Leafy greens
- Berries
- Quinoa
- Steel-cut oats
- Sweet potatoes
- Brown rice (in moderation)
- Legumes`;
  } else {
    carbSources = `- Brown rice
- Sweet potatoes
- Quinoa
- Oatmeal
- Whole grain bread
- Fruits
- Starchy vegetables
- Whole wheat pasta`;
  }

  // Fat sources based on preferences
  fatSources = `- Avocados
- Nuts (almonds, walnuts)
- Seeds (chia, flax)
- Olive oil${!profile.dietaryPreferences?.includes('vegan') ? '\n- Fatty fish (salmon)' : ''}
- Coconut oil
- Natural nut butters`;

  // Meal timing based on activity level
  if (profile.activityLevel === 'very_active' || profile.activityLevel === 'extra_active') {
    timing = `
## Meal Timing
- Eat breakfast within 1 hour of waking
- Have a pre-workout meal 2-3 hours before exercise
- Post-workout nutrition within 30 minutes
- Space other meals 3-4 hours apart`;
  } else {
    timing = `
## Meal Timing
- Eat breakfast within 1 hour of waking
- Space meals 3-4 hours apart
- Consider a light snack if hungry between meals`;
  }

  return `# Recommended Foods Based on Your Profile

## Protein Sources
${proteinSources}

## Carbohydrate Sources
${carbSources}

## Healthy Fats
${fatSources}
${timing}`;
};

// Helper function to generate personalized foods to avoid
const generateFoodsToAvoid = (profile) => {
  let goalBasedRestrictions = '';
  let healthConsiderations = '';
  let dietaryRestrictions = '';

  // Goal-based restrictions
  if (profile.goal === 'weight_loss') {
    goalBasedRestrictions = `- Sugary beverages and sodas
- Processed snacks and chips
- White bread and refined grains
- Fried foods
- High-fat dairy products
- Excessive alcohol
- Candy and sweets
- Large portion sizes`;
  } else if (profile.goal === 'weight_gain') {
    goalBasedRestrictions = `- Low-nutrient processed foods
- Empty calorie foods
- Excessive caffeine
- Foods that may reduce appetite
- Very low-calorie alternatives
- Diet sodas`;
  } else {
    goalBasedRestrictions = `- Highly processed foods
- Excessive sugar
- Trans fats
- Excessive sodium
- Artificial preservatives`;
  }

  // Health considerations
  healthConsiderations = `- Artificial sweeteners
- Deep fried foods
- Processed meats
- Foods with added sugars
- Excessive caffeine
- Foods with artificial colors/preservatives`;

  // Dietary restrictions based on preferences
  if (profile.dietaryPreferences?.length) {
    dietaryRestrictions = `
## Based on Your Dietary Preferences
${profile.dietaryPreferences.includes('vegan') ? 
'- All animal products\n- Foods with hidden animal ingredients (gelatin, whey, etc.)\n- Honey' :
profile.dietaryPreferences.includes('vegetarian') ?
'- Meat products\n- Fish and seafood\n- Foods with gelatin or animal-derived ingredients' : ''}`;
  }

  return `# Foods to Minimize or Avoid Based on Your Goals

## Based on Your Goals
${goalBasedRestrictions}

## General Health Considerations
${healthConsiderations}${dietaryRestrictions}`;
};

const QUOTA_DOC_PATH = 'quotaMonitoring/daily';
const MAX_DAILY_READS = 50000;
const MAX_DAILY_WRITES = 20000;
const STREAK_CACHE_KEY = 'streakCache';
const QUOTA_CACHE_KEY = 'quotaCache';
const STREAK_UPDATE_THRESHOLD = 5; // Update Firestore every 5 completed meals
const QUOTA_UPDATE_THRESHOLD = 100; // Update Firestore every 100 reads
const MEAL_STATUS_CACHE_KEY = 'mealStatusCache';
const PROFILE_CACHE_KEY = 'userProfileCache';
const WRITE_BATCH_DELAY = 60000;

const checkAndUpdateQuota = async () => {
  try {
    // Get cached quota data
    const cachedQuota = JSON.parse(localStorage.getItem(QUOTA_CACHE_KEY) || '{}');
    const today = new Date().toISOString().split('T')[0];
    
    // Initialize cache if needed
    if (!cachedQuota.date || cachedQuota.date !== today) {
      const newCache = {
        date: today,
        reads: 1,
        writes: 0,
        lastFirestoreUpdate: null
      };
      localStorage.setItem(QUOTA_CACHE_KEY, JSON.stringify(newCache));
      return { canProceed: true, quotaExceeded: false };
    }

    // Update local cache
    cachedQuota.reads = (cachedQuota.reads || 0) + 1;
    const quotaExceeded = cachedQuota.reads >= MAX_DAILY_READS;

    // Only update Firestore periodically
    if (cachedQuota.reads % QUOTA_UPDATE_THRESHOLD === 0) {
      const quotaRef = doc(db, QUOTA_DOC_PATH);
      try {
        await runTransaction(db, async (transaction) => {
          const quotaDoc = await transaction.get(quotaRef);
          
          if (!quotaDoc.exists() || quotaDoc.data().date !== today) {
            transaction.set(quotaRef, {
              date: today,
              reads: cachedQuota.reads,
              writes: cachedQuota.writes || 0,
              lastReset: serverTimestamp()
            });
          } else {
            transaction.update(quotaRef, {
              reads: cachedQuota.reads,
              lastUpdated: serverTimestamp()
            });
          }
        });
        cachedQuota.lastFirestoreUpdate = new Date().toISOString();
      } catch (error) {
        console.error('Error updating quota in Firestore:', error);
        // Continue with local cache even if Firestore update fails
      }
    }

    // Update local cache
    localStorage.setItem(QUOTA_CACHE_KEY, JSON.stringify(cachedQuota));

    return { 
      canProceed: true, 
      quotaExceeded,
      currentReads: cachedQuota.reads,
      currentWrites: cachedQuota.writes || 0
    };
  } catch (error) {
    console.error('Error checking quota:', error);
    return { canProceed: true, quotaExceeded: false }; // Fail open
  }
};

const updateWriteQuota = async () => {
  try {
    // Get cached quota data
    const cachedQuota = JSON.parse(localStorage.getItem(QUOTA_CACHE_KEY) || '{}');
    const today = new Date().toISOString().split('T')[0];
    
    // Initialize cache if needed
    if (!cachedQuota.date || cachedQuota.date !== today) {
      cachedQuota.date = today;
      cachedQuota.reads = 0;
      cachedQuota.writes = 0;
    }

    // Update local cache
    cachedQuota.writes = (cachedQuota.writes || 0) + 1;
    localStorage.setItem(QUOTA_CACHE_KEY, JSON.stringify(cachedQuota));

    // Only update Firestore periodically
    if (cachedQuota.writes % QUOTA_UPDATE_THRESHOLD === 0) {
      const quotaRef = doc(db, QUOTA_DOC_PATH);
      try {
        await runTransaction(db, async (transaction) => {
          const quotaDoc = await transaction.get(quotaRef);
          
          if (!quotaDoc.exists() || quotaDoc.data().date !== today) {
            transaction.set(quotaRef, {
              date: today,
              reads: cachedQuota.reads || 0,
              writes: cachedQuota.writes,
              lastReset: serverTimestamp()
            });
          } else {
            transaction.update(quotaRef, {
              writes: cachedQuota.writes,
              lastUpdated: serverTimestamp()
            });
          }
        });
        cachedQuota.lastFirestoreUpdate = new Date().toISOString();
        localStorage.setItem(QUOTA_CACHE_KEY, JSON.stringify(cachedQuota));
      } catch (error) {
        console.error('Error updating write quota in Firestore:', error);
        // Continue with local cache even if Firestore update fails
      }
    }
  } catch (error) {
    console.error('Error updating write quota:', error);
  }
};

const updateStreak = async (date, completedMeals, totalMeals) => {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  // Get cached streak data
  const cachedStreak = JSON.parse(localStorage.getItem(STREAK_CACHE_KEY) || '{}');
  const { lastUpdate = null, streak = 0, pendingUpdates = 0 } = cachedStreak;

  // Check if all meals for the day are completed
  const isFullyCompleted = completedMeals === totalMeals;
  
  // Update streak history in Firestore
  const streakRef = doc(db, `users/${userId}/stats/streak`);
  
  try {
    await setDoc(streakRef, {
      [`history.${date}`]: isFullyCompleted
    }, { merge: true });
    
    // Update local state
    if (isFullyCompleted) {
      setStreakDays(prev => [...new Set([...prev, date])]);
      setMissedDays(prev => prev.filter(d => d !== date));
    } else {
      setMissedDays(prev => [...new Set([...prev, date])]);
      setStreakDays(prev => prev.filter(d => d !== date));
    }
  } catch (error) {
    console.error('Error updating streak history:', error);
  }
  
  // If not fully completed, reset streak
  if (!isFullyCompleted) {
    const newStreakData = { 
      lastUpdate: date,
      streak: 0,
      pendingUpdates: 0
    };
    localStorage.setItem(STREAK_CACHE_KEY, JSON.stringify(newStreakData));
    
    // Only update Firestore if we had a streak going
    if (streak > 0) {
      await setDoc(streakRef, {
        current: 0,
        lastUpdate: date
      }, { merge: true });
    }
    return;
  }

  // Calculate new streak
  let newStreak = streak;
  if (!lastUpdate || isNextDay(lastUpdate, date)) {
    newStreak++;
  }

  // Update local cache
  const newPendingUpdates = pendingUpdates + 1;
  const newStreakData = {
    lastUpdate: date,
    streak: newStreak,
    pendingUpdates: newPendingUpdates
  };
  localStorage.setItem(STREAK_CACHE_KEY, JSON.stringify(newStreakData));

  // Only update Firestore when we hit the threshold or it's a significant streak milestone
  if (newPendingUpdates >= STREAK_UPDATE_THRESHOLD || newStreak % 10 === 0) {
    try {
      await setDoc(streakRef, {
        current: newStreak,
        lastUpdate: date
      }, { merge: true });

      // Reset pending updates counter after successful Firestore update
      newStreakData.pendingUpdates = 0;
      localStorage.setItem(STREAK_CACHE_KEY, JSON.stringify(newStreakData));
    } catch (error) {
      console.error('Error updating streak:', error);
    }
  }
};

const isNextDay = (lastDate, currentDate) => {
  const last = new Date(lastDate);
  const current = new Date(currentDate);
  const diffTime = Math.abs(current - last);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1;
};

const getStreak = async () => {
  const userId = auth.currentUser?.uid;
  if (!userId) return 0;

  // Check cache first
  const cachedStreak = localStorage.getItem(STREAK_CACHE_KEY);
  if (cachedStreak) {
    const { streak } = JSON.parse(cachedStreak);
    return streak;
  }

  try {
    const streakRef = doc(db, `users/${userId}/stats/streak`);
    const streakDoc = await getDoc(streakRef);
    const streak = streakDoc.exists() ? streakDoc.data().current || 0 : 0;
    
    // Cache the result
    localStorage.setItem(STREAK_CACHE_KEY, JSON.stringify({
      streak,
      lastUpdate: new Date().toISOString().split('T')[0],
      pendingUpdates: 0
    }));
    
    return streak;
  } catch (error) {
    console.error('Error fetching streak:', error);
    return 0;
  }
};

const fetchUserProfile = async () => {
  try {
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }

    // Try to get from cache first
    const cachedProfile = localStorage.getItem(PROFILE_CACHE_KEY);
    if (cachedProfile) {
      const { data, timestamp } = JSON.parse(cachedProfile);
      const cacheAge = Date.now() - timestamp;
      if (cacheAge < CACHE_DURATION) {
        return data;
      }
    }

    const profileRef = doc(db, 'userProfiles', auth.currentUser.uid);
    const profileDoc = await getDoc(profileRef);

    if (!profileDoc.exists()) {
      throw new Error('User profile not found');
    }

    const profileData = profileDoc.data();
    
    // Cache the result
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
      data: profileData,
      timestamp: Date.now()
    }));

    return profileData;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};

const generateDietPlan = async (userProfile) => {
  try {
    // Calculate BMR using Harris-Benedict equation
    const weight = parseFloat(userProfile.weight);
    const height = parseFloat(userProfile.height);
    const age = parseFloat(userProfile.age);
    const isMale = userProfile.gender.toLowerCase() === 'male';
    
    let bmr;
    if (isMale) {
      bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
    } else {
      bmr = 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
    }

    // Activity level multiplier
    const activityMultipliers = {
      'sedentary': 1.2,
      'lightly_active': 1.375,
      'moderately_active': 1.55,
      'very_active': 1.725,
      'extra_active': 1.9
    };
    
    const activityMultiplier = activityMultipliers[userProfile.activityLevel] || 1.2;
    let tdee = bmr * activityMultiplier;

    // Adjust calories based on goal
    let calorieTarget;
    switch(userProfile.goal) {
      case 'weight_loss':
        calorieTarget = tdee - 500; // 500 calorie deficit
        break;
      case 'weight_gain':
        calorieTarget = tdee + 500; // 500 calorie surplus
        break;
      default:
        calorieTarget = tdee; // maintenance
    }

    // Calculate macros
    const protein = weight * 2; // 2g per kg of body weight
    const fat = (calorieTarget * 0.25) / 9; // 25% of calories from fat
    const carbs = (calorieTarget - (protein * 4) - (fat * 9)) / 4; // Remaining calories from carbs

    // Create meal distribution
    const mealDistribution = {
      breakfast: {
        calories: Math.round(calorieTarget * 0.3),
        protein: Math.round(protein * 0.3),
        carbs: Math.round(carbs * 0.3),
        fats: Math.round(fat * 0.3)
      },
      lunch: {
        calories: Math.round(calorieTarget * 0.35),
        protein: Math.round(protein * 0.35),
        carbs: Math.round(carbs * 0.35),
        fats: Math.round(fat * 0.35)
      },
      dinner: {
        calories: Math.round(calorieTarget * 0.25),
        protein: Math.round(protein * 0.25),
        carbs: Math.round(carbs * 0.25),
        fats: Math.round(fat * 0.25)
      },
      snacks: {
        calories: Math.round(calorieTarget * 0.1),
        protein: Math.round(protein * 0.1),
        carbs: Math.round(carbs * 0.1),
        fats: Math.round(fat * 0.1)
      }
    };

    // Generate diet plan based on dietary type
    let recommendedFoods = '';
    let foodsToAvoid = '';
    
    if (userProfile.dietaryType === 'vegetarian') {
      recommendedFoods = `
## Recommended Foods
- Protein Sources: Lentils, chickpeas, tofu, tempeh, seitan, Greek yogurt, cottage cheese, eggs
- Grains: Quinoa, brown rice, oats, whole wheat bread
- Vegetables: All leafy greens, broccoli, cauliflower, carrots, bell peppers
- Fruits: Apples, bananas, oranges, berries
- Healthy Fats: Avocados, nuts, seeds, olive oil`;
      
      foodsToAvoid = `
## Foods to Avoid
- All meat products
- Fish and seafood
- Animal-based gelatin
- Stock or fats made from meat`;
    } else {
      recommendedFoods = `
## Recommended Foods
- Lean Proteins: Chicken breast, turkey, fish, lean beef
- Complex Carbs: Brown rice, quinoa, sweet potatoes, oats
- Vegetables: Broccoli, spinach, kale, bell peppers
- Fruits: Apples, berries, oranges, bananas
- Healthy Fats: Avocados, nuts, olive oil, seeds`;
      
      foodsToAvoid = `
## Foods to Avoid
- Processed foods
- Sugary drinks
- Excessive alcohol
- Trans fats
- High-sodium foods`;
    }

    const dietPlan = `
# Your Personalized Diet Plan

## Daily Targets
- Total Calories: ${Math.round(calorieTarget)} kcal
- Protein: ${Math.round(protein)}g
- Carbs: ${Math.round(carbs)}g
- Fats: ${Math.round(fat)}g

## Meal Distribution
### Breakfast (30%)
- Calories: ${mealDistribution.breakfast.calories} kcal
- Protein: ${mealDistribution.breakfast.protein}g
- Carbs: ${mealDistribution.breakfast.carbs}g
- Fats: ${mealDistribution.breakfast.fats}g

### Lunch (35%)
- Calories: ${mealDistribution.lunch.calories} kcal
- Protein: ${mealDistribution.lunch.protein}g
- Carbs: ${mealDistribution.lunch.carbs}g
- Fats: ${mealDistribution.lunch.fats}g

### Dinner (25%)
- Calories: ${mealDistribution.dinner.calories} kcal
- Protein: ${mealDistribution.dinner.protein}g
- Carbs: ${mealDistribution.dinner.carbs}g
- Fats: ${mealDistribution.dinner.fats}g

### Snacks (10%)
- Calories: ${mealDistribution.snacks.calories} kcal
- Protein: ${mealDistribution.snacks.protein}g
- Carbs: ${mealDistribution.snacks.carbs}g
- Fats: ${mealDistribution.snacks.fats}g`;

    const generatedPlan = {
      dailyTargets: {
        total: {
          calories: Math.round(calorieTarget),
          protein: Math.round(protein),
          carbs: Math.round(carbs),
          fats: Math.round(fat)
        },
        breakfast: {
          calories: Math.round(calorieTarget * 0.3),
          protein: Math.round(protein * 0.3),
          carbs: Math.round(carbs * 0.3),
          fats: Math.round(fat * 0.3)
        },
        lunch: {
          calories: Math.round(calorieTarget * 0.35),
          protein: Math.round(protein * 0.35),
          carbs: Math.round(carbs * 0.35),
          fats: Math.round(fat * 0.35)
        },
        dinner: {
          calories: Math.round(calorieTarget * 0.25),
          protein: Math.round(protein * 0.25),
          carbs: Math.round(carbs * 0.25),
          fats: Math.round(fat * 0.25)
        },
        snacks: {
          calories: Math.round(calorieTarget * 0.1),
          protein: Math.round(protein * 0.1),
          carbs: Math.round(carbs * 0.1),
          fats: Math.round(fat * 0.1)
        }
      },
      dietPlan,
      recommendedFoods,
      foodsToAvoid
    };

    // Save the generated plan to Firestore
    const dietPlanRef = doc(db, 'dietPlans', userProfile.uid);
    await setDoc(dietPlanRef, {
      ...generatedPlan,
      generatedForProfile: userProfile,
      createdAt: serverTimestamp(),
      lastGenerated: serverTimestamp()
    });

    return generatedPlan;
  } catch (error) {
    console.error('Error generating diet plan:', error);
    throw error;
  }
};

const DietPlan = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dietPlanData, setDietPlanData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!currentUser) {
          setError('Please sign in to view your diet plan');
          setLoading(false);
          return;
        }

        // Check if user profile exists
        const userProfileRef = doc(db, 'userProfiles', currentUser.uid);
        const userProfileDoc = await getDoc(userProfileRef);

        if (!userProfileDoc.exists()) {
          setError('Please complete your profile to generate a diet plan');
          setLoading(false);
          return;
        }

        // Get user profile and generate plan
        const userProfile = {
          ...userProfileDoc.data(),
          uid: currentUser.uid
        };

        console.log('Generating diet plan for user profile:', userProfile);
        const generatedPlan = await generateDietPlan(userProfile);
        setDietPlanData(generatedPlan);

      } catch (error) {
        console.error('Error:', error);
        setError('Failed to generate diet plan. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser]);

  if (!currentUser) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          Please <Button onClick={() => navigate('/login')}>sign in</Button> to view your diet plan.
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        gap: 2
      }}>
        <CircularProgress />
        <Typography variant="h6" color="text.secondary">
          Loading your diet plan...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!dietPlanData?.dailyTargets) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">No diet plan found. Please complete your profile to generate a diet plan.</Alert>
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Grid container spacing={3}>
        {/* Total Daily Targets */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Total Daily Targets
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, bgcolor: 'success.light', color: 'white', textAlign: 'center' }}>
                    <Typography variant="subtitle1">Total Calories</Typography>
                    <Typography variant="h4">{dietPlanData.dailyTargets.total.calories} kcal</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, bgcolor: 'success.main', color: 'white', textAlign: 'center' }}>
                    <Typography variant="subtitle1">Total Protein</Typography>
                    <Typography variant="h4">{dietPlanData.dailyTargets.total.protein}g</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, bgcolor: 'warning.main', color: 'white', textAlign: 'center' }}>
                    <Typography variant="subtitle1">Total Carbs</Typography>
                    <Typography variant="h4">{dietPlanData.dailyTargets.total.carbs}g</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, bgcolor: 'error.light', color: 'white', textAlign: 'center' }}>
                    <Typography variant="subtitle1">Total Fats</Typography>
                    <Typography variant="h4">{dietPlanData.dailyTargets.total.fats}g</Typography>
                  </Paper>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Meal-Specific Targets */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Meal-Specific Targets
              </Typography>
              <Grid container spacing={3}>
                {Object.entries(dietPlanData.dailyTargets)
                  .filter(([mealType]) => mealType !== 'total')
                  .map(([mealType, targets]) => (
                    <Grid item xs={12} sm={6} key={mealType}>
                      <Paper sx={{ p: 2, height: '100%' }}>
                        <Typography variant="h6" gutterBottom>
                          {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                        </Typography>
                        <Grid container spacing={1}>
                          <Grid item xs={6}>
                            <Box sx={{ p: 1, bgcolor: 'primary.light', color: 'white', borderRadius: 1, mb: 1 }}>
                              <Typography variant="caption">Calories</Typography>
                              <Typography variant="body1" fontWeight="bold">{targets.calories} kcal</Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={6}>
                            <Box sx={{ p: 1, bgcolor: 'success.light', color: 'white', borderRadius: 1, mb: 1 }}>
                              <Typography variant="caption">Protein</Typography>
                              <Typography variant="body1" fontWeight="bold">{targets.protein}g</Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={6}>
                            <Box sx={{ p: 1, bgcolor: 'warning.light', color: 'white', borderRadius: 1 }}>
                              <Typography variant="caption">Carbs</Typography>
                              <Typography variant="body1" fontWeight="bold">{targets.carbs}g</Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={6}>
                            <Box sx={{ p: 1, bgcolor: 'error.light', color: 'white', borderRadius: 1 }}>
                              <Typography variant="caption">Fats</Typography>
                              <Typography variant="body1" fontWeight="bold">{targets.fats}g</Typography>
                            </Box>
                          </Grid>
                        </Grid>
                      </Paper>
                    </Grid>
                  ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Recommended Foods */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Recommended Foods
              </Typography>
              <Box sx={{ 
                maxHeight: '400px',
                overflowY: 'auto',
                pr: 1,
                '& h1, & h2': {
                  fontFamily: 'inherit',
                  fontWeight: 'bold',
                  mb: 2
                }
              }}>
                <ReactMarkdown>{dietPlanData.recommendedFoods || ''}</ReactMarkdown>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Foods to Avoid */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Foods to Avoid
              </Typography>
              <Box sx={{ 
                maxHeight: '400px',
                overflowY: 'auto',
                pr: 1,
                '& h1, & h2': {
                  fontFamily: 'inherit',
                  fontWeight: 'bold',
                  mb: 2
                }
              }}>
                <ReactMarkdown>{dietPlanData.foodsToAvoid || ''}</ReactMarkdown>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};

export default DietPlan; 