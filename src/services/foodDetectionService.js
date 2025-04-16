import { API_ENDPOINTS, API_CONFIG, handleServerError } from '../config/api';

// Food detection service using PyTorch model
export const detectFoodAndNutrition = async (imageUrl) => {
  try {
    // Convert image URL to File/Blob if it's not already
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();

    // Create form data
    const formData = new FormData();
    formData.append('image', imageBlob, 'food_image.jpg');

    // Send to Flask backend through proxy
    const response = await fetch(API_ENDPOINTS.DETECT, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json'
      }
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
      ...handleServerError(error)
    };
  }
}; 