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

import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState([]); // 房間列表
  const [currentRoom, setCurrentRoom] = useState(null); // 目前選中的房間
  const [messages, setMessages] = useState([]); 
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tempProfile, setTempProfile] = useState({}); // 用來存放編輯中的資料
  const [searchKeyword, setSearchKeyword] = useState("");
  const [replyingTo, setReplyingTo] = useState(null); // 紀錄正在回覆哪則訊息
  const [blockedUsers, setBlockedUsers] = useState([]); // 紀錄你封鎖的人的 UID
  const [profile, setProfile] = useState(null);
  const messageRefs = useRef({});
  const [usersBlockingMe, setUsersBlockingMe] = useState([]);

  useEffect(() => {
    if (profile) {
      setBlockedUsers(profile.blockedUsers || []);
    }
  }, [profile]);

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
          const defaultUsername = currentUser.email.split('@')[0];
          const defaultPhoto = "/donlogo.jpeg";
          await setDoc(userRef, {
            email: currentUser.email,
            uid: currentUser.uid,
            username: defaultUsername,
            photoURL: defaultPhoto,
            inviteId: `${currentUser.email.split('@')[0]}_${Math.floor(Math.random() * 10000)}` 
          });
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);
  
  const toggleBlockUser = async (targetUid, targetName) => {
    if (targetUid === user.uid) return;
    const isBlocked = blockedUsers.includes(targetUid);
    
    if (!isBlocked) {
      if (!window.confirm(`封鎖 ${targetName} 後，你們將無法在私人聊天室對話，且群組訊息會互相隱藏。確定嗎？`)) return;
    }

    try {
      await updateDoc(doc(db, "users", user.uid), {
        blockedUsers: isBlocked ? blockedUsers.filter(id => id !== targetUid) : arrayUnion(targetUid)
      });
    } catch (err) { alert("操作失敗"); }
  };

  const scrollToMessage = (msgId) => {
    const targetElement = messageRefs.current[msgId];
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetElement.classList.add('highlight-flash'); // 加入 CSS 動畫
      setTimeout(() => targetElement.classList.remove('highlight-flash'), 2000);
    } else {
      alert("找不到原始訊息（可能已被回收）");
    }
  };
  // 監聽自己的個人檔案
  useEffect(() => {
    if (user) {
      const unsubscribe = onSnapshot(doc(db, "users", user.uid), (doc) => {
        setProfile(doc.data());
      });
      return () => unsubscribe();
    }
  }, [user]);

// 打開編輯視窗並帶入現有資料
  const openProfile = () => {
    setTempProfile({
      username: profile?.username || "",
      phone: profile?.phone || "",
      address: profile?.address || "",
      photoURL: profile?.photoURL || "https://via.placeholder.com/100",
      inviteId: profile?.inviteId || ""
    });
    setShowProfileModal(true);
  };

