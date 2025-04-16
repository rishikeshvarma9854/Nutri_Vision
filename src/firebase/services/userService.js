import { db, optimizedWrite } from '../config';
import { 
  doc, 
  getDoc, 
  serverTimestamp 
} from 'firebase/firestore';

// Create or update user
export const createUser = async (userId, userData) => {
  try {
    const userRef = doc(db, 'users', userId);
    await optimizedWrite(userRef, {
      user_id: userId,
      name: userData.name || '',
      email: userData.email || '',
      google_id: userData.googleId || '',
      profile_pic: userData.photoURL || '',
      created_at: serverTimestamp(),
      last_login: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

// Create or update user profile
export const createUserProfile = async (userId, profileData) => {
  try {
    const profileRef = doc(db, 'userProfiles', userId);
    await optimizedWrite(profileRef, {
      user_id: userId,
      height: profileData.height || 0,
      weight: profileData.weight || 0,
      age: profileData.age || 0,
      goal: profileData.goal || '',
      activity_level: profileData.activityLevel || '',
      dietary_type: profileData.dietaryType || '',
      food_allergies: profileData.foodAllergies || [],
      medical_conditions: profileData.medicalConditions || [],
      updated_at: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
};

// Get user data
export const getUserData = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? userSnap.data() : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
};

// Get user profile
export const getUserProfile = async (userId) => {
  try {
    const profileRef = doc(db, 'userProfiles', userId);
    const profileSnap = await getDoc(profileRef);
    return profileSnap.exists() ? profileSnap.data() : null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};

// Update user profile
export const updateUserProfile = async (userId, profileData) => {
  try {
    const profileRef = doc(db, 'userProfiles', userId);
    await optimizedWrite(profileRef, {
      ...profileData,
      updated_at: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

// Update user last login
export const updateUserLastLogin = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    await optimizedWrite(userRef, {
      last_login: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating last login:', error);
    throw error;
  }
}; 