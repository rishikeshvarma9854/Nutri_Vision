import { db } from '../config.js';
import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

// Get API key from environment variables
const API_KEY = "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"; // Using the key directly for now
const API_URL = "https://api-inference.huggingface.co/models/gpt2";

// Add API key validation
console.log('API Key configured:', API_KEY ? 'Yes' : 'No');
if (!API_KEY) {
  console.warn('Hugging Face API key is not configured.');
}

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
export const generateDietRecommendations = async (userProfile) => {
  try {
    console.log('Generating diet recommendations for profile:', userProfile);
    
    // Create a detailed prompt for the AI
    const prompt = `Generate a personalized diet plan for:
Age: ${userProfile.age} years
Height: ${userProfile.height}cm
Weight: ${userProfile.weight}kg
Target Weight: ${userProfile.targetWeight}kg
Goal: ${userProfile.goal}
Activity Level: ${userProfile.activityLevel}
Dietary Type: ${userProfile.dietaryType}
Food Allergies: ${userProfile.foodAllergies?.join(', ') || 'None'}
Medical Conditions: ${userProfile.medicalConditions?.join(', ') || 'None'}

Please provide specific recommendations considering their medical conditions and goals.`;

    try {
      // For now, let's use an enhanced static recommendation system
      // that takes into account the user's profile
      const isWeightGain = userProfile.goal?.toLowerCase().includes('gain');
      const isWeightLoss = userProfile.goal?.toLowerCase().includes('loss');
      const isVegetarian = userProfile.dietaryType?.toLowerCase().includes('vegetarian');
      const isVegan = userProfile.dietaryType?.toLowerCase().includes('vegan');
      const hasDiabetes = userProfile.medicalConditions?.some(c => c.toLowerCase().includes('diabetes'));
      const hasHeartCondition = userProfile.medicalConditions?.some(c => c.toLowerCase().includes('heart'));

      const recommendations = {
        recommendedFoods: [
          ...(isVegan ? [
            'Quinoa',
            'Lentils',
            'Chickpeas',
            'Tofu',
            'Tempeh',
            'Seitan',
            'Nutritional yeast',
            'Plant-based protein powder',
            'Chia seeds',
            'Hemp seeds'
          ] : isVegetarian ? [
            'Greek yogurt',
            'Eggs',
            'Cottage cheese',
            'Whey protein',
            'Lentils',
            'Quinoa',
            'Tofu',
            'Tempeh'
          ] : [
            'Chicken breast',
            'Salmon',
            'Lean beef',
            'Turkey',
            'Eggs',
            'Greek yogurt',
            'Tuna',
            'Whey protein'
          ]),
          'Sweet potatoes',
          'Brown rice',
          'Oatmeal',
          'Spinach',
          'Broccoli',
          'Avocado',
          'Almonds',
          'Olive oil',
          'Bananas',
          'Berries',
          ...(hasDiabetes ? [
            'Cinnamon',
            'Green leafy vegetables',
            'Chia seeds',
            'Steel-cut oats'
          ] : []),
          ...(hasHeartCondition ? [
            'Fatty fish',
            'Walnuts',
            'Flaxseeds',
            'Garlic',
            'Dark leafy greens'
          ] : [])
        ],
        foodsToAvoid: [
          'Processed foods',
          'Artificial sweeteners',
          'Excessive caffeine',
          'Deep fried foods',
          ...(userProfile.foodAllergies || []),
          ...(isVegan ? ['All animal products'] :
              isVegetarian ? ['Meat products'] : []),
          ...(hasDiabetes ? [
            'Sugary drinks',
            'White bread',
            'Processed snacks',
            'Candy',
            'Regular soda'
          ] : []),
          ...(hasHeartCondition ? [
            'Saturated fats',
            'Trans fats',
            'Excessive salt',
            'Processed meats'
          ] : [])
        ],
        mealSchedule: [
          {
            name: 'Breakfast',
            time: '7:00 AM - 9:00 AM',
            foods: isVegan ? [
              'Oatmeal with plant-based milk and berries',
              'Banana and almond butter smoothie',
              'Chia seeds',
              ...(hasDiabetes ? ['Cinnamon for blood sugar control'] : [])
            ] : isVegetarian ? [
              'Greek yogurt with honey and granola',
              'Scrambled eggs with spinach',
              'Whole grain toast'
            ] : [
              'Scrambled eggs with vegetables',
              'Oatmeal with protein powder',
              'Fresh fruit'
            ],
            targets: {
              calories: isWeightGain ? 600 : isWeightLoss ? 300 : 400,
              protein: isWeightGain ? 35 : 25,
              carbs: isWeightGain ? 70 : isWeightLoss ? 30 : 45,
              fats: isWeightGain ? 20 : 15
            }
          },
          {
            name: 'Lunch',
            time: '12:00 PM - 2:00 PM',
            foods: isVegan ? [
              'Quinoa bowl with roasted vegetables',
              'Chickpea curry',
              'Mixed green salad'
            ] : isVegetarian ? [
              'Lentil soup with vegetables',
              'Quinoa salad with tofu',
              'Mixed nuts'
            ] : [
              'Grilled chicken breast',
              'Brown rice',
              'Steamed vegetables'
            ],
            targets: {
              calories: isWeightGain ? 700 : isWeightLoss ? 400 : 500,
              protein: isWeightGain ? 40 : 30,
              carbs: isWeightGain ? 80 : isWeightLoss ? 35 : 50,
              fats: isWeightGain ? 25 : 20
            }
          },
          {
            name: 'Dinner',
            time: '6:00 PM - 8:00 PM',
            foods: isVegan ? [
              'Tempeh stir-fry with vegetables',
              'Brown rice',
              'Steamed broccoli'
            ] : isVegetarian ? [
              'Black bean burger',
              'Sweet potato wedges',
              'Grilled vegetables'
            ] : [
              'Baked salmon',
              'Quinoa',
              'Roasted vegetables'
            ],
            targets: {
              calories: isWeightGain ? 600 : isWeightLoss ? 350 : 450,
              protein: isWeightGain ? 35 : 28,
              carbs: isWeightGain ? 65 : isWeightLoss ? 35 : 45,
              fats: isWeightGain ? 22 : 18
            }
          },
          {
            name: 'Snacks',
            time: '10:00 AM, 3:00 PM',
            foods: isVegan ? [
              'Mixed nuts and dried fruit',
              'Apple with almond butter',
              'Hummus with vegetable sticks'
            ] : isVegetarian ? [
              'Greek yogurt with honey',
              'Trail mix',
              'Protein smoothie'
            ] : [
              'Protein shake',
              'Almonds and fruit',
              'Rice cakes with peanut butter'
            ],
            targets: {
              calories: isWeightGain ? 200 : isWeightLoss ? 100 : 150,
              protein: isWeightGain ? 15 : 8,
              carbs: isWeightGain ? 25 : isWeightLoss ? 10 : 15,
              fats: isWeightGain ? 10 : 7
            }
          }
        ],
        additionalNotes: `This meal plan is customized for your ${userProfile.goal} goal with a ${userProfile.dietaryType} diet.
${hasDiabetes ? '\n• For diabetes management: Focus on low glycemic index foods, regular meal timing, and portion control.' : ''}
${hasHeartCondition ? '\n• For heart health: Emphasis on omega-3 rich foods, reduced sodium, and heart-healthy fats.' : ''}
${userProfile.foodAllergies?.length ? '\n• Carefully check food labels due to your allergies.' : ''}
\nAdjust portions based on your hunger and energy levels. Stay hydrated by drinking water throughout the day.
${isVegan ? '\nConsider taking supplements (B12, D3, Iron)' : isVegetarian ? '\nConsider taking supplements (B12, D3)' : ''}
Monitor your progress and adjust the plan as needed.`
      };

      return recommendations;
    } catch (error) {
      console.error('Error generating AI recommendations:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in diet recommendations:', error);
    throw error;
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