import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB1ZzJtmFoHo8mXyE0McB4mXZJ_Lu4aOdU",
  authDomain: "gugugaga-4ce07.firebaseapp.com",
  projectId: "gugugaga-4ce07",
  storageBucket: "gugugaga-4ce07.firebasestorage.app",
  messagingSenderId: "453202620509",
  appId: "1:453202620509:web:e0a54fb4266b23319a1db4",
  measurementId: "G-Z6RVG2ZNZF"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 1. 會員機制 (Membership Mechanism)
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// 2. 資料庫 (Database read/write)
const db = getFirestore(app);

// 3. 檔案儲存 (Storage)
const storage = getStorage(app);

// 統一在最後匯出所有需要的實例，不要在上面加 export const 了
export { auth, db, googleProvider, storage };
export default app;