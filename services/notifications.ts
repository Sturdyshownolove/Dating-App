import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { db, Collections, serverTimestamp } from './firebase';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const registerForPushNotifications = async (userId: string): Promise<string | null> => {
  try {
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Push token lives in `users/{uid}/private/push` — the parent users doc
    // is broadly readable for the discovery feed, and Expo's push API is
    // unauthenticated (possession = ability to send), so the token must
    // never sit on a doc any other user can read.
    await db
      .collection(Collections.USERS).doc(userId)
      .collection('private').doc('push')
      .set({ token, updatedAt: serverTimestamp() }, { merge: true });

    // Legacy top-level `users/{uid}.pushToken` field is cleaned up by
    // the scheduled `sweepLegacyUserFields` CF (daily 04:00 UTC) — no
    // client-side clear needed.

    // Configure Android channel
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('matches', {
        name: 'Matches',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6C5CE7',
      });
      Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
      });
      Notifications.setNotificationChannelAsync('timer', {
        name: 'Timer Warnings',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
};

export const scheduleTimerWarning = async (
  matchId: string,
  otherUserName: string,
  expiresAt: Date
) => {
  const warningTime = new Date(expiresAt.getTime() - 10 * 60 * 1000); // 10 min before
  const now = new Date();

  if (warningTime > now) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Time is running out!',
        body: `Your match with ${otherUserName} expires in 10 minutes!`,
        data: { matchId, type: 'timer_warning' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: warningTime },
    });
  }
};

export const sendLocalNotification = async (title: string, body: string, data?: any) => {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null, // immediate
  });
};