// 儲存到 Firestore
  const saveProfile = async () => {
    try {
      const newId = tempProfile.inviteId;

      // 如果 ID 有變動，才執行重複檢查
      if (newId !== profile?.inviteId) {
        if (!newId) return alert("ID 不能為空！");
        
        const q = query(collection(db, "users"), where("inviteId", "==", newId));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          alert("該 ID 已被使用，請更換一個。");
          return;
        }
      }

      // 執行更新
      await updateDoc(doc(db, "users", user.uid), {
        username: tempProfile.username,
        phone: tempProfile.phone,
        address: tempProfile.address,
        photoURL: tempProfile.photoURL,
        inviteId: newId, // 加入這一行
      });

      setShowProfileModal(false);
      alert("個人檔案已更新！");
    } catch (err) {
      alert("儲存失敗" );
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 限制檔案大小 (Base64 會膨脹體積，建議限制在 200KB 以內)
    if (file.size > 200 * 1024) {
      alert("檔案太大，請上傳 200KB 以下的圖片以符合資料庫限制。");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      // 這就是圖片的 Base64 字串
      const base64String = reader.result;
      setTempProfile({ ...tempProfile, photoURL: base64String });
      alert("圖片處理完成！按下儲存即可更新。");
    };
    reader.readAsDataURL(file);
  };


  // A. 回收訊息 (Unsend)
  const unsendMessage = async (msgId) => {
    if (!window.confirm("確定要回收這條訊息嗎？")) return;
    try {
      await deleteDoc(doc(db, "rooms", currentRoom.id, "messages", msgId));
    } catch (err) { alert("回收失敗" ); }
  };

  // B. 編輯訊息 (Edit)
  const editMessage = async (msgId, oldText) => {
    const newText = prompt("編輯訊息：", oldText);
    if (!newText || newText === oldText) return;
    try {
      await updateDoc(doc(db, "rooms", currentRoom.id, "messages", msgId), {
        text: newText,
        isEdited: true 
      });
    } catch (err) { alert("編輯失敗" ); }
  };

  // C. 處理發送圖片 (Send Image)
  const handleSendImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 200 * 1024) {
      alert("圖片太大了，請上傳 200KB 以下的圖片。");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await addDoc(collection(db, "rooms", currentRoom.id, "messages"), {
          text: "", 
          image: reader.result, // Base64 字串
          createdAt: serverTimestamp(),
          uid: user.uid,
          email: user.email,
          username: profile?.username || user.email,
          photoURL: profile?.photoURL || ""
        });
      } catch (err) { alert("圖片傳送失敗"); }
    };
    reader.readAsDataURL(file);
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

  useEffect(() => {
    if (user && currentRoom) {
      let isInitialLoad = true; // 用來標記是否為「第一次載入歷史訊息」

      const q = query(
        collection(db, "rooms", currentRoom.id, "messages"),
        orderBy("createdAt", "asc")
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        // 1. 先處理畫面上要顯示的所有訊息
        const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMessages(newMessages);

        // 2. 處理通知邏輯：只有在「非第一次載入」且「頁面隱藏」時才觸發
        if (!isInitialLoad) {
          snapshot.docChanges().forEach((change) => {
            // 只處理「新增加 (added)」的訊息
            if (change.type === "added") {
              const msgData = change.doc.data();
              
              // 條件：不是自己發的 + 權限允許 + 視窗隱藏 (document.hidden)
              if (msgData.uid !== user.uid && Notification.permission === "granted" && document.hidden) {
                new Notification(`[#${currentRoom.name}] 新訊息`, {
                  body: `${msgData.email}: ${msgData.text}`,
                  icon: "https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                });
              }
            }
          });
        }

        // 第一次監聽完成後，將標記設為 false，之後進來的訊息都會觸發通知
        isInitialLoad = false;
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
// 在其他 useEffect 附近新增這個，用來偵測對方是否封鎖我

// 監聽房間內所有成員的實時封鎖名單
  useEffect(() => {
    if (user && currentRoom && currentRoom.members) {
      // 針對房間內的所有人建立監聽
      const unsubs = currentRoom.members.map(memberId => {
        if (memberId === user.uid) return () => {}; // 不用監聽自己
        
        return onSnapshot(doc(db, "users", memberId), (docSnap) => {
          if (docSnap.exists()) {
            const peerBlockedList = docSnap.data().blockedUsers || [];
            if (peerBlockedList.includes(user.uid)) {
              // 他封鎖了我：加入名單
              setUsersBlockingMe(prev => prev.includes(memberId) ? prev : [...prev, memberId]);
            } else {
              // 他沒封鎖我 (或解除封鎖)：從名單移除
              setUsersBlockingMe(prev => prev.filter(id => id !== memberId));
            }
          }
        });
      });

      // 離開房間或切換房間時，清除所有監聽器並重置狀態
      return () => {
        unsubs.forEach(unsub => unsub());
        setUsersBlockingMe([]);
      };
    } else {
      setUsersBlockingMe([]);
    }
  }, [currentRoom, user]);

  // 建立新房間邏輯 (Invite 邏輯預備)
  // 在 App.js 中找到 createNewRoom 函式，建議修改如下：
  const createNewRoom = async () => {
    const roomName = prompt("請輸入聊天室名稱：");
    if (!roomName) return;

    const firstMemberId = prompt("請輸入要邀請的成員 ID：");
    if (!firstMemberId || firstMemberId === profile.inviteId) {
      return alert("ID 無效或不能邀請自己");
    }

    try {
      const q = query(collection(db, "users"), where("inviteId", "==", firstMemberId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) return alert("找不到該使用者。");

      const targetData = querySnapshot.docs[0].data();
      const targetUid = targetData.uid;
      const targetBlockedList = targetData.blockedUsers || []; 

      // --- 關鍵雙向檢查 ---
      // 1. 我封鎖了他
      if (blockedUsers.includes(targetUid)) {
        return alert("你已封鎖此使用者，無法建立聊天室。");
      }
      // 2. 他封鎖了我 (基於隱私，我們告知「找不到」或「無法建立」)
      if (targetBlockedList.includes(user.uid)) {
        return alert("找不到該使用者。"); 
      }

      await addDoc(collection(db, "rooms"), {
        name: roomName,
        members: [user.uid, targetUid],
        creator: user.uid,
        createdAt: serverTimestamp(),
      });
      alert("房間建立成功！");
    } catch (err) { alert("建立失敗"); }
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
      alert("刪除失敗" );
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
      alert("邀請失敗");
    }
  };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = () => {
    if (!email || !password) return alert("請輸入帳號密碼");
    
    signInWithEmailAndPassword(auth, email, password)
      .catch((error) => {
        // 這裡處理各種錯誤狀況
        if (error.code === 'auth/user-not-found') {
          alert('此帳號尚未註冊，請先註冊。');
        } else if (error.code === 'auth/wrong-password') {
          alert('密碼輸入錯誤，請再試一次');
        } else {
          alert('登入失敗' );
        }
      });
  };

  const handleSignUp = async () => {
    if (!email || !password) return alert("請輸入帳號密碼");

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert("註冊成功。");
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        alert("此 Email 已註冊過。");
      } else {
        alert("註冊失敗：" );
      }
    }
  };

  const handleLogout = () => signOut(auth).then(() => {
    setUser(null);
    setCurrentRoom(null);
  });

  const sendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === "" || !currentRoom) return;
    
    const msgText = newMessage;
    const replyData = replyingTo; 
    const otherId = currentRoom.members?.find(m => m !== user.uid);
    if (currentRoom.members?.length === 2) {
        const otherId = currentRoom.members.find(m => m !== user.uid);
        // 改用 usersBlockingMe.includes(otherId)
        if (blockedUsers.includes(otherId) || usersBlockingMe.includes(otherId)) {
          alert("封鎖狀態下無法傳送訊息。");
          return;
        }
      }
    setNewMessage("");
    setReplyingTo(null);

    try {
      await addDoc(collection(db, "rooms", currentRoom.id, "messages"), {
        text: msgText,
        createdAt: serverTimestamp(),
        uid: user.uid,
        email: user.email,
        username: profile?.username || user.email,
        photoURL: profile?.photoURL || "",
        senderBlockedUsers: blockedUsers, 
        replyTo: replyData ? {
          id: replyData.id, 
          text: replyData.text,
          username: replyData.username
        } : null,
        reactions: [] // 預留 Emoji 反應空間
      });
    } catch (err) { alert(err.message); }
  };

  const handleReaction = async (msgId, emoji) => {
    const msgRef = doc(db, "rooms", currentRoom.id, "messages", msgId);
    const msgSnap = await getDoc(msgRef);
    const currentReactions = msgSnap.data().reactions || [];

    // 檢查是否已經點過這個 emoji
    const existingIndex = currentReactions.findIndex(r => r.uid === user.uid && r.emoji === emoji);

    if (existingIndex > -1) {
      // 如果點過了，就移除 (即「回收」功能)
      currentReactions.splice(existingIndex, 1);
    } else {
      // 沒點過就加入
      currentReactions.push({ uid: user.uid, emoji: emoji });
    }

    await updateDoc(msgRef, { reactions: currentReactions });
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
              <div className="user-profile-small" onClick={openProfile} style={{ cursor: 'pointer' }}>
                <img src={profile?.photoURL || "https://via.placeholder.com/30"} alt="avatar" className="mini-avatar" />
                <div className="user-info-text">
                  <div className="user-name-display">{profile?.username || user.email}</div>
                  <div className="invite-tag">ID: {profile?.inviteId}</div>
                </div>
              </div>
              <button onClick={handleLogout} className="btn-mini">登出</button>
            </div>
          </aside>

          {/* 右側訊息區域 */}
          <div className="chat-container">
            <header className="chat-header">
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', width: '100%' }}>
                <h3>{currentRoom ? `# ${currentRoom.name}` : "請選擇房間"}</h3>
                {/* 搜尋框 */}
                <input 
                  type="text" 
                  placeholder="搜尋訊息..." 
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="search-input"
                />
                {currentRoom && (
                  <button onClick={inviteUserByInviteId} className="btn-mini">+ 邀請</button>
                )}
              </div>
            </header>

            <main className="chat-messages">
              {/* 封鎖警告橫幅 (加分項要求的 UI) */}
              
              {currentRoom?.members?.length === 2 && (() => {
                  const otherId = currentRoom.members.find(m => m !== user.uid);
                  const iBlockHim = blockedUsers.includes(otherId);
                  const heBlocksMe = usersBlockingMe.includes(otherId);
                  
                  if (iBlockHim || heBlocksMe) {
                    return <div className="block-warning-banner">⚠️ 封鎖中：你們已無法互相傳送私人訊息。</div>;
                  }
                  return null;
              })()}
              {messages
                .filter(msg => {
                    const matchesSearch = msg.text.toLowerCase().includes(searchKeyword.toLowerCase());

                    // 1. 我封鎖了他 (iBlockHim)
                    const iBlockHim = blockedUsers.includes(msg.uid);
                    
                    // 2. 他封鎖了我 (不分群組或私聊，直接看實時名單)
                    const heBlocksMeLive = usersBlockingMe.includes(msg.uid);
                    
                    // 3. 快照保險 (適用於已經離開房間的人)
                    const heBlocksMeSnapshot = msg.senderBlockedUsers?.includes(user.uid);

                    // 只要任何一個封鎖條件成立，訊息就徹底消失！
                    return matchesSearch && !iBlockHim && !heBlocksMeLive && !heBlocksMeSnapshot;
                })
                .map((msg) => (
                  <div 
                    key={msg.id} 
                    ref={el => messageRefs.current[msg.id] = el} 
                    className={`msg-wrapper ${msg.uid === user.uid ? 'sent' : 'received'}`}
                  >
                    {msg.uid !== user.uid && (
                      <img 
                        src={msg.photoURL || "/donlogo.jpeg"} 
                        className="chat-avatar" 
                        title={msg.username}
                      />
                    )}
                    
                    <div className="msg-content-wrapper">
                      <div className="msg-username">{msg.username || msg.email}</div>
                      
                      {msg.replyTo && (
                        <div className="reply-quote" onClick={() => scrollToMessage(msg.replyTo.id)}>
                          <small>@{msg.replyTo.username}: {msg.replyTo.text.substring(0, 20)}</small>
                        </div>
                      )}

                      <div className="msg-bubble-row">
                        <div className={msg.image ? "msg-image-only" : `msg-bubble ${msg.uid === user.uid ? 'sent' : 'received'}`}>
                          {msg.image && <img src={msg.image} className="sent-image-standalone" />}
                          {msg.text && <div className="msg-text">{msg.text}</div>}
                          
                          {/* Emoji 反應顯示 (符合截圖：顯示多人、可回收) */}
                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="reactions-pill">
                              {msg.reactions.map((r, i) => (
                                <span key={i} onClick={() => r.uid === user.uid && handleReaction(msg.id, r.emoji)}>
                                  {r.emoji}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="msg-ops-outside">
                          {/* Emoji 快速選單 */}
                          
                          <div className="emoji-trigger">
                            <span>❤️</span>
                            <div className="emoji-popover">
                              {['❤️', '👍', '😂', '😮'].map(e => {
                                // 判斷目前這個 emoji 是否已經被我點過了
                                const isReactedByMe = msg.reactions?.some(r => r.uid === user.uid && r.emoji === e);
                                
                                return (
                                  <button 
                                    key={e} 
                                    onClick={() => handleReaction(msg.id, e)}
                                    /* 動態加入類別 */
                                    className={isReactedByMe ? "active-reaction-btn" : ""}
                                  >
                                    {e}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          
                          <button onClick={() => setReplyingTo(msg)}>回覆</button>
                          {msg.uid === user.uid && (
                            <>
                              {!msg.image && <button onClick={() => editMessage(msg.id, msg.text)}>編輯</button>}
                              <button onClick={() => unsendMessage(msg.id)}>回收</button>
                            </>
                          )}
                          {msg.uid !== user.uid && (
                            <button 
                              onClick={() => toggleBlockUser(msg.uid, msg.username)}
                              className="btn-block-text">
                              封鎖
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {msg.uid === user.uid && <img src={profile?.photoURL || "/donlogo.jpeg"} className="chat-avatar" />}
                  </div>
                ))}
              <div ref={messagesEndRef} />
            </main>
            {replyingTo && (
              <div className="reply-preview-bar">
                <div className="reply-info">
                  <small>正在回覆 @{replyingTo.username}</small>
                  <div>{replyingTo.text}</div>
                </div>
                <button onClick={() => setReplyingTo(null)}>✕</button>
              </div>
            )}

            
            <form className="chat-input-area" onSubmit={sendMessage}>
              {/* 隱藏的檔案選取器 */}
              <input 
                type="file" 
                id="image-upload" 
                accept="image/*" 
                onChange={handleSendImage} 
                style={{ display: 'none' }} 
              />
              <label htmlFor="image-upload" className="btn-image-label">+</label>
              
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
      {showProfileModal && (
        <div className="modal-overlay">
          <div className="profile-modal">
            <h2>編輯個人檔案</h2>
            <div className="profile-fields">
            

              <label>個人頭像 (Profile Picture)</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <img src={tempProfile.photoURL} alt="preview" className="mini-avatar" />
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageUpload} 
                    style={{ border: 'none', background: 'transparent' }}
                  />
                </div>
                
              
              <label>使用者名稱 (Username)</label>
              <input value={tempProfile.username} onChange={e => setTempProfile({...tempProfile, username: e.target.value})} />
               {/* 新增專屬 ID 欄位 */}
              <label>ID (用於邀請，不可重複)</label>
              <input 
                value={tempProfile.inviteId} 
                onChange={e => setTempProfile({...tempProfile, inviteId: e.target.value})} 
                placeholder="例如: lucky_cat_88"
              />
              <label>Email (不可修改)</label>
              <input value={user.email} disabled className="disabled-input" />
              
              <label>電話 (Phone Number)</label>
              <input value={tempProfile.phone} onChange={e => setTempProfile({...tempProfile, phone: e.target.value})} />
              
              <label>地址 (Address)</label>
              <textarea value={tempProfile.address} onChange={e => setTempProfile({...tempProfile, address: e.target.value})} />
            </div>
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setShowProfileModal(false)}>取消</button>
              <button className="btn-save" onClick={saveProfile}>儲存變更</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;