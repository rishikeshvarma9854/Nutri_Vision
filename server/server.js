const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const https = require('https');
const multer = require('multer');
const upload = multer();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Google AI with better error handling
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
let genAI;
try {
  genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
} catch (error) {
  console.error('Failed to initialize Gemini API:', error);
}

// Configure CORS
app.use(cors({
  origin: ['https://nutrivision-oc9q.onrender.com', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Food detection endpoint with enhanced error handling
app.post('/api/detect', upload.single('image'), async (req, res) => {
  try {
    console.log('Received image upload request');
    
    if (!genAI) {
      throw new Error('Gemini API not properly initialized');
    }
    
    if (!req.file) {
      console.log('No file received in request');
      return res.status(400).json({ error: 'No image provided' });
    }

    // Validate image size
    const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
    if (req.file.size > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'Image size too large. Maximum size is 4MB' });
    }

    // Validate mime type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Invalid image format. Supported formats: JPEG, PNG, WebP' });
    }

    console.log('File received:', {
      size: req.file.size,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname
    });

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `You are a food image analysis expert. Analyze the following food image and return a JSON array of detected food items. For each item, include:\n- \"name\": the food name (e.g., \"idli\"),\n- \"quantity\": the exact number of items you see (e.g., 6 for 6 idlis on a plate; if you see a bowl of curry, return 1),\n- \"confidence\": your confidence score (0 to 1).\n\nExample:\n[\n  {\"name\": \"idli\", \"quantity\": 6, \"confidence\": 0.95},\n  {\"name\": \"sambar\", \"quantity\": 1, \"confidence\": 0.85}\n]\n\nIf you see multiple of the same item, count them and set \"quantity\" accordingly. If you are unsure, make your best estimate. If you cannot count, return 0 for quantity. Return only the JSON array, nothing else. Do NOT return any explanation or text before or after the JSON. and here is the image`;

    // Log prompt and image info
    console.log('Prompt sent to Gemini:', prompt);
    console.log('Image size (bytes):', req.file.size);
    console.log('Image mimetype:', req.file.mimetype);

    // Add timeout for Gemini API call
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Gemini API timeout after 30 seconds')), 30000);
    });

    // Race between API call and timeout
    const result = await Promise.race([
      model.generateContent([
        {
          inlineData: {
            data: req.file.buffer.toString('base64'),
            mimeType: req.file.mimetype
          }
        },
        prompt
      ]),
      timeoutPromise
    ]);
    
    console.log('Received response from Gemini API');
    const response = await result.response;
    const text = response.text();
    console.log('Gemini API response (raw):', text);
    
    // Try to find JSON in the response using multiple patterns
    let jsonStr = text;
    
    // Try to extract JSON from markdown code block
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    // Try to extract JSON from any code block
    const codeMatch = text.match(/```\n([\s\S]*?)\n```/);
    if (codeMatch) {
      jsonStr = codeMatch[1];
    }
    
    // Try to find JSON array directly
    const arrayMatch = text.match(/\[[\s\S]*?\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }
    
    // Clean up the string before parsing
    jsonStr = jsonStr.trim();
    
    // Convert single quotes to double quotes for valid JSON
    jsonStr = jsonStr.replace(/'/g, '"');
    
    // Parse the JSON
    let items;
    try {
      items = JSON.parse(jsonStr);
      console.log('Parsed items:', items);
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError);
      console.error('Attempted to parse:', jsonStr);
      throw new Error('Invalid JSON response from Gemini API');
    }
    
    // Ensure items is an array
    if (!Array.isArray(items)) {
      items = [items];
    }
    
    const formattedResponse = {
      success: true,
      foodItems: items.map(item => item.name || item),
      quantities: items.map(item => {
        // If quantity is missing or 0, default to 1
        if (item.quantity === undefined || item.quantity === 0) return 1;
        return item.quantity;
      }),
      confidence: items.map(item => item.confidence || 1),
      timestamp: new Date().toISOString()
    };
    console.log('Gemini parsed items:', items);
    console.log('Sending formatted response:', formattedResponse);
    res.json(formattedResponse);
  } catch (error) {
    console.error('Detailed error in food detection:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      status: error.status,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : undefined
    });

    // More specific error messages based on the error type
    let errorMessage = 'Failed to detect food items';
    let statusCode = 500;

    if (error.message.includes('timeout')) {
      errorMessage = 'Request timed out while processing the image';
      statusCode = 504;
    } else if (error.message.includes('not properly initialized')) {
      errorMessage = 'Service configuration error';
      statusCode = 503;
    } else if (error.code === 'LIMIT_FILE_SIZE') {
      errorMessage = 'Image file too large';
      statusCode = 400;
    }

    res.status(statusCode).json({ 
      error: errorMessage,
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Nutrition information endpoint
app.post('/api/get_nutrition', async (req, res) => {
  let foodItem;
  try {
    console.log('Received nutrition request:', req.body);
    
    const { foodName, food_name } = req.body;
    foodItem = foodName || food_name;
    
    if (!foodItem) {
      console.log('No food name provided in request');
      return res.status(400).json({ error: 'No food name provided' });
    }

    console.log('Getting nutrition for:', foodItem);

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `Provide nutrition information for ${foodItem}. Return a JSON object with the following structure:
    {
      "calories": number,
      "protein": number,
      "carbs": number,
      "fats": number,
      "servingSize": string
    }
    Only return the JSON object, no additional text.`;
    
    console.log('Sending request to Gemini API with prompt:', prompt);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log('Raw Gemini API response:', text);
    
    // Extract JSON from markdown code block if present
    let jsonStr = text;
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    // Clean up the response
    jsonStr = jsonStr.trim();
    jsonStr = jsonStr.replace(/'/g, '"');
    
    console.log('Cleaned JSON string:', jsonStr);
    
    // Parse the JSON
    const nutritionData = JSON.parse(jsonStr);
    console.log('Parsed nutrition data:', nutritionData);
    
    // Format response to match frontend expectations
    const formattedResponse = {
      success: true,
      total: {
        calories: Number(nutritionData.calories) || 0,
        protein: Number(nutritionData.protein) || 0,
        carbs: Number(nutritionData.carbs) || 0,
        fats: Number(nutritionData.fats) || 0
      },
      items: {
        [foodItem]: {
          calories: Number(nutritionData.calories) || 0,
          protein: Number(nutritionData.protein) || 0,
          carbs: Number(nutritionData.carbs) || 0,
          fats: Number(nutritionData.fats) || 0,
          servingSize: nutritionData.servingSize || '1 serving'
        }
      }
    };
    
    console.log('Sending formatted response:', formattedResponse);
    res.json(formattedResponse);
  } catch (error) {
    console.error('Detailed error in nutrition endpoint:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Return default values in the expected format
    const defaultResponse = {
      success: true,
      total: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0
      },
      items: {}
    };
    
    // Only add the food item if we have it
    if (foodItem) {
      defaultResponse.items[foodItem] = {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        servingSize: '1 serving'
      };
    }
    
    res.json(defaultResponse);
  }
});

// Meal classification endpoint
app.post('/api/classify_meal', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = "Classify this meal as breakfast, lunch, dinner, or snack. Return a JSON object with the classification.";
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: req.file.buffer.toString('base64'),
          mimeType: req.file.mimetype
        }
      }
    ]);
    const response = await result.response;
    const text = response.text();
    
    res.json(JSON.parse(text));
  } catch (error) {
    console.error('Error in meal classification:', error);
    res.status(500).json({ error: 'Failed to classify meal' });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 