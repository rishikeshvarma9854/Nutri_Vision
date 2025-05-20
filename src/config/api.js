// Get the server URL based on environment
export const getServerUrl = () => {
  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  return isLocalhost 
    ? 'http://localhost:3000/api'
    : 'https://nutrivision-oc9q.onrender.com/api';
};

// API endpoints
const API_ENDPOINTS = {
  DETECT: `${getServerUrl()}/detect`,
  GET_NUTRITION: `${getServerUrl()}/get_nutrition`,
  CLASSIFY_MEAL: `${getServerUrl()}/classify_meal`,
  HEALTH: `${getServerUrl()}/health`
};

// API configuration
const API_CONFIG = {
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  credentials: 'include'
};

export { API_ENDPOINTS, API_CONFIG };

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
    const response = await fetch(API_ENDPOINTS.HEALTH, {
      method: 'GET',
      headers: API_CONFIG.headers,
      credentials: 'include'
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
        'Check if the server is running on port 3000',
        'Try refreshing the page'
      ]
    };
  }
  return {
    error: error.message,
    suggestions: ['Please try again later']
  };
};