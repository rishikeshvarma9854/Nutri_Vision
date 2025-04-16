import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Grid, Button, CircularProgress, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack, Divider, Alert } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Today as TodayIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { format, parseISO, isValid, compareDesc, isToday } from 'date-fns';
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
        console.log('Raw meals data from Firestore:', data);
        const processedMeals = {};

        // Process each date's meals
        Object.entries(data).forEach(([date, meals]) => {
          if (!isValid(parseISO(date))) {
            console.log(`Skipping invalid date: ${date}`);
            return; // Skip invalid dates
          }
          
          console.log(`Processing meals for date ${date}:`, meals);
          
          // Handle different data structures
          let mealsArray = [];
          
          if (Array.isArray(meals)) {
            console.log(`Found array structure for ${date} with ${meals.length} meals`);
            mealsArray = meals;
          } else if (meals && typeof meals === 'object') {
            if (Array.isArray(meals.meals)) {
              console.log(`Found object with meals array for ${date}`);
              mealsArray = meals.meals;
            } else {
              // For object structure, convert to array of meal objects
              console.log(`Found object structure for ${date}, converting to array`);
              // Add each meal type as a separate meal
              Object.entries(meals).forEach(([mealType, mealData]) => {
                if (mealType === 'breakfast' || mealType === 'lunch' || 
                    mealType === 'dinner' || mealType === 'snacks') {
                  if (mealData && mealData.nutrition) {
                    mealsArray.push({
                      ...mealData,
                      mealType,
                      nutrition: mealData.nutrition
                    });
                  }
                }
              });
            }
          }
          
          if (mealsArray.length === 0) {
            console.log(`No valid meals found for ${date}`);
            return;
          }
          
          processedMeals[date] = mealsArray.map(meal => {
            // Handle case where the meal might be missing some properties
            if (!meal) {
              console.log(`Skipping null or undefined meal for ${date}`);
              return null;
            }
            
            console.log(`Processing meal for ${date}:`, meal);
            
            // Extract name/foodName
            const name = meal.name || meal.foodName || 'Unknown Food';
            
            // Process timestamp
            let timestamp;
            if (meal.timestamp) {
              try {
                timestamp = typeof meal.timestamp === 'string' 
                  ? new Date(meal.timestamp) 
                  : meal.timestamp.toDate ? meal.timestamp.toDate() : new Date();
              } catch (e) {
                console.error('Error parsing timestamp:', e);
                timestamp = new Date();
              }
            } else {
              timestamp = new Date();
            }
            
            // Process nutrition
            const nutrition = meal.nutrition || {};
            
            // Process meal type
            const mealType = meal.mealType || determineMealType(timestamp);
            
            return {
              id: Math.random().toString(36).substring(2, 9), // Generate random ID for UI purposes
              name,
              foodName: meal.foodName || name,
              timestamp,
              nutrition: {
                calories: Number(nutrition.calories) || 0,
                protein: Number(nutrition.protein) || 0,
                carbs: Number(nutrition.carbs) || 0,
                fats: Number(nutrition.fats) || 0
              },
              mealType,
              predictions: meal.predictions || []
            };
          }).filter(Boolean); // Remove null entries
          
          console.log(`Processed ${processedMeals[date].length} meals for ${date}`);
        });

        console.log('Final processed meals data:', processedMeals);
        setAllMeals(processedMeals);
      } else {
        console.log('No meals document found for user');
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
      const foodName = mealData.foodItems[0];

      // Get nutrition from Gemini
      const nutrition = await getNutritionFromGemini(foodName);
      
      if (!nutrition) {
        setError('Failed to get nutrition information. Please try again.');
        return;
      }

      const newMeal = {
        foodName: foodName,
        name: foodName,
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
      
      // Get the current host IP
      const host = window.location.hostname;
      const isLocalhost = host === 'localhost' || host === '127.0.0.1';
      const apiUrl = isLocalhost 
        ? 'http://localhost:5000/get_nutrition'
        : `http://${host}:5000/get_nutrition`;

      const response = await fetch(apiUrl, {
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
      
      if (!data.success || !data.total) {
        throw new Error('Invalid nutrition data received');
      }

      // Get the nutrition data for the specific food item
      const foodNutrition = data.items?.[foodName] || data.total;

      return {
        calories: Math.round(foodNutrition.calories) || 0,
        protein: Math.round(foodNutrition.protein) || 0,
        carbs: Math.round(foodNutrition.carbs) || 0,
        fats: Math.round(foodNutrition.fats) || 0
      };
    } catch (error) {
      console.error('Error getting nutrition from Gemini:', error);
      // Return null to indicate failure
      return null;
    }
  };

  const deleteMeal = async (date, mealIndex) => {
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

  const displayMeals = () => {
    if (loading) {
      return <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} />;
    }

    if (error) {
      return <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>;
    }

    if (Object.keys(allMeals).length === 0) {
      return (
        <Alert severity="info" sx={{ my: 2 }}>
          You haven't logged any meals yet. Use the camera feature to log your first meal!
        </Alert>
      );
    }

    // Sort dates from newest to oldest
    const sortedDates = Object.keys(allMeals)
      .filter(date => isValid(parseISO(date)))
      .sort((a, b) => compareDesc(parseISO(a), parseISO(b)));

    const mealTypeOrder = ['breakfast', 'lunch', 'snacks', 'dinner'];

    return (
      <Box>
        {sortedDates.map(date => {
          const meals = allMeals[date];
          
          if (!meals || meals.length === 0) return null;
          
          // Sort meals by time of day (breakfast, lunch, dinner, snacks) and then by timestamp
          const sortedMeals = [...meals].sort((a, b) => {
            // First sort by meal type order
            const aMealTypeIndex = mealTypeOrder.indexOf(a.mealType);
            const bMealTypeIndex = mealTypeOrder.indexOf(b.mealType);
            
            if (aMealTypeIndex !== bMealTypeIndex) {
              return aMealTypeIndex - bMealTypeIndex;
            }
            
            // Then sort by timestamp
            if (a.timestamp && b.timestamp) {
              return new Date(a.timestamp) - new Date(b.timestamp);
            }
            
            return 0;
          });
          
          // Group meals by meal type
          const mealsByType = {};
          mealTypeOrder.forEach(type => {
            mealsByType[type] = sortedMeals.filter(meal => meal.mealType === type);
          });

          return (
            <Box key={date} sx={{ mb: 4 }}>
              <Typography 
                variant="h6" 
                sx={{ 
                  mb: 2, 
                  pb: 1, 
                  borderBottom: '1px solid', 
                  borderColor: 'divider',
                  fontWeight: 600
                }}
              >
                {format(parseISO(date), 'EEEE, MMMM d, yyyy')} {isToday(parseISO(date)) && '(Today)'}
              </Typography>

              {/* Display daily totals */}
              <Box sx={{ mb: 3, p: 2, backgroundColor: 'background.paper', borderRadius: 1, boxShadow: 1 }}>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>Daily Nutrition Totals</Typography>
                <Grid container spacing={3}>
                  <Grid item xs={3}>
                    <Typography variant="body2" color="text.secondary">Calories</Typography>
                    <Typography variant="h6">
                      {sortedMeals.reduce((sum, meal) => sum + (Number(meal.nutrition?.calories) || 0), 0)}
                    </Typography>
                  </Grid>
                  <Grid item xs={3}>
                    <Typography variant="body2" color="text.secondary">Protein</Typography>
                    <Typography variant="h6">
                      {sortedMeals.reduce((sum, meal) => sum + (Number(meal.nutrition?.protein) || 0), 0)}g
                    </Typography>
                  </Grid>
                  <Grid item xs={3}>
                    <Typography variant="body2" color="text.secondary">Carbs</Typography>
                    <Typography variant="h6">
                      {sortedMeals.reduce((sum, meal) => sum + (Number(meal.nutrition?.carbs) || 0), 0)}g
                    </Typography>
                  </Grid>
                  <Grid item xs={3}>
                    <Typography variant="body2" color="text.secondary">Fats</Typography>
                    <Typography variant="h6">
                      {sortedMeals.reduce((sum, meal) => sum + (Number(meal.nutrition?.fats) || 0), 0)}g
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              {/* Display meals grouped by meal type */}
              {mealTypeOrder.map(mealType => {
                const mealsOfType = mealsByType[mealType];
                if (!mealsOfType || mealsOfType.length === 0) return null;
                
                return (
                  <Box key={mealType} sx={{ mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ 
                      mb: 1, 
                      textTransform: 'capitalize',
                      fontWeight: 500, 
                      color: 'primary.main' 
                    }}>
                      {mealType}
                    </Typography>
                    
                    <Grid container spacing={2}>
                      {mealsOfType.map((meal, index) => (
                        <Grid item xs={12} sm={6} md={4} key={`${meal.id || index}-${meal.name}`}>
                          <Card sx={{ 
                            height: '100%', 
                            boxShadow: 2,
                            transition: 'transform 0.2s',
                            '&:hover': {
                              transform: 'translateY(-4px)',
                              boxShadow: 3
                            }
                          }}>
                            <CardContent>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                <Typography variant="h6" sx={{ fontWeight: 500 }}>
                                  {meal.foodName || meal.name || 'Unknown Food'}
                                </Typography>
                                <IconButton 
                                  size="small" 
                                  color="error" 
                                  onClick={() => deleteMeal(date, index)}
                                  sx={{ ml: 1, p: 0.5 }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Box>
                              
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                {meal.timestamp ? format(new Date(meal.timestamp), 'h:mm a') : ''}
                              </Typography>
                              
                              <Grid container spacing={1}>
                                <Grid item xs={6}>
                                  <Typography variant="body2" color="text.secondary">Calories</Typography>
                                  <Typography variant="body1">{Number(meal.nutrition?.calories) || 0}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                  <Typography variant="body2" color="text.secondary">Protein</Typography>
                                  <Typography variant="body1">{Number(meal.nutrition?.protein) || 0}g</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                  <Typography variant="body2" color="text.secondary">Carbs</Typography>
                                  <Typography variant="body1">{Number(meal.nutrition?.carbs) || 0}g</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                  <Typography variant="body2" color="text.secondary">Fats</Typography>
                                  <Typography variant="body1">{Number(meal.nutrition?.fats) || 0}g</Typography>
                                </Grid>
                              </Grid>
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>
    );
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

      {displayMeals()}

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