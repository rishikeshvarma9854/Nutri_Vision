import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  enableIndexedDbPersistence,
  CACHE_SIZE_UNLIMITED,
  memoryLocalCache,
  writeBatch,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase with error handling
let app;
let auth;
let db;
let storage;
let analytics;

try {
  app = initializeApp(firebaseConfig);
  console.log('Firebase app initialized successfully');
  
  auth = getAuth(app);
  console.log('Firebase Auth initialized successfully');
  
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    }),
    experimentalForceLongPolling: true,
    ignoreUndefinedProperties: true
  });
  console.log('Firebase Firestore initialized successfully');
  
  storage = getStorage(app);
  console.log('Firebase Storage initialized successfully');
  
  analytics = getAnalytics(app);
  console.log('Firebase Analytics initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
  // Provide fallback values
  app = null;
  auth = null;
  db = null;
  storage = null;
  analytics = null;
}

// Enhanced write queue with strict rate limiting
let writeQueue = [];
const MAX_QUEUE_SIZE = 5;
const PROCESS_INTERVAL = 30000; // 30 seconds
const MAX_RETRIES = 3;
const WRITE_RATE_LIMIT = 100; // Maximum writes per minute
let lastWriteTime = Date.now();
let writesInLastMinute = 0;
let isProcessing = false;

const processWriteQueue = async () => {
  if (writeQueue.length === 0 || isProcessing) return;

  isProcessing = true;

  try {
    // Check rate limit
    const now = Date.now();
    if (now - lastWriteTime > 60000) {
      writesInLastMinute = 0;
      lastWriteTime = now;
    }

    if (writesInLastMinute >= WRITE_RATE_LIMIT) {
      console.warn('Write rate limit reached, delaying writes');
      return;
    }

    const batch = writeBatch(db);
    const itemsToProcess = writeQueue.splice(0, MAX_QUEUE_SIZE);

    for (const { ref, data, options, retries = 0 } of itemsToProcess) {
      batch.set(ref, data, options);
    }

    await batch.commit();
    writesInLastMinute += itemsToProcess.length;
    console.log(`Processed ${itemsToProcess.length} writes (${writesInLastMinute}/${WRITE_RATE_LIMIT} this minute)`);
  } catch (error) {
    console.error('Error processing writes:', error);
    // Put failed items back in queue with retry count
    const failedItems = itemsToProcess.map(item => ({
      ...item,
      retries: (item.retries || 0) + 1
    }));
    // Only requeue if we haven't exceeded max retries
    const itemsToRequeue = failedItems.filter(item => item.retries < MAX_RETRIES);
    writeQueue = [...itemsToRequeue, ...writeQueue];
  } finally {
    isProcessing = false;
  }
};

// Process queue periodically
setInterval(processWriteQueue, PROCESS_INTERVAL);

// Strict write function with rate limiting and queue size limits
const optimizedWrite = async (ref, data, options = {}) => {
  // Check rate limit before adding to queue
  const now = Date.now();
  if (now - lastWriteTime > 60000) {
    writesInLastMinute = 0;
    lastWriteTime = now;
  }

  if (writesInLastMinute >= WRITE_RATE_LIMIT) {
    console.warn('Write rate limit reached, delaying write');
    setTimeout(() => optimizedWrite(ref, data, options), 5000);
    return;
  }

  // Check queue size limit
  if (writeQueue.length >= 100) {
    console.warn('Write queue size limit reached, dropping oldest write');
    writeQueue.shift();
  }

  writeQueue.push({ ref, data, options });
  
  if (writeQueue.length >= MAX_QUEUE_SIZE && !isProcessing) {
    await processWriteQueue();
  }
};

export { app, auth, db, storage, analytics, optimizedWrite }; 