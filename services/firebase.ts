import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

// Firebase is auto-initialized via google-services.json (Android)
// and GoogleService-Info.plist (iOS) — no manual init needed.

export const firebaseAuth = auth();
export const db = firestore();
export const firebaseStorage = storage();

// Collections
export const Collections = {
  USERS: 'users',
  MATCHES: 'matches',
  MESSAGES: 'messages',
  SWIPES: 'swipes',
  REPORTS: 'reports',
  NOTIFICATIONS: 'notifications',
} as const;

// Server timestamp helper
export const serverTimestamp = firestore.FieldValue.serverTimestamp;

// Firestore timestamp conversion
export const toDate = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (timestamp.toDate) return timestamp.toDate();
  if (timestamp instanceof Date) return timestamp;
  return new Date(timestamp);
};

export default firebase;
