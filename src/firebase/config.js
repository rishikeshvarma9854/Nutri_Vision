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

// Get the development auth domain
const getDevelopmentAuthDomain = () => {
  // For development, always use the Firebase auth domain
  // This ensures Google Sign-in works properly
  return process.env.REACT_APP_FIREBASE_AUTH_DOMAIN;
};

const firebaseConfig = {
  apiKey: "AIzaSyA6cUdhIJ7vuMrRPJMaVWTWtaIZ7T-0J2U",
  authDomain: "nutri-vision-704d5.firebaseapp.com",
  projectId: "nutri-vision-704d5",
  storageBucket: "nutri-vision-704d5.appspot.com",
  messagingSenderId: "459313233457",
  appId: "1:459313233457:web:e8497090f2a65c09c65f10",
  measurementId: "G-5R7PH6HJ83"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
const auth = getAuth(app);

// Initialize Firestore with persistent cache and better error handling
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  }),
  experimentalForceLongPolling: true,
  ignoreUndefinedProperties: true
});

// Initialize other Firebase services
const storage = getStorage(app);
const analytics = getAnalytics(app);

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

// Export Firebase services
export { auth, db, storage, analytics, optimizedWrite };
export default app; 