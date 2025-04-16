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

// Create feedback
export const createFeedback = async (userId, feedbackData) => {
  try {
    const feedbackRef = collection(db, 'feedback');
    const newFeedback = await addDoc(feedbackRef, {
      user_id: userId,
      diet_plan_id: feedbackData.dietPlanId,
      rating: feedbackData.rating,
      comments: feedbackData.comments,
      ai_response: feedbackData.aiResponse,
      created_at: serverTimestamp()
    });

    return newFeedback.id;
  } catch (error) {
    console.error('Error creating feedback:', error);
    throw error;
  }
};

// Get feedback by ID
export const getFeedback = async (feedbackId) => {
  try {
    const feedbackRef = doc(db, 'feedback', feedbackId);
    const feedbackSnap = await getDoc(feedbackRef);
    return feedbackSnap.exists() ? feedbackSnap.data() : null;
  } catch (error) {
    console.error('Error getting feedback:', error);
    throw error;
  }
};

// Get user's feedback history
export const getUserFeedback = async (userId) => {
  try {
    const feedbackRef = collection(db, 'feedback');
    const q = query(
      feedbackRef,
      where('user_id', '==', userId),
      orderBy('created_at', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting user feedback:', error);
    throw error;
  }
};

// Get feedback for a diet plan
export const getDietPlanFeedback = async (dietPlanId) => {
  try {
    const feedbackRef = collection(db, 'feedback');
    const q = query(
      feedbackRef,
      where('diet_plan_id', '==', dietPlanId),
      orderBy('created_at', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting diet plan feedback:', error);
    throw error;
  }
};

// Update feedback with AI response
export const updateFeedbackWithAIResponse = async (feedbackId, aiResponse) => {
  try {
    const feedbackRef = doc(db, 'feedback', feedbackId);
    await setDoc(feedbackRef, {
      ai_response: aiResponse,
      updated_at: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error updating feedback with AI response:', error);
    throw error;
  }
}; 