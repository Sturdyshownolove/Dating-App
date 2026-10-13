import { create } from 'zustand';
import { Message } from '@/services/firestore';
import { sendMessage, subscribeToMessages, markMessagesAsSeen, setTypingStatus, subscribeToTyping } from '@/services/chat';

interface ChatState {
  messages: Message[];
  isTyping: boolean;
  isSending: boolean;
  isLocked: boolean;

  setMessages: (messages: Message[]) => void;
  setIsTyping: (typing: boolean) => void;
  setLocked: (locked: boolean) => void;
  send: (matchId: string, senderId: string, text: string, imageUrl?: string | null) => Promise<boolean>;
  subscribe: (matchId: string) => () => void;
  subscribeTyping: (matchId: string, otherUserId: string) => () => void;
  markSeen: (matchId: string, userId: string) => void;
  updateTyping: (matchId: string, userId: string, typing: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isTyping: false,
  isSending: false,
  isLocked: false,

  setMessages: (messages) => set({ messages }),
  setIsTyping: (isTyping) => set({ isTyping }),
  setLocked: (isLocked) => set({ isLocked }),

  send: async (matchId, senderId, text, imageUrl = null) => {
    if (get().isLocked) return false;
    set({ isSending: true });
    const success = await sendMessage(matchId, senderId, text, imageUrl);
    set({ isSending: false });
    if (!success) set({ isLocked: true });
    return success;
  },

  subscribe: (matchId) => {
    return subscribeToMessages(matchId, (messages) => set({ messages }));
  },

  subscribeTyping: (matchId, otherUserId) => {
    return subscribeToTyping(matchId, otherUserId, (typing) => set({ isTyping: typing }));
  },

  markSeen: (matchId, userId) => {
    markMessagesAsSeen(matchId, userId);
  },

  updateTyping: (matchId, userId, typing) => {
    setTypingStatus(matchId, userId, typing);
  },
}));
