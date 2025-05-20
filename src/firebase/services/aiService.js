import { db } from '../config.js';
import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Get API key from environment variables
const API_KEY = "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"; // Using the key directly for now
const API_URL = "https://api-inference.huggingface.co/models/gpt2";

// Add API key validation
console.log('API Key configured:', API_KEY ? 'Yes' : 'No');
if (!API_KEY) {
  console.warn('Hugging Face API key is not configured.');
}

// Use environment variable for Gemini API key
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
  throw new Error('Gemini API key is not configured');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Generate content using Hugging Face API
const generateContent = async (prompt) => {
  try {
    if (!API_KEY) {
      throw new Error('API key is not configured. Please set REACT_APP_HUGGING_FACE_API_KEY in your environment variables.');
    }

    console.log('Making API request to Hugging Face...');
    console.log('Using model:', API_URL);
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_length: 1000,
          temperature: 0.7,
          top_p: 0.9,
          return_full_text: false
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Response:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
    }

    const result = await response.json();
    if (!result || !result[0] || !result[0].generated_text) {
      throw new Error('Invalid response format from API');
    }

    return result[0].generated_text;
  } catch (error) {
    console.error("Error calling Hugging Face API:", error);
    // Fallback to static recommendations if API fails
    return generateStaticRecommendations();
  }
};

// Fallback static recommendations
const generateStaticRecommendations = () => {
  return {
    recommendedFoods: [
      'Lean proteins (chicken, fish, tofu)',
      'Whole grains (quinoa, brown rice, oats)',
      'Fresh vegetables (leafy greens, broccoli, carrots)',
      'Fresh fruits (berries, apples, citrus)',
      'Healthy fats (avocado, nuts, olive oil)'
    ],
    foodsToAvoid: [
      'Processed foods',
      'Sugary drinks',
      'Excessive salt',
      'Trans fats',
      'Refined carbohydrates'
    ],
    mealSchedule: [
      {
        time: '7:00 AM - 9:00 AM',
        name: 'Breakfast',
        foods: ['Oatmeal with berries and nuts', 'Greek yogurt with honey'],
        notes: 'Start your day with protein and complex carbs',
        targets: {
          calories: 400,
          protein: 25,
          carbs: 45,
          fats: 15
        }
      },
      {
        time: '12:00 PM - 2:00 PM',
        name: 'Lunch',
        foods: ['Grilled chicken salad', 'Quinoa bowl with vegetables'],
        notes: 'Focus on lean proteins and vegetables',
        targets: {
          calories: 500,
          protein: 30,
          carbs: 50,
          fats: 20
        }
      },
      {
        time: '6:00 PM - 8:00 PM',
        name: 'Dinner',
        foods: ['Baked fish with roasted vegetables', 'Brown rice or sweet potato'],
        notes: 'Light but nutritious dinner',
        targets: {
          calories: 450,
          protein: 28,
          carbs: 45,
          fats: 18
        }
      },
      {
        time: '10:00 AM, 3:00 PM',
        name: 'Snacks',
        foods: [
          'Apple with almond butter',
          'Carrot sticks with hummus',
          'Mixed nuts and dried fruit'
        ],
        notes: 'Healthy snacks between meals',
        targets: {
          calories: 150,
          protein: 8,
          carbs: 15,
          fats: 7
        }
      }
    ],
    additionalNotes: 'This meal plan is designed to support your weight gain goal while maintaining a balanced, nutritious diet. Adjust portions based on your specific caloric needs.'
  };
};

