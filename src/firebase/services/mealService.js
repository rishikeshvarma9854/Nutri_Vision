import { db, storage } from '../config';
import { 
  collection,
  doc, 
  setDoc,
  addDoc, 
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';

// Create meal log
export const createMealLog = async (userId, mealData, imageFile) => {
  try {
    let imageUrl = '';
    if (imageFile) {
      const imageRef = ref(storage, `meal-images/${userId}/${uuidv4()}`);
      await uploadBytes(imageRef, imageFile);
      imageUrl = await getDownloadURL(imageRef);
    }

    const mealLogRef = collection(db, 'mealLogs');
    const newMealLog = await addDoc(mealLogRef, {
      user_id: userId,
      meal_type: mealData.mealType,
      date: mealData.date || serverTimestamp(),
      image_url: imageUrl,
      created_at: serverTimestamp()
    });

    return newMealLog.id;
  } catch (error) {
    console.error('Error creating meal log:', error);
    throw error;
  }
};

// Create food detection record
export const createFoodDetection = async (detectionData) => {
  try {
    const detectionRef = collection(db, 'foodDetection');
    const newDetection = await addDoc(detectionRef, {
      detection_id: uuidv4(),
      meal_log_id: detectionData.mealLogId,
      custom_food_id: detectionData.customFoodId || null,
      usda_food_id: detectionData.usdaFoodId,
      confidence_score: detectionData.confidenceScore,
      portion_size: detectionData.portionSize,
      weight_estimate: detectionData.weightEstimate,
      volume_estimation: detectionData.volumeEstimation,
      features: detectionData.features || [],
      created_at: serverTimestamp()
    });

    return newDetection.id;
  } catch (error) {
    console.error('Error creating food detection:', error);
    throw error;
  }
};

// Get user's meal logs for a specific date
export const getMealLogs = async (userId, date) => {
  try {
    const mealLogsRef = collection(db, 'mealLogs');
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      mealLogsRef,
      where('user_id', '==', userId),
      where('date', '>=', startOfDay),
      where('date', '<=', endOfDay),
      orderBy('date', 'asc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting meal logs:', error);
    throw error;
  }
};

// Get food detection details
export const getFoodDetection = async (detectionId) => {
  try {
    const detectionRef = doc(db, 'foodDetection', detectionId);
    const detectionSnap = await getDoc(detectionRef);
    return detectionSnap.exists() ? detectionSnap.data() : null;
  } catch (error) {
    console.error('Error getting food detection:', error);
    throw error;
  }
};

// Get food detections for a meal log
export const getMealFoodDetections = async (mealLogId) => {
  try {
    const detectionsRef = collection(db, 'foodDetection');
    const q = query(
      detectionsRef,
      where('meal_log_id', '==', mealLogId),
      orderBy('created_at', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting meal food detections:', error);
    throw error;
  }
};

// Log a meal
export const logMeal = async (userId, mealData) => {
  try {
    const { mealType, calories, protein, carbs, fats, foods, imageUrl } = mealData;
    
    // Add meal log
    await addDoc(collection(db, 'mealLogs'), {
      userId,
      mealType,
      calories,
      protein,
      carbs,
      fats,
      foods,
      imageUrl,
      timestamp: serverTimestamp()
    });

    // Update user progress
    await updateDailyProgress(userId);

    return true;
  } catch (error) {
    console.error('Error logging meal:', error);
    throw error;
  }
};

// Get today's meals
export const getTodaysMeals = async (userId) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const mealsQuery = query(
      collection(db, 'mealLogs'),
      where('userId', '==', userId),
      where('timestamp', '>=', today),
      where('timestamp', '<', tomorrow),
      orderBy('timestamp', 'asc')
    );

    const snapshot = await getDocs(mealsQuery);
    const meals = {};
    snapshot.forEach((doc) => {
      const meal = doc.data();
      meals[meal.mealType] = meal;
    });

    return meals;
  } catch (error) {
    console.error('Error getting today\'s meals:', error);
    throw error;
  }
};

// Update daily progress
export const updateDailyProgress = async (userId) => {
  try {
    const meals = await getTodaysMeals(userId);
    const dietPlanDoc = await getDoc(doc(db, 'dietPlans', userId));
    const targets = dietPlanDoc.data()?.recommendations?.dailyTargets;

    if (!targets) return;

    let totalProgress = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0
    };

    // Calculate total progress
    Object.values(meals).forEach((meal) => {
      totalProgress.calories += meal.calories || 0;
      totalProgress.protein += meal.protein || 0;
      totalProgress.carbs += meal.carbs || 0;
      totalProgress.fats += meal.fats || 0;
    });

    // Check if all meals are completed within their time windows
    const allMealsCompleted = ['breakfast', 'lunch', 'snacks', 'dinner'].every(
      mealType => meals[mealType] && isWithinTimeWindow(mealType, meals[mealType].timestamp)
    );

    // Update streak if all meals are completed
    if (allMealsCompleted) {
      await updateStreak(userId, true);
    }

    // Store progress
    await addDoc(collection(db, 'userProgress'), {
      userId,
      date: new Date(),
      progress: totalProgress,
      targets: targets.total,
      completed: allMealsCompleted,
      timestamp: serverTimestamp()
    });

    return totalProgress;
  } catch (error) {
    console.error('Error updating daily progress:', error);
    throw error;
  }
};

// Check if meal is within its time window
const isWithinTimeWindow = (mealType, timestamp) => {
  if (!timestamp) return false;

  const mealTime = new Date(timestamp.seconds * 1000);
  const hours = mealTime.getHours();
  const minutes = mealTime.getMinutes();
  const time = hours * 60 + minutes;

  const windows = {
    breakfast: { start: 6 * 60, end: 9 * 60 }, // 6:00 AM - 9:00 AM
    lunch: { start: 12 * 60, end: 14 * 60 }, // 12:00 PM - 2:00 PM
    snacks: [
      { start: 10 * 60, end: 11 * 60 }, // 10:00 AM - 11:00 AM
      { start: 15 * 60, end: 16 * 60 }  // 3:00 PM - 4:00 PM
    ],
    dinner: { start: 18 * 60, end: 20 * 60 } // 6:00 PM - 8:00 PM
  };

  if (mealType === 'snacks') {
    return windows.snacks.some(window => 
      time >= window.start && time <= window.end
    );
  }

  const window = windows[mealType];
  return time >= window.start && time <= window.end;
};

// Update user streak
export const updateStreak = async (userId, completed) => {
  try {
    const userDoc = await getDoc(doc(db, 'userProfiles', userId));
    const currentStreak = userDoc.data()?.streak || 0;
    const lastUpdate = userDoc.data()?.lastStreakUpdate?.toDate() || new Date(0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let newStreak = currentStreak;

    if (completed) {
      if (lastUpdate.getTime() === yesterday.getTime()) {
        // Consecutive day, increment streak
        newStreak++;
      } else if (lastUpdate.getTime() < yesterday.getTime()) {
        // Streak broken, start new streak
        newStreak = 1;
      }
      // If same day, keep current streak

      await updateDoc(doc(db, 'userProfiles', userId), {
        streak: newStreak,
        lastStreakUpdate: serverTimestamp()
      });
    }

    return newStreak;
  } catch (error) {
    console.error('Error updating streak:', error);
    throw error;
  }
}; 