import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  IconButton,
  Stack,
  Chip,
  Avatar,
  CircularProgress,
  Alert,
  Divider,
  Badge,
  AlertTitle
} from '@mui/material';
import {
  Camera as CameraIcon,
  Upload as UploadIcon,
  CheckCircle as CheckCircleIcon,
  LocalFireDepartment as FireIcon,
  EmojiEvents as TrophyIcon,
  Restaurant as RestaurantIcon,
  Schedule as ScheduleIcon,
  Add as AddIcon,
  PendingActions as PendingIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import Webcam from 'react-webcam';
import { db, auth } from '../firebase/config';
import { doc, setDoc, getDoc, collection, query, where, getDocs, orderBy, serverTimestamp, updateDoc, addDoc, arrayUnion, increment, onSnapshot, writeBatch, limit } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { API_ENDPOINTS, API_CONFIG } from '../config/api';
import { useAuth } from '../contexts/AuthContext';
import * as firebase from 'firebase/app';
import Calendar from 'react-calendar';
import { debounce } from 'lodash';

const MEAL_ORDER = ['breakfast', 'lunch', 'snacks', 'dinner'];
const MEAL_TIMES = [
  { name: 'Breakfast', time: '6:00 AM - 11:00 AM' },
  { name: 'Lunch', time: '11:30 AM - 3:00 PM' },
  { name: 'Snacks', time: '3:30 PM - 7:00 PM' },
  { name: 'Dinner', time: '7:30 PM - 12:00 AM' }
];

// Add these constants at the top of the file, after the imports
const MAX_DAILY_WRITES = 50;
const MAX_TOTAL_WRITES = 1000;

// Add these constants at the top level
const MEAL_STATUS_CACHE_KEY = 'mealStatusCache';
const STREAK_CACHE_KEY = 'streakCache';
const WRITE_BATCH_DELAY = 60000; // 1 minute
const BATCH_UPDATE_DELAY = 60000; // 1 minute
const MAX_CACHED_UPDATES = 20;
const pendingUpdates = new Map();
let lastWriteTime = 0;
let lastWriteStatus = null;
let lastMealStatus = null;
let lastFirestoreWrite = 0;

// Utility function to format date as YYYY-MM-DD
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Add this function near the top of the file, after the imports
const calculateNutrientsReached90Percent = (progress, mealType, dietPlan) => {
  const nutrients = ['protein', 'carbs', 'fats'];
  return nutrients.filter(nutrient => {
    const target = dietPlan?.recommendations?.dailyTargets?.[mealType]?.[nutrient] || 0;
    return target > 0 && (progress[nutrient] / target) >= 0.9;
  }).length;
};

const calculateNutrientsReached85Percent = (progress, mealType, dietPlan) => {
  const nutrients = ['protein', 'carbs', 'fats'];
  return nutrients.filter(nutrient => {
    const target = dietPlan?.recommendations?.dailyTargets?.[mealType]?.[nutrient] || 0;
    return target > 0 && (progress[nutrient] / target) >= 0.85;
  }).length;
};

// Add this function near the top of the file
const cleanupOldData = () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

    // Clean up old meal status data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('mealStatus_')) {
        const date = key.split('_')[1];
        if (date < cutoffDate) {
          localStorage.removeItem(key);
        }
      }
    }

    // Clean up old migration flags
    const migrationDate = localStorage.getItem('migrationDate');
    if (migrationDate && migrationDate < cutoffDate) {
      localStorage.removeItem('migrationCompleted');
      localStorage.removeItem('migrationDate');
    }
  } catch (error) {
    console.error('Error cleaning up old data:', error);
  }
};

// Add this function at the top level
const updateStreakHistory = async (userId) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const streakRef = doc(db, 'userStreaks', userId);
    const streakDoc = await getDoc(streakRef);
    
    // Get existing history or create new
    let history = {};
    if (streakDoc.exists()) {
      history = streakDoc.data().history || {};
    }
    
    // Fill in missing dates up to today
    const lastDate = Object.keys(history).sort().pop() || today;
    let currentDate = new Date(lastDate);
    const todayDate = new Date(today);
    
    while (currentDate <= todayDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (!history.hasOwnProperty(dateStr)) {
        history[dateStr] = false;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Update Firestore with a batch write to ensure atomicity
    const batch = writeBatch(db);
    batch.set(streakRef, {
      history,
      lastUpdated: serverTimestamp(),
      userId
    }, { merge: true });
    
    await batch.commit();
    return history;
  } catch (error) {
    console.error('Error updating streak history:', error);
    throw error;
  }
};

// Add these utility functions at the top level
const DEBOUNCE_DELAY = 2000; // 2 seconds delay

