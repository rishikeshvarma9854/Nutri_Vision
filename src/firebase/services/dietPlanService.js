import { db } from '../config';
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
import { v4 as uuidv4 } from 'uuid';

// Create diet plan
export const createDietPlan = async (userId, planData) => {
  try {
    const dietPlanRef = collection(db, 'dietPlans');
    const newPlan = await addDoc(dietPlanRef, {
      user_id: userId,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      start_date: planData.startDate,
      end_date: planData.endDate,
      ai_reasoning: planData.aiReasoning,
      meal_type: planData.mealType,
      diet_plan_meals: planData.meals.map(meal => ({
        meal_id: uuidv4(),
        name: meal.name,
        type: meal.type,
        nutrition_values: meal.nutritionValues
      }))
    });

    return newPlan.id;
  } catch (error) {
    console.error('Error creating diet plan:', error);
    throw error;
  }
};

// Get user's current diet plan
export const getCurrentDietPlan = async (userId) => {
  try {
    const dietPlansRef = collection(db, 'dietPlans');
    const currentDate = new Date();
    
    const q = query(
      dietPlansRef,
      where('user_id', '==', userId),
      where('start_date', '<=', currentDate),
      where('end_date', '>=', currentDate),
      orderBy('start_date', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const plans = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return plans[0] || null; // Return the most recent active plan
  } catch (error) {
    console.error('Error getting current diet plan:', error);
    throw error;
  }
};

// Get diet plan by ID
export const getDietPlan = async (planId) => {
  try {
    const planRef = doc(db, 'dietPlans', planId);
    const planSnap = await getDoc(planRef);
    return planSnap.exists() ? planSnap.data() : null;
  } catch (error) {
    console.error('Error getting diet plan:', error);
    throw error;
  }
};

// Get user's diet plan history
export const getDietPlanHistory = async (userId) => {
  try {
    const dietPlansRef = collection(db, 'dietPlans');
    const q = query(
      dietPlansRef,
      where('user_id', '==', userId),
      orderBy('created_at', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting diet plan history:', error);
    throw error;
  }
};

// Create diet plan meal
export const createDietPlanMeal = async (planId, mealData) => {
  try {
    const mealRef = collection(db, 'dietPlanMeals');
    const newMeal = await addDoc(mealRef, {
      diet_plan_id: planId,
      meal_type: mealData.type,
      diet_plan_meal_id: mealData.mealId,
      created_at: serverTimestamp()
    });

    return newMeal.id;
  } catch (error) {
    console.error('Error creating diet plan meal:', error);
    throw error;
  }
};

// Update diet plan
export const updateDietPlan = async (planId, planData) => {
  try {
    const planRef = doc(db, 'dietPlans', planId);
    await setDoc(planRef, {
      ...planData,
      updated_at: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error updating diet plan:', error);
    throw error;
  }
}; 