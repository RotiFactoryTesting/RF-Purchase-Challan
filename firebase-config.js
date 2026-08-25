// ─────────────────────────────────────────────────────────
// RF Purchase Challan — Firebase configuration
// ─────────────────────────────────────────────────────────
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (or reuse an existing one)
// 3. Project settings ⚙ → General → "Your apps" → Add app → Web (</>)
// 4. Copy the firebaseConfig object it gives you and paste the values below
// 5. In the Firebase console, enable:
//      - Authentication → Sign-in method → Email/Password
//      - Firestore Database → Create database (start in production mode)
//    Then paste firestore.rules (included in this folder) into
//    Firestore → Rules, and click Publish.
// ─────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyCJX2RS0qihImi3AJin7j-SsyAhe01JGdI",
  authDomain: "rf-purchase-challan.firebaseapp.com",
  projectId: "rf-purchase-challan",
  storageBucket: "rf-purchase-challan.firebasestorage.app",
  messagingSenderId: "951171956657",
  appId: "1:951171956657:web:9ca3dca089e4520afe8790"
};
