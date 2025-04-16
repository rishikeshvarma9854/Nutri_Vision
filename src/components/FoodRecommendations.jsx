import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, List, ListItem, ListItemText, ListItemIcon, Divider, Alert } from '@mui/material';
import { CheckCircle as CheckIcon, Cancel as CancelIcon } from '@mui/icons-material';
import { db, auth } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

const DEFAULT_RECOMMENDATIONS = {
  recommended: [
    { name: 'Lean Proteins', description: 'Chicken breast, fish, tofu, eggs' },
    { name: 'Whole Grains', description: 'Brown rice, quinoa, oats' },
    { name: 'Leafy Greens', description: 'Spinach, kale, broccoli' },
    { name: 'Healthy Fats', description: 'Avocados, nuts, olive oil' },
    { name: 'Fruits', description: 'Berries, apples, citrus fruits' }
  ],
  avoid: [
    { name: 'Processed Foods', description: 'Packaged snacks, instant meals' },
    { name: 'Sugary Drinks', description: 'Sodas, artificial juices' },
    { name: 'Refined Grains', description: 'White bread, pastries' },
    { name: 'Trans Fats', description: 'Fried foods, margarine' },
    { name: 'Excessive Salt', description: 'Chips, processed meats' }
  ]
};

const FoodRecommendations = () => {
  const [recommendations, setRecommendations] = useState(DEFAULT_RECOMMENDATIONS);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    try {
      if (!auth.currentUser) {
        setError('Please sign in to view personalized recommendations');
        return;
      }

      const userId = auth.currentUser.uid;
      const userDoc = await getDoc(doc(db, 'userProfiles', userId));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        // For now, using static recommendations
        setRecommendations(DEFAULT_RECOMMENDATIONS);
        setError(null);
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      setError('Using default recommendations');
      setRecommendations(DEFAULT_RECOMMENDATIONS);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {error && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom color="primary">
            Recommended Foods
          </Typography>
          <List>
            {recommendations.recommended.map((food, index) => (
              <React.Fragment key={index}>
                <ListItem>
                  <ListItemIcon>
                    <CheckIcon color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary={food.name}
                    secondary={food.description}
                  />
                </ListItem>
                {index < recommendations.recommended.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom color="error">
            Foods to Avoid
          </Typography>
          <List>
            {recommendations.avoid.map((food, index) => (
              <React.Fragment key={index}>
                <ListItem>
                  <ListItemIcon>
                    <CancelIcon color="error" />
                  </ListItemIcon>
                  <ListItemText
                    primary={food.name}
                    secondary={food.description}
                  />
                </ListItem>
                {index < recommendations.avoid.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </CardContent>
      </Card>
    </Box>
  );
};

export default FoodRecommendations; 