@echo off
setlocal

REM Set your Docker Hub username
set DOCKER_USERNAME=rishikesh9854

echo Step 1: Building Docker image...
docker build -t nutri-vision .
if %ERRORLEVEL% neq 0 (
    echo Error building Docker image!
    pause
    exit /b %ERRORLEVEL%
)

echo Step 2: Tagging image...
docker tag nutri-vision %DOCKER_USERNAME%/nutri-vision:latest
if %ERRORLEVEL% neq 0 (
    echo Error tagging Docker image!
    pause
    exit /b %ERRORLEVEL%
)

echo Step 3: Pushing to Docker Hub...
docker push %DOCKER_USERNAME%/nutri-vision:latest
if %ERRORLEVEL% neq 0 (
    echo Error pushing to Docker Hub!
    pause
    exit /b %ERRORLEVEL%
)

echo Success! Image has been pushed to Docker Hub.
pause 
 