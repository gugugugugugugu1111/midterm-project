// src/App.js
import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import { auth, googleProvider, db } from './firebase'; 
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,    // 補上這一行
  createUserWithEmailAndPassword // 補上這一行
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot,
  where,
  doc,
  setDoc,
  updateDoc,   
  getDocs, 
  getDoc,
  deleteDoc,    
  arrayUnion   
} from "firebase/firestore";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState([]); // 房間列表
  const [currentRoom, setCurrentRoom] = useState(null); // 目前選中的房間
  const [messages, setMessages] = useState([]); 
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef(null);

  // 1. 監聽登入狀態
  // 在 useEffect 監聽登入狀態中修改
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
    setUser(currentUser);
    if (currentUser) {
      const userRef = doc(db, "users", currentUser.uid);
      if (Notification.permission !== "granted") {
        Notification.requestPermission();
      }
      // 先檢查這份檔案是否已存在，避免每次登入都重寫
      const userSnap = await getDoc(userRef); // 記得頂部要 import getDoc
      
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: currentUser.email,
          uid: currentUser.uid,
          inviteId: `${currentUser.email.split('@')[0]}_${Math.floor(Math.random() * 10000)}` 
        });
      }
    }
    setLoading(false);
  });
  return () => unsubscribe();
}, []);
// 新增一個狀態來存儲個人檔案資料
const [profile, setProfile] = useState(null);

// 監聽自己的個人檔案
useEffect(() => {
  if (user) {
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (doc) => {
      setProfile(doc.data());
    });
    return () => unsubscribe();
  }
}, [user]);

// 修改邀請 ID 的功能
const updateInviteId = async () => {
  const newId = prompt("設置你的專屬ID (不可重複)：", profile?.inviteId);
  if (!newId || newId === profile?.inviteId) return;

  try {
    // 1. 先去搜尋有沒有別人的 inviteId 等於這個新 ID
    const q = query(collection(db, "users"), where("inviteId", "==", newId));
    const querySnapshot = await getDocs(q);

    // 2. 如果結果不為空，代表有人捷足先登了
    if (!querySnapshot.empty) {
      alert("ID 已被別人使用，請更換。");
      return;
    }

    // 3. 確定沒人使用，才更新
    await updateDoc(doc(db, "users", user.uid), { inviteId: newId });
    alert("ID 已更新！");
  } catch (err) {
    alert("檢查重複時出錯：" + err.message);
  }
};

  // 2. 監聽房間列表 (載入該使用者參與的房間)
  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, "rooms"),
        where("members", "array-contains", user.uid)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRooms(fetchedRooms);
        // 如果還沒選房間，預設選第一個
        if (fetchedRooms.length > 0 && !currentRoom) {
          setCurrentRoom(fetchedRooms[0]);
        }
      });
      return () => unsubscribe();
    }
  }, [user, currentRoom]);

  // 3. 監聽目前房間的訊息 (子集合模式)
  // 3. 監聽目前房間的訊息並觸發通知
