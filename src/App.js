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
  const [messages, setMessages] = useState([]); 
  const [newMessage, setNewMessage] = useState(""); 

  // 1. 監聽 Firebase 登入狀態
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe(); // 確保組件卸載時移除監聽
  }, []);

  // 2. 監聽 Firestore 訊息變動 (即時讀取)
  useEffect(() => {
    // 只有在 user 存在時才啟動監聽
    if (user) {
      const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedMessages = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMessages(fetchedMessages);
      }, (error) => {
        console.error("Firestore Error:", error);
      });

      return () => unsubscribe(); // **關鍵**：切換使用者或登出時，一定要停止舊的監聽
    } else {
      setMessages([]); // 登出後清空訊息列表，防止視覺殘留
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
    signOut(auth).then(() => {
      setUser(null);
      setMessages([]); // 登出時清空
    });
  };

  // 4. 傳送訊息邏輯
  const sendMessage = async (e) => {
    e.preventDefault();
    const messageToSend = newMessage.trim();
    if (messageToSend === "") return;

    try {
      // 先清空輸入框，增加使用者體驗
      setNewMessage(""); 
      
      await addDoc(collection(db, "messages"), {
        text: messageToSend,
        createdAt: serverTimestamp(),
        uid: user.uid,
        email: user.email,
      });
    } catch (err) {
      alert("發送失敗：" + err.message);
      // 如果發送失敗，可以把文字塞回去讓使用者重試
      setNewMessage(messageToSend);
    }
  };

  if (loading) return <div className="loading-screen">載入中...</div>;

  return (
    <div className="App">
      {user ? (
        <div className="chat-container">
          <header className="chat-header">
            <h3>GuGuGaGa</h3>
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
            {/* **修正點**：必須加上 value={newMessage} 讓它成為受控組件 */}
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