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

app = create_app()
CORS(app)

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
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
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
        # Get the image file from the request
        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image file provided'}), 400

        image_file = request.files['image']
        if not image_file:
            return jsonify({'success': False, 'error': 'No image file provided'}), 400

        # Read and process the image
        image_bytes = image_file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # Prepare image for model
        input_tensor = transform(image).unsqueeze(0)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model.to(device)
        input_tensor = input_tensor.to(device)

        # Perform inference
        with torch.no_grad():
            outputs = model(input_tensor)
            probabilities = torch.nn.functional.softmax(outputs, dim=1)
            confidence, predicted_class = torch.max(probabilities, 1)

        predicted_label = classes[predicted_class.item()]
        confidence_value = confidence.item()

        # Get top 3 predictions
        top_probs, top_classes = torch.topk(probabilities, 3)
        predictions = []
        for i in range(3):
            class_idx = top_classes[0][i].item()
            prob = top_probs[0][i].item()
            predictions.append({
                'label': classes[class_idx],
                'confidence': prob
            })

        # Define nutrition values based on the predicted food
        # TODO: Replace with actual nutrition database lookup
        nutrition_values = {
            'calories': 200,  # Default values
            'protein': 10,
            'carbs': 25,
            'fats': 8
        }

        # Check confidence threshold
        if confidence_value < MODEL_CONFIG['confidence_threshold']:
            return jsonify({
                'success': False,
                'error': 'Low confidence in food detection',
                'predictions': predictions
            })

        response = {
            'success': True,
            'foodItems': [predicted_label],
            'predictions': predictions,
            'nutrition': nutrition_values
        }

        return jsonify(response)

    except Exception as e:
        print('Error in detect_food:', str(e))
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/get_nutrition', methods=['POST'])
def get_nutrition():
    try:
        data = request.json
        food_name = data.get('food_name')
        
        if not food_name:
            return jsonify({'error': 'No food name provided'}), 400

        # Prompt Gemini for nutrition information with more specific instructions
        prompt = f"""
        Analyze the nutritional content of one serving of {food_name} and provide accurate values.
        Return only a JSON object with the following format, no other text:
        {{
            "calories": (realistic calories in kcal),
            "protein": (realistic protein content in grams),
            "carbs": (realistic carbohydrate content in grams),
            "fats": (realistic fat content in grams)
        }}
        
        Ensure values are realistic and specific to {food_name}. Base the values on standard serving sizes.
        For example:
        - Rice (1 cup): ~200 calories, 4g protein, 45g carbs, 0g fat
        - Fried Shrimp (6 pieces): ~230 calories, 14g protein, 16g carbs, 12g fat
        - Pizza (1 slice): ~285 calories, 12g protein, 36g carbs, 10g fat
        - Sushi (1 roll): ~250 calories, 9g protein, 38g carbs, 7g fat
        """

        response = gemini_model.generate_content(prompt)
        nutrition_text = response.text.strip()
        
        # Clean up the response to ensure it's valid JSON
        nutrition_text = nutrition_text.replace('```json', '').replace('```', '').strip()
        nutrition_data = eval(nutrition_text)  # Convert string to dict
        
        # Validate the nutrition data
        required_keys = ['calories', 'protein', 'carbs', 'fats']
        for key in required_keys:
            if key not in nutrition_data or not isinstance(nutrition_data[key], (int, float)):
                raise ValueError(f"Invalid or missing {key} value")

        print(f"Nutrition data for {food_name}:", nutrition_data)
        return jsonify(nutrition_data)

    except Exception as e:
        print(f"Error getting nutrition data: {str(e)}")
        # Return reasonable default values based on the food type
        default_values = {
            'rice': {'calories': 200, 'protein': 4, 'carbs': 45, 'fats': 0},
            'fried shrimp': {'calories': 230, 'protein': 14, 'carbs': 16, 'fats': 12},
            'pizza': {'calories': 285, 'protein': 12, 'carbs': 36, 'fats': 10},
            'sushi': {'calories': 250, 'protein': 9, 'carbs': 38, 'fats': 7}
        }
        
        food_name_lower = food_name.lower()
        for key in default_values:
            if key in food_name_lower:
                return jsonify(default_values[key])
                
        return jsonify({
            'calories': 200,
            'protein': 10,
            'carbs': 25,
            'fats': 8
        })

if __name__ == '__main__':
    app.run(**SERVER_CONFIG) 