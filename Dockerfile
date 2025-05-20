# Build stage for frontend
FROM node:18-alpine as frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/dist ./dist

# Copy server code
COPY server ./server

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV GOOGLE_API_KEY=AIzaSyBS--qFPRpUxyf1MQBcq2I0Gb8GRW7iUrk
ENV VITE_FIREBASE_API_KEY=your_firebase_api_key
ENV VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
ENV VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
ENV VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
ENV VITE_FIREBASE_APP_ID=your_firebase_app_id
ENV VITE_GEMINI_API_KEY=AIzaSyBS--qFPRpUxyf1MQBcq2I0Gb8GRW7iUrk

# Expose the port
EXPOSE 3000

# Start the server
CMD ["node", "server/server.js"]