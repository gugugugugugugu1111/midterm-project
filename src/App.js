// src/App.js
import React, { useEffect, useState } from 'react';
import './App.css';
import { auth, googleProvider, db } from './firebase'; 
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot 
} from "firebase/firestore";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [messages, setMessages] = useState([]); // 存放訊息列表
  const [newMessage, setNewMessage] = useState(""); // 存放輸入框內容

  // 1. 監聽 Firebase 登入狀態
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. 監聽 Firestore 訊息變動 (即時讀取)
  useEffect(() => {
    if (user) {
      const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setMessages(snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })));
      });
      return () => unsubscribe();
    }
  }, [user]);

  // 3. 處理登入與註冊
  const handleSignIn = () => {
    if (!email || !password) return alert("請輸入帳號密碼");
    signInWithEmailAndPassword(auth, email, password).catch(err => alert('帳號或密碼錯誤'));
  };

  const handleSignUp = () => {
    if (!email || !password) return alert("請輸入帳號密碼");
    createUserWithEmailAndPassword(auth, email, password).catch(err => alert('註冊失敗，請檢查格式'));
  };

  const handleLogout = () => {
    signOut(auth).then(() => setUser(null));
  };

  // 4. 傳送訊息邏輯
  const sendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === "") return;

    try {
      await addDoc(collection(db, "messages"), {
        text: newMessage,
        createdAt: serverTimestamp(),
        uid: user.uid,
        email: user.email,
      });
      setNewMessage(""); // 發送完畢清空輸入框
    } catch (err) {
      alert("發送失敗：" + err.message);
    }
  };

  if (loading) return <div className="loading-screen">載入中...</div>;

  return (
    <div className="App">
      {user ? (
        // --- 登入後的聊天室介面 ---
        <div className="chat-container">
          <header className="chat-header">
            <h3>NTHU 聊天室</h3>
            <div className="user-info">
              <span>{user.email}</span>
              <button className="btn-logout" onClick={handleLogout}>登出</button>
            </div>
          </header>

          <main className="chat-messages">
            {messages.length === 0 && (
              <div className="msg-bubble system">目前還沒有訊息，開始聊天吧！</div>
            )}
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`msg-bubble ${msg.uid === user.uid ? 'sent' : 'received'}`}
              >
                <div className="msg-email">{msg.email}</div>
                <div className="msg-text">{msg.text}</div>
              </div>
            ))}
          </main>

          <form className="chat-input-area" onSubmit={sendMessage}>
            <input 
              type="text" 
              placeholder="輸入訊息..." 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <button type="submit" className="btn-send">發送</button>
          </form>
        </div>
      ) : (
        // --- 登入前的會員系統介面 ---
        <div className="auth-card">
          <h2>會員系統</h2>
          <div className="input-group">
            <label>Email 地址</label>
            <input type="email" placeholder="example@email.com" onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="input-group">
            <label>密碼</label>
            <input type="password" placeholder="請輸入密碼" onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={handleSignIn}>登入系統</button>
          <button className="btn-secondary" onClick={handleSignUp}>註冊新帳號</button>
          <div className="divider">或者</div>
          <button className="btn-google" onClick={() => signInWithPopup(auth, googleProvider)}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="G" />
            使用 Google 登入
          </button>
        </div>
      )}
    </div>
  );
}

export default App;