from config import create_app, SERVER_CONFIG, MODEL_CONFIG
from flask import request, jsonify
import numpy as np
import cv2
from PIL import Image
import io
import base64
import torch
import torchvision.transforms as transforms
from torchvision import models
from flask_cors import CORS
import google.generativeai as genai
import os
from datetime import datetime
from efficientnet_pytorch import EfficientNet
from dotenv import load_dotenv

app = create_app()
CORS(app)

# Load environment variables
load_dotenv()

# Load the model and classes
def load_model():
    model = models.efficientnet_v2_s(pretrained=False)
    num_classes = 256
    model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, num_classes)
    model.load_state_dict(torch.load("efficientnet_v2_food256.pth", map_location=torch.device("cuda" if torch.cuda.is_available() else "cpu")))
    model.eval()
    return model

# Load class labels
def load_classes():
    classes = {}
    with open("category.txt", 'r') as f:
        next(f)  # Skip header
        for line in f:
            values = line.strip().split("\t")
            if len(values) == 2:
                classes[int(values[0]) - 1] = values[1]  # Convert to 0-based index
    return classes

# Initialize model and classes
model = load_model()
classes = load_classes()

# Define transformations
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# Configure Gemini
GOOGLE_API_KEY = os.getenv('GOOGLE_GENAI_API_KEY')  # Use the same env var as Node.js server
if not GOOGLE_API_KEY:
    raise ValueError("Missing GOOGLE_GENAI_API_KEY environment variable")

genai.configure(api_key=GOOGLE_API_KEY)
gemini_model = genai.GenerativeModel('gemini-2.0-flash')

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'}), 200

@app.route('/classify_meal', methods=['POST'])
def classify_meal():
    try:
        data = request.get_json()
        if not data or 'food_name' not in data or 'hour' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400

        food_name = data['food_name']
        hour = data['hour']
        suggested_type = data.get('suggested_type', None)

        # Simple time-based classification
        meal_type = suggested_type or determineMealTypeByHour(hour)

        return jsonify({
            'success': True,
            'meal_type': meal_type
        })

    except Exception as e:
        print('Error in classify_meal:', str(e))
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def determineMealTypeByHour(hour):
    # Breakfast: 6 AM - 11 AM
    if 6 <= hour < 11:
        return 'breakfast'
    # Lunch: 11:30 AM - 3 PM
    elif 11.5 <= hour < 15:
        return 'lunch'
    # Snacks: 3:30 PM - 7 PM
    elif 15.5 <= hour < 19:
        return 'snacks'
    # Dinner: 7:30 PM - 12 AM
    elif hour >= 19.5 or hour < 0:
        return 'dinner'
    # All other times (12 AM - 5:59 AM, 11:00 AM - 11:29 AM, 3:00 PM - 3:29 PM, 7:00 PM - 7:29 PM) are snacks
    return 'snacks'

@app.route('/detect', methods=['POST'])
def detect_food():
    try:
        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image file provided'}), 400

        image_file = request.files['image']
        image_data = image_file.read()
        
        # Create image data for Gemini
        image_parts = [
            {
                "mime_type": image_file.content_type,
                "data": image_data
            }
        ]

        prompt = """Analyze this food image and identify ALL food items present. Return the names in this exact format: ['FOOD_NAME_1', 'FOOD_NAME_2', ...]. 
        Focus on identifying specific dishes rather than generic categories.
        For example, prefer 'mango pudding' over 'pudding', 'fig jelly' over 'jelly'.
        Be as specific as possible with the cuisine and preparation method if visible.
        No other text."""

        response = gemini_model.generate_content([prompt, image_parts[0]])
        text = response.text.strip()

        # Parse the food items array
        import re
        matches = re.search(r'\[(.*)\]', text)
        if not matches:
            raise ValueError('Invalid response format from Gemini')

        food_items = [
            item.strip().strip('"\'') 
            for item in matches.group(1).split(',')
            if item.strip()
        ]

        print(f"Detected food items: {food_items}")

        return jsonify({
            'success': True,
            'foodItems': food_items,
            'modelDetails': {
                'gemini': {
                    'success': True,
                    'detected': food_items
                }
            }
        })

    except Exception as e:
        print(f"Error in food detection: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to process image',
            'details': str(e)
        }), 500

@app.route('/get_nutrition', methods=['POST'])
def get_nutrition():
    try:
        data = request.json
        food_name = data.get('food_name')
        
        if not food_name:
            return jsonify({'error': 'No food name provided'}), 400

        # Handle both single food item and array of food items
        food_items = food_name if isinstance(food_name, list) else [food_name]
        
        prompt = f"""You are a nutrition data API. For each food item in this list: {', '.join(food_items)}, return a JSON object with these exact numeric values (no text, no explanations):
{{
  "items": {{
    "FOOD_NAME_1": {{
      "calories": number,
      "protein": number,
      "carbs": number,
      "fats": number
    }},
    // ... other food items ...
  }},
  "total": {{
    "calories": number (sum of all items),
    "protein": number (sum of all items),
    "carbs": number (sum of all items),
    "fats": number (sum of all items)
  }}
}}
Use average values per serving. Numbers only, no units or ranges."""

        response = gemini_model.generate_content(prompt)
        nutrition_text = response.text.strip()
        
        # Clean up the response to ensure it's valid JSON
        import json
        nutrition_text = nutrition_text.replace('```json', '').replace('```', '').strip()
        nutrition_data = json.loads(nutrition_text)

        # Validate nutrition data
        if not nutrition_data.get('items') or not nutrition_data.get('total'):
            raise ValueError('Invalid nutrition data format - missing items or total')

        # Validate each item and total
        def validate_nutrition(data):
            required_keys = ['calories', 'protein', 'carbs', 'fats']
            return all(
                isinstance(data.get(key), (int, float)) and data.get(key) >= 0 
                for key in required_keys
            )

        # Validate total
        if not validate_nutrition(nutrition_data['total']):
            raise ValueError('Invalid total nutrition data format')

        # Validate each item
        for item_name, item_data in nutrition_data['items'].items():
            if not validate_nutrition(item_data):
                raise ValueError(f'Invalid nutrition data format for {item_name}')

        # Round all numbers to 1 decimal place
        def round_nutrition(data):
            return {
                'calories': round(data['calories'] * 10) / 10,
                'protein': round(data['protein'] * 10) / 10,
                'carbs': round(data['carbs'] * 10) / 10,
                'fats': round(data['fats'] * 10) / 10
            }

        processed_data = {
            'success': True,
            'items': {
                name: round_nutrition(item_data)
                for name, item_data in nutrition_data['items'].items()
            },
            'total': round_nutrition(nutrition_data['total'])
        }

        print(f"Processed nutrition data: {processed_data}")
        return jsonify(processed_data)

    except Exception as e:
        print(f"Error getting nutrition data:\n  {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get nutrition data',
            'details': str(e)
        }), 500

if __name__ == '__main__':
    app.run(**SERVER_CONFIG) 