useEffect(() => {
  if (user && currentRoom) {
    const q = query(
      collection(db, "rooms", currentRoom.id, "messages"),
      orderBy("createdAt", "asc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // --- 新增：通知判斷邏輯 ---
      // 取得最後一筆訊息
      const lastMsg = newMessages[newMessages.length - 1];
      
      // 條件：1. 有訊息 2. 不是自己發的 3. 權限已開啟 
      if (lastMsg && lastMsg.uid !== user.uid && Notification.permission === "granted") {
        
        // 為了避免重複通知舊訊息，檢查這則訊息是否是 10 秒內產生的
        const msgTime = lastMsg.createdAt?.toMillis() || Date.now();
        const now = Date.now();
        
        // 且只有在視窗被隱藏 (切換到別的分頁) 時才通知，才符合「未讀通知」的直覺
        if (now - msgTime < 10000 && document.hidden) {
          new Notification(`[#${currentRoom.name}] 新訊息`, {
            body: `${lastMsg.email}: ${lastMsg.text}`,
            icon: "https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" // 可換成你的 logo
          });
        }
      }
      // -----------------------

      setMessages(newMessages);
    });
    
    return () => unsubscribe();
  } else {
    setMessages([]);
  }
}, [user, currentRoom]);

  // 自動捲動到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 建立新房間邏輯 (Invite 邏輯預備)
  const createNewRoom = async () => {
  const roomName = prompt("請輸入聊天室名稱：");
  if (!roomName) return;

  const firstMemberId = prompt("請輸入要邀請的成員 ID：");
  if (firstMemberId === profile.inviteId) {
  alert("你不能邀請你自己！");
  return;
}
  if (!firstMemberId) {
    alert("建立房間必須至少邀請一位成員！");
    return;
  }

  try {
    // 1. 找尋該邀請 ID 對應的 UID
    const q = query(collection(db, "users"), where("inviteId", "==", firstMemberId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      alert("找不到該使用者，請確認邀請 ID 是否正確。");
      return;
    }

    const targetUid = querySnapshot.docs[0].data().uid;

    // 2. 建立房間，成員包含自己與被邀請者
    await addDoc(collection(db, "rooms"), {
      name: roomName,
      members: [user.uid, targetUid],
      creator: user.uid, // 紀錄誰是建立者，方便之後判斷誰能刪除
      createdAt: serverTimestamp(),
    });
    
    alert(`房間「${roomName}」建立成功，已加入 ${firstMemberId}！`);
  } catch (err) {
    alert("建立失敗：" + err.message);
  }
};
const deleteRoom = async (e, roomId, roomCreator) => {
  e.stopPropagation(); // 防止觸發切換房間的點擊事件
  
  // 權限檢查：只有建立者能刪除
  if (roomCreator !== user.uid) {
    alert("只有房間建立者可以刪除房間！");
    return;
  }

  if (!window.confirm("確定要刪除這個聊天室嗎？所有訊息將會消失。")) return;

  try {
    // 直接呼叫頂部 import 進來的 deleteDoc
    await deleteDoc(doc(db, "rooms", roomId));
    
    // 如果刪除的是當前房間，重設選中狀態
    if (currentRoom?.id === roomId) {
      setCurrentRoom(null);
    }
    alert("房間已刪除");
  } catch (err) {
    console.error("Delete Error:", err);
    alert("刪除失敗：" + err.message);
  }
};
  // 邀請成員邏輯
const inviteUserByInviteId = async () => {
  if (!currentRoom) return alert("請先選擇一個房間");
  
  const targetId = prompt("請輸入對方的邀請 ID：");
  if (!targetId) return;
  if (targetId === profile.inviteId) {
    alert("你不能邀請你自己！");
    return;
  }
  try {
    // 1. 去 users 集合搜尋誰的 inviteId 等於輸入的值
    const q = query(collection(db, "users"), where("inviteId", "==", targetId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return alert("找不到該使用者！");
    }

    // 2. 取得對方的真實 UID
    const targetUid = querySnapshot.docs[0].data().uid;

    // 3. 加入房間成員
    const roomRef = doc(db, "rooms", currentRoom.id);
    await updateDoc(roomRef, {
      members: arrayUnion(targetUid)
    });
    
    alert(`成功邀請 ${targetId} 進入房間！`);
  } catch (err) {
    alert("邀請失敗：" + err.message);
  }
};

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = () => {
    if (!email || !password) return alert("請輸入帳號密碼");
    signInWithEmailAndPassword(auth, email, password).catch(err => alert('帳號或密碼錯誤'));
  };

  const handleSignUp = () => {
    if (!email || !password) return alert("請輸入帳號密碼");
    createUserWithEmailAndPassword(auth, email, password).catch(err => alert('註冊失敗，請檢查格式'));
  };

  const handleLogout = () => signOut(auth).then(() => {
    setUser(null);
    setCurrentRoom(null);
  });

  const sendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === "" || !currentRoom) return;
    const text = newMessage;
    setNewMessage("");
    try {
      await addDoc(collection(db, "rooms", currentRoom.id, "messages"), {
        text: text,
        createdAt: serverTimestamp(),
        uid: user.uid,
        email: user.email,
      });
    } catch (err) { alert(err.message); }
  };

  if (loading) return <div className="loading-screen">載入中...</div>;

  return (
    <div className="App">
      {user ? (
        <div className="main-layout">
          {/* 左側房間選單 */}
          <aside className="sidebar">
            <div className="sidebar-header">
              <h4>聊天室列表</h4>
              <button onClick={createNewRoom} className="btn-add">+</button>
            </div>
            <div className="room-list">
                {rooms.map(room => (
                  <div 
                    key={room.id} 
                    className={`room-item ${currentRoom?.id === room.id ? 'active' : ''}`}
                    onClick={() => setCurrentRoom(room)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span># {room.name}</span>
                    
                    {/* 如果是建立者，顯示刪除按鈕 */}
                    {room.creator === user.uid && (
                      <button 
                        onClick={(e) => deleteRoom(e, room.id, room.creator)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            <div className="sidebar-footer">
              <div className="user-profile-small" onClick={updateInviteId} style={{ cursor: 'pointer' }}>
                <div className="user-email">{user.email}</div>
                <div className="invite-tag">ID: {profile?.inviteId || '未設定'} (點擊修改)</div>
              </div>
              <button onClick={handleLogout} className="btn-mini">登出</button>
            </div>
          </aside>

          {/* 右側訊息區域 */}
          <div className="chat-container">
            <header className="chat-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <h3>{currentRoom ? `# ${currentRoom.name}` : "請選擇房間"}</h3>
                
                {currentRoom && (
                  <button onClick={inviteUserByInviteId} className="btn-mini" style={{ backgroundColor: '#10b981' }}>
                    + 邀請成員
                  </button>
                )}
              </div>
            </header>

            <main className="chat-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`msg-bubble ${msg.uid === user.uid ? 'sent' : 'received'}`}>
                  <div className="msg-email">{msg.email}</div>
                  <div className="msg-text">{msg.text}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </main>

            <form className="chat-input-area" onSubmit={sendMessage}>
              <input 
                type="text" 
                placeholder="發送訊息..." 
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={!currentRoom}
              />
              <button type="submit" className="btn-send" disabled={!currentRoom}>發送</button>
            </form>
          </div>
        </div>
      ) : (
        /* ... 登入介面保持不變 ... */
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