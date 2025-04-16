// Food detection service using PyTorch model
const API_ENDPOINT = 'http://localhost:5000/detect'; // Assuming Flask server runs on port 5000

export const detectFoodAndNutrition = async (imageUrl) => {
  try {
    // Convert image URL to File/Blob if it's not already
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();

    // Create form data
    const formData = new FormData();
    formData.append('image', imageBlob, 'food_image.jpg');

    // Send to Flask backend
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Failed to detect food items');
    }

    const result = await response.json();
    
    return {
      ...result,
      success: true
    };
  } catch (error) {
    console.error('Error in food detection:', error);
    return {
      success: false,
      error: error.message,
      nutrition: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0
      }
    };
  }
}; 