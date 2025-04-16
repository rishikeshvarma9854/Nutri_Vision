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
  Alert,
  Paper
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
  Filler,
  BarElement
} from 'chart.js';
import { db, auth } from '../firebase/config';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import MealAnalysis from '../components/MealAnalysis';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
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
    streak: [],
    dates: [],
    mealBreakdown: {}
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
      
      // Process meal data into daily totals and meal-specific breakdowns
      const dailyTotals = {};
      const mealBreakdown = {};
      
      if (userMealsDoc.exists()) {
        const mealsData = userMealsDoc.data();
        Object.entries(mealsData).forEach(([date, dayData]) => {
          const mealDate = new Date(date);
          if (mealDate >= startDate && mealDate <= endDate) {
            // Initialize daily totals
            dailyTotals[date] = {
              calories: 0,
              protein: 0,
              carbs: 0,
              fats: 0
            };
            
            // Process each meal type
            Object.entries(dayData).forEach(([mealType, mealData]) => {
              if (!mealBreakdown[date]) {
                mealBreakdown[date] = {};
              }
              
              // Store meal-specific data
              mealBreakdown[date][mealType] = {
                calories: mealData.nutrition?.calories || 0,
                protein: mealData.nutrition?.protein || 0,
                carbs: mealData.nutrition?.carbs || 0,
                fats: mealData.nutrition?.fats || 0,
                timestamp: mealData.timestamp
              };
              
              // Add to daily totals
              dailyTotals[date].calories += mealData.nutrition?.calories || 0;
              dailyTotals[date].protein += mealData.nutrition?.protein || 0;
              dailyTotals[date].carbs += mealData.nutrition?.carbs || 0;
              dailyTotals[date].fats += mealData.nutrition?.fats || 0;
            });
          }
        });
      }

      // Fetch user streaks
      const userStreaksRef = doc(db, 'userStreaks', userId);
      const userStreaksDoc = await getDoc(userStreaksRef);
      const streakData = {};
      
      if (userStreaksDoc.exists()) {
        const streaksData = userStreaksDoc.data();
        const history = streaksData.history || {};
        
        // Get all dates in the range
        const allDates = [];
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          allDates.push(currentDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Calculate streak for each date
        let currentStreak = 0;
        for (const date of allDates) {
          if (history[date]) {
            currentStreak++;
          } else {
            currentStreak = 0;
          }
          streakData[date] = currentStreak;
        }
      }

      // Combine all data
      const dates = [...new Set([
        ...Object.keys(dailyTotals),
        ...Object.keys(streakData)
      ])].sort();

      const processedData = {
        calories: dates.map(date => dailyTotals[date]?.calories || 0),
        protein: dates.map(date => dailyTotals[date]?.protein || 0),
        carbs: dates.map(date => dailyTotals[date]?.carbs || 0),
        fats: dates.map(date => dailyTotals[date]?.fats || 0),
        streak: dates.map(date => streakData[date] || 0),
        dates: dates.map(date => {
          const d = new Date(date);
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }),
        mealBreakdown
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
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45
        }
      },
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 100,
          callback: function(value) {
            return value.toFixed(0);
          }
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };

  // Specific options for weight chart
  const weightChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        beginAtZero: false,
        ticks: {
          stepSize: 1,
          callback: function(value) {
            return value.toFixed(1) + ' kg';
          }
        }
      }
    }
  };

  // Specific options for streak chart
  const streakChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          callback: function(value) {
            return Math.floor(value) + ' days';
          }
        }
      }
    }
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
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
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
          {/* Nutrition Overview */}
          <Grid item xs={12}>
            <Paper elevation={2} sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Nutrition Overview
              </Typography>
              <Box sx={{ 
                height: 400, 
                overflowX: 'auto',
                overflowY: 'hidden'
              }}>
                <Box sx={{ 
                  minWidth: progressData.dates.length * 50,
                  height: '100%'
                }}>
                  <Line
                    options={chartOptions}
                    data={{
                      labels: progressData.dates,
                      datasets: [
                        {
                          label: 'Calories',
                          data: progressData.calories,
                          borderColor: '#FF6384',
                          backgroundColor: '#FF638420',
                          fill: true,
                          tension: 0.4,
                          pointRadius: 4,
                          pointHoverRadius: 6
                        },
                        {
                          label: 'Protein',
                          data: progressData.protein,
                          borderColor: '#36A2EB',
                          backgroundColor: '#36A2EB20',
                          fill: true,
                          tension: 0.4,
                          pointRadius: 4,
                          pointHoverRadius: 6
                        },
                        {
                          label: 'Carbs',
                          data: progressData.carbs,
                          borderColor: '#4BC0C0',
                          backgroundColor: '#4BC0C020',
                          fill: true,
                          tension: 0.4,
                          pointRadius: 4,
                          pointHoverRadius: 6
                        },
                        {
                          label: 'Fats',
                          data: progressData.fats,
                          borderColor: '#FFCE56',
                          backgroundColor: '#FFCE5620',
                          fill: true,
                          tension: 0.4,
                          pointRadius: 4,
                          pointHoverRadius: 6
                        }
                      ]
                    }}
                  />
                </Box>
              </Box>
            </Paper>
          </Grid>

          {/* Streak Progress */}
          <Grid item xs={12}>
            <Paper elevation={2} sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Diet Adherence Streak
              </Typography>
              <Box sx={{ 
                height: 300,
                overflowX: 'auto',
                overflowY: 'hidden'
              }}>
                <Box sx={{ 
                  minWidth: progressData.dates.length * 50,
                  height: '100%'
                }}>
                  <Line
                    options={{
                      ...chartOptions,
                      scales: {
                        ...chartOptions.scales,
                        y: {
                          beginAtZero: true,
                          ticks: {
                            stepSize: 1,
                            callback: function(value) {
                              return Math.floor(value) + ' days';
                            }
                          }
                        }
                      },
                      plugins: {
                        ...chartOptions.plugins,
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              return `Streak: ${context.parsed.y} days`;
                            }
                          }
                        }
                      }
                    }}
                    data={createChartData('Daily Streak', progressData.streak, '#4BC0C0')}
                  />
                </Box>
              </Box>
            </Paper>
          </Grid>

          {/* AI Analysis */}
          <Grid item xs={12}>
            <MealAnalysis mealData={progressData.mealBreakdown} />
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
};

export default Progress; 