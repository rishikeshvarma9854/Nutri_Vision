const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Function to process scheduled notifications
exports.processScheduledNotifications = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
  const now = admin.firestore.Timestamp.now();
  const db = admin.firestore();
  
  try {
    // Get all pending notifications scheduled for now or earlier
    const querySnapshot = await db.collection('scheduledNotifications')
      .where('status', '==', 'pending')
      .where('scheduledTime', '<=', now)
      .get();

    const batch = db.batch();
    const promises = [];

    for (const doc of querySnapshot.docs) {
      const notification = doc.data();
      
      // Skip if max reminders reached
      if (notification.reminderCount >= notification.maxReminders) {
        batch.update(doc.ref, { status: 'expired' });
        continue;
      }

      // Skip if already acknowledged
      if (notification.acknowledged) {
        batch.update(doc.ref, { status: 'completed' });
        continue;
      }

      // Get user's FCM token
      const userDoc = await db.collection('users').doc(notification.userId).get();
      if (!userDoc.exists || !userDoc.data().fcmToken) {
        console.log('No FCM token found for user:', notification.userId);
        continue;
      }

      const fcmToken = userDoc.data().fcmToken;

      // Send the notification
      try {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: notification.title,
            body: notification.body
          },
          data: {
            notificationId: doc.id,
            type: notification.type,
            ...notification.data
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'reminders',
              priority: 'max',
              defaultSound: true,
              defaultVibrateTimings: true
            }
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1
              }
            }
          }
        });

        // Mark notification as sent and increment reminder count
        batch.update(doc.ref, { 
          status: 'sent',
          sentAt: now,
          reminderCount: admin.firestore.FieldValue.increment(1)
        });

        // Schedule next reminder if acknowledgment required and not at max reminders
        if (notification.data.requireAcknowledgment && 
            !notification.acknowledged && 
            notification.reminderCount < notification.maxReminders - 1) {
          
          const nextReminderTime = new Date(now.toDate());
          nextReminderTime.setMinutes(nextReminderTime.getMinutes() + 5); // 5-minute follow-up

          batch.create(db.collection('scheduledNotifications').doc(), {
            ...notification,
            title: `Reminder: ${notification.title}`,
            scheduledTime: admin.firestore.Timestamp.fromDate(nextReminderTime),
            status: 'pending',
            reminderCount: notification.reminderCount + 1,
            createdAt: now
          });
        }

        // Schedule next occurrence for recurring reminders
        if ((notification.type === 'water_reminder' || notification.type === 'movement_reminder') && 
            notification.reminderCount === 0) { // Only reschedule on first send
          
          const settings = await db.collection('notificationSettings')
            .doc(notification.userId)
            .get();

          if (settings.exists) {
            const userSettings = settings.data();
            const reminderSettings = notification.type === 'water_reminder' 
              ? userSettings.waterReminders 
              : userSettings.movementReminders;

            if (reminderSettings.enabled) {
              const interval = parseInt(reminderSettings.interval);
              const [endHours, endMinutes] = reminderSettings.endTime.split(':').map(Number);
              
              const nextTime = new Date(notification.scheduledTime.toDate());
              nextTime.setMinutes(nextTime.getMinutes() + interval);

              const endTime = new Date(nextTime);
              endTime.setHours(endHours, endMinutes, 0, 0);

              // Only schedule if within the same day's time window
              if (nextTime <= endTime) {
                batch.create(db.collection('scheduledNotifications').doc(), {
                  ...notification,
                  scheduledTime: admin.firestore.Timestamp.fromDate(nextTime),
                  status: 'pending',
                  reminderCount: 0,
                  createdAt: now
                });
              }
            }
          }
        }

      } catch (error) {
        console.error('Error sending notification:', error);
        batch.update(doc.ref, { 
          status: 'error',
          error: error.message
        });
      }
    }

    await batch.commit();
    return null;
  } catch (error) {
    console.error('Error processing notifications:', error);
    return null;
  }
});

// Function to handle notification acknowledgments
exports.handleNotificationAcknowledgment = functions.firestore
  .document('userActivity/{userId}/notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    const acknowledgment = snap.data();
    const { userId, notificationId } = context.params;

    try {
      const db = admin.firestore();
      const notificationRef = db.collection('scheduledNotifications').doc(notificationId);
      const notificationDoc = await notificationRef.get();

      if (!notificationDoc.exists) {
        console.log('Notification not found:', notificationId);
        return null;
      }

      const notification = notificationDoc.data();
      const batch = db.batch();

      // Mark the original notification as acknowledged
      batch.update(notificationRef, {
        acknowledged: true,
        acknowledgedAt: acknowledgment.timestamp
      });

      // Cancel any pending reminders for this notification
      const pendingRemindersQuery = await db.collection('scheduledNotifications')
        .where('data.originalNotificationId', '==', notificationId)
        .where('status', '==', 'pending')
        .get();

      pendingRemindersQuery.forEach(doc => {
        batch.update(doc.ref, { 
          status: 'cancelled',
          cancelledAt: acknowledgment.timestamp
        });
      });

      await batch.commit();
      return null;
    } catch (error) {
      console.error('Error handling notification acknowledgment:', error);
      return null;
    }
}); 