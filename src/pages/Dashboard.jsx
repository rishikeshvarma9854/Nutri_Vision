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
  Close as CloseIcon
} from '@mui/icons-material';
import Webcam from 'react-webcam';
import { db, auth } from '../firebase/config';
import { doc, setDoc, getDoc, collection, query, where, getDocs, orderBy, serverTimestamp, updateDoc, addDoc, arrayUnion, increment } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { API_ENDPOINTS, API_CONFIG } from '../config/api';
import { useAuth } from '../contexts/AuthContext';
import * as firebase from 'firebase/app';

const MEAL_ORDER = ['breakfast', 'lunch', 'snacks', 'dinner'];
const MEAL_TIMES = [
  { name: 'Breakfast', time: '6:00 AM - 11:00 AM' },
  { name: 'Lunch', time: '11:30 AM - 3:00 PM' },
  { name: 'Snacks', time: '3:30 PM - 7:00 PM' },
  { name: 'Dinner', time: '7:30 PM - 12:00 AM' }
];

// Utility function to format date as YYYY-MM-DD
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Dashboard = () => {
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
  const [todaysMeals, setTodaysMeals] = useState({});
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

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        if (!auth.currentUser) return;

        const userId = auth.currentUser.uid;
        const today = new Date().toISOString().split('T')[0];

        // Load saved meal status
        const savedStatus = localStorage.getItem(`mealStatus_${today}`);
        if (savedStatus) {
          setMealStatus(JSON.parse(savedStatus));
        }

        // Fetch user profile
        const userProfileRef = doc(db, 'userProfiles', userId);
        const userProfileDoc = await getDoc(userProfileRef);
        
        if (userProfileDoc.exists()) {
          const profileData = userProfileDoc.data();
          setUserProfile(profileData);
        }

        // Fetch diet plan for daily targets
        const dietPlanRef = doc(db, 'dietPlans', userId);
        const dietPlanDoc = await getDoc(dietPlanRef);
        
        if (dietPlanDoc.exists()) {
          const dietPlanData = dietPlanDoc.data();
          const dailyTargets = dietPlanData.dailyTargets || {
            breakfast: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            lunch: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            dinner: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            snacks: { calories: 0, protein: 0, carbs: 0, fats: 0 }
          };

          // Calculate total daily targets
          const totalDailyTargets = {
            calories: Object.values(dailyTargets).reduce((sum, meal) => sum + meal.calories, 0),
            protein: Object.values(dailyTargets).reduce((sum, meal) => sum + meal.protein, 0),
            carbs: Object.values(dailyTargets).reduce((sum, meal) => sum + meal.carbs, 0),
            fats: Object.values(dailyTargets).reduce((sum, meal) => sum + meal.fats, 0)
          };

          // Fetch current progress from Firestore
          const progressRef = doc(db, 'userProgress', userId);
          const progressDoc = await getDoc(progressRef);
          let currentProgress = {
            calories: 0,
            protein: 0,
            carbs: 0,
            fats: 0
          };

          if (progressDoc.exists()) {
            const progressData = progressDoc.data();
            if (progressData[today]) {
              currentProgress = {
                calories: progressData[today].calories || 0,
                protein: progressData[today].protein || 0,
                carbs: progressData[today].carbs || 0,
                fats: progressData[today].fats || 0
              };
            } else {
              // If no progress for today, create a new progress document
              await setDoc(progressRef, {
                [today]: {
                  calories: 0,
                  protein: 0,
                  carbs: 0,
                  fats: 0,
                  userId: userId,
                  lastUpdated: new Date().toISOString()
                }
              }, { merge: true });
            }
          } else {
            // If no progress document exists, create one
            await setDoc(progressRef, {
              [today]: {
                calories: 0,
                protein: 0,
                carbs: 0,
                fats: 0,
                userId: userId,
                lastUpdated: new Date().toISOString()
              }
            });
          }

          // Set daily progress with current values and targets
          setDailyProgress({
            calories: { current: currentProgress.calories, target: totalDailyTargets.calories },
            protein: { current: currentProgress.protein, target: totalDailyTargets.protein },
            carbs: { current: currentProgress.carbs, target: totalDailyTargets.carbs },
            fats: { current: currentProgress.fats, target: totalDailyTargets.fats }
          });

          // Set the diet plan with the meal-specific targets
          setDietPlan({
            recommendations: {
              dailyTargets: dailyTargets
            }
          });
        }

        // Fetch today's meals
        const mealsRef = doc(db, 'userMeals', userId);
        const mealsDoc = await getDoc(mealsRef);
        
        const meals = {};
        if (mealsDoc.exists()) {
          const todaysMealData = mealsDoc.data()[today] || [];
          
          // Make sure we're working with an array
          if (Array.isArray(todaysMealData)) {
            todaysMealData.forEach(meal => {
              const mealType = meal.mealType;
              if (!meals[mealType]) {
                meals[mealType] = {
                  calories: 0,
                  protein: 0,
                  carbs: 0,
                  fats: 0
                };
              }
              // Make sure we're accessing nutrition data correctly
              const nutrition = meal.nutrition || {};
              meals[mealType].calories += Number(nutrition.calories) || 0;
              meals[mealType].protein += Number(nutrition.protein) || 0;
              meals[mealType].carbs += Number(nutrition.carbs) || 0;
              meals[mealType].fats += Number(nutrition.fats) || 0;
            });
          }
        }

        // Update local state with accumulated values
        setTodaysMeals(meals);
        updateMealStatus(meals);

        // Update progress in Firestore with the correct totals
        const progressRef = doc(db, 'userProgress', userId);
        const totalProgress = {
          calories: 0,
          protein: 0,
          carbs: 0,
          fats: 0
        };

        // Calculate total progress across all meals
        Object.values(meals).forEach(meal => {
          totalProgress.calories += Number(meal.calories) || 0;
          totalProgress.protein += Number(meal.protein) || 0;
          totalProgress.carbs += Number(meal.carbs) || 0;
          totalProgress.fats += Number(meal.fats) || 0;
        });

        await setDoc(progressRef, {
          [today]: {
            ...totalProgress,
            lastUpdated: new Date().toISOString()
          }
        }, { merge: true });

      } catch (error) {
        console.error('Error fetching user data:', error);
        setError('Failed to load your data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();

    // Set up a timer to check for day change
    const checkDayChange = () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        checkAndUpdateStreak();
        fetchUserData();
      }
    };

    const dayChangeTimer = setInterval(checkDayChange, 60000);
    return () => clearInterval(dayChangeTimer);
  }, []);

  const calculateDailyTargets = (profile) => {
    // BMR calculation using Mifflin-St Jeor Equation
    const bmr = profile.gender === 'male'
      ? (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age) + 5
      : (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age) - 161;

    // Activity factor
    const activityFactors = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      veryActive: 1.9
    };

    const tdee = bmr * (activityFactors[profile.activityLevel] || 1.2);
    
    // Adjust based on goal
    let targetCalories = tdee;
    if (profile.goal === 'weightLoss') {
      targetCalories *= 0.8; // 20% deficit
    } else if (profile.goal === 'weightGain') {
      targetCalories *= 1.2; // 20% surplus
    }

    // Calculate macros
    const protein = profile.weight * (profile.goal === 'weightGain' ? 2.2 : 2); // g/kg
    const fats = (targetCalories * 0.25) / 9; // 25% of calories from fat
    const carbs = (targetCalories - (protein * 4) - (fats * 9)) / 4;

    // Meal distribution percentages
    const mealDistribution = {
      breakfast: 0.20, // 20% - Lighter breakfast
      lunch: 0.35,     // 35% - Main meal
      dinner: 0.30,    // 30% - Substantial dinner but lighter than lunch
      snacks: 0.15     // 15% - Divided between morning and afternoon snacks
    };

    // Distribute across meals with different ratios
    return {
      breakfast: {
        calories: Math.round(targetCalories * mealDistribution.breakfast),
        protein: Math.round(protein * mealDistribution.breakfast),
        carbs: Math.round(carbs * mealDistribution.breakfast),
        fats: Math.round(fats * mealDistribution.breakfast)
      },
      lunch: {
        calories: Math.round(targetCalories * mealDistribution.lunch),
        protein: Math.round(protein * mealDistribution.lunch),
        carbs: Math.round(carbs * mealDistribution.lunch),
        fats: Math.round(fats * mealDistribution.lunch)
      },
      dinner: {
        calories: Math.round(targetCalories * mealDistribution.dinner),
        protein: Math.round(protein * mealDistribution.dinner),
        carbs: Math.round(carbs * mealDistribution.dinner),
        fats: Math.round(fats * mealDistribution.dinner)
      },
      snacks: {
        calories: Math.round(targetCalories * mealDistribution.snacks),
        protein: Math.round(protein * mealDistribution.snacks),
        carbs: Math.round(carbs * mealDistribution.snacks),
        fats: Math.round(fats * mealDistribution.snacks)
      }
    };
  };

  const updateMealStatus = async (meals) => {
    const targets = {
      breakfast: { calories: 520, protein: 30, carbs: 65, fats: 15 },
      lunch: { calories: 520, protein: 30, carbs: 65, fats: 15 },
      snacks: { calories: 520, protein: 30, carbs: 65, fats: 15 },
      dinner: { calories: 520, protein: 30, carbs: 65, fats: 15 }
    };

    const newMealStatus = {};
    MEAL_ORDER.forEach(mealType => {
      const meal = meals[mealType] || { calories: 0, protein: 0, carbs: 0, fats: 0 };
      const target = targets[mealType];

      // Calculate progress percentages for each nutrient
      const progress = {
        calories: (meal.calories / target.calories) * 100,
        protein: (meal.protein / target.protein) * 100,
        carbs: (meal.carbs / target.carbs) * 100,
        fats: (meal.fats / target.fats) * 100
      };

      // A meal is complete if ANY of these conditions are met:
      // 1. Total calories reached 90% of target
      // 2. At least 2 nutrients (protein, carbs, fats) reached 90% of their targets
      const nutrientsReached90Percent = [
        progress.protein >= 90,
        progress.carbs >= 90,
        progress.fats >= 90
      ].filter(Boolean).length;

      newMealStatus[mealType] = progress.calories >= 90 || nutrientsReached90Percent >= 2;
    });

    // Save to localStorage
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(`mealStatus_${today}`, JSON.stringify(newMealStatus));
    setMealStatus(newMealStatus);

    console.log('Updated meal status:', newMealStatus); // Debug log
  };

  // Add this useEffect to load meal status on mount
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const savedStatus = localStorage.getItem(`mealStatus_${today}`);
    if (savedStatus) {
      setMealStatus(JSON.parse(savedStatus));
    }
  }, []);

  const updateMealProgress = async (mealType, nutrition) => {
    try {
      if (!auth.currentUser) return;

      const today = new Date().toISOString().split('T')[0];
      const mealRef = doc(db, 'userMeals', auth.currentUser.uid);
      
      // Store the meal in Firestore
      await setDoc(mealRef, {
        [today]: {
          [mealType]: {
            nutrition,
            timestamp: serverTimestamp()
          }
        }
      }, { merge: true });

      // Update local state
      const currentMeal = todaysMeals[mealType] || {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0
      };

      const updatedMeal = {
        calories: currentMeal.calories + (nutrition.calories || 0),
        protein: currentMeal.protein + (nutrition.protein || 0),
        carbs: currentMeal.carbs + (nutrition.carbs || 0),
        fats: currentMeal.fats + (nutrition.fats || 0)
      };

      const newTodaysMeals = {
        ...todaysMeals,
        [mealType]: updatedMeal
      };

      setTodaysMeals(newTodaysMeals);
      updateMealStatus(newTodaysMeals);

    } catch (error) {
      console.error('Error updating meal progress:', error);
      setError('Failed to update meal progress');
    }
  };

  const handlePrevTarget = () => {
    setActiveTargetIndex((prev) => (prev - 1 + MEAL_ORDER.length) % MEAL_ORDER.length);
  };

  const handleNextTarget = () => {
    setActiveTargetIndex((prev) => (prev + 1) % MEAL_ORDER.length);
  };

  const handleMealCheck = (meal) => {
    // Disable manual checking - meals are checked automatically based on progress
    return;
  };

  const checkCameraAvailability = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.log('MediaDevices API not available');
        setHasCamera(false);
        setCameraError('Camera API is not available in your browser');
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      if (videoDevices.length === 0) {
        setHasCamera(false);
        setCameraError('No camera found on this device');
        return;
      }

      setHasCamera(true);
    } catch (error) {
      console.error('Error checking camera:', error);
      setHasCamera(false);
      setCameraError('Failed to check camera availability');
    }
  }, []);

  useEffect(() => {
    checkCameraAvailability();
  }, [checkCameraAvailability]);

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

  const processImage = async (imageFile) => {
    try {
      setIsProcessing(true);
      setError(null);

      // Validate file before sending
      if (!imageFile || !(imageFile instanceof File)) {
        throw new Error('Invalid image file');
      }

      // Validate that it's an image file
      if (!imageFile.type.startsWith('image/')) {
        throw new Error('Please upload an image file');
      }

      // Create FormData and append the image with its original format
      const formData = new FormData();
      formData.append('image', imageFile);

      console.log('Sending request to detect food:', API_ENDPOINTS.DETECT);
      console.log('Image file being sent:', imageFile.name, imageFile.type, imageFile.size);
      
      let response;
      try {
        response = await fetch(API_ENDPOINTS.DETECT, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Server error response:', errorText);
          throw new Error(`Server error: ${errorText}`);
        }

        const responseData = await response.json();
        console.log('Detection response:', responseData);

        if (!responseData.predictions || responseData.predictions.length === 0) {
          throw new Error('No food detected in the image');
        }

        // Display captured image
        setCapturedImage(URL.createObjectURL(imageFile));

        // Get all predictions sorted by confidence
        const sortedPredictions = [...responseData.predictions].sort((a, b) => b.confidence - a.confidence);
        const bestPrediction = sortedPredictions[0];

        // Show warning for low confidence but continue processing
        if (bestPrediction.confidence < 0.1) {
          setError('Warning: Low confidence in food detection. Results may not be accurate.');
        }

        // Get nutrition data for the detected food
        const foodName = bestPrediction.label;
        console.log('Getting nutrition for:', foodName);
        
        const nutritionResponse = await fetch(API_ENDPOINTS.GET_NUTRITION, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            food_name: foodName,
            serving_size: 1
          })
        });

        if (!nutritionResponse.ok) {
          const nutritionError = await nutritionResponse.text();
          console.error('Nutrition API error:', nutritionError);
          throw new Error('Failed to get nutrition information');
        }

        const nutritionData = await nutritionResponse.json();
        console.log('Nutrition data:', nutritionData);

        // Create the final result object
        const finalResult = {
          predictions: sortedPredictions,
          selectedFood: {
            name: foodName,
            confidence: bestPrediction.confidence
          },
          nutrition: nutritionData
        };

        // Always show the prediction result
        setPredictionResult(finalResult);
        setDetectedFood({
          name: foodName,
          confidence: bestPrediction.confidence,
          nutrition: nutritionData
        });

        // Add to meal log if confidence is above 10%
        if (bestPrediction.confidence >= 0.1) {
          await handleAddMeal(finalResult);
        }

      } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        throw fetchError;
      }

    } catch (error) {
      console.error('Error processing image:', error);
      setError(error.message || 'Failed to process image');
      // Clear the captured image if there's an error
      setCapturedImage(null);
      setPredictionResult(null);
      setDetectedFood(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddMeal = async (result) => {
    if (!currentUser) {
      console.error('No user logged in');
      return;
    }

    try {
      const now = new Date();
      const currentHour = now.getHours() + now.getMinutes() / 60;
      const today = new Date().toISOString().split('T')[0];
      
      // Determine meal type based on time
      let mealType;
      if (currentHour >= 6 && currentHour < 11) {
        mealType = 'breakfast';
      } else if (currentHour >= 11.5 && currentHour < 15) {
        mealType = 'lunch';
      } else if (currentHour >= 15.5 && currentHour < 19) {
        mealType = 'snacks';
      } else if (currentHour >= 19.5 || currentHour < 0) {
        mealType = 'dinner';
      } else {
        mealType = 'snacks'; // Default to snacks for any other time
      }

      console.log('Current hour:', currentHour, 'Meal type:', mealType);

      // Get existing meals first
      const userMealsRef = doc(db, 'userMeals', currentUser.uid);
      const mealDoc = await getDoc(userMealsRef);
      const existingData = mealDoc.exists() ? mealDoc.data() : {};
      const todaysMealArray = existingData[today] || [];

      // Create new meal data
      const mealData = {
        foodItems: [result.selectedFood.name],
        timestamp: new Date().toISOString(),
        mealType: mealType,
        nutrition: result.nutrition,
        confidence: result.selectedFood.confidence
      };

      // Update Firestore with new meal
      await setDoc(userMealsRef, {
        ...existingData,
        [today]: [...todaysMealArray, mealData]
      });

      // Update progress in Firestore
      const progressRef = doc(db, 'userProgress', currentUser.uid);
      const progressDoc = await getDoc(progressRef);
      const currentProgress = progressDoc.exists() ? (progressDoc.data()[today] || {}) : {};

      const updatedProgress = {
        calories: (currentProgress.calories || 0) + result.nutrition.calories,
        protein: (currentProgress.protein || 0) + result.nutrition.protein,
        carbs: (currentProgress.carbs || 0) + result.nutrition.carbs,
        fats: (currentProgress.fats || 0) + result.nutrition.fats,
        lastUpdated: new Date().toISOString()
      };

      await setDoc(progressRef, {
        [today]: updatedProgress
      }, { merge: true });

      // Update local state with accumulated values
      const updatedMeals = { ...todaysMeals };
      if (!updatedMeals[mealType]) {
        updatedMeals[mealType] = {
          calories: 0,
          protein: 0,
          carbs: 0,
          fats: 0
        };
      }
      updatedMeals[mealType].calories += result.nutrition.calories;
      updatedMeals[mealType].protein += result.nutrition.protein;
      updatedMeals[mealType].carbs += result.nutrition.carbs;
      updatedMeals[mealType].fats += result.nutrition.fats;

      setTodaysMeals(updatedMeals);
      updateMealStatus(updatedMeals);

      // Don't clear states immediately
      setTimeout(() => {
        setCapturedImage(null);
        setPredictionResult(null);
        setDetectedFood(null);
        setError(null);
        deactivateCamera();
      }, 5000); // Show result for 5 seconds

      console.log('Meal logged successfully with type:', mealType);

    } catch (err) {
      console.error('Error logging meal:', err);
      setError('Failed to log meal. Please try again.');
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
    if (!dietPlan?.recommendations?.dailyTargets) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Loading daily targets...</Typography>
        </Box>
      );
    }

    const mealType = MEAL_ORDER[activeTargetIndex];
    const targets = {
      calories: 520,
      protein: 30,
      carbs: 65,
      fats: 15
    };
    
    // Get the accumulated values for this meal type
    const meal = todaysMeals[mealType] || { calories: 0, protein: 0, carbs: 0, fats: 0 };
    
    // Calculate progress percentages
    const progress = {
      calories: (meal.calories / targets.calories) * 100 || 0,
      protein: (meal.protein / targets.protein) * 100 || 0,
      carbs: (meal.carbs / targets.carbs) * 100 || 0,
      fats: (meal.fats / targets.fats) * 100 || 0,
    };

    return (
      <Box sx={{ position: 'relative', width: '100%' }}>
        <Typography variant="h6" gutterBottom>
          Daily Targets
        </Typography>
        
        <Box sx={{ position: 'relative', minHeight: '300px', width: '100%' }}>
          <Card sx={{ width: '100%', p: 2 }}>
            <Stack spacing={3} sx={{ width: '100%' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" color="primary">
                  {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {MEAL_TIMES[activeTargetIndex].time}
                </Typography>
              </Stack>

              <Stack spacing={2.5} sx={{ width: '100%' }}>
                <Box sx={{ width: '100%' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="body2">Calories</Typography>
                    <Typography variant="body2">{Math.round(meal.calories)}/{targets.calories} kcal</Typography>
                  </Stack>
                  <LinearProgress 
                    variant="determinate" 
                    value={Math.min(progress.calories, 100)}
                    sx={{ height: 8, borderRadius: 4, width: '100%' }}
                  />
                </Box>

                <Box sx={{ width: '100%' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="body2">Protein</Typography>
                    <Typography variant="body2">{Math.round(meal.protein)}/{targets.protein}g</Typography>
                  </Stack>
                  <LinearProgress 
                    variant="determinate" 
                    value={Math.min(progress.protein, 100)}
                    sx={{ height: 8, borderRadius: 4, width: '100%' }}
                    color="success"
                  />
                </Box>

                <Box sx={{ width: '100%' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="body2">Carbs</Typography>
                    <Typography variant="body2">{Math.round(meal.carbs)}/{targets.carbs}g</Typography>
                  </Stack>
                  <LinearProgress 
                    variant="determinate" 
                    value={Math.min(progress.carbs, 100)}
                    sx={{ height: 8, borderRadius: 4, width: '100%' }}
                    color="warning"
                  />
                </Box>

                <Box sx={{ width: '100%' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="body2">Fats</Typography>
                    <Typography variant="body2">{Math.round(meal.fats)}/{targets.fats}g</Typography>
                  </Stack>
                  <LinearProgress 
                    variant="determinate" 
                    value={Math.min(progress.fats, 100)}
                    sx={{ height: 8, borderRadius: 4, width: '100%' }}
                    color="error"
                  />
                </Box>
              </Stack>
            </Stack>
          </Card>

          {/* Navigation Controls */}
          <Stack
            direction="row"
            spacing={2}
            justifyContent="center"
            alignItems="center"
            sx={{ mt: 2 }}
          >
            <IconButton
              onClick={handlePrevTarget}
              size="small"
              sx={{
                bgcolor: 'background.paper',
                boxShadow: 1,
                '&:hover': { bgcolor: 'grey.100' }
              }}
            >
              <ChevronLeftIcon />
            </IconButton>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
            >
              {MEAL_ORDER.map((_, index) => (
                <Box
                  key={index}
                  onClick={() => setActiveTargetIndex(index)}
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: index === activeTargetIndex ? 'primary.main' : 'grey.300',
                    cursor: 'pointer',
                    transition: 'all 0.3s'
                  }}
                />
              ))}
            </Stack>

            <IconButton
              onClick={handleNextTarget}
              size="small"
              sx={{
                bgcolor: 'background.paper',
                boxShadow: 1,
                '&:hover': { bgcolor: 'grey.100' }
              }}
            >
              <ChevronRightIcon />
            </IconButton>
          </Stack>
        </Box>
      </Box>
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

      // Only check after dinner time (after 12 AM)
      if (hour < 0) return;

      // Check if all meals are completed
      const allMealsCompleted = MEAL_ORDER.every(meal => mealStatus[meal]);
      
      // Get current streak from Firestore
      const streakRef = doc(db, 'userStreaks', userId);
      let streakDoc;
      
      try {
        streakDoc = await getDoc(streakRef);
      } catch (error) {
        console.error('Error reading streak document:', error);
        // Initialize with default values if read fails
        streakDoc = { exists: () => false };
      }
      
      let currentStreak = 0;
      let history = {};
      
      if (streakDoc.exists()) {
        const data = streakDoc.data();
        currentStreak = data.currentStreak || 0;
        history = data.history || {};
      }

      // Update streak and history
      if (allMealsCompleted) {
        currentStreak += 1;
        history[today] = true;
      } else {
        currentStreak = 0;
        history[today] = false;
      }

      // Try to update Firestore
      try {
        await setDoc(streakRef, {
          currentStreak,
          history,
          lastUpdated: new Date().toISOString(),
          userId
        });

        // Only update local state if Firestore update succeeds
        setStreak(currentStreak);
        setDietHistory(history);
      } catch (error) {
        console.error('Error updating streak document:', error);
        // Continue without crashing if update fails
      }

    } catch (error) {
      console.error('Error in checkAndUpdateStreak:', error);
      // Continue without crashing
    }
  };

  // Add this useEffect to fetch historical streak data
  useEffect(() => {
    const fetchHistoricalStreakData = async () => {
      if (!currentUser) return;

      try {
        // Get all progress data
        const progressRef = doc(db, 'userProgress', currentUser.uid);
        const progressDoc = await getDoc(progressRef);
        const progressData = progressDoc.data() || {};

        const completed = [];
        const missed = [];

        // Process each date in the progress data
        Object.entries(progressData).forEach(([date, data]) => {
          // Skip if not a date entry
          if (date === 'dailyProgress' || date === 'userId' || date === 'createdAt' || !data) return;

          // Check if the date has valid nutrition values
          if (data.calories > 0 && data.protein > 0 && data.carbs > 0 && data.fats > 0) {
            completed.push(date);
          } else {
            missed.push(date);
          }
        });

        console.log('Setting completed dates:', completed);
        console.log('Setting missed dates:', missed);
        
        setCompletedDates(completed);
        setMissedDates(missed);
      } catch (error) {
        console.error('Error fetching historical streak data:', error);
      }
    };

    fetchHistoricalStreakData();
  }, [currentUser]);

  // Add this function at the top level of the component
  const fetchHistoricalData = async (userId) => {
    try {
      // Get all meals data
      const mealsRef = doc(db, 'userMeals', userId);
      const mealsDoc = await getDoc(mealsRef);
      const mealsData = mealsDoc.data() || {};

      // Get all progress data
      const progressRef = doc(db, 'userProgress', userId);
      const progressDoc = await getDoc(progressRef);
      const progressData = progressDoc.data() || {};

      const completed = [];
      const missed = [];

      // Process each date
      Object.entries(progressData).forEach(([date, data]) => {
        // Skip non-date entries
        if (date === 'dailyProgress' || date === 'userId' || date === 'createdAt' || !data) return;

        // Get meals for this date
        const mealsForDate = mealsData[date] || [];
        const mealTypes = new Set(mealsForDate.map(meal => meal.mealType));

        // Check if all required meals are present and have nutrition values
        if (data.calories > 0 && data.protein > 0 && data.carbs > 0 && data.fats > 0 && mealTypes.size >= 3) {
          completed.push(date);
          console.log('Marked as completed:', date);
        } else {
          missed.push(date);
          console.log('Marked as missed:', date);
        }
      });

      console.log('Completed dates:', completed);
      console.log('Missed dates:', missed);

      return { completed, missed };
    } catch (error) {
      console.error('Error fetching historical data:', error);
      return { completed: [], missed: [] };
    }
  };

  // Update the useEffect that handles user authentication
  useEffect(() => {
    const loadUserData = async (user) => {
      if (!user) {
        navigate('/login');
        return;
      }

      try {
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
  const renderDay = (day) => {
    const dateStr = day.toISOString().split('T')[0];
    const isToday = dateStr === new Date().toISOString().split('T')[0];
    const isCompleted = completedDates.includes(dateStr);
    const isMissed = missedDates.includes(dateStr);
    
    // Debug logs
    if (isCompleted || isMissed) {
      console.log('Rendering date:', dateStr, { isCompleted, isMissed });
    }

    return (
      <Box
        key={dateStr}
        sx={{
          position: 'relative',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '&::after': {
            content: '""',
            position: 'absolute',
            bottom: 0,
            left: '10%',
            right: '10%',
            height: '3px',
            backgroundColor: isCompleted ? '#4CAF50' : isMissed ? '#f44336' : 'transparent'
          }
        }}
      >
        <Typography 
          variant="body2" 
          align="center"
          sx={{
            color: isToday ? 'primary.main' : 'text.primary',
            fontWeight: isToday ? 'bold' : 'normal'
          }}
        >
          {day.getDate()}
        </Typography>
      </Box>
    );
  };

  const renderPredictionResult = () => {
    if (!predictionResult || !detectedFood) return null;

    return (
      <Box sx={{ mt: 2 }}>
        {error && (
          <Alert 
            severity={error.includes('Warning:') ? 'warning' : 'error'}
            sx={{ mb: 2 }}
          >
            {error}
          </Alert>
        )}
        <Typography variant="h6" gutterBottom>
          Detected Food: {detectedFood.name}
        </Typography>
        <Typography variant="body2" gutterBottom color="text.secondary">
          Confidence: {(detectedFood.confidence * 100).toFixed(1)}%
        </Typography>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={3}>
            <Typography variant="body2" color="text.secondary">Calories</Typography>
            <Typography variant="h6">{detectedFood.nutrition.calories}</Typography>
          </Grid>
          <Grid item xs={3}>
            <Typography variant="body2" color="text.secondary">Protein</Typography>
            <Typography variant="h6">{detectedFood.nutrition.protein}g</Typography>
          </Grid>
          <Grid item xs={3}>
            <Typography variant="body2" color="text.secondary">Carbs</Typography>
            <Typography variant="h6">{detectedFood.nutrition.carbs}g</Typography>
          </Grid>
          <Grid item xs={3}>
            <Typography variant="body2" color="text.secondary">Fats</Typography>
            <Typography variant="h6">{detectedFood.nutrition.fats}g</Typography>
          </Grid>
        </Grid>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button variant="contained" onClick={() => setError(null)}>
          Try Again
        </Button>
      </Container>
    );
  }

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
                  height: '100%'
                }}>
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      mb: 1,
                      backgroundColor: 'primary.light',
                      p: 2,
                      borderRadius: 1
                    }}>
                      <FireIcon sx={{ color: '#ff6b6b', mr: 1, fontSize: 28 }} />
                      <Box>
                        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 600 }}>
                          Current Streak: {streak} days
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                          Next milestone: {streak + (5 - (streak % 5))} days
                        </Typography>
                      </Box>
                    </Box>
                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                      <StaticDatePicker
                        displayStaticWrapperAs="desktop"
                        openTo="day"
                        value={selectedDate}
                        onChange={(newDate) => setSelectedDate(newDate)}
                        renderDay={renderDay}
                        sx={{
                          width: '100%',
                          '& .MuiPickersCalendarHeader-root': {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            pl: 2,
                            pr: 2
                          },
                          '& .MuiPickersCalendarHeader-label': {
                            fontSize: '1rem',
                            fontWeight: 500
                          },
                          '& .MuiPickersDay-root': {
                            fontSize: '0.9rem',
                            margin: '2px',
                            height: 36,
                            width: 36
                          },
                          '& .MuiPickersDay-today': {
                            border: '2px solid',
                            borderColor: 'primary.main'
                          }
                        }}
                      />
                    </LocalizationProvider>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Grid>

          {/* Bottom Row - Today's Meals and Streak Info */}
          <Grid item xs={12}>
            <Grid container spacing={2}>
              {/* Today's Meals Card */}
              <Grid item xs={12} md={6}>
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
                      Today's Meals
                    </Typography>
                    <Grid container spacing={2} sx={{ mt: 0 }}>
                      {MEAL_ORDER.map((meal) => (
                        <Grid item xs={6} sm={3} key={meal}>
                          <Card
                            elevation={mealStatus[meal] ? 3 : 1}
                            sx={{
                              cursor: 'pointer',
                              bgcolor: mealStatus[meal] ? 'primary.light' : 'background.paper',
                              transition: 'all 0.3s',
                              '&:hover': { transform: 'scale(1.02)' },
                              border: mealStatus[meal] ? '2px solid' : '1px solid',
                              borderColor: mealStatus[meal] ? 'primary.main' : 'grey.300',
                              height: '100%'
                            }}
                          >
                            <CardContent sx={{ p: '16px !important', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                              <Typography
                                variant="subtitle1"
                                sx={{ 
                                  textTransform: 'capitalize',
                                  fontWeight: mealStatus[meal] ? 600 : 400,
                                  color: mealStatus[meal] ? 'primary.main' : 'text.primary',
                                  mb: 1
                                }}
                              >
                                {meal}
                              </Typography>
                              <CheckCircleIcon
                                color={mealStatus[meal] ? 'primary' : 'disabled'}
                                sx={{ fontSize: 32 }}
                              />
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>

              {/* Streak Info Card */}
              <Grid item xs={12} md={6}>
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
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default Dashboard; 