// Store AI interaction in Firebase
const storeAIInteraction = async (userId, type, prompt, response) => {
  try {
    await addDoc(collection(db, 'aiInteractions'), {
      userId,
      type,
      prompt,
      response,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error storing AI interaction:', error);
  }
};

// Generate diet recommendations
export const generateDietRecommendations = async (userProfile, dietPlan) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Generate personalized food recommendations based on the following user profile and diet plan:

User Profile:
- Age: ${userProfile.age}
- Gender: ${userProfile.gender}
- Weight: ${userProfile.weight} kg
- Height: ${userProfile.height} cm
- Activity Level: ${userProfile.activityLevel}
- Dietary Preferences: ${userProfile.dietaryPreferences?.join(', ') || 'None specified'}

Diet Plan:
- Daily Calories: ${dietPlan.recommendations.dailyTargets.total.calories} kcal
- Protein: ${dietPlan.recommendations.dailyTargets.total.protein}g
- Carbs: ${dietPlan.recommendations.dailyTargets.total.carbs}g
- Fats: ${dietPlan.recommendations.dailyTargets.total.fats}g

Please provide:
1. A list of recommended foods that align with the user's profile and nutritional needs
2. A list of foods to avoid based on the user's profile and goals

Format the response as a JSON object with two properties:
- recommendedFoods: A markdown-formatted list of recommended foods
- foodsToAvoid: A markdown-formatted list of foods to avoid`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse the JSON response
    const recommendations = JSON.parse(text);
    
    return {
      recommendedFoods: recommendations.recommendedFoods,
      foodsToAvoid: recommendations.foodsToAvoid
    };
  } catch (error) {
    console.error('Error generating food recommendations:', error);
    // Return default recommendations if Gemini fails
    return {
      recommendedFoods: "Based on your profile, focus on whole foods, lean proteins, and complex carbohydrates.",
      foodsToAvoid: "Limit processed foods, sugary drinks, and excessive saturated fats."
    };
  }
};

// Analyze meal and provide feedback
export const analyzeMealImage = async (mealType, imageUrl, userProfile) => {
  try {
    const allergies = userProfile.allergies || [];
    
    const prompt = `Analyze this meal image (${imageUrl}) for a ${mealType} meal.
      Consider the user's profile:
      - Dietary Type: ${userProfile.dietary_type || 'Omnivore'}
      - Food Allergies: ${allergies.length > 0 ? allergies.join(', ') : 'None'}
      - Goal: ${userProfile.goal || 'Weight Maintenance'}
      
      Please provide:
      1. Identified foods
      2. Estimated calories
      3. Nutritional analysis
      4. Suggestions for improvement
      5. Alignment with user's goals`;

    const text = await generateContent(prompt);
    
    // Store the interaction
    await storeAIInteraction(
      userProfile.userId,
      'meal_analysis',
      prompt,
      text
    );

    // Store the meal analysis
    await addDoc(collection(db, 'mealAnalyses'), {
      userId: userProfile.userId,
      mealType,
      imageUrl,
      analysis: text,
      timestamp: serverTimestamp()
    });

    return text;
  } catch (error) {
    console.error('Error analyzing meal image:', error);
    throw error;
  }
};

// Generate personalized feedback
export const generatePersonalizedFeedback = async (progressData, userProfile) => {
  try {
    const prompt = `Based on this user's progress:
      - Daily Goal Achievement: ${progressData.daily_goal_achieved}
      - Current Weight: ${progressData.weight}
      - Meals Completed: ${Object.entries(progressData)
        .filter(([key]) => key.includes('_completed'))
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')}
      
      And their profile:
      - Goal: ${userProfile.goal}
      - Activity Level: ${userProfile.activity_level}
      
      Please provide:
      1. Progress analysis
      2. Motivational feedback
      3. Specific recommendations
      4. Areas for improvement
      5. Next steps`;

    const text = await generateContent(prompt);
    
    // Store the interaction
    await storeAIInteraction(
      userProfile.userId,
      'progress_feedback',
      prompt,
      text
    );

    // Store the feedback
    await addDoc(collection(db, 'userFeedback'), {
      userId: userProfile.userId,
      feedback: text,
      progressData,
      timestamp: serverTimestamp()
    });

    return text;
  } catch (error) {
    console.error('Error generating personalized feedback:', error);
    throw error;
  }
};

// Generate chat response
export const generateChatResponse = async (message, userProfile) => {
  try {
    const context = `As a nutrition expert, respond to this question from a user with:
Goal: ${userProfile.goal || 'Weight Maintenance'}
Diet: ${userProfile.dietary_type || 'Omnivore'}
Activity: ${userProfile.activity_level || 'Moderately Active'}
Allergies: ${(userProfile.allergies || []).join(', ') || 'None'}

Question: ${message}`;

    const text = await generateContent(context);
    
    // Store the interaction
    await storeAIInteraction(
      userProfile.userId,
      'chat',
      message,
      text
    );

    return text;
  } catch (error) {
    console.error('Error generating chat response:', error);
    return "I apologize, but I'm having trouble connecting to the AI service right now. Please try again later or contact support if the problem persists.";
  }
}; 