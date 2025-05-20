const API_BASE_URL = 'https://nutrivision-oc9q.onrender.com/api';

export const API_ENDPOINTS = {
  detect: `${API_BASE_URL}/detect`,
  getNutrition: `${API_BASE_URL}/get_nutrition`,
  classifyMeal: `${API_BASE_URL}/classify_meal`,
  health: `${API_BASE_URL}/health`
};

export const makeApiRequest = async (endpoint, method = 'GET', data = null) => {
  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : null,
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}; 
 