const debouncedFirestoreUpdate = debounce(async (userId, today, newMealStatus) => {
  try {
    const mealStatusRef = doc(db, 'userMealStatus', userId);
    await setDoc(mealStatusRef, {
      [today]: newMealStatus,
      lastUpdated: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error in debouncedFirestoreUpdate:', error);
  }
}, DEBOUNCE_DELAY);

// Add this function to handle batched writes
const batchedFirestoreWrite = debounce(async (userId, updates) => {
  try {
    const mealStatusRef = doc(db, 'userMealStatus', userId);
    await setDoc(mealStatusRef, updates, { merge: true });
  } catch (error) {
    console.error('Error in batched write:', error);
  }
}, WRITE_BATCH_DELAY);

// Add this near the top of the file, after the imports
const getApiBaseUrl = () => {
  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const port = isLocalhost ? '5000' : '443';
  const protocol = isLocalhost ? 'http' : 'https';
  return `${protocol}://${host}:${port}`;
};

// Update the API_BASE_URL constant
const API_BASE_URL = getApiBaseUrl();

// Add this function near the top of the file, after the imports
const getServerUrl = () => {
  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const port = isLocalhost ? '5000' : '443';
  const protocol = isLocalhost ? 'http' : 'https';
  return `${protocol}://${host}:${port}`;
};

const Dashboard = () => {
  // State declarations
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [detectedFood, setDetectedFood] = useState(null);
  const [dailyProgress, setDailyProgress] = useState({
    calories: { current: 0, target: 2000 },
    protein: { current: 0, target: 150 },
    carbs: { current: 0, target: 250 },
    fats: { current: 0, target: 65 },
  });
  const [streak, setStreak] = useState(0);
  const [mealStatus, setMealStatus] = useState({
    breakfast: false,
    lunch: false,
    dinner: false,
    snacks: false,
  });
  const [loading, setLoading] = useState(true);
  const [dietPlan, setDietPlan] = useState(null);
  const [todaysMeals, setTodaysMeals] = useState({
    breakfast: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    lunch: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    dinner: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    snacks: { calories: 0, protein: 0, carbs: 0, fats: 0 }
  });
  const [isUploading, setIsUploading] = useState(false);
  const lastUploadedMeal = useRef(null);
  const [userProfile, setUserProfile] = useState(null);
  const [activeTargetIndex, setActiveTargetIndex] = useState(() => {
    const now = new Date();
    const hour = now.getHours();
    
    // Breakfast: 6 AM - 11 AM
    if (hour >= 6 && hour < 11) return 0;
    // Lunch: 12 PM - 3 PM
    if (hour >= 12 && hour < 15) return 1;
    // Snacks: 3 PM - 7 PM
    if (hour >= 15 && hour < 19) return 2;
    // Dinner: 7 PM - 12 AM
    if (hour >= 19 || hour < 0) return 3;
    
    // Default to the next upcoming meal
    if (hour < 6) return 0; // Before breakfast
    if (hour < 12) return 1; // Before lunch
    if (hour < 15) return 2; // Before snacks
    return 3; // Before dinner
  });
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [predictionResult, setPredictionResult] = useState(null);
  const [dietHistory, setDietHistory] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [cameraError, setCameraError] = useState(null);
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraPermission, setCameraPermission] = useState('prompt');
  const { currentUser } = useAuth();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [completedDates, setCompletedDates] = useState([]);
  const [missedDates, setMissedDates] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const migrationCompletedRef = useRef(false);
  const [firestoreError, setFirestoreError] = useState(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [writeCount, setWriteCount] = useState(0);
  const [dailyWriteCount, setDailyWriteCount] = useState(0);
  const [lastWriteDate, setLastWriteDate] = useState(null);
  const [processingStatus, setProcessingStatus] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [detectedItems, setDetectedItems] = useState([]);
  const [nutritionData, setNutritionData] = useState(null);
  const [currentMealData, setCurrentMealData] = useState({ items: [], nutrition: {} });
  const [hasUploaded, setHasUploaded] = useState(false);
  const [dailyTargets, setDailyTargets] = useState({
    breakfast: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    lunch: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    dinner: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    snacks: { calories: 0, protein: 0, carbs: 0, fats: 0 }
  });
  const [progress, setProgress] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0
  });
  const [todayMeals, setTodayMeals] = useState([]);

  // Fetch diet plan and meals data
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!auth.currentUser) {
          setError('Please sign in to view your dashboard');
          setLoading(false);
          return;
        }

        // Fetch diet plan from dietPlans collection
        let planData = null;
        const dietPlansRef = doc(db, 'dietPlans', auth.currentUser.uid);
        const dietPlanDoc = await getDoc(dietPlansRef);

        if (dietPlanDoc.exists()) {
          planData = dietPlanDoc.data();
        } else {
          // If no direct document exists, try querying the collection
          const q = query(
            collection(db, 'dietPlans'),
            where('userId', '==', auth.currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            planData = querySnapshot.docs[0].data();
          }
        }

        if (planData) {
          console.log('Fetched diet plan:', planData); // Debug log
          setDietPlan(planData);
          
          if (planData.dailyTargets) {
            setDailyTargets(planData.dailyTargets);
            
            // Update dailyProgress with the total targets
            const totalTargets = {
              calories: Object.values(planData.dailyTargets).reduce((sum, meal) => sum + meal.calories, 0),
              protein: Object.values(planData.dailyTargets).reduce((sum, meal) => sum + meal.protein, 0),
              carbs: Object.values(planData.dailyTargets).reduce((sum, meal) => sum + meal.carbs, 0),
              fats: Object.values(planData.dailyTargets).reduce((sum, meal) => sum + meal.fats, 0)
            };

            setDailyProgress({
              calories: { current: 0, target: totalTargets.calories },
              protein: { current: 0, target: totalTargets.protein },
              carbs: { current: 0, target: totalTargets.carbs },
              fats: { current: 0, target: totalTargets.fats }
            });
          }
        }

        // Fetch today's meals
        const today = new Date().toISOString().split('T')[0];
        const mealsRef = doc(db, 'userMeals', auth.currentUser.uid);
        const mealsDoc = await getDoc(mealsRef);
        
        if (mealsDoc.exists()) {
          const mealsData = mealsDoc.data();
          const todaysMealData = mealsData[today] || [];
          
          const meals = {
            breakfast: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            lunch: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            dinner: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            snacks: { calories: 0, protein: 0, carbs: 0, fats: 0 }
          };

          todaysMealData.forEach(meal => {
            const mealType = meal.mealType;
            if (!mealType) return;

            const nutrition = meal.nutrition || {};
            meals[mealType].calories += Number(nutrition.calories) || 0;
            meals[mealType].protein += Number(nutrition.protein) || 0;
            meals[mealType].carbs += Number(nutrition.carbs) || 0;
            meals[mealType].fats += Number(nutrition.fats) || 0;
          });

          setTodaysMeals(meals);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser]);

  // Handle meal addition
  const handleAddMeal = useCallback(async (mealData) => {
    try {
      if (!auth.currentUser) return;

      const userId = auth.currentUser.uid;
      const today = new Date().toISOString().split('T')[0];
      const currentHour = new Date().getHours() + new Date().getMinutes() / 60;
      const mealType = determineMealTypeByHour(currentHour);

      // Ensure mealData has the required structure
      if (!mealData || !mealData.nutrition) {
        throw new Error('Invalid meal data structure');
      }

      // 1. Update userMeals collection
      const mealsRef = doc(db, 'userMeals', userId);
      const mealsDoc = await getDoc(mealsRef);
      
      // Initialize the data structure if it doesn't exist
      let currentMeals = {};
      if (mealsDoc.exists()) {
        currentMeals = mealsDoc.data();
      }
      
      // Initialize today's meals array if it doesn't exist
      if (!currentMeals[today]) {
        currentMeals[today] = [];
      }

      // Create the new meal object with proper structure
      const newMeal = {
        foodName: mealData.foodName || 'Unknown Food',
        name: mealData.name || mealData.foodName || 'Unknown Food',
        nutrition: {
          calories: Number(mealData.nutrition.calories) || 0,
          protein: Number(mealData.nutrition.protein) || 0,
          carbs: Number(mealData.nutrition.carbs) || 0,
          fats: Number(mealData.nutrition.fats) || 0
        },
        mealType,
        timestamp: new Date().toISOString()
      };

      // Add the new meal to today's meals
      currentMeals[today].push(newMeal);
      await setDoc(mealsRef, currentMeals, { merge: true });

      // Update local state
      setTodaysMeals(prev => {
        const updatedMeals = { ...prev };
        const currentMeal = updatedMeals[mealType] || { calories: 0, protein: 0, carbs: 0, fats: 0 };
        
        updatedMeals[mealType] = {
          calories: currentMeal.calories + newMeal.nutrition.calories,
          protein: currentMeal.protein + newMeal.nutrition.protein,
          carbs: currentMeal.carbs + newMeal.nutrition.carbs,
          fats: currentMeal.fats + newMeal.nutrition.fats
        };
        
        return updatedMeals;
      });

      // Update meal status
      const newMealStatus = { ...mealStatus };
      newMealStatus[mealType] = true;
      setMealStatus(newMealStatus);

      // Show success message
      setSnackbar({
        open: true,
        message: `Added ${newMeal.foodName} to ${mealType}`,
        severity: 'success'
      });

    } catch (error) {
      console.error('Error adding meal:', error);
      setError('Failed to add meal. Please try again.');
    }
  }, [auth.currentUser, mealStatus]);

  // Calculate progress percentages and update meal status
  useEffect(() => {
    if (todayMeals && todayMeals.length > 0 && dailyTargets.calories > 0) {
      const totalConsumed = todayMeals.reduce((acc, meal) => ({
        calories: acc.calories + (meal.nutrition?.calories || 0),
        protein: acc.protein + (meal.nutrition?.protein || 0),
        carbs: acc.carbs + (meal.nutrition?.carbs || 0),
        fats: acc.fats + (meal.nutrition?.fats || 0)
      }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

      // Calculate percentages
      const percentages = {
        calories: (totalConsumed.calories / dailyTargets.calories) * 100,
        protein: (totalConsumed.protein / dailyTargets.protein) * 100,
        carbs: (totalConsumed.carbs / dailyTargets.carbs) * 100,
        fats: (totalConsumed.fats / dailyTargets.fats) * 100
      };

      setProgress({
        calories: Math.min(percentages.calories, 100),
        protein: Math.min(percentages.protein, 100),
        carbs: Math.min(percentages.carbs, 100),
        fats: Math.min(percentages.fats, 100)
      });

      // Update meal status if all nutrients are at least 85% of target
      const allTargetsMet = Object.values(percentages).every(percent => percent >= 85);
      
      if (allTargetsMet && !mealStatus) {
        const today = new Date().toISOString().split('T')[0];
        updateDoc(doc(db, 'users', currentUser.uid), {
          [`mealStatus.${today}`]: true
        });
        setMealStatus(true);
      }
    }
  }, [todayMeals, dailyTargets, currentUser, mealStatus]);

  useEffect(() => {
    // Check if user is logged in
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/login');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const updateActiveTarget = () => {
      const now = new Date();
      const currentHour = now.getHours() + now.getMinutes() / 60;
      
      // Determine active meal based on time
      let newActiveIndex;
      if (currentHour >= 6 && currentHour < 11) {
        newActiveIndex = 0; // Breakfast
      } else if (currentHour >= 11.5 && currentHour < 15) {
        newActiveIndex = 1; // Lunch
      } else if (currentHour >= 15.5 && currentHour < 19) {
        newActiveIndex = 2; // Snacks
      } else if (currentHour >= 19.5 || currentHour < 0) {
        newActiveIndex = 3; // Dinner
      } else {
        newActiveIndex = 2; // Default to snacks for other times
      }

      setActiveTargetIndex(newActiveIndex);
    };

    // Update immediately and then every minute
    updateActiveTarget();
    const interval = setInterval(updateActiveTarget, 60000);
    return () => clearInterval(interval);
  }, []);

  // Add error handling wrapper for Firestore operations
  const safeFirestoreOperation = async (operation) => {
    try {
      return await operation();
    } catch (error) {
      if (error.code === 'resource-exhausted') {
        setIsQuotaExceeded(true);
        setFirestoreError('Firestore quota exceeded. Using cached data.');
        return null;
      }
      console.error('Firestore error:', error);
      return null;
    }
  };

  // Modify fetchUserData to handle quota exceeded
  useEffect(() => {
    let unsubscribeAuth = null;
    let unsubscribeMeals = null;

    const fetchUserData = async () => {
      try {
        if (!auth.currentUser) return;

        const userId = auth.currentUser.uid;
        const today = new Date().toISOString().split('T')[0];

        // Single fetch for initial data
        const mealsRef = doc(db, 'userMeals', userId);
        const mealsDoc = await getDoc(mealsRef);

        if (mealsDoc.exists()) {
          const data = mealsDoc.data();
          const todaysMealData = data[today] || [];
          
          const meals = {
            breakfast: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            lunch: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            dinner: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            snacks: { calories: 0, protein: 0, carbs: 0, fats: 0 }
          };

          if (Array.isArray(todaysMealData)) {
            todaysMealData.forEach(meal => {
              const mealType = meal.mealType;
              if (!mealType) return;

              const nutrition = meal.nutrition || {};
              meals[mealType].calories += Number(nutrition.calories) || 0;
              meals[mealType].protein += Number(nutrition.protein) || 0;
              meals[mealType].carbs += Number(nutrition.carbs) || 0;
              meals[mealType].fats += Number(nutrition.fats) || 0;
            });
          }

          setTodaysMeals(meals);

          // Update meal status only if needed
          const newMealStatus = {
            breakfast: meals.breakfast.calories > 0,
            lunch: meals.lunch.calories > 0,
            dinner: meals.dinner.calories > 0,
            snacks: meals.snacks.calories > 0
          };

          const statusChanged = Object.keys(newMealStatus).some(
            mealType => newMealStatus[mealType] !== mealStatus[mealType]
          );

          if (statusChanged && canWriteToFirestore()) {
            setMealStatus(newMealStatus);
            const mealStatusRef = doc(db, 'userMealStatus', userId);
            await setDoc(mealStatusRef, {
              [today]: newMealStatus,
              lastUpdated: serverTimestamp()
            }, { merge: true });
            setWriteCount(prev => prev + 1);
            setDailyWriteCount(prev => prev + 1);
          }
        }

        // Update streak history
        try {
          await updateStreakHistory(userId);
        } catch (error) {
          if (error.code === 'resource-exhausted') {
            setIsQuotaExceeded(true);
            console.log('Firestore quota exceeded during streak update');
          }
        }

      } catch (error) {
        console.error('Error fetching user data:', error);
        if (error.code === 'resource-exhausted') {
          setIsQuotaExceeded(true);
        }
        setError('Failed to load your data. Using cached data.');
      } finally {
        setLoading(false);
      }
    };

    unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchUserData();
      } else {
        navigate('/login');
      }
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeMeals) unsubscribeMeals();
    };
  }, [navigate]);

  // Add this function to check write limits
  const canWriteToFirestore = () => {
    const today = new Date().toISOString().split('T')[0];
    if (lastWriteDate !== today) {
      setDailyWriteCount(0);
      setLastWriteDate(today);
    }
    return writeCount < MAX_TOTAL_WRITES && dailyWriteCount < MAX_DAILY_WRITES;
  };

  const handlePrevTarget = () => {
    setActiveTargetIndex((prev) => (prev - 1 + MEAL_ORDER.length) % MEAL_ORDER.length);
  };

  const handleNextTarget = () => {
    setActiveTargetIndex((prev) => (prev + 1) % MEAL_ORDER.length);
  };

  const debouncedUpdateMealStatus = async (userId, date, status) => {
    // Store the update in the pending map
    const key = `${userId}_${date}`;
    pendingUpdates.set(key, status);

    // Clear any existing timeout
    if (pendingUpdates.timeout) {
      clearTimeout(pendingUpdates.timeout);
    }

    // Check if the status has actually changed
    const statusStr = JSON.stringify(status);
    if (lastWriteStatus === statusStr) {
      pendingUpdates.clear();
      return;
    }

    // Check if we've reached the maximum cached updates
    if (pendingUpdates.size >= MAX_CACHED_UPDATES) {
      // Force a write if we've cached too many updates
      await processPendingUpdates(userId);
      return;
    }

    // Check if enough time has passed since the last write
    const now = Date.now();
    if (now - lastWriteTime >= BATCH_UPDATE_DELAY) {
      await processPendingUpdates(userId);
      return;
    }

    // Set a new timeout to process the updates
    pendingUpdates.timeout = setTimeout(async () => {
      await processPendingUpdates(userId);
    }, BATCH_UPDATE_DELAY);
  };

  const processPendingUpdates = async (userId) => {
    try {
      if (pendingUpdates.size === 0) return;

      const mealStatusRef = doc(db, 'userMealStatus', userId);
      const updates = Array.from(pendingUpdates.entries()).reduce((acc, [key, status]) => {
        const [_, date] = key.split('_');
        acc[date] = status;
        return acc;
      }, {});

      // Only write if there are actual changes
      const currentStatus = localStorage.getItem(MEAL_STATUS_CACHE_KEY);
      const updatesStr = JSON.stringify(updates);
      
      if (currentStatus === updatesStr) {
        pendingUpdates.clear();
        delete pendingUpdates.timeout;
        return;
      }

      // Update last write status before writing
      lastWriteStatus = updatesStr;

      await setDoc(mealStatusRef, {
        userId,
        updatedAt: serverTimestamp(),
        mealStatus: updates
      }, { merge: true });

      // Update last write time
      lastWriteTime = Date.now();

      // Clear the pending updates
      pendingUpdates.clear();
      delete pendingUpdates.timeout;

      // Update local cache
      localStorage.setItem(MEAL_STATUS_CACHE_KEY, updatesStr);
    } catch (error) {
      console.error('Error processing pending updates:', error);
      // Keep the updates in the pending map if the write fails
    }
  };

  const renderCameraInterface = () => (
    <Card sx={{ 
      width: '100%',
      backgroundColor: 'white',
      borderRadius: '8px',
      overflow: 'hidden',
      mb: 4,
      boxShadow: 'none'
    }}>
      <Box sx={{ p: 3 }}>
        {isCameraActive ? (
          <Box sx={{ 
            width: '100%', 
            height: '400px', // Increased height
            position: 'relative',
            border: '2px dashed #4CAF50',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={{
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: "environment"
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain' // Changed to contain
              }}
            />
            <Box sx={{ 
              position: 'absolute', 
              top: 16,
              right: 16,
              zIndex: 2
            }}>
              <IconButton
                onClick={deactivateCamera}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.9)',
                  '&:hover': { bgcolor: 'white' }
                }}
              >
                <CloseIcon />
              </IconButton>
            </Box>
            <Box sx={{ 
              position: 'absolute', 
              bottom: 16, 
              left: '50%', 
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 2
            }}>
              <Button
                variant="contained"
                onClick={captureImage}
                disabled={isProcessing}
                sx={{
                  bgcolor: '#4CAF50',
                  color: 'white',
                  '&:hover': { bgcolor: '#43A047' }
                }}
              >
                Capture
              </Button>
            </Box>
          </Box>
        ) : capturedImage ? (
          <>
            <Box sx={{ 
              width: '100%', 
              height: '400px', // Increased height
              position: 'relative',
              border: '2px dashed #4CAF50',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <img
                src={capturedImage}
                alt="Captured food"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain' // Changed to contain
                }}
              />
              <Box sx={{ 
                position: 'absolute', 
                top: 16,
                right: 16,
                zIndex: 2
              }}>
                <IconButton
                  onClick={() => {
                    setCapturedImage(null);
                    setPredictionResult(null);
                    setDetectedFood(null);
                    setError(null);
                    deactivateCamera();
                  }}
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.9)',
                    '&:hover': { bgcolor: 'white' }
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>
            {renderPredictionResult()}
          </>
        ) : (
          <>
            <Box 
              onClick={activateCamera}
              sx={{
                width: '100%',
                height: '400px', // Increased height
                border: '2px dashed #4CAF50',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: 'rgba(76, 175, 80, 0.04)'
                }
              }}
            >
              <CameraIcon sx={{ fontSize: 40, color: '#4CAF50' }} />
              <Typography color="text.secondary" sx={{ mt: 2 }}>
                Click here to activate camera
              </Typography>
            </Box>
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                id="upload-button"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processImage(e.target.files[0]);
                  }
                }}
              />
              <label htmlFor="upload-button">
                <Button
                  component="span"
                  variant="text"
                  sx={{ 
                    color: '#4CAF50',
                    textTransform: 'none',
                    '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' }
                  }}
                >
                  Or upload a photo
                </Button>
              </label>
            </Box>
          </>
        )}

        {isProcessing && (
          <Box sx={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            bgcolor: 'rgba(255,255,255,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <CircularProgress size={40} sx={{ color: '#4CAF50' }} />
          </Box>
        )}
      </Box>
    </Card>
  );

  const renderDailyTargets = () => {
    const currentMealType = MEAL_ORDER[activeTargetIndex];
    const mealTargets = dailyTargets[currentMealType] || { calories: 0, protein: 0, carbs: 0, fats: 0 };
    const mealProgress = todaysMeals[currentMealType] || { calories: 0, protein: 0, carbs: 0, fats: 0 };

    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h6">
              {currentMealType.charAt(0).toUpperCase() + currentMealType.slice(1)} Targets
            </Typography>
            <Stack direction="row" spacing={1}>
              <IconButton onClick={handlePrevTarget} size="small">
                <ChevronLeftIcon />
              </IconButton>
              <IconButton onClick={handleNextTarget} size="small">
                <ChevronRightIcon />
              </IconButton>
            </Stack>
          </Stack>

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary">
                Calories
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ flexGrow: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min((mealProgress.calories / mealTargets.calories) * 100, 100)}
                    sx={{ height: 10, borderRadius: 5 }}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {mealProgress.calories}/{mealTargets.calories}
                </Typography>
              </Stack>
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary">
                Protein
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ flexGrow: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min((mealProgress.protein / mealTargets.protein) * 100, 100)}
                    sx={{ height: 10, borderRadius: 5 }}
                    color="success"
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {mealProgress.protein}/{mealTargets.protein}g
                </Typography>
              </Stack>
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary">
                Carbs
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ flexGrow: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min((mealProgress.carbs / mealTargets.carbs) * 100, 100)}
                    sx={{ height: 10, borderRadius: 5 }}
                    color="warning"
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {mealProgress.carbs}/{mealTargets.carbs}g
                </Typography>
              </Stack>
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary">
                Fats
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ flexGrow: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min((mealProgress.fats / mealTargets.fats) * 100, 100)}
                    sx={{ height: 10, borderRadius: 5 }}
                    color="error"
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {mealProgress.fats}/{mealTargets.fats}g
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  };

  // Update the fetchStreakHistory function to handle errors gracefully
  const fetchStreakHistory = async () => {
    try {
      if (!auth.currentUser) return;

      const streakRef = doc(db, 'userStreaks', auth.currentUser.uid);
      const streakDoc = await getDoc(streakRef);
      
      if (streakDoc.exists()) {
        const data = streakDoc.data();
        setStreak(data.currentStreak || 0);
        setDietHistory(data.history || {});
      } else {
        // Initialize streak document if it doesn't exist
        const initialData = {
          currentStreak: 0,
          history: {},
          lastUpdated: new Date().toISOString(),
          userId: auth.currentUser.uid
        };
        
        try {
          await setDoc(streakRef, initialData);
          setStreak(0);
          setDietHistory({});
        } catch (error) {
          console.error('Error initializing streak document:', error);
          // Continue without crashing if initialization fails
        }
      }
    } catch (error) {
      console.error('Error fetching streak history:', error);
      // Set default values if there's an error
      setStreak(0);
      setDietHistory({});
    }
  };

  // Update the checkAndUpdateStreak function to handle errors gracefully
  const checkAndUpdateStreak = async () => {
    try {
      if (!auth.currentUser) return;

      const userId = auth.currentUser.uid;
      const today = new Date().toISOString().split('T')[0];
      const hour = new Date().getHours();

      if (hour < 0) return;

      const allMealsCompleted = MEAL_ORDER.every(meal => mealStatus[meal]);
      
      const streakRef = doc(db, 'userStreaks', userId);
      let streakDoc;
      
      try {
        streakDoc = await getDoc(streakRef);
      } catch (error) {
        console.error('Error reading streak document:', error);
        streakDoc = { exists: () => false };
      }
      
      let currentStreak = 0;
      let history = {};
      
      if (streakDoc.exists()) {
        const data = streakDoc.data();
        currentStreak = data.currentStreak || 0;
        history = data.history || {};
      }

      if (allMealsCompleted) {
        currentStreak += 1;
        history[today] = true;
      } else {
        currentStreak = 0;
        history[today] = false;
      }

      try {
        await setDoc(streakRef, {
          currentStreak,
          history,
          lastUpdated: new Date().toISOString(),
          userId
        });

        setStreak(currentStreak);
        setDietHistory(history);
      } catch (error) {
        console.error('Error updating streak document:', error);
      }

    } catch (error) {
      console.error('Error in checkAndUpdateStreak:', error);
    }
  };

  const fetchHistoricalStreakData = async () => {
    if (!currentUser) return;

    try {
      const progressRef = doc(db, 'userProgress', currentUser.uid);
      const progressDoc = await getDoc(progressRef);
      const progressData = progressDoc.data() || {};

      const completed = [];
      const missed = [];
      
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      Object.entries(progressData).forEach(([date, data]) => {
        if (!dateRegex.test(date) || 
            date === 'dailyProgress' || 
            date === 'userId' || 
            date === 'createdAt' || 
            !data) return;

        if (data.calories > 0 && data.protein > 0 && data.carbs > 0 && data.fats > 0) {
          completed.push(date);
        } else {
          missed.push(date);
        }
      });

      const uniqueCompleted = Array.from(new Set(completed))
        .filter(date => dateRegex.test(date))
        .sort();
        
      const uniqueMissed = Array.from(new Set(missed))
        .filter(date => dateRegex.test(date))
        .sort();

      const currentStreak = calculateStreak(uniqueCompleted, today);

      await setDoc(streakRef, {
        currentStreak,
        history: Object.fromEntries(uniqueCompleted.map(date => [date, true])),
        lastUpdated: new Date().toISOString()
      }, { merge: true });

      setStreak(currentStreak);
      
      return { completed: uniqueCompleted, missed: uniqueMissed };
    } catch (error) {
      console.error('Error fetching historical data:', error);
      return { completed: [], missed: [] };
    }
  };

  useEffect(() => {
    const fetchStreakOnMount = async () => {
      if (!auth.currentUser) return;
      
      try {
        const userId = auth.currentUser.uid;
        const streakRef = doc(db, 'userStreaks', userId);
        const streakDoc = await getDoc(streakRef);
        
        if (streakDoc.exists()) {
          const data = streakDoc.data();
          setStreak(data.currentStreak || 0);
        } else {
          setStreak(0);
        }
      } catch (error) {
        console.error('Error fetching streak on mount:', error);
      }
    };
    
    fetchStreakOnMount();
  }, []);

  const recalculateStreak = async () => {
    try {
      if (!auth.currentUser) return;
      
      const userId = auth.currentUser.uid;
      const today = new Date().toISOString().split('T')[0];
      
      const streakRef = doc(db, 'userStreaks', userId);
      const streakDoc = await getDoc(streakRef);
      
      if (!streakDoc.exists()) return;
      
      const data = streakDoc.data();
      const completedDates = Object.entries(data.history || {})
        .filter(([_, isCompleted]) => isCompleted)
        .map(([date]) => date);
      
      // Update streak in Firestore and get new streak value
      const newStreak = await updateStreakInFirestore(userId, completedDates, today);
      
      // Update local state
      setStreak(newStreak);
    } catch (error) {
      console.error('Error recalculating streak:', error);
    }
  };

  useEffect(() => {
    const fetchStreakOnMount = async () => {
      if (!auth.currentUser) return;
      
      try {
        const userId = auth.currentUser.uid;
        const streakRef = doc(db, 'userStreaks', userId);
        const streakDoc = await getDoc(streakRef);
        
        if (streakDoc.exists()) {
          const data = streakDoc.data();
          setStreak(data.currentStreak || 0);
        } else {
          setStreak(0);
        }
      } catch (error) {
        console.error('Error fetching streak on mount:', error);
      }
    };
    
    fetchStreakOnMount();
  }, []);

  // Add this function at the top level of the component
  const fetchHistoricalData = async (userId) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const streakRef = doc(db, 'userStreaks', userId);
      const streakDoc = await getDoc(streakRef);
      
      let completed = [];
      let missed = [];
      
      if (streakDoc.exists()) {
        const data = streakDoc.data();
        const history = data.history || {};
        
        // Process all dates up to today
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        
        Object.entries(history).forEach(([date, status]) => {
          const entryDate = new Date(date);
          // Only process dates up to today
          if (entryDate <= currentDate) {
            if (status === true) {
              completed.push(date);
            } else {
              missed.push(date);
            }
          }
        });
        
        // Sort the arrays
        completed.sort();
        missed.sort();
      }
      
      return { completed, missed };
    } catch (error) {
      console.error('Error fetching historical data:', error);
      return { completed: [], missed: [] };
    }
  };

  // Helper function to calculate streak consistently
  const calculateStreak = (history) => {
    if (!history || Object.keys(history).length === 0) return 0;
    
    // Get all dates and sort them in descending order (most recent first)
    const dates = Object.entries(history)
      .filter(([_, completed]) => completed === true)
      .map(([date]) => date)
      .sort((a, b) => b.localeCompare(a));
    
    if (dates.length === 0) return 0;
    
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Convert today to YYYY-MM-DD format
    const todayStr = today.toISOString().split('T')[0];
    
    // Start checking from the most recent date
    for (let i = 0; i < dates.length; i++) {
      const currentDate = new Date(dates[i]);
      currentDate.setHours(0, 0, 0, 0);
      
      // If we're checking the first date
      if (i === 0) {
        // If the most recent completion is not from today or yesterday, break
        const daysDiff = Math.floor((today - currentDate) / (1000 * 60 * 60 * 24));
        if (daysDiff > 1) break;
        streak = 1;
        continue;
      }
      
      // Get the previous date to check for consecutive days
      const prevDate = new Date(dates[i - 1]);
      prevDate.setHours(0, 0, 0, 0);
      
      // Check if dates are consecutive
      const daysDiff = Math.floor((prevDate - currentDate) / (1000 * 60 * 60 * 24));
      if (daysDiff === 1) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  };

  // Helper function to check if a date is yesterday
  const isYesterday = (date) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  };

  // Update the useEffect that handles user authentication
  useEffect(() => {
    const loadUserData = async (user) => {
      if (!user) {
        navigate('/login');
        return;
      }

      try {
        // Clean up old data before loading new data
        cleanupOldData();
        
        // Fetch historical data
        const { completed, missed } = await fetchHistoricalData(user.uid);
        setCompletedDates(completed);
        setMissedDates(missed);

        // Load today's meal status from Firestore instead of localStorage
        const today = new Date().toISOString().split('T')[0];
        const progressRef = doc(db, 'userProgress', user.uid);
        const progressDoc = await getDoc(progressRef);
        
        if (progressDoc.exists()) {
          const todayData = progressDoc.data()[today];
          if (todayData) {
            const newMealStatus = {
              breakfast: todayData.breakfast || false,
              lunch: todayData.lunch || false,
              snacks: todayData.snacks || false,
              dinner: todayData.dinner || false
            };
            setMealStatus(newMealStatus);
          }
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        loadUserData(user);
      } else {
        navigate('/login');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Update the renderDay function
  const renderDay = (date, selectedDates, dayInCurrentMonth) => {
    if (!dayInCurrentMonth) return <div>{date.getDate()}</div>;
    
    const dateStr = date.toISOString().split('T')[0];
    const isCompleted = completedDates.includes(dateStr);
    const isMissed = missedDates.includes(dateStr);
    
    return (
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...(isCompleted && {
            bgcolor: 'success.main',
            color: 'white',
            borderRadius: '50%'
          }),
          ...(isMissed && {
            bgcolor: 'error.main',
            color: 'white',
            borderRadius: '50%'
          })
        }}
      >
        {date.getDate()}
      </Box>
    );
  };

  const renderPredictionResult = () => {
    if (!detectedFood) return null;

    // Log the detected food data to verify values
    console.log('Rendering prediction result with data:', detectedFood);

    return (
      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <Typography variant="h6" gutterBottom>
          Detected Food: {detectedFood.name || detectedFood.foodName}
        </Typography>

        <Typography variant="h6" gutterBottom>
          Nutrition Information:
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={3}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'primary.light', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">Calories</Typography>
              <Typography variant="h6">{Math.round(detectedFood?.nutrition?.calories) || 0}</Typography>
            </Box>
          </Grid>
          <Grid item xs={3}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'success.light', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">Protein</Typography>
              <Typography variant="h6">{Math.round(detectedFood?.nutrition?.protein) || 0}g</Typography>
            </Box>
          </Grid>
          <Grid item xs={3}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'warning.light', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">Carbs</Typography>
              <Typography variant="h6">{Math.round(detectedFood?.nutrition?.carbs) || 0}g</Typography>
            </Box>
          </Grid>
          <Grid item xs={3}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">Fats</Typography>
              <Typography variant="h6">{Math.round(detectedFood?.nutrition?.fats) || 0}g</Typography>
            </Box>
          </Grid>
        </Grid>
      </Box>
    );
  };

  const determineMealTypeByHour = (hour) => {
    // Breakfast: 6 AM - 11 AM
    if (hour >= 6 && hour < 11) return 'breakfast';
    // Lunch: 11:30 AM - 3 PM
    if (hour >= 11.5 && hour < 15) return 'lunch';
    // Snacks: 3:30 PM - 7 PM
    if (hour >= 15.5 && hour < 19) return 'snacks';
    // Dinner: 7:30 PM - 12 AM
    if (hour >= 19.5 || hour < 0) return 'dinner';
    // All other times (12 AM - 5:59 AM, 11:00 AM - 11:29 AM, 3:00 PM - 3:29 PM, 7:00 PM - 7:29 PM) are snacks
    return 'snacks';
  };

  // New function to migrate meals from userProgress to userMeals
  const migrateMealsFromProgress = async (userId) => {
    if (migrationCompletedRef.current) return;
    
    try {
      console.log('Starting migration of meals from userProgress to userMeals');
      
      // Get data from userProgress
      const progressRef = doc(db, 'userProgress', userId);
      const progressDoc = await getDoc(progressRef);
      
      if (!progressDoc.exists()) {
        console.log('No userProgress data to migrate');
        return;
      }
      
      const progressData = progressDoc.data();
      console.log('Progress data from Firestore:', progressData);
      
      // Get current userMeals data
      const mealsRef = doc(db, 'userMeals', userId);
      const mealsDoc = await getDoc(mealsRef);
      const mealsData = mealsDoc.exists() ? mealsDoc.data() : {};
      console.log('Current meals data from Firestore:', mealsData);
      
      let migratedCount = 0;
      let skippedCount = 0;
      
      // Process each date in progressData
      for (const [date, dateData] of Object.entries(progressData)) {
        // Skip keys that are not dates
        if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          console.log(`Skipping non-date key: ${date}`);
          continue;
        }
        
        console.log(`Processing date: ${date}, data:`, dateData);
        
        // Initialize the meals array for this date if it doesn't exist
        if (!mealsData[date]) {
          mealsData[date] = [];
        }
        
        // Create a set of identifiers for existing meals to detect duplicates
        // Use a composite key of foodName + mealType + timestamp + calories as a fingerprint
        const existingMealSignatures = new Set();
        mealsData[date].forEach(meal => {
          // Create a unique signature for the meal
          const foodName = meal.foodName || meal.name || 'Unknown';
          const mealType = meal.mealType || 'snacks';
          const timestamp = meal.timestamp ? meal.timestamp.toString().substring(0, 16) : '';
          const calories = meal.nutrition?.calories || 0;
          
          const signature = `${foodName}-${mealType}-${timestamp}-${calories}`;
          existingMealSignatures.add(signature);
          
          // Also add without timestamp as some migrated meals might not have exact same timestamp
          const signatureNoTime = `${foodName}-${mealType}-${calories}`;
          existingMealSignatures.add(signatureNoTime);
        });
        
        // Case 1: If dateData has a 'meals' array property
        if (Array.isArray(dateData.meals) && dateData.meals.length > 0) {
          console.log(`Found ${dateData.meals.length} meals in userProgress for ${date}`);
          
          dateData.meals.forEach(meal => {
            // Skip if we already have this meal by checking signature
            const foodName = meal.foodName || meal.name || 'Unknown Food';
            const mealType = meal.mealType || 'snacks';
            const timestamp = meal.timestamp ? meal.timestamp.toString().substring(0, 16) : '';
            const calories = meal.nutrition?.calories || 0;
            
            const signature = `${foodName}-${mealType}-${timestamp}-${calories}`;
            const signatureNoTime = `${foodName}-${mealType}-${calories}`;
            
            if (existingMealSignatures.has(signature) || existingMealSignatures.has(signatureNoTime)) {
              console.log(`Skipping duplicate meal: ${foodName}`);
              skippedCount++;
              return;
            }
            
            // Only add if it has necessary data
            if (meal && (meal.nutrition || meal.foodName)) {
              // Determine meal type based on timestamp if not specified
              let mealType = meal.mealType;
              if (!mealType && meal.timestamp) {
                try {
                  const mealTime = new Date(meal.timestamp);
                  const hour = mealTime.getHours() + mealTime.getMinutes() / 60;
                  mealType = determineMealTypeByHour(hour);
                } catch (e) {
                  console.error('Error determining meal type from timestamp:', e);
                  mealType = 'snacks'; // Default
                }
              }
              
              const newMeal = {
                foodName: foodName,
                name: foodName,
                nutrition: meal.nutrition || {
                  calories: 0,
                  protein: 0,
                  carbs: 0,
                  fats: 0
                },
                mealType: mealType || 'snacks',
                timestamp: meal.timestamp || new Date().toISOString()
              };
              
              mealsData[date].push(newMeal);
              
              // Add the signature to the set to prevent duplicates in the same run
              existingMealSignatures.add(signature);
              existingMealSignatures.add(signatureNoTime);
              
              console.log(`Migrated meal: ${foodName} as ${mealType}`);
              migratedCount++;
            }
          });
        } 
        // Case 2: Check direct mealType objects in the date data
        else if (dateData.breakfast || dateData.lunch || dateData.dinner || dateData.snacks) {
          console.log(`Found direct meal type objects for ${date}`);
          
          // Process each meal type
          const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'];
          
          mealTypes.forEach(mealType => {
            if (dateData[mealType]) {
              const mealData = dateData[mealType];
              
              // Create a timestamp for this meal based on typical meal times
              let mealHour;
              switch(mealType) {
                case 'breakfast': mealHour = 8; break; // 8 AM
                case 'lunch': mealHour = 13; break;    // 1 PM
                case 'dinner': mealHour = 19; break;   // 7 PM
                case 'snacks': mealHour = 16; break;   // 4 PM
                default: mealHour = 12;                // Noon
              }
              
              const mealDate = new Date(date);
              mealDate.setHours(mealHour, 0, 0, 0);
              const timestamp = mealDate.toISOString();
              
              // Create the foodName
              const foodName = `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} meal`;
              
              // Get nutrition
              const nutrition = typeof mealData === 'object' && mealData.nutrition ? mealData.nutrition : {
                calories: typeof mealData === 'object' ? (mealData.calories || 0) : 0,
                protein: typeof mealData === 'object' ? (mealData.protein || 0) : 0,
                carbs: typeof mealData === 'object' ? (mealData.carbs || 0) : 0,
                fats: typeof mealData === 'object' ? (mealData.fats || 0) : 0
              };
              
              // Create signatures
              const calories = nutrition.calories || 0;
              const signature = `${foodName}-${mealType}-${timestamp.substring(0, 16)}-${calories}`;
              const signatureNoTime = `${foodName}-${mealType}-${calories}`;
              
              // Check if this meal already exists
              if (existingMealSignatures.has(signature) || existingMealSignatures.has(signatureNoTime)) {
                console.log(`Skipping duplicate meal type: ${mealType}`);
                skippedCount++;
                return;
              }
              
              const newMeal = {
                foodName: foodName,
                name: foodName,
                nutrition: nutrition,
                mealType: mealType,
                timestamp: timestamp
              };
              
              mealsData[date].push(newMeal);
              
              // Add the signature to the set to prevent duplicates in the same run
              existingMealSignatures.add(signature);
              existingMealSignatures.add(signatureNoTime);
              
              console.log(`Migrated ${mealType} meal for ${date}`);
              migratedCount++;
            }
          });
        }
        // Case 3: If the date has calories, protein, etc. directly (no meals array)
        else if (dateData.calories !== undefined || dateData.protein !== undefined || 
                 dateData.carbs !== undefined || dateData.fats !== undefined) {
          
          // Distribute nutrition data across different meal types based on typical proportions
          const mealDistribution = {
            breakfast: 0.25,
            lunch: 0.35,
            dinner: 0.30,
            snacks: 0.10
          };
          
          // Check if any of these meal types already exist
          let hasExistingMeals = mealsData[date].length > 0;
          
          // Only create these entries if we don't already have meals for this date
          if (!hasExistingMeals) {
            console.log(`Found total nutrition data for ${date}, distributing across meal types`);
            
            for (const [mealType, proportion] of Object.entries(mealDistribution)) {
              // Create a timestamp for this meal
              let mealHour;
              switch(mealType) {
                case 'breakfast': mealHour = 8; break; // 8 AM
                case 'lunch': mealHour = 13; break;    // 1 PM
                case 'dinner': mealHour = 19; break;   // 7 PM
                case 'snacks': mealHour = 16; break;   // 4 PM
                default: mealHour = 12;                // Noon
              }
              
              const mealDate = new Date(date);
              mealDate.setHours(mealHour, 0, 0, 0);
              const timestamp = mealDate.toISOString();
              
              const foodName = `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} meal`;
              const calories = Math.round((dateData.calories || 0) * proportion);
              
              // Create signatures
              const signature = `${foodName}-${mealType}-${timestamp.substring(0, 16)}-${calories}`;
              const signatureNoTime = `${foodName}-${mealType}-${calories}`;
              
              // Check if this meal already exists
              if (existingMealSignatures.has(signature) || existingMealSignatures.has(signatureNoTime)) {
                console.log(`Skipping duplicate meal type: ${mealType}`);
                skippedCount++;
                continue;
              }
              
              const newMeal = {
                foodName: foodName,
                name: foodName,
                nutrition: {
                  calories: calories,
                  protein: Math.round((dateData.protein || 0) * proportion),
                  carbs: Math.round((dateData.carbs || 0) * proportion),
                  fats: Math.round((dateData.fats || 0) * proportion)
                },
                mealType,
                timestamp
              };
              
              mealsData[date].push(newMeal);
              
              // Add the signature to the set to prevent duplicates in the same run
              existingMealSignatures.add(signature);
              existingMealSignatures.add(signatureNoTime);
              
              console.log(`Migrated ${mealType} with ${proportion * 100}% of nutrition data for ${date}`);
              migratedCount++;
            }
          } else {
            console.log(`Skipping nutrition distribution for ${date} as it already has meals`);
          }
        }
      }
      
      // Update userMeals with the migrated data only if we added new meals
      if (migratedCount > 0) {
        await setDoc(mealsRef, mealsData, { merge: true });
        console.log(`Migration complete: ${migratedCount} meals migrated, ${skippedCount} skipped as duplicates`);
        
        // Show success message to user
        setSnackbar({
          open: true,
          message: `${migratedCount} meals have been migrated to your meal log`,
          severity: 'success'
        });
        
        // Update local UI with the new migrated meals
        fetchAllMeals();
      } else {
        console.log(`No meals needed migration (${skippedCount} duplicates skipped)`);
        setSnackbar({
          open: true,
          message: `No new meals needed to be migrated`,
          severity: 'info'
        });
      }
      
      migrationCompletedRef.current = true;
    } catch (error) {
      console.error('Error during meal migration:', error);
      setSnackbar({
        open: true,
        message: 'Failed to migrate meals: ' + error.message,
        severity: 'error'
      });
    }
  };

  // Modify the fetchAllMeals function
  const fetchAllMeals = useCallback(async () => {
    try {
      if (!auth.currentUser) return;

      const userId = auth.currentUser.uid;
      const today = new Date().toISOString().split('T')[0];
      
      // Get cached meal status first
      const cachedStatus = localStorage.getItem(`mealStatus_${today}`);
      if (cachedStatus) {
        const parsedStatus = JSON.parse(cachedStatus);
        // Only update if different from current state
        if (JSON.stringify(parsedStatus) !== JSON.stringify(mealStatus)) {
          setMealStatus(parsedStatus);
        }
      }

      // Single fetch for meals
      const mealsRef = doc(db, 'userMeals', userId);
      const mealsDoc = await getDoc(mealsRef);
      
      const meals = {
        breakfast: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        lunch: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        dinner: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        snacks: { calories: 0, protein: 0, carbs: 0, fats: 0 }
      };
      
      let newMealStatus = {
        breakfast: false,
        lunch: false,
        dinner: false,
        snacks: false
      };
      
      if (mealsDoc.exists()) {
        const todaysMealData = mealsDoc.data()[today] || [];
        
        if (Array.isArray(todaysMealData)) {
          todaysMealData.forEach(meal => {
            const mealType = meal.mealType;
            if (!mealType) return;
            
            const nutrition = meal.nutrition || {};
            meals[mealType].calories += Number(nutrition.calories) || 0;
            meals[mealType].protein += Number(nutrition.protein) || 0;
            meals[mealType].carbs += Number(nutrition.carbs) || 0;
            meals[mealType].fats += Number(nutrition.fats) || 0;
            
            // Mark meal as completed if it has any calories
            if (meals[mealType].calories > 0) {
              newMealStatus[mealType] = true;
            }
          });
        }
      }

      // Only update states if they've changed
      if (JSON.stringify(meals) !== JSON.stringify(todaysMeals)) {
        setTodaysMeals(meals);
      }
      
      // Only update if status has changed
      const statusChanged = Object.keys(newMealStatus).some(
        mealType => newMealStatus[mealType] !== mealStatus[mealType]
      );

      if (statusChanged) {
        setMealStatus(newMealStatus);
        localStorage.setItem(`mealStatus_${today}`, JSON.stringify(newMealStatus));
        
        // Debounce the Firestore update
        if (canWriteToFirestore()) {
          debouncedFirestoreUpdate(userId, today, newMealStatus);
          setWriteCount(prev => prev + 1);
          setDailyWriteCount(prev => prev + 1);
        }
      }
      
    } catch (error) {
      console.error('Error fetching meals:', error);
    }
  }, [auth.currentUser, mealStatus, todaysMeals, canWriteToFirestore]);

  // Add this to the migrateMealsFromProgress function just before migrationCompletedRef.current = true
  // Replace the existing line with fetchAllMeals && fetchAllMeals() with this:
  
  // Update the component with the new migrated meals
  fetchAllMeals();

  // Modify the useEffect that monitors mealStatus changes
  useEffect(() => {
    let isMounted = true;

    const updateStreakOnMealCompletion = async () => {
      try {
        if (!currentUser) return;

        const today = new Date().toISOString().split('T')[0];
        const streakRef = doc(db, 'userStreaks', currentUser.uid);
        
        // Get current streak data
        const streakDoc = await getDoc(streakRef);
        let history = {};
        if (streakDoc.exists()) {
          history = streakDoc.data().history || {};
        }
        
        // Update today's status
        history[today] = true;
        
        // Use a batch write to ensure atomicity
        const batch = writeBatch(db);
        batch.set(streakRef, {
          history,
          lastUpdated: serverTimestamp(),
          userId: currentUser.uid
        }, { merge: true });
        
        await batch.commit();
        
        // Update local state
        setCompletedDates(prev => [...new Set([...prev, today])]);
        
        // Recalculate streak
        const newStreak = calculateStreak(history);
        setStreak(newStreak);
      } catch (error) {
        console.error('Error updating streak:', error);
      }
    };
    
    updateStreakOnMealCompletion();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const clearLocalStorage = async () => {
    try {
      // Clear all localStorage items
      localStorage.clear();
      
      // Clear Firestore cache
      await db.clearPersistence();
      
      // Reload the page to reset the application state
      window.location.reload();
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  };

  const clearCache = async () => {
    try {
      // Clear localStorage
      localStorage.clear();
      
      // Clear Firestore cache
      await db.clearPersistence();
      
      // Reload the page to reset the application state
      window.location.reload();
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  };

  // Add these styles at the top of the file after imports
  const calendarStyles = {
    '.react-calendar': {
      width: '100%',
      maxWidth: '100%',
      background: 'white',
      border: '1px solid #a0a096',
      fontFamily: 'Arial, Helvetica, sans-serif',
      lineHeight: '1.125em',
      borderRadius: '8px',
      padding: '8px'
    },
    '.react-calendar__navigation': {
      display: 'flex',
      height: '44px',
      marginBottom: '1em'
    },
    '.react-calendar__navigation button': {
      minWidth: '44px',
      background: 'none',
      border: 'none',
      color: '#6f48eb',
      fontSize: '16px',
      marginTop: '8px'
    },
    '.react-calendar__navigation button:enabled:hover, .react-calendar__navigation button:enabled:focus': {
      backgroundColor: '#f8f8fa'
    },
    '.react-calendar__navigation button[disabled]': {
      backgroundColor: '#f0f0f0'
    },
    '.react-calendar__month-view__weekdays': {
      textAlign: 'center',
      textTransform: 'uppercase',
      fontWeight: 'bold',
      fontSize: '0.75em'
    },
    '.react-calendar__month-view__weekdays__weekday': {
      padding: '0.5em'
    },
    '.react-calendar__month-view__weekNumbers .react-calendar__tile': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.75em',
      fontWeight: 'bold'
    },
    '.react-calendar__month-view__days__day--weekend': {
      color: '#000000'
    },
    '.react-calendar__month-view__days__day--neighboringMonth': {
      color: '#757575'
    },
    '.react-calendar__year-view .react-calendar__tile, .react-calendar__decade-view .react-calendar__tile, .react-calendar__century-view .react-calendar__tile': {
      padding: '2em 0.5em'
    },
    '.react-calendar__tile': {
      maxWidth: '100%',
      padding: '10px 6.6667px',
      background: 'none',
      textAlign: 'center',
      lineHeight: '16px',
      border: 'none',
      borderRadius: '4px'
    },
    '.react-calendar__tile:disabled': {
      backgroundColor: '#f0f0f0'
    },
    '.react-calendar__tile:enabled:hover, .react-calendar__tile:enabled:focus': {
      backgroundColor: '#e6e6fa'
    },
    '.react-calendar__tile--now': {
      background: '#ffff76'
    },
    '.react-calendar__tile--now:enabled:hover, .react-calendar__tile--now:enabled:focus': {
      background: '#ffffa9'
    },
    '.react-calendar__tile--hasActive': {
      background: '#76baff'
    },
    '.react-calendar__tile--hasActive:enabled:hover, .react-calendar__tile--hasActive:enabled:focus': {
      background: '#a9d4ff'
    },
    '.react-calendar__tile--active': {
      background: '#6f48eb',
    },
    '.react-calendar__tile--active:enabled:hover, .react-calendar__tile--active:enabled:focus': {
      background: '#7c5cf1'
    },
    '.react-calendar--selectRange .react-calendar__tile--hover': {
      backgroundColor: '#e6e6fa'
    },
    '.streak-day': {
      backgroundColor: 'rgba(76, 175, 79, 0.52) !important'
    },
    '.missed-day': {
      backgroundColor: 'rgba(244, 67, 54, 0.52) !important'
    }
  };

  // Modify the calendar tile class and content functions
  const tileClassName = ({ date }) => {
    const dateStr = date.toISOString().split('T')[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Convert date strings to Date objects for comparison
    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);
    
    // Format the date string to match Firestore format (YYYY-MM-DD)
    const formattedDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    
    // Check if the date is in completedDates
    if (completedDates.includes(formattedDate)) {
      return 'streak-day';
    }
    
    // Only mark as missed if it's a past date and not completed
    if (dateObj < today && !completedDates.includes(formattedDate)) {
      return 'missed-day';
    }
    
    return '';
  };

  const tileContent = ({ date }) => {
    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);
    
    // Format the date string to match Firestore format (YYYY-MM-DD)
    const formattedDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Show icons for completed days
    if (completedDates.includes(formattedDate)) {
      return <CheckCircleIcon sx={{ color: 'success.main', fontSize: 16 }} />;
    }
    
    // Show X for missed days (past dates that weren't completed)
    if (dateObj < today && !completedDates.includes(formattedDate)) {
      return <CancelIcon sx={{ color: 'error.main', fontSize: 16 }} />;
    }
    
    return null;
  };

  const activateCamera = async () => {
    try {
      setError(null);
      setCameraError(null);

      // Check if browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support camera access');
      }

      // Request camera permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      // Update state and refs
      setHasCamera(true);
      setCameraPermission('granted');
      setIsCameraActive(true);
      
      // Set up video stream
      if (webcamRef.current && webcamRef.current.video) {
        webcamRef.current.video.srcObject = stream;
      }
      
      streamRef.current = stream;
    } catch (error) {
      console.error('Camera activation error:', error);
      
      // Handle specific error types
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraError('Camera access denied. Please grant permission to use your camera.');
        setCameraPermission('denied');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setCameraError('No camera found on your device.');
        setHasCamera(false);
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setCameraError('Your camera is in use by another application.');
      } else {
        setCameraError('Failed to access camera: ' + error.message);
      }
      
      setHasCamera(false);
      setIsCameraActive(false);
    }
  };

  const updateMealStatus = async (mealType, progress) => {
    try {
      if (!auth.currentUser) return;

      const userId = auth.currentUser.uid;
      const today = new Date().toISOString().split('T')[0];

      // Get current cached status
      const cachedStatus = localStorage.getItem(MEAL_STATUS_CACHE_KEY);
      let currentMealStatus = {
        breakfast: false,
        lunch: false,
        dinner: false,
        snacks: false
      };

      if (cachedStatus) {
        try {
          currentMealStatus = JSON.parse(cachedStatus);
        } catch (error) {
          console.error('Error parsing cached meal status:', error);
        }
      }

      // Update the specific meal status based on progress
      const mealComplete = progress.calories >= 90 || progress.nutrientsReached90Percent >= 2;
      
      // Only proceed if the status has actually changed
      if (currentMealStatus[mealType] !== mealComplete) {
        currentMealStatus[mealType] = mealComplete;

        // Save to localStorage
        localStorage.setItem(MEAL_STATUS_CACHE_KEY, JSON.stringify(currentMealStatus));
        setMealStatus(currentMealStatus);

        // Check if all meals are completed
        const allMealsCompleted = Object.values(currentMealStatus).every(status => status);

        // Update streak data
        const streakRef = doc(db, 'userStreaks', userId);
        const streakDoc = await getDoc(streakRef);
        const streakData = streakDoc.exists() ? streakDoc.data() : { history: {} };

        // Update the history with the current day's status
        const updatedHistory = {
          ...streakData.history,
          [today]: allMealsCompleted
        };

        // Update local state for calendar display
        if (allMealsCompleted) {
          setCompletedDates(prev => {
            const newDates = new Set(prev);
            newDates.add(today);
            return Array.from(newDates);
          });
          setMissedDates(prev => prev.filter(date => date !== today));
        }

        // Use the debounced update function
        debouncedUpdateMealStatus(userId, today, currentMealStatus);
      }
    } catch (error) {
      console.error('Error updating meal status:', error);
    }
  };

  const processImage = useCallback(async (file) => {
    try {
      setIsProcessing(true);
      setError(null);
      setDetectedFood(null);
      setCapturedImage(URL.createObjectURL(file));

      const formData = new FormData();
      formData.append('image', file);

      // First, detect all food items in the image
      const detectionResponse = await fetch(`${getServerUrl()}/detect`, {
        method: 'POST',
        body: formData
      });

      if (!detectionResponse.ok) {
        throw new Error('Failed to detect food');
      }

      const detectionData = await detectionResponse.json();
      console.log('Detection response:', detectionData);

      if (!detectionData.success || !detectionData.foodItems || detectionData.foodItems.length === 0) {
        throw new Error('No food detected in the image');
      }

      // Get nutrition data for all detected food items
      const foodItems = detectionData.foodItems;
      let totalNutrition = {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0
      };

      const detectedFoodNames = [];

      // Process each detected food item
      for (const foodName of foodItems) {
        const nutritionResponse = await fetch(`${getServerUrl()}/get_nutrition`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ food_name: foodName })
        });
        
        if (!nutritionResponse.ok) {
          console.warn(`Failed to get nutrition data for ${foodName}`);
          continue;
        }

        const nutritionData = await nutritionResponse.json();
        console.log(`Nutrition data for ${foodName}:`, nutritionData);

        // Add to total nutrition values
        totalNutrition.calories += Number(nutritionData.total?.calories || nutritionData.calories || 0);
        totalNutrition.protein += Number(nutritionData.total?.protein || nutritionData.protein || 0);
        totalNutrition.carbs += Number(nutritionData.total?.carbs || nutritionData.carbs || 0);
        totalNutrition.fats += Number(nutritionData.total?.fats || nutritionData.fats || 0);
        
        detectedFoodNames.push(foodName);
      }

      // Round the total nutrition values
      totalNutrition = {
        calories: Math.round(totalNutrition.calories),
        protein: Math.round(totalNutrition.protein),
        carbs: Math.round(totalNutrition.carbs),
        fats: Math.round(totalNutrition.fats)
      };

      console.log('Total nutrition for all items:', totalNutrition);

      // Create the meal data object with combined data
      const mealData = {
        foodName: detectedFoodNames.join(', '),
        name: detectedFoodNames.join(', '),
        nutrition: totalNutrition,
        imageUrl: URL.createObjectURL(file),
        timestamp: new Date().toISOString(),
        foodItems: detectedFoodNames // Store individual food items
      };

      // Set the detected food for display
      setDetectedFood(mealData);

      // Show success message with all detected items
      setSnackbar({
        open: true,
        message: `Detected: ${detectedFoodNames.join(', ')}. Logging meal...`,
        severity: 'info'
      });

      // Automatically log the meal after a short delay
      setTimeout(() => {
        handleAddMeal(mealData);
      }, 1500);

    } catch (error) {
      console.error('Error processing image:', error);
      setError(error.message);
      setSnackbar({
        open: true,
        message: error.message,
        severity: 'error'
      });
    } finally {
      setIsProcessing(false);
      // Make sure camera is deactivated in case of error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
        setIsCameraActive(false);
      }
    }
  }, [handleAddMeal]);

  const deactivateCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsCameraActive(false);
    setCapturedImage(null);
    setPredictionResult(null);
  };

  const captureImage = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      // Convert base64 to blob
      fetch(imageSrc)
        .then(res => res.blob())
        .then(blob => {
          // Create File object with original format
          const file = new File([blob], "captured-image.jpg", { type: blob.type });
          console.log('Created file from capture:', file.name, file.type, file.size);
          // Deactivate camera after successful capture
          deactivateCamera();
          // Set captured image
          setCapturedImage(URL.createObjectURL(file));
          // Process the image
          processImage(file);
        })
        .catch(error => {
          console.error('Error converting image:', error);
          setError('Failed to process captured image');
        });
    }
  }, []);

  // Update the useEffect that syncs calendar with streak data
  useEffect(() => {
    const syncCalendarData = async () => {
      if (!auth.currentUser) return;
      
      try {
        // Set up real-time listener for streak updates
        const streakRef = doc(db, 'userStreaks', auth.currentUser.uid);
        const unsubscribe = onSnapshot(streakRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            const history = data.history || {};
            
            // Calculate current streak from history
            const currentStreak = calculateStreak(history);
            setStreak(currentStreak);
            
            // Update calendar data
            const completed = [];
            const missed = [];
            
            // Process all dates
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            Object.entries(history).forEach(([date, status]) => {
              const entryDate = new Date(date);
              entryDate.setHours(0, 0, 0, 0);
              
              // Only process dates up to today
              if (entryDate <= today) {
                if (status === true) {
                  completed.push(date);
                } else {
                  missed.push(date);
                }
              }
            });
            
            // Sort the arrays chronologically
            completed.sort();
            missed.sort();
            
            // Update calendar states
            setCompletedDates(completed);
            setMissedDates(missed);
            
            // Remove redundant console logs and keep only one essential update
            if (process.env.NODE_ENV === 'development') {
              console.log(`Streak data updated: ${currentStreak} day streak`);
            }
          }
        });

        return () => unsubscribe();
      } catch (error) {
        console.error('Error in calendar sync:', error);
      }
    };

    syncCalendarData();
  }, [auth.currentUser]);

  // Remove the loading check before the return statement and integrate it into the component
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'url(/images/healthy-food-bg.jpg) no-repeat center center fixed',
        backgroundSize: 'cover',
        py: 3
      }}
    >
      <Container maxWidth="xl">
        {/* Show quota exceeded warning at the top */}
        {isQuotaExceeded && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>Firestore Quota Exceeded</AlertTitle>
            You can continue using the app with limited functionality. Your data will be saved locally.
          </Alert>
        )}

        {/* Show write limit warning if needed */}
        {writeCount >= MAX_TOTAL_WRITES && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>Write Limit Reached</AlertTitle>
            You've reached the maximum number of writes. Some features may be limited.
          </Alert>
        )}
        
        {/* Show daily write limit warning if needed */}
        {dailyWriteCount >= MAX_DAILY_WRITES && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>Daily Write Limit Reached</AlertTitle>
            You've reached today's write limit. Your data will be saved locally.
          </Alert>
        )}
        
        {/* Show any other errors */}
        {error && !isQuotaExceeded && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <Grid container spacing={2}>
          {/* Camera Interface Card */}
          <Grid item xs={12}>
            {renderCameraInterface()}
          </Grid>

          {/* Main Content Row */}
          <Grid item xs={12}>
            <Grid container spacing={2}>
              {/* Left Column - Daily Targets */}
              <Grid item xs={12} md={6}>
                <Card sx={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <CardContent sx={{ flex: 1, p: 2 }}>
                    {renderDailyTargets()}
                  </CardContent>
                </Card>
              </Grid>

              {/* Right Column - Calendar */}
              <Grid item xs={12} md={6}>
                <Card sx={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <CardContent sx={{ flex: 1, p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6">Calendar</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CheckCircleIcon sx={{ color: 'success.main', fontSize: 16 }} />
                          <Typography variant="caption">Streak Day</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CancelIcon sx={{ color: 'error.main', fontSize: 16 }} />
                          <Typography variant="caption">Missed Day</Typography>
                        </Box>
                      </Box>
                    </Box>
                    <Box sx={{ ...calendarStyles }}>
                      <Calendar
                        onChange={setSelectedDate}
                        value={selectedDate}
                        tileClassName={tileClassName}
                        tileContent={tileContent}
                      />
                    </Box>
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      mt: 2,
                      gap: 1
                    }}>
                      <FireIcon sx={{ color: 'warning.main' }} />
                      <Typography variant="h6" color="warning.main">
                        {streak} Day{streak !== 1 ? 's' : ''} Streak
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        {/* Streak Info Card */}
        <Grid item xs={12} sx={{ mt: 4 }}>
          <Card sx={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            height: '100%'
          }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ 
                borderBottom: '2px solid',
                borderColor: 'primary.main',
                pb: 1,
                mb: 2
              }}>
                Streak Information
              </Typography>
              <Box sx={{ 
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                p: 2,
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                borderRadius: 1
              }}>
                <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.primary' }}>
                  Keep up the great work! Track your meals daily to maintain your streak.
                </Typography>
                <Box sx={{ 
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                  mt: 1
                }}>
                  {[
                    'Complete all meals to increase your streak',
                    'Streak resets if you miss any meal',
                    'Green dates indicate successful diet days',
                    'Red dates indicate missed diet goals'
                  ].map((text, index) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          backgroundColor: 'success.main'
                        }}
                      />
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {text}
                      </Typography>
                    </Box>
                  ))}
                </Box>
                
                {/* Display last sync info */}
                <Box sx={{ mt: 1, mb: 1 }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem', mb: 1 }}>
                    {localStorage.getItem('migrationCompleted') 
                      ? 'Meal data synced in this session' 
                      : 'No meal sync performed yet'}
                  </Typography>
                </Box>
                
                {/* Add action buttons */}
                <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 1 }}>
                  {/* Sync Missing Meals button */}
                  <Button 
                    variant="outlined"
                    color="primary"
                    startIcon={<RestaurantIcon />}
                    onClick={() => {
                      if (auth.currentUser) {
                        migrationCompletedRef.current = false;
                        localStorage.removeItem('migrationCompleted');
                        migrateMealsFromProgress(auth.currentUser.uid);
                      }
                    }}
                    size="small"
                    disabled={loading}
                  >
                    Sync Meals
                  </Button>
                  
                  {/* Recalculate Streak button */}
                  <Button 
                    variant="outlined"
                    color="secondary"
                    startIcon={<FireIcon />}
                    onClick={recalculateStreak}
                    size="small"
                    disabled={loading}
                  >
                    Fix Streak
                  </Button>
                  
                  {/* Clear Cache button */}
                  <Button 
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={clearCache}
                    size="small"
                    disabled={loading}
                  >
                    Clear Cache
                  </Button>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Container>
    </Box>
  );
};

export default Dashboard; 