# 📱 Fuuk'Up — React Native & Expo Mobile Application

A cross-platform mobile application built with **React Native**, **Expo SDK**, **NativeWind (Tailwind CSS)**, and **Firebase**.

## 🚀 Tech Stack
- **Framework:** Expo 52+ / React Native 0.76+
- **Styling:** NativeWind (Tailwind CSS)
- **State Management:** Zustand
- **Backend / Auth:** Firebase Authentication, Firestore, Cloud Functions
- **Hardware Integrations:** Camera, Location, Push Notifications

## ⚙️ Configuration & Setup
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Configure Firebase:
   - Copy `google-services.json.example` to `google-services.json` and replace with your Firebase credentials.
   - Copy `.env.example` to `.env` and fill in required environment variables.
3. Start the Expo development server:
   ```bash
   npx expo start
   ```
4. Build with EAS or locally:
   ```bash
   npx eas build --platform android
   ```


## 📄 License
Copyright © 2026 Anıl Aygün. All rights reserved.
See [LICENSE](LICENSE) for terms of use.
