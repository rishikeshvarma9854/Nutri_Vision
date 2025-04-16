import { db } from '../config';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';

const PROGRESS_THRESHOLD = 0.85; // 85% threshold for meal completion

// Helper function to calculate nutrient totals
const calculateNutrientTotals = (meals) => {
  return meals.reduce((acc, meal) => ({
    calories: acc.calories + (meal.calories || 0),
    protein: acc.protein + (meal.protein || 0),
    carbs: acc.carbs + (meal.carbs || 0),
    fats: acc.fats + (meal.fats || 0)
  }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
};

// Helper function to check if progress meets threshold
const meetsProgressThreshold = (current, target) => {
  if (!target || target === 0) return false;
  return (current / target) >= PROGRESS_THRESHOLD;
};

// Update user progress when a meal is added
export const updateUserProgress = async (userId, date, mealType, mealData) => {
  try {
    await runTransaction(db, async (transaction) => {
      // 1. Update userMeals
      const mealsRef = doc(db, 'userMeals', userId);
      const mealsDoc = await transaction.get(mealsRef);
      
      if (!mealsDoc.exists()) {
        transaction.set(mealsRef, {
          [date]: {
            [mealType]: [mealData]
          }
        });
      } else {
        const existingMeals = mealsDoc.data()[date] || {};
        const existingMealType = existingMeals[mealType] || [];
        
        transaction.update(mealsRef, {
          [`${date}.${mealType}`]: [...existingMealType, mealData]
        });
      }

      // 2. Update userProgress
      const progressRef = doc(db, 'userProgress', userId);
      const progressDoc = await transaction.get(progressRef);
      
      const nutrientTotals = calculateNutrientTotals([mealData]);
      
      if (!progressDoc.exists()) {
        // Get targets from dietPlan
        const dietPlanRef = doc(db, 'dietPlan', userId);
        const dietPlanDoc = await transaction.get(dietPlanRef);
        const targets = dietPlanDoc.exists() ? dietPlanDoc.data().recommendations.dailyTargets[mealType] : {};
        
        transaction.set(progressRef, {
          [date]: {
            current: nutrientTotals,
            targets: targets
          }
        });
      } else {
        const existingProgress = progressDoc.data()[date] || { current: {}, targets: {} };
        
        transaction.update(progressRef, {
          [`${date}.current`]: {
            calories: (existingProgress.current.calories || 0) + nutrientTotals.calories,
            protein: (existingProgress.current.protein || 0) + nutrientTotals.protein,
            carbs: (existingProgress.current.carbs || 0) + nutrientTotals.carbs,
            fats: (existingProgress.current.fats || 0) + nutrientTotals.fats
          }
        });
      }

      // 3. Update userMealStatus
      const mealStatusRef = doc(db, 'userMealStatus', userId);
      const mealStatusDoc = await transaction.get(mealStatusRef);
      
      const progressDocAfter = await transaction.get(progressRef);
      const currentProgress = progressDocAfter.data()[date]?.current || {};
      const targets = progressDocAfter.data()[date]?.targets || {};
      
      const isComplete = meetsProgressThreshold(
        currentProgress[mealType === 'snacks' ? 'calories' : mealType],
        targets[mealType === 'snacks' ? 'calories' : mealType]
      );
      
      if (!mealStatusDoc.exists()) {
        transaction.set(mealStatusRef, {
          [date]: {
            meals: {
              breakfast: false,
              lunch: false,
              dinner: false,
              snacks: false,
              [mealType]: isComplete
            }
          }
        });
      } else {
        transaction.update(mealStatusRef, {
          [`${date}.meals.${mealType}`]: isComplete
        });
      }

      // 4. Update userStreaks if all meals are complete
      const mealStatusDocAfter = await transaction.get(mealStatusRef);
      const allMealsComplete = Object.values(mealStatusDocAfter.data()[date]?.meals || {}).every(Boolean);
      
      if (allMealsComplete) {
        const streaksRef = doc(db, 'userStreaks', userId);
        const streaksDoc = await transaction.get(streaksRef);
        
        if (!streaksDoc.exists()) {
          transaction.set(streaksRef, {
            currentStreak: 1,
            lastCompletedDay: date,
            lastUpdated: serverTimestamp(),
            history: {
              [date]: true
            }
          });
        } else {
          const lastDate = new Date(streaksDoc.data().lastCompletedDay);
          const currentDate = new Date(date);
          const dayDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
          
          let newStreak = streaksDoc.data().currentStreak;
          if (dayDiff === 1) {
            newStreak += 1;
          } else if (dayDiff > 1) {
            newStreak = 1;
          }
          
          transaction.update(streaksRef, {
            currentStreak: newStreak,
            lastCompletedDay: date,
            lastUpdated: serverTimestamp(),
            [`history.${date}`]: true
          });
        }
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error updating user progress:', error);
    return false;
  }
};

// Update user progress when a meal is deleted
export const deleteMealAndUpdateProgress = async (userId, date, mealType, mealId) => {
  try {
    await runTransaction(db, async (transaction) => {
      // 1. Delete from userMeals
      const mealsRef = doc(db, 'userMeals', userId);
      const mealsDoc = await transaction.get(mealsRef);
      
      if (mealsDoc.exists()) {
        const existingMeals = mealsDoc.data()[date] || {};
        const existingMealType = existingMeals[mealType] || [];
        const updatedMeals = existingMealType.filter(meal => meal.id !== mealId);
        
        transaction.update(mealsRef, {
          [`${date}.${mealType}`]: updatedMeals
        });

        // 2. Update userProgress
        const progressRef = doc(db, 'userProgress', userId);
        const progressDoc = await transaction.get(progressRef);
        
        if (progressDoc.exists()) {
          const existingProgress = progressDoc.data()[date] || { current: {} };
          const deletedMeal = existingMealType.find(meal => meal.id === mealId);
          
          if (deletedMeal) {
            const nutrientTotals = calculateNutrientTotals([deletedMeal]);
            
            transaction.update(progressRef, {
              [`${date}.current`]: {
                calories: Math.max(0, (existingProgress.current.calories || 0) - nutrientTotals.calories),
                protein: Math.max(0, (existingProgress.current.protein || 0) - nutrientTotals.protein),
                carbs: Math.max(0, (existingProgress.current.carbs || 0) - nutrientTotals.carbs),
                fats: Math.max(0, (existingProgress.current.fats || 0) - nutrientTotals.fats)
              }
            });
          }
        }

        // 3. Update userMealStatus
        const mealStatusRef = doc(db, 'userMealStatus', userId);
        const progressDocAfter = await transaction.get(progressRef);
        const currentProgress = progressDocAfter.data()[date]?.current || {};
        const targets = progressDocAfter.data()[date]?.targets || {};
        
        const isComplete = meetsProgressThreshold(
          currentProgress[mealType === 'snacks' ? 'calories' : mealType],
          targets[mealType === 'snacks' ? 'calories' : mealType]
        );
        
        transaction.update(mealStatusRef, {
          [`${date}.meals.${mealType}`]: isComplete
        });

        // 4. Update userStreaks if needed
        const mealStatusDocAfter = await transaction.get(mealStatusRef);
        const allMealsComplete = Object.values(mealStatusDocAfter.data()[date]?.meals || {}).every(Boolean);
        
        if (!allMealsComplete) {
          const streaksRef = doc(db, 'userStreaks', userId);
          transaction.update(streaksRef, {
            [`history.${date}`]: false
          });
        }
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error deleting meal and updating progress:', error);
    return false;
  }
};

// Get user progress for a specific date
export const getUserProgress = async (userId, date) => {
  try {
    const progressRef = doc(db, 'userProgress', userId);
    const progressDoc = await getDoc(progressRef);
    
    if (!progressDoc.exists()) {
      return null;
    }
    
    return progressDoc.data()[date] || null;
  } catch (error) {
    console.error('Error getting user progress:', error);
    return null;
  }
};

// Get user meals for a specific date
export const getUserMeals = async (userId, date) => {
  try {
    const mealsRef = doc(db, 'userMeals', userId);
    const mealsDoc = await getDoc(mealsRef);
    
    if (!mealsDoc.exists()) {
      return null;
    }
    
    return mealsDoc.data()[date] || null;
  } catch (error) {
    console.error('Error getting user meals:', error);
    return null;
  }
};

// Get user meal status for a specific date
export const getUserMealStatus = async (userId, date) => {
  try {
    const mealStatusRef = doc(db, 'userMealStatus', userId);
    const mealStatusDoc = await getDoc(mealStatusRef);
    
    if (!mealStatusDoc.exists()) {
      return null;
    }
    
    return mealStatusDoc.data()[date] || null;
  } catch (error) {
    console.error('Error getting user meal status:', error);
    return null;
  }
};

// Get user streaks
export const getUserStreaks = async (userId) => {
  try {
    const streaksRef = doc(db, 'userStreaks', userId);
    const streaksDoc = await getDoc(streaksRef);
    
    if (!streaksDoc.exists()) {
      return null;
    }
    
    return streaksDoc.data();
  } catch (error) {
    console.error('Error getting user streaks:', error);
    return null;
  }
}; 