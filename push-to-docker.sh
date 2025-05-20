#!/bin/bash

# Set your Docker Hub username
DOCKER_USERNAME="your_dockerhub_username"

# Build the image
echo "Building Docker image..."
docker build -t nutri-vision .

# Tag the image
echo "Tagging image..."
docker tag nutri-vision $DOCKER_USERNAME/nutri-vision:latest

# Push to Docker Hub
echo "Pushing to Docker Hub..."
docker push $DOCKER_USERNAME/nutri-vision:latest

echo "Done!" 
 