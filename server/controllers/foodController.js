const { detectFood, getNutrition, classifyMeal } = require('../services/foodService');

// Controller functions
exports.detectFood = async (req, res) => {
  try {
    const result = await detectFood(req.body.image);
    res.json(result);
  } catch (error) {
    console.error('Error in detectFood controller:', error);
    res.status(500).json({ error: 'Failed to detect food' });
  }
};

exports.getNutrition = async (req, res) => {
  try {
    const result = await getNutrition(req.body.food_name);
    res.json(result);
  } catch (error) {
    console.error('Error in getNutrition controller:', error);
    res.status(500).json({ error: 'Failed to get nutrition information' });
  }
};

exports.classifyMeal = async (req, res) => {
  try {
    const result = await classifyMeal(req.body.image);
    res.json(result);
  } catch (error) {
    console.error('Error in classifyMeal controller:', error);
    res.status(500).json({ error: 'Failed to classify meal' });
  }
}; 