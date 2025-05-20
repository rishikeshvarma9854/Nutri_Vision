import { db } from '../config';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';

// Constants for notification types and intervals
const NOTIFICATION_TYPES = {
  PROFILE_UPDATE: 'profile_update',
  MEAL_REMINDER: 'meal_reminder',
  WATER_REMINDER: 'water_reminder',
  MOVEMENT_REMINDER: 'movement_reminder'
};

const REMINDER_INTERVALS = {
  NORMAL: 30, // 30 minutes
  SHORT: 15,  // 15 minutes
  LONG: 60    // 60 minutes
};

const DEFAULT_NOTIFICATION_SETTINGS = {
  profileUpdate: {
    enabled: true,
    frequency: 'monthly', // monthly reminder to update profile
  },
  mealReminders: {
    enabled: true,
    breakfast: '08:00',
    lunch: '13:00',
    snacks: '16:00',
    dinner: '20:00'
  },
  waterReminders: {
    enabled: true,
    interval: 120, // minutes (every 2 hours)
    startTime: '08:00',
    endTime: '22:00'
  },
  movementReminders: {
    enabled: true,
    interval: 180, // minutes (every 3 hours)
    startTime: '09:00',
    endTime: '21:00'
  }
};

// Helper function to parse time string into hours and minutes
const parseTime = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return { hours, minutes };
};

// Function to request notification permission
export const requestNotificationPermission = async () => {
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};

// Function to save user notification settings
export const saveNotificationSettings = async (userId, settings) => {
  try {
    // Normalize settings structure
    const normalizedSettings = {
      ...settings,
      waterReminders: {
        enabled: settings.waterReminders?.enabled ?? true,
        interval: settings.waterReminders?.interval ?? REMINDER_INTERVALS.NORMAL,
        startTime: settings.waterReminders?.startTime ?? '08:00',
        endTime: settings.waterReminders?.endTime ?? '22:00'
      },
      movementReminders: {
        enabled: settings.movementReminders?.enabled ?? true,
        interval: settings.movementReminders?.interval ?? REMINDER_INTERVALS.LONG,
        startTime: settings.movementReminders?.startTime ?? '09:00',
        endTime: settings.movementReminders?.endTime ?? '21:00'
      }
    };

    // Save to the notificationSettings collection
    const notificationRef = doc(collection(db, 'notificationSettings'), userId);
    await setDoc(notificationRef, {
      ...normalizedSettings,
      userId,
      updatedAt: Timestamp.now()
    }, { merge: true });

    // Also save to user settings for backward compatibility
    const userSettingsRef = doc(collection(db, 'users', userId, 'settings'), 'notifications');
    await setDoc(userSettingsRef, {
      ...normalizedSettings,
      updatedAt: Timestamp.now()
    }, { merge: true });

    await initializeNotifications(userId);
  } catch (error) {
    console.error('Error saving notification settings:', error);
    throw error;
  }
};

// Function to get user notification settings
export const getNotificationSettings = async (userId) => {
  try {
    // Try to get from notificationSettings collection first
    const notificationRef = doc(collection(db, 'notificationSettings'), userId);
    let docSnap = await getDoc(notificationRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    }
    
    // If not found, try the user settings
    const userSettingsRef = doc(collection(db, 'users', userId, 'settings'), 'notifications');
    docSnap = await getDoc(userSettingsRef);
    
    if (docSnap.exists()) {
      // If found in user settings, migrate to notificationSettings collection
      const settings = docSnap.data();
      await saveNotificationSettings(userId, settings);
      return settings;
    }
    
    // If no settings found anywhere, create default settings
    await saveNotificationSettings(userId, DEFAULT_NOTIFICATION_SETTINGS);
    return DEFAULT_NOTIFICATION_SETTINGS;
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
};

// Function to send a notification
export const sendNotification = (title, body, icon = '/logo192.png') => {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon
    });
  }
};

// Function to schedule meal reminders
export const scheduleMealReminders = (settings) => {
  if (!settings.mealReminders.enabled) return;

  const meals = {
    breakfast: settings.mealReminders.breakfast,
    lunch: settings.mealReminders.lunch,
    snacks: settings.mealReminders.snacks,
    dinner: settings.mealReminders.dinner
  };

  Object.entries(meals).forEach(([meal, time]) => {
    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);

    if (scheduledTime > now) {
      const delay = scheduledTime.getTime() - now.getTime();
      setTimeout(() => {
        sendNotification(
          'Meal Time!',
          `It's time for your ${meal}. Don't forget to eat healthy!`
        );
      }, delay);
    }
  });
};

// Function to schedule a single notification
const scheduleNotification = async (userId, type, time, title, body, data = {}, settings = {}) => {
  try {
    const notificationRef = doc(collection(db, 'users', userId, 'scheduledNotifications'));
    await setDoc(notificationRef, {
      userId,
      type,
      scheduledTime: Timestamp.fromDate(time),
      title,
      body,
      data: {
        ...data,
        requireAcknowledgment: settings.requireAcknowledgment || false,
        reminderInterval: settings.reminderInterval || REMINDER_INTERVALS.NORMAL
      },
      status: 'pending',
      acknowledged: false,
      reminderCount: 0,
      maxReminders: 3,
      createdAt: Timestamp.now()
    });

    return notificationRef.id;
  } catch (error) {
    console.error('Error scheduling notification:', error);
    throw error;
  }
};

