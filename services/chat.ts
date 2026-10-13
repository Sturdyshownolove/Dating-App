import { db, Collections, serverTimestamp, toDate } from './firebase';
import { Message } from './firestore';

export const sendMessage = async (
  matchId: string,
  senderId: string,
  text: string,
  imageUrl: string | null = null
): Promise<boolean> => {
  try {
    // Existence + active/blocked precheck is a UX-only fast-fail so the user
    // doesn't see a confusing permission-denied on a known-expired chat. The
    // authoritative gate is the firestore.rules message-create check
    // (isMatchParticipant + isActive + isBlocked); this precheck is best-effort.
    const matchDoc = await db.collection(Collections.MATCHES).doc(matchId).get();
    if (!matchDoc.exists) return false;
    const matchData = matchDoc.data()!;
    if (!matchData.isActive || matchData.isBlocked) return false;

    // Match expiry + parent-doc lastMessage update are now server-side:
    // - autoExpireMatches (every 1 min) flips isActive on time-based expiry.
    // - onMessageCreate trigger updates lastMessage / lastMessageAt.
    await db.collection(Collections.MATCHES).doc(matchId).collection('messages').add({
      matchId, senderId, text: text.trim(), imageUrl, timestamp: serverTimestamp(), seen: false,
    });
    return true;
  } catch (error) {
    console.error('Error sending message:', error);
    return false;
  }
};

export const subscribeToMessages = (
  matchId: string,
  callback: (messages: Message[]) => void
) => {
  return db.collection(Collections.MATCHES).doc(matchId)
    .collection('messages').orderBy('timestamp', 'desc').limit(100)
    .onSnapshot((snapshot) => {
      const messages = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id, matchId: data.matchId, senderId: data.senderId,
          text: data.text, imageUrl: data.imageUrl,
          timestamp: toDate(data.timestamp), seen: data.seen || false,
        } as Message;
      });
      callback(messages);
    });
};

export const markMessagesAsSeen = async (matchId: string, currentUserId: string): Promise<void> => {
  try {
    // Query on `seen` only (single-field, auto-indexed). Combining
    // `seen == false` with `senderId != currentUserId` requires a
    // composite (seen, senderId) index that isn't declared — that query
    // threw FAILED_PRECONDITION, so read receipts never updated. The
    // own-message exclusion is a cheap in-memory filter instead: a single
    // match's unseen set is small (messages expire with the match), so no
    // composite index is worth maintaining. Only the COUNTERPARTY's
    // messages are marked — never our own.
    const unseenSnap = await db.collection(Collections.MATCHES).doc(matchId)
      .collection('messages').where('seen', '==', false).get();
    const toMark = unseenSnap.docs.filter((doc) => doc.data().senderId !== currentUserId);
    if (toMark.length === 0) return;
    const batch = db.batch();
    toMark.forEach((doc) => batch.update(doc.ref, { seen: true }));
    await batch.commit();
  } catch (error) {
    console.error('Error marking messages as seen:', error);
  }
};

export const setTypingStatus = async (matchId: string, userId: string, isTyping: boolean): Promise<void> => {
  try {
    await db.collection(Collections.MATCHES).doc(matchId).update({ [`typing_${userId}`]: isTyping });
  } catch (error) {
    console.error('Error setting typing status:', error);
  }
};

export const subscribeToTyping = (matchId: string, otherUserId: string, callback: (isTyping: boolean) => void) => {
  return db.collection(Collections.MATCHES).doc(matchId).onSnapshot((doc) => {
    if (doc.exists) callback(doc.data()?.[`typing_${otherUserId}`] || false);
  });
};
