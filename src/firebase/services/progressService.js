import { db } from '../config';
import { 
  collection,
  doc, 
  setDoc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';

// Update user progress
export const updateUserProgress = async (userId, progressData) => {
  try {
    const progressRef = doc(db, 'userProgress', userId);
    const date = new Date().toISOString().split('T')[0];
    
    await setDoc(progressRef, {
      user_id: userId,
      date,
      daily_goal_achieved: progressData.dailyGoalAchieved || false,
      weight: progressData.weight,
      breakfast_completed: progressData.breakfastCompleted || false,
      lunch_completed: progressData.lunchCompleted || false,
      dinner_completed: progressData.dinnerCompleted || false,
      snack_completed: progressData.snackCompleted || false,
      updated_at: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error updating user progress:', error);
    throw error;
  }
};

// Get user progress
export const getUserProgress = async (userId, date) => {
  try {
    const progressRef = doc(db, 'userProgress', userId);
    const progressSnap = await getDoc(progressRef);
    return progressSnap.exists() ? progressSnap.data() : null;
  } catch (error) {
    console.error('Error getting user progress:', error);
    throw error;
  }
};

// Update user streak
export const updateUserStreak = async (userId, streakData) => {
  try {
    const streakRef = doc(db, 'streaks', userId);
    await setDoc(streakRef, {
      user_id: userId,
      current_streak: streakData.currentStreak,
      longest_streak: streakData.longestStreak,
      last_completed_day: streakData.lastCompletedDay,
      updated_at: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error updating user streak:', error);
    throw error;
  }
};

// Get user streak
export const getUserStreak = async (userId) => {
  try {
    const streakRef = doc(db, 'streaks', userId);
    const streakSnap = await getDoc(streakRef);
    return streakSnap.exists() ? streakSnap.data() : null;
  } catch (error) {
    console.error('Error getting user streak:', error);
    throw error;
  }
};

// Check and update streak
export const checkAndUpdateStreak = async (userId) => {
  try {
    const streakRef = doc(db, 'streaks', userId);
    const streakSnap = await getDoc(streakRef);
    const currentDate = new Date();
    
    if (!streakSnap.exists()) {
      // Initialize streak for new user
      await setDoc(streakRef, {
        user_id: userId,
        current_streak: 1,
        longest_streak: 1,
        last_completed_day: currentDate.toISOString(),
        updated_at: serverTimestamp()
      });
      return 1;
    }

    const streakData = streakSnap.data();
    const lastCompleted = new Date(streakData.last_completed_day);
    const daysDifference = Math.floor((currentDate - lastCompleted) / (1000 * 60 * 60 * 24));

    let newStreak = streakData.current_streak;
    if (daysDifference === 1) {
      // Consecutive day
      newStreak += 1;
    } else if (daysDifference > 1) {
      // Streak broken
      newStreak = 1;
    }

    const newLongestStreak = Math.max(newStreak, streakData.longest_streak);

    await updateDoc(streakRef, {
      current_streak: newStreak,
      longest_streak: newLongestStreak,
      last_completed_day: currentDate.toISOString(),
      updated_at: serverTimestamp()
    });

    return newStreak;
  } catch (error) {
    console.error('Error checking and updating streak:', error);
    throw error;
  }
};

// Get user progress history
export const getUserProgressHistory = async (userId, startDate, endDate) => {
  try {
    const progressRef = collection(db, 'userProgress');
    const q = query(
      progressRef,
      where('user_id', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting user progress history:', error);
    throw error;
  }
}; 