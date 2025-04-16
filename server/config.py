from flask import Flask, request
from flask_cors import CORS
import os

def create_app():
    app = Flask(__name__)
    
    # Enable CORS for all routes with specific origins
    CORS(app, resources={
        r"/*": {
            "origins": [
                "http://localhost:5173",    # Local development
                "http://127.0.0.1:5173",    # Local development alternative
                "http://localhost:3000",    # Another common local port
                "http://127.0.0.1:3000",    # Another common local port alternative
                "https://nutri-vision-d6596.web.app",  # Production domain
                "https://nutri-vision-d6596.firebaseapp.com"  # Firebase alternative domain
            ],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "Accept"],
            "expose_headers": ["Content-Type"],
            "supports_credentials": False,
            "max_age": 3600
        }
    })
    
    # Add CORS headers to all responses
    @app.after_request
    def after_request(response):
        origin = request.headers.get('Origin')
        allowed_origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://nutri-vision-d6596.web.app",
            "https://nutri-vision-d6596.firebaseapp.com"
        ]
        
        if origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
        else:
            response.headers['Access-Control-Allow-Origin'] = allowed_origins[0]
            
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
        return response
    
    return app

# Server configuration
SERVER_CONFIG = {
    'host': '0.0.0.0',  # Listen on all network interfaces
    'port': int(os.getenv('PORT', 5000)),
    'debug': True,
    'threaded': True  # Enable threading
}

# Model configuration
MODEL_CONFIG = {
    'confidence_threshold': 0.3,
    'max_detections': 10
} 