// Function to schedule water reminders
export const scheduleWaterReminders = async (userId, settings) => {
  try {
    const { enabled, interval, startTime, endTime } = settings.waterReminders;
    if (!enabled) return;

    const waterMessages = [
      "Time to hydrate! 💧",
      "Don't forget your water! 🚰",
      "Stay hydrated, stay healthy! 🌊",
      "Water break! Your body will thank you 💪",
      "Hydration check! Take a sip 🥤"
    ];

    // Clear any existing timer
    if (window.waterReminderTimer) {
      clearInterval(window.waterReminderTimer);
    }

    const now = new Date();
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;

    // Calculate time until next reminder
    let timeUntilNextReminder;
    if (currentTimeInMinutes < startTimeInMinutes) {
      // If before start time, wait until start time
      timeUntilNextReminder = startTimeInMinutes - currentTimeInMinutes;
    } else {
      // If after start time, calculate next interval
      const minutesSinceStart = currentTimeInMinutes - startTimeInMinutes;
      const intervalsSinceStart = Math.floor(minutesSinceStart / interval);
      const nextIntervalMinutes = startTimeInMinutes + (intervalsSinceStart + 1) * interval;
      timeUntilNextReminder = nextIntervalMinutes - currentTimeInMinutes;
    }

    // Convert to milliseconds
    timeUntilNextReminder = timeUntilNextReminder * 60 * 1000;

    // Start with a timeout for the first reminder
    setTimeout(() => {
      // Send first reminder
      if (currentTimeInMinutes <= endTimeInMinutes) {
        const message = waterMessages[Math.floor(Math.random() * waterMessages.length)];
        sendNotification('Water Reminder', message);
      }

      // Then start the interval
      window.waterReminderTimer = setInterval(() => {
        const currentTime = new Date();
        const currentHour = currentTime.getHours();
        const currentMinute = currentTime.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        
        if (currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes) {
          const message = waterMessages[Math.floor(Math.random() * waterMessages.length)];
          sendNotification('Water Reminder', message);
        }
      }, interval * 60 * 1000);
    }, timeUntilNextReminder);

    console.log(`Water reminders set for every ${interval} minutes between ${startTime} and ${endTime}`);
    console.log(`First reminder in ${timeUntilNextReminder / 60000} minutes`);
  } catch (error) {
    console.error('Error scheduling water reminders:', error);
  }
};

// Function to schedule movement reminders
export const scheduleMovementReminders = async (userId, settings) => {
  try {
    const { enabled, interval, startTime, endTime } = settings.movementReminders;
    if (!enabled) return;

    const activities = [
      { action: "stretch", message: "Time for a quick stretch! 🧘‍♂️" },
      { action: "walk", message: "Take a short walk around! 🚶‍♂️" },
      { action: "exercise", message: "How about some quick exercises? 💪" },
      { action: "stand", message: "Stand up and move around! 🏃‍♂️" },
      { action: "break", message: "Movement break! Your body needs it 🌟" }
    ];

    // Clear any existing timer
    if (window.movementReminderTimer) {
      clearInterval(window.movementReminderTimer);
    }

    const now = new Date();
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;

    // Calculate time until next reminder
    let timeUntilNextReminder;
    if (currentTimeInMinutes < startTimeInMinutes) {
      // If before start time, wait until start time
      timeUntilNextReminder = startTimeInMinutes - currentTimeInMinutes;
    } else {
      // If after start time, calculate next interval
      const minutesSinceStart = currentTimeInMinutes - startTimeInMinutes;
      const intervalsSinceStart = Math.floor(minutesSinceStart / interval);
      const nextIntervalMinutes = startTimeInMinutes + (intervalsSinceStart + 1) * interval;
      timeUntilNextReminder = nextIntervalMinutes - currentTimeInMinutes;
    }

    // Convert to milliseconds
    timeUntilNextReminder = timeUntilNextReminder * 60 * 1000;

    // Start with a timeout for the first reminder
    setTimeout(() => {
      // Send first reminder
      if (currentTimeInMinutes <= endTimeInMinutes) {
        const activity = activities[Math.floor(Math.random() * activities.length)];
        sendNotification('Movement Reminder', activity.message);
      }

      // Then start the interval
      window.movementReminderTimer = setInterval(() => {
        const currentTime = new Date();
        const currentHour = currentTime.getHours();
        const currentMinute = currentTime.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        
        if (currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes) {
          const activity = activities[Math.floor(Math.random() * activities.length)];
          sendNotification('Movement Reminder', activity.message);
        }
      }, interval * 60 * 1000);
    }, timeUntilNextReminder);

    console.log(`Movement reminders set for every ${interval} minutes between ${startTime} and ${endTime}`);
    console.log(`First reminder in ${timeUntilNextReminder / 60000} minutes`);
  } catch (error) {
    console.error('Error scheduling movement reminders:', error);
  }
};

// Function to schedule profile update reminder with persistence
export const scheduleProfileUpdateReminder = async (userId, settings) => {
  if (!settings.profileUpdate.enabled) return;

  try {
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1); // First day of next month
    nextMonth.setHours(10, 0, 0, 0); // 10 AM

    await scheduleNotification(
      userId,
      NOTIFICATION_TYPES.PROFILE_UPDATE,
      nextMonth,
      'Update Your Profile',
      'Time for your monthly profile update! Keep your information current for better recommendations.',
      {
        type: 'profile_update',
        scheduledFor: nextMonth.toISOString()
      },
      settings.profileUpdate
    );
  } catch (error) {
    console.error('Error scheduling profile update reminder:', error);
  }
};

// Main function to initialize all notifications
export const initializeNotifications = async (userId) => {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) {
    console.log('Notification permission not granted');
    return;
  }

  const settings = await getNotificationSettings(userId);
  
  scheduleMealReminders(settings);
  scheduleWaterReminders(userId, settings);
  scheduleMovementReminders(userId, settings);
  scheduleProfileUpdateReminder(userId, settings);
};