const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'replace with your key');
const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

// Food detection function
exports.detectFood = async (image) => {
  try {
    if (!image) {
      throw new Error('No image provided');
    }

    const prompt = "What food items are in this image? List them in a JSON array format with confidence scores. Example format: [{'name': 'apple', 'confidence': 0.95}, {'name': 'banana', 'confidence': 0.85}]";
    
    // Convert base64 image to buffer
    const imageBuffer = Buffer.from(image.split(',')[1], 'base64');
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: "image/jpeg"
        }
      }
    ]);
    
    const response = await result.response;
    const text = response.text();
    
    // Parse the response and return food items
    const items = JSON.parse(text);
    return {
      success: true,
      foodItems: items.map(item => item.name),
      confidence: items.map(item => item.confidence),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in detectFood:', error);
    throw new Error('Failed to detect food items: ' + error.message);
  }
};

// Nutrition information function
exports.getNutrition = async (foodName) => {
  try {
    const prompt = `Provide nutrition information for ${foodName} in JSON format with calories, protein, carbs, and fats.`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse the response and return nutrition data
    return {
      success: true,
      nutrition: JSON.parse(text),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in getNutrition:', error);
    throw new Error('Failed to get nutrition information');
  }
};

// Meal classification function
exports.classifyMeal = async (image) => {
  try {
    const prompt = "Classify this meal as breakfast, lunch, dinner, or snack. Return the classification in JSON format.";
    const result = await model.generateContent([prompt, image]);
    const response = await result.response;
    const text = response.text();
    
    // Parse the response and return meal classification
    return {
      success: true,
      classification: JSON.parse(text),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in classifyMeal:', error);
    throw new Error('Failed to classify meal');
  }
}; 