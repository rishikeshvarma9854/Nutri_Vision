import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Grid, Button, CircularProgress, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack, Divider } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Today as TodayIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { format, parseISO, isValid } from 'date-fns';
import { db, auth } from '../firebase/config';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const MealLog = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [allMeals, setAllMeals] = useState({});
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [newMeal, setNewMeal] = useState({
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fats: ''
  });
  const [error, setError] = useState('');
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' or 'desc'

  useEffect(() => {
    fetchAllMeals();
  }, []);

  const fetchAllMeals = async () => {
    try {
      if (!auth.currentUser) {
        console.error('No user logged in');
        return;
      }

      const userId = auth.currentUser.uid;
      console.log('Fetching all meals for user:', userId);
      
      const mealsRef = doc(db, 'userMeals', userId);
      const mealsDoc = await getDoc(mealsRef);
      
      if (mealsDoc.exists()) {
        const data = mealsDoc.data();
        const processedMeals = {};

        // Process each date's meals
        Object.entries(data).forEach(([date, meals]) => {
          if (!isValid(parseISO(date))) return; // Skip invalid dates
          
          let mealsArray = Array.isArray(meals) ? meals : meals?.meals || [];
          
          processedMeals[date] = mealsArray.map(meal => ({
            ...meal,
            timestamp: meal.timestamp ? 
              (typeof meal.timestamp === 'string' ? new Date(meal.timestamp) : meal.timestamp.toDate()) 
              : new Date(),
            nutrition: meal.nutrition || {},
            mealType: meal.mealType || determineMealType(meal.timestamp),
            predictions: meal.predictions || []
          }));
        });

        setAllMeals(processedMeals);
      }
    } catch (error) {
      console.error('Error fetching meals:', error);
      setError('Failed to fetch meals');
    } finally {
      setLoading(false);
    }
  };

  const determineMealType = (timestamp) => {
    if (!timestamp) return 'snacks';
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const hour = date.getHours();
    
    if (hour >= 5 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 16) return 'lunch';
    if (hour >= 16 && hour < 22) return 'dinner';
    return 'snacks';
  };

  const handleAddMeal = async (mealData) => {
    try {
      if (!auth.currentUser) {
        console.error('No user logged in');
        return;
      }

      if (!mealData.foodItems?.[0]) {
        setError('Please enter a food name');
        return;
      }

      const userId = auth.currentUser.uid;
      const timestamp = new Date().toISOString();
      const mealType = determineMealType(timestamp);

      // Get nutrition from Gemini
      const nutrition = await getNutritionFromGemini(mealData.foodItems[0]);
      
      if (!nutrition) {
        setError('Failed to get nutrition information. Please try again.');
        return;
      }

      const newMeal = {
        foodItems: mealData.foodItems,
        nutrition: nutrition,
        timestamp: timestamp,
        mealType: mealType,
        predictions: mealData.predictions || [],
        confidence: mealData.confidence,
        userId: userId
      };

      console.log('Adding new meal with nutrition:', newMeal);

      const dateKey = format(selectedDate, 'yyyy-MM-dd');
      const mealRef = doc(db, 'userMeals', userId);
      const mealDoc = await getDoc(mealRef);
      
      if (mealDoc.exists()) {
        const existingData = mealDoc.data();
        const existingMeals = existingData[dateKey] || [];
        await updateDoc(mealRef, {
          [dateKey]: [...existingMeals, newMeal]
        });
      } else {
        await setDoc(mealRef, {
          [dateKey]: [newMeal]
        });
      }

      // Clear any existing error
      setError('');
      // Close the dialog
      setOpenDialog(false);
      // Reset the new meal form
      setNewMeal({ name: '', calories: '', protein: '', carbs: '', fats: '' });
      // Refresh the meals display
      fetchAllMeals();

    } catch (error) {
      console.error('Error adding meal:', error);
      setError('Failed to add meal: ' + error.message);
    }
  };

  // Function to get nutrition information from Gemini
  const getNutritionFromGemini = async (foodName) => {
    try {
      console.log('Getting nutrition for:', foodName);
      const response = await fetch('http://localhost:5000/get_nutrition', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ food_name: foodName })
      });

      if (!response.ok) {
        throw new Error('Failed to get nutrition data');
      }

      const data = await response.json();
      console.log('Received nutrition data:', data);
      
      if (!data.calories && !data.protein && !data.carbs && !data.fats) {
        throw new Error('Invalid nutrition data received');
      }

      return {
        calories: Math.round(data.calories) || 0,
        protein: Math.round(data.protein) || 0,
        carbs: Math.round(data.carbs) || 0,
        fats: Math.round(data.fats) || 0
      };
    } catch (error) {
      console.error('Error getting nutrition from Gemini:', error);
      // Return null to indicate failure
      return null;
    }
  };

  const handleDeleteMeal = async (date, mealIndex) => {
    try {
      if (!auth.currentUser) return;

      const userId = auth.currentUser.uid;
      const mealRef = doc(db, 'userMeals', userId);
      const mealDoc = await getDoc(mealRef);

      if (mealDoc.exists()) {
        const data = mealDoc.data();
        const mealsForDate = [...(data[date] || [])];
        mealsForDate.splice(mealIndex, 1);
        
        await updateDoc(mealRef, {
          [date]: mealsForDate
        });

        fetchAllMeals();
      }
    } catch (error) {
      console.error('Error deleting meal:', error);
      setError('Failed to delete meal');
    }
  };

  const calculateDailyTotals = (meals) => {
    if (!Array.isArray(meals) || meals.length === 0) {
      return {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0
      };
    }

    return meals.reduce((totals, meal) => {
      const nutrition = meal.nutrition || {};
      return {
        calories: totals.calories + (nutrition.calories || 0),
        protein: totals.protein + (nutrition.protein || 0),
        carbs: totals.carbs + (nutrition.carbs || 0),
        fats: totals.fats + (nutrition.fats || 0)
      };
    }, {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0
    });
  };

  const getSortedDates = () => {
    return Object.keys(allMeals)
      .filter(date => isValid(parseISO(date)))
      .sort((a, b) => {
        return sortOrder === 'desc' 
          ? parseISO(b) - parseISO(a) 
          : parseISO(a) - parseISO(b);
      });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={2} alignItems="center" mb={3}>
        <Typography variant="h4">Meal Log</Typography>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DatePicker
            value={selectedDate}
            onChange={(newDate) => setSelectedDate(newDate)}
            slotProps={{ textField: { size: "small" } }}
          />
        </LocalizationProvider>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
        >
          Add Meal
        </Button>
        <Button
          variant="outlined"
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
        >
          Sort {sortOrder === 'desc' ? 'Oldest First' : 'Newest First'}
        </Button>
      </Stack>

      {getSortedDates().map(date => (
        <Box key={date} sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            {format(parseISO(date), 'MMMM d, yyyy')}
          </Typography>
          
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Daily Totals
              </Typography>
              <Grid container spacing={3}>
                {Object.entries(calculateDailyTotals(allMeals[date])).map(([key, value]) => (
                  <Grid item xs={6} sm={3} key={key}>
                    <Typography variant="body2" color="text.secondary">
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </Typography>
                    <Typography variant="h6">
                      {value}{key === 'calories' ? ' kcal' : 'g'}
                    </Typography>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>

          {allMeals[date].map((meal, index) => (
            <Card key={index} sx={{ mb: 2 }}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="h6">{meal.foodItems?.[0] || 'Unknown Food'}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {meal.mealType?.charAt(0).toUpperCase() + meal.mealType?.slice(1) || 'Snack'} - 
                      {new Date(meal.timestamp).toLocaleTimeString()}
                    </Typography>
                  </Box>
                  <IconButton onClick={() => handleDeleteMeal(date, index)} size="small">
                    <DeleteIcon />
                  </IconButton>
                </Box>
                <Grid container spacing={2} mt={1}>
                  <Grid item xs={6} sm={3}>
                    <Typography color="text.secondary">Calories</Typography>
                    <Typography>{meal.nutrition?.calories || 0} kcal</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography color="text.secondary">Protein</Typography>
                    <Typography>{meal.nutrition?.protein || 0}g</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography color="text.secondary">Carbs</Typography>
                    <Typography>{meal.nutrition?.carbs || 0}g</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography color="text.secondary">Fats</Typography>
                    <Typography>{meal.nutrition?.fats || 0}g</Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          ))}
          <Divider sx={{ my: 3 }} />
        </Box>
      ))}

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
        <DialogTitle>Add New Meal</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Food Name"
              fullWidth
              value={newMeal?.name || ''}
              onChange={(e) => setNewMeal(prev => ({ ...prev, name: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button 
            onClick={() => {
              handleAddMeal({ foodItems: [newMeal?.name] });
              setOpenDialog(false);
            }} 
            variant="contained"
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MealLog; 