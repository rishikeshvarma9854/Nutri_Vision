#!/bin/bash

# Variables
RESOURCE_GROUP="nutri-vision-rg"
ACR_NAME="nutrivisionacr"
APP_NAME="nutri-vision-app"
LOCATION="eastus"
IMAGE_NAME="nutri-vision"
IMAGE_TAG="latest"

# Login to Azure
echo "Logging in to Azure..."
az login

# Create Resource Group
echo "Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Azure Container Registry
echo "Creating Azure Container Registry..."
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic

# Login to ACR
echo "Logging in to ACR..."
az acr login --name $ACR_NAME

# Build and push Docker image
echo "Building and pushing Docker image..."
docker build -t $ACR_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG .
docker push $ACR_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG

# Create App Service Plan
echo "Creating App Service Plan..."
az appservice plan create --name "${APP_NAME}-plan" --resource-group $RESOURCE_GROUP --sku P1V2 --is-linux

# Create Web App
echo "Creating Web App..."
az webapp create --resource-group $RESOURCE_GROUP --plan "${APP_NAME}-plan" --name $APP_NAME --deployment-container-image-name $ACR_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG

# Configure Web App
echo "Configuring Web App..."
az webapp config set --resource-group $RESOURCE_GROUP --name $APP_NAME --https-only true

# Enable continuous deployment
echo "Enabling continuous deployment..."
az webapp deployment container config --enable-cd true --name $APP_NAME --resource-group $RESOURCE_GROUP

echo "Deployment completed successfully!"
echo "Your app is available at: https://$APP_NAME.azurewebsites.net" 