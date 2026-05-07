// src/App.js
import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import { auth, googleProvider, db } from './firebase'; 
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,    
  createUserWithEmailAndPassword 
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
  const [rooms, setRooms] = useState([]);  
  const [currentRoom, setCurrentRoom] = useState(null); 
  const [messages, setMessages] = useState([]); 
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tempProfile, setTempProfile] = useState({}); 
  const [searchKeyword, setSearchKeyword] = useState("");
  const [replyingTo, setReplyingTo] = useState(null); 
  const [blockedUsers, setBlockedUsers] = useState([]); 
  const [profile, setProfile] = useState(null);
  const messageRefs = useRef({});
  const [usersBlockingMe, setUsersBlockingMe] = useState([]);
  const [roomMemberProfiles, setRoomMemberProfiles] = useState({});
  const [showRoomInfoModal, setShowRoomInfoModal] = useState(false);
  const [editRoomName, setEditRoomName] = useState("");
  const [roomMembersData, setRoomMembersData] = useState([]);
  const [blockedUsersData, setBlockedUsersData] = useState([]); 

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
        const userSnap = await getDoc(userRef); 
        
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
      targetElement.classList.add('highlight-flash');  
      setTimeout(() => targetElement.classList.remove('highlight-flash'), 2000);
    } else {
      alert("找不到原始訊息（可能已被回收）");
    }
  };
  useEffect(() => {
    if (user) {
      const unsubscribe = onSnapshot(doc(db, "users", user.uid), (doc) => {
        setProfile(doc.data());
      });
      return () => unsubscribe();
    }
  }, [user]);

  const openProfile = async () => {
    setTempProfile({
      username: profile?.username || "",
      phone: profile?.phone || "",
      address: profile?.address || "",
      photoURL: profile?.photoURL || "https://via.placeholder.com/100",
      inviteId: profile?.inviteId || ""
    });
    setShowProfileModal(true);

    const blockedUids = profile?.blockedUsers || [];
    if (blockedUids.length > 0) {
      try {
        const blockedDocs = await Promise.all(
          blockedUids.map(uid => getDoc(doc(db, "users", uid)))
        );
        const bData = blockedDocs.map(d => d.exists() ? d.data() : null).filter(Boolean);
        setBlockedUsersData(bData);
      } catch (err) {
        console.error("抓取黑名單失敗", err);
      }
    } else {
      setBlockedUsersData([]);
    }
  };
  const handleUnblock = async (targetUid) => {
    if (!window.confirm("確定要解除封鎖此使用者嗎？")) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        // 從 blockedUsers 陣列中移除該 UID
        blockedUsers: blockedUsers.filter(id => id !== targetUid)
      });
      
      setBlockedUsersData(prev => prev.filter(u => u.uid !== targetUid));
      alert("已解除封鎖！");
    } catch (err) {
      alert("解除封鎖失敗");
    }
  };

  const saveProfile = async () => {
    try {
      const newId = tempProfile.inviteId;

      if (newId !== profile?.inviteId) {
        if (!newId) return alert("ID 不能為空！");
        
        const q = query(collection(db, "users"), where("inviteId", "==", newId));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          alert("該 ID 已被使用，請更換一個。");
          return;
        }
      }

      await updateDoc(doc(db, "users", user.uid), {
        username: tempProfile.username,
        phone: tempProfile.phone,
        address: tempProfile.address,
        photoURL: tempProfile.photoURL,
        inviteId: newId, 
      });

      setShowProfileModal(false);
      alert("個人檔案已更新！");
    } catch (err) {
      alert("儲存失敗" );
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const compressedBase64 = await compressImage(file, 400, 400, 0.7);
      
      setTempProfile({ ...tempProfile, photoURL: compressedBase64 });
      alert("圖片處理完成！按下儲存即可更新。");
    } catch (error) {
      console.error(error);
      alert("圖片處理失敗");
    }
  };


  const unsendMessage = async (msgId) => {
    if (!window.confirm("確定要回收這條訊息嗎？")) return;
    try {
      await deleteDoc(doc(db, "rooms", currentRoom.id, "messages", msgId));
    } catch (err) { alert("回收失敗" ); }
  };

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


  const handleSendImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const compressedBase64 = await compressImage(file, 1024, 1024, 0.7);

      const sizeInBytes = (compressedBase64.length * 3) / 4;
      if (sizeInBytes > 900 * 1024) { 
        alert("圖片即使壓縮後依然太大，請選擇其他圖片。");
        return;
      }

      await addDoc(collection(db, "rooms", currentRoom.id, "messages"), {
        text: "", 
        image: compressedBase64,  
        createdAt: serverTimestamp(),
        uid: user.uid,
        email: user.email,
        username: profile?.username || user.email,
        photoURL: profile?.photoURL || "",
        senderBlockedUsers: blockedUsers, 
        replyTo: null,
        reactions: []
      });
    } catch (err) { 
      console.error(err);
      alert("圖片處理或傳送失敗"); 
    }
  };

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, "rooms"),
        where("members", "array-contains", user.uid)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRooms(fetchedRooms);
        if (fetchedRooms.length > 0 && !currentRoom) {
          setCurrentRoom(fetchedRooms[0]);
        }
      });
      return () => unsubscribe();
    }
  }, [user, currentRoom]);

  useEffect(() => {
    if (user && currentRoom) {
      let isInitialLoad = true; 

      const q = query(
        collection(db, "rooms", currentRoom.id, "messages"),
        orderBy("createdAt", "asc")
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMessages(newMessages);

        if (!isInitialLoad) {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const msgData = change.doc.data();
              
              if (msgData.uid !== user.uid && Notification.permission === "granted" && document.hidden) {
                new Notification(`[#${currentRoom.name}] 新訊息`, {
                  body: `${msgData.email}: ${msgData.text}`,
                  icon: "https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                });
              }
            }
          });
        }

        isInitialLoad = false;
      });
      
      return () => unsubscribe();
    } else {
      setMessages([]);
    }
  }, [user, currentRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  useEffect(() => {
    if (user && currentRoom && currentRoom.members) {
      const unsubs = currentRoom.members.map(memberId => {
        return onSnapshot(doc(db, "users", memberId), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            
            setRoomMemberProfiles(prev => ({
              ...prev,
              [memberId]: data
            }));

            if (memberId !== user.uid) {
              const peerBlockedList = data.blockedUsers || [];
              if (peerBlockedList.includes(user.uid)) {
                setUsersBlockingMe(prev => prev.includes(memberId) ? prev : [...prev, memberId]);
              } else {
                setUsersBlockingMe(prev => prev.filter(id => id !== memberId));
              }
            }
          }
        });
      });

      return () => {
        unsubs.forEach(unsub => unsub());
        setUsersBlockingMe([]);
        setRoomMemberProfiles({}); 
      };
    } else {
      setUsersBlockingMe([]);
      setRoomMemberProfiles({});
    }
  }, [currentRoom, user]);


  const compressImage = (file, maxWidth, maxHeight, quality) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          ctx.drawImage(img, 0, 0, width, height);

          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedBase64);
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };
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


      if (blockedUsers.includes(targetUid)) {
        return alert("你已封鎖此使用者，無法建立聊天室。");
      }
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
    e.stopPropagation(); 
    if (roomCreator !== user.uid) {
      alert("只有房間建立者可以刪除房間！");
      return;
    }

    if (!window.confirm("確定要刪除這個聊天室嗎？所有訊息將會消失。")) return;

    try {
      await deleteDoc(doc(db, "rooms", roomId));
      if (currentRoom?.id === roomId) {
        setCurrentRoom(null);
      }
      alert("房間已刪除");
    } catch (err) {
      console.error("Delete Error:", err);
      alert("刪除失敗" );
    }
  };
  const inviteUserByInviteId = async () => {
    if (!currentRoom) return alert("請先選擇一個房間");
    
    const targetId = prompt("請輸入對方的邀請 ID：");
    if (!targetId) return;
    if (targetId === profile.inviteId) {
      alert("你不能邀請你自己！");
      return;
    }
    try {
      const q = query(collection(db, "users"), where("inviteId", "==", targetId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return alert("找不到該使用者！");
      }

      const targetUid = querySnapshot.docs[0].data().uid;

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
        if (error.code === 'auth/user-not-found') {
          alert('此帳號尚未註冊，請先註冊。');
        } else if (error.code === 'auth/wrong-password') {
          alert('密碼輸入錯誤，請再試一次');
        } else {
          alert('登入失敗，帳號密碼錯誤或帳號不存在。' );
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
        alert("註冊失敗，密碼長度至少六個字元。" );
      }
    }
  };

  const handleLogout = () => signOut(auth).then(() => {
    setUser(null);
    setCurrentRoom(null);
  });

  const formatTime = (timestamp) => {
    if (!timestamp) return "";  
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('zh-TW', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true 
    });
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === "" || !currentRoom) return;
    
    const msgText = newMessage;
    const replyData = replyingTo; 
    if (currentRoom.members?.length === 2) {
        const otherId = currentRoom.members.find(m => m !== user.uid);
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
        reactions: []  
      });
    } catch (err) { alert(err.message); }
  };

  const handleReaction = async (msgId, emoji) => {
    const msgRef = doc(db, "rooms", currentRoom.id, "messages", msgId);
    const msgSnap = await getDoc(msgRef);
    const currentReactions = msgSnap.data().reactions || [];

    const existingIndex = currentReactions.findIndex(r => r.uid === user.uid && r.emoji === emoji);

    if (existingIndex > -1) {
      currentReactions.splice(existingIndex, 1);
    } else {
      currentReactions.push({ uid: user.uid, emoji: emoji });
    }

    await updateDoc(msgRef, { reactions: currentReactions });
  };
  const openRoomInfo = async () => {
    if (!currentRoom) return;
    setEditRoomName(currentRoom.name);
    setShowRoomInfoModal(true);

    try {
      const memberDocs = await Promise.all(
        currentRoom.members.map(uid => getDoc(doc(db, "users", uid)))
      );
      
      const membersData = memberDocs.map(d => {
        if (d.exists()) return d.data();
        return { uid: d.id, username: "未知使用者" };
      });
      
      setRoomMembersData(membersData);
    } catch (error) {
      console.error("抓取成員失敗:", error);
    }
  };
  const saveRoomName = async () => {
    if (!editRoomName.trim()) return alert("群組名稱不能為空！");
    try {
      await updateDoc(doc(db, "rooms", currentRoom.id), {
        name: editRoomName.trim()
      });
      alert("群組名稱已更新！");
    } catch (err) {
      alert("更新失敗：" + err.message);
    }
  };
  if (loading) return <div className="loading-screen">載入中...</div>;

  return (
    <div className="App">
      {user ? (
        <div className="main-layout">
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <img src={profile?.photoURL || "/donlogo.jpeg"} alt="avatar" className="mini-avatar" />
                  <span style={{ fontSize: '12px', color: '#38bdf8', opacity: 0.9 }}>
                    (點擊修改個人檔案)
                  </span>
                </div>
                
                <div className="user-info-text">
                  <div className="user-name-display" style={{ fontSize: '1.2rem', color: 'white', fontWeight: '500' }}>
                    {profile?.username || user.email}
                  </div>
                  <div className="invite-tag" style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>
                    ID: {profile?.inviteId}
                  </div>
                </div>
                
              </div>
              
              <button onClick={handleLogout} className="btn-mini" style={{ marginTop: '10px' }}>登出</button>
            </div>
          </aside>

          <div className="chat-container">
            <header className="chat-header">
              <div className="chat-header-content">
                <h3>{currentRoom ? `# ${currentRoom.name}` : "請選擇房間"}</h3>
                
                <input 
                  type="text" 
                  placeholder="搜尋訊息..." 
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="search-input"
                />
                
                {currentRoom && (
                  <div className="header-actions">
                    <button onClick={inviteUserByInviteId} className="btn-header btn-invite">+ 邀請</button>
                    <button onClick={openRoomInfo} className="btn-header btn-setting">⚙️ 設定</button>
                  </div>
                )}
              </div>
            </header>

            <main className="chat-messages">
              
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
                    const iBlockHim = blockedUsers.includes(msg.uid);
                    const heBlocksMeLive = usersBlockingMe.includes(msg.uid);
                    const heBlocksMeSnapshot = msg.senderBlockedUsers?.includes(user.uid);
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
                        src={roomMemberProfiles[msg.uid]?.photoURL || msg.photoURL || "/donlogo.jpeg"} 
                        className="chat-avatar" 
                        title={roomMemberProfiles[msg.uid]?.username || msg.username}
                      />
                    )}
                    
                    <div className="msg-content-wrapper">
                      <div className="msg-username">
                        <span>{roomMemberProfiles[msg.uid]?.username || msg.username || msg.email}</span>
                        <span className="msg-time">{formatTime(msg.createdAt)}</span>
                      </div>
                      
                      {msg.replyTo && (
                        <div className="reply-quote" onClick={() => scrollToMessage(msg.replyTo.id)}>
                          <small>@{msg.replyTo.username}: {msg.replyTo.text.substring(0, 20)}</small>
                        </div>
                      )}

                      <div className="msg-bubble-row">
                        <div className={msg.image ? "msg-image-only" : `msg-bubble ${msg.uid === user.uid ? 'sent' : 'received'}`}>
                          {msg.image && <img src={msg.image} className="sent-image-standalone" />}
                          {msg.text && <div className="msg-text">{msg.text}</div>}
                          
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
                          
                          <div className="emoji-trigger">
                            <span>❤️</span>
                            <div className="emoji-popover">
                              {['❤️', '👍', '😂', '😮'].map(e => {
                                const isReactedByMe = msg.reactions?.some(r => r.uid === user.uid && r.emoji === e);
                                
                                return (
                                  <button 
                                    key={e} 
                                    onClick={() => handleReaction(msg.id, e)}
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
                <label style={{ marginTop: '20px', borderBottom: '1px solid #334155', paddingBottom: '5px' }}>
                黑名單列表 ({blockedUsersData.length} 人)
              </label>
              <div style={{ maxHeight: '150px', overflowY: 'auto', marginTop: '10px', paddingRight: '5px' }}>
                {blockedUsersData.map(blockedUser => (
                  <div key={blockedUser.uid} style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', backgroundColor: '#0f172a', 
                    borderRadius: '8px', marginBottom: '8px' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={blockedUser.photoURL || "/donlogo.jpeg"} alt="avatar" className="mini-avatar" style={{width: '28px', height: '28px'}} />
                      <span style={{ color: 'white', fontSize: '0.9rem' }}>{blockedUser.username || blockedUser.email}</span>
                    </div>
                    <button 
                      onClick={() => handleUnblock(blockedUser.uid)}
                      style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      解除
                    </button>
                  </div>
                ))}
                {blockedUsersData.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>目前沒有封鎖任何人。</div>}
              </div>
            </div>
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setShowProfileModal(false)}>取消</button>
              <button className="btn-save" onClick={saveProfile}>儲存變更</button>
            </div>
          </div>
        </div>
      )}
      {showRoomInfoModal && currentRoom && (
        <div className="modal-overlay">
          <div className="profile-modal">
            <h2>群組設定</h2>
            <div className="profile-fields">
              
              <label>修改群組名稱</label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                <input 
                  value={editRoomName} 
                  onChange={e => setEditRoomName(e.target.value)} 
                  style={{ flex: 1 }}
                />
                <button className="btn-save" onClick={saveRoomName}>儲存</button>
              </div>

              <label style={{ marginTop: '25px', borderBottom: '1px solid #334155', paddingBottom: '5px' }}>
                群組成員名單 ({roomMembersData.length} 人)
              </label>
              
              <div style={{ maxHeight: '250px', overflowY: 'auto', marginTop: '10px', paddingRight: '5px' }}>
                {roomMembersData.map(member => (
                  <div key={member.uid} style={{ 
                    display: 'flex', alignItems: 'center', gap: '15px', 
                    padding: '10px', backgroundColor: '#0f172a', 
                    borderRadius: '8px', marginBottom: '8px' 
                  }}>
                    <img src={member.photoURL || "/donlogo.jpeg"} alt="avatar" className="mini-avatar" />
                    <div>
                      <div style={{ color: 'white', fontWeight: '500', fontSize: '0.95rem' }}>
                        {member.username || member.email}
                        {member.uid === currentRoom.creator && <span style={{ color: '#f59e0b', fontSize: '10px', marginLeft: '5px' }}>管理員</span>}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>
                        ID: {member.inviteId || "無"}
                      </div>
                    </div>
                  </div>
                ))}
                {roomMembersData.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>載入中...</div>}
              </div>

            </div>
            
            <div className="modal-btns" style={{ marginTop: '20px' }}>
              <button className="btn-cancel" onClick={() => setShowRoomInfoModal(false)}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;