from flask import Flask, request
from flask_cors import CORS
import os
import socket

def get_local_ip():
    try:
        # Create a socket connection to get the local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except:
        return 'localhost'

def create_app():
    app = Flask(__name__)
    
    # Get the local IP address
    local_ip = get_local_ip()
    
    # Default allowed origins including dynamic IP
    default_origins = [
        'http://localhost:3000',
        'http://localhost:5000',
        'https://nutri-vision-704d5.web.app',
        'https://nutri-vision-704d5.firebaseapp.com',
        f'http://{local_ip}:3000',
        f'http://{local_ip}:5000'
    ]
    
    # Get additional origins from environment variable
    additional_origins = os.getenv('ALLOWED_ORIGINS', '').split(',')
    allowed_origins = default_origins + [origin for origin in additional_origins if origin]
    
    # Enable CORS for all routes with specific origins
    CORS(app, resources={
        r"/*": {
            "origins": allowed_origins,
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "Accept"],
            "expose_headers": ["Content-Type"],
            "supports_credentials": True,
            "max_age": 3600
        }
    })
    
    # Add CORS headers to all responses
    @app.after_request
    def after_request(response):
        origin = request.headers.get('Origin')
        if origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,Accept'
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