import axios from 'axios';

const API_BASE_URL = 'https://nutrivision-oc9q.onrender.com/api';

export const detectFood = async (image) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/detect`, { image });
    return response.data;
  } catch (error) {
    console.error('Error detecting food:', error);
    throw error;
  }
};

export const getNutrition = async (foodName) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/get_nutrition`, { foodName });
    return response.data;
  } catch (error) {
    console.error('Error getting nutrition:', error);
    throw error;
  }
};

export const classifyMeal = async (image) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/classify_meal`, { image });
    return response.data;
  } catch (error) {
    console.error('Error classifying meal:', error);
    throw error;
  }
}; 