// Get the server URL based on the environment
const getServerUrl = () => 'http://localhost:5000';

// API endpoints
export const API_ENDPOINTS = {
  DETECT: `${getServerUrl()}/detect`,
  GET_NUTRITION: `${getServerUrl()}/get_nutrition`,
  HEALTH_CHECK: `${getServerUrl()}/health`
};

// API configuration
export const API_CONFIG = {
  headers: {
    'Accept': 'application/json'
  }
};

// Function to process image before sending
export const processImageForUpload = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Get the base64 string without the data URL prefix
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Function to check server health
export const checkServerHealth = async () => {
  try {
    const response = await fetch(API_ENDPOINTS.HEALTH_CHECK, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.status === 'healthy';
  } catch (error) {
    console.error('Server health check failed:', error);
    return false;
  }
};

// Function to handle server errors
export const handleServerError = (error) => {
  console.error('Detailed error:', error);
  if (error.message.includes('Failed to fetch') || error.message.includes('Network Error')) {
    return {
      error: 'Unable to connect to the server. Please check your network connection and ensure the server is running.',
      suggestions: [
        'Make sure you are connected to the same network as the server',
        'Check if the server is running on port 5000',
        'Try refreshing the page'
      ]
    };
  }
  return {
    error: error.message,
    suggestions: ['Please try again later']
  };
}; 