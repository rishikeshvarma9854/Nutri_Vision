import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert
} from '@mui/material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { db, auth } from '../firebase/config';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const Progress = () => {
  const [timeRange, setTimeRange] = useState('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [progressData, setProgressData] = useState({
    calories: [],
    protein: [],
    carbs: [],
    fats: [],
    weight: [],
    streak: [],
    dates: []
  });

  useEffect(() => {
    fetchProgressData();
  }, [timeRange]);

  const fetchProgressData = async () => {
    try {
      setLoading(true);
      const userId = auth.currentUser.uid;
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      switch (timeRange) {
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case 'year':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
      }

      // Fetch user meals for nutrition data
      const userMealsRef = doc(db, 'userMeals', userId);
      const userMealsDoc = await getDoc(userMealsRef);
      
      // Process meal data into daily totals
      const dailyTotals = {};
      if (userMealsDoc.exists()) {
        const mealsData = userMealsDoc.data();
        Object.entries(mealsData).forEach(([date, meals]) => {
          const mealDate = new Date(date);
          if (mealDate >= startDate && mealDate <= endDate) {
            dailyTotals[date] = meals.reduce((total, meal) => ({
              calories: total.calories + (meal.nutritionInfo?.calories || 0),
              protein: total.protein + (meal.nutritionInfo?.protein || 0),
              carbs: total.carbs + (meal.nutritionInfo?.carbs || 0),
              fats: total.fats + (meal.nutritionInfo?.fats || 0)
            }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
          }
        });
      }

      // Fetch user progress for weight data
      const userProgressRef = doc(db, 'userProgress', userId);
      const userProgressDoc = await getDoc(userProgressRef);
      const weightData = {};
      if (userProgressDoc.exists()) {
        const progressData = userProgressDoc.data();
        Object.entries(progressData).forEach(([date, data]) => {
          if (data.weight) {
            const progressDate = new Date(date);
            if (progressDate >= startDate && progressDate <= endDate) {
              weightData[date] = data.weight;
            }
          }
        });
      }

      // Fetch user streaks
      const userStreaksRef = doc(db, 'userStreaks', userId);
      const userStreaksDoc = await getDoc(userStreaksRef);
      const streakData = {};
      if (userStreaksDoc.exists()) {
        const streaksData = userStreaksDoc.data();
        Object.entries(streaksData).forEach(([date, data]) => {
          const streakDate = new Date(date);
          if (streakDate >= startDate && streakDate <= endDate) {
            streakData[date] = data.streak || 0;
          }
        });
      }

      // Combine all data
      const dates = [...new Set([
        ...Object.keys(dailyTotals),
        ...Object.keys(weightData),
        ...Object.keys(streakData)
      ])].sort();

      const processedData = {
        calories: dates.map(date => dailyTotals[date]?.calories || 0),
        protein: dates.map(date => dailyTotals[date]?.protein || 0),
        carbs: dates.map(date => dailyTotals[date]?.carbs || 0),
        fats: dates.map(date => dailyTotals[date]?.fats || 0),
        weight: dates.map(date => weightData[date] || null),
        streak: dates.map(date => streakData[date] || 0),
        dates: dates.map(date => {
          const d = new Date(date);
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        })
      };

      setProgressData(processedData);
    } catch (error) {
      console.error('Error fetching progress data:', error);
      setError('Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const createChartData = (label, data, color) => ({
    labels: progressData.dates,
    datasets: [
      {
        label,
        data,
        borderColor: color,
        backgroundColor: color + '20',
        fill: true,
        tension: 0.4
      }
    ]
  });

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Progress Tracking
        </Typography>
        <ToggleButtonGroup
          value={timeRange}
          exclusive
          onChange={(e, newValue) => newValue && setTimeRange(newValue)}
          sx={{ mb: 3 }}
        >
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="month">Month</ToggleButton>
          <ToggleButton value="year">Year</ToggleButton>
        </ToggleButtonGroup>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Calories Progress */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Calories Intake
                </Typography>
                <Line 
                  data={createChartData('Calories', progressData.calories, '#2196f3')} 
                  options={chartOptions}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Macronutrients Progress */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Macronutrients
                </Typography>
                <Line 
                  data={{
                    labels: progressData.dates,
                    datasets: [
                      {
                        label: 'Protein',
                        data: progressData.protein,
                        borderColor: '#4caf50',
                        backgroundColor: '#4caf5020',
                        fill: true,
                        tension: 0.4
                      },
                      {
                        label: 'Carbs',
                        data: progressData.carbs,
                        borderColor: '#ff9800',
                        backgroundColor: '#ff980020',
                        fill: true,
                        tension: 0.4
                      },
                      {
                        label: 'Fats',
                        data: progressData.fats,
                        borderColor: '#f44336',
                        backgroundColor: '#f4433620',
                        fill: true,
                        tension: 0.4
                      }
                    ]
                  }}
                  options={chartOptions}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Weight Progress */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Weight Progress
                </Typography>
                <Line 
                  data={createChartData('Weight (kg)', progressData.weight, '#9c27b0')}
                  options={{
                    ...chartOptions,
                    plugins: {
                      ...chartOptions.plugins,
                      tooltip: {
                        callbacks: {
                          label: (context) => `Weight: ${context.parsed.y} kg`
                        }
                      }
                    }
                  }}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Streak Progress */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Diet Adherence Streak
                </Typography>
                <Line 
                  data={createChartData('Days', progressData.streak, '#795548')}
                  options={{
                    ...chartOptions,
                    plugins: {
                      ...chartOptions.plugins,
                      tooltip: {
                        callbacks: {
                          label: (context) => `Streak: ${context.parsed.y} days`
                        }
                      }
                    }
                  }}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
};

export default Progress; 