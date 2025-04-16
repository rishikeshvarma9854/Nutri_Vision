import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Grid,
  Paper
} from '@mui/material';
import { db, auth } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

const MealAnalysis = ({ mealData }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    if (mealData) {
      analyzeMeals();
    }
  }, [mealData]);

  const analyzeMeals = async () => {
    try {
      setLoading(true);
      setError(null);

      // Process the meal data to get insights
      const insights = {
        totalMeals: 0,
        averageCalories: 0,
        mostCommonMeal: '',
        nutritionDistribution: {
          protein: 0,
          carbs: 0,
          fats: 0
        }
      };

      // Calculate total meals and average calories
      let totalCalories = 0;
      let mealCount = 0;
      const mealTypes = {};

      Object.entries(mealData).forEach(([date, meals]) => {
        Object.entries(meals).forEach(([mealType, data]) => {
          totalCalories += data.calories || 0;
          mealCount++;
          
          // Track meal types
          mealTypes[mealType] = (mealTypes[mealType] || 0) + 1;
          
          // Add to nutrition distribution
          insights.nutritionDistribution.protein += data.protein || 0;
          insights.nutritionDistribution.carbs += data.carbs || 0;
          insights.nutritionDistribution.fats += data.fats || 0;
        });
      });

      insights.totalMeals = mealCount;
      insights.averageCalories = mealCount > 0 ? Math.round(totalCalories / mealCount) : 0;
      
      // Find most common meal type
      const mostCommon = Object.entries(mealTypes).reduce((a, b) => a[1] > b[1] ? a : b);
      insights.mostCommonMeal = mostCommon[0];

      // Calculate nutrition percentages
      const totalNutrition = insights.nutritionDistribution.protein + 
                           insights.nutritionDistribution.carbs + 
                           insights.nutritionDistribution.fats;

      if (totalNutrition > 0) {
        insights.nutritionDistribution.protein = Math.round((insights.nutritionDistribution.protein / totalNutrition) * 100);
        insights.nutritionDistribution.carbs = Math.round((insights.nutritionDistribution.carbs / totalNutrition) * 100);
        insights.nutritionDistribution.fats = Math.round((insights.nutritionDistribution.fats / totalNutrition) * 100);
      }

      setAnalysis(insights);
    } catch (error) {
      console.error('Error analyzing meal data:', error);
      setError('Failed to analyze meal data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!analysis) {
    return null;
  }

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Meal Analysis
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Overview
              </Typography>
              <Typography variant="body2">
                Total Meals: {analysis.totalMeals}
              </Typography>
              <Typography variant="body2">
                Average Calories: {analysis.averageCalories}
              </Typography>
              <Typography variant="body2">
                Most Common Meal: {analysis.mostCommonMeal}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Nutrition Distribution
              </Typography>
              <Typography variant="body2">
                Protein: {analysis.nutritionDistribution.protein}%
              </Typography>
              <Typography variant="body2">
                Carbs: {analysis.nutritionDistribution.carbs}%
              </Typography>
              <Typography variant="body2">
                Fats: {analysis.nutritionDistribution.fats}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Paper>
  );
};

export default MealAnalysis; 