// =====================================
// Firebase 模組引入 (版本統一至 10.12.2)
// =====================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs, query as fsQuery, orderBy as fsOrderBy, limit as fsLimit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref, set, get, child, onValue, query, orderByChild, limitToLast, push, onDisconnect, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDwZ9dQlbx9oMRut4kuAkHpSL8rmfAGOvo",
    authDomain: "silenvocab.firebaseapp.com",
    projectId: "silenvocab",
    storageBucket: "silenvocab.firebasestorage.app",
    messagingSenderId: "307375326136",
    appId: "1:307375326136:web:8e6c28182f29f8805c854d",
    measurementId: "G-FPJ44BRH2N",
    databaseURL: "https://silenvocab-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

const API_BASE = 'http://45.32.26.246:3000';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app); 
const provider = new GoogleAuthProvider();

let currentUser = null;
window.purchasedBundles = JSON.parse(localStorage.getItem('sv_purchased_bundles')) || []; 

// =====================================
// 即時在線陪伴系統
// =====================================
const connectedRef = ref(rtdb, '.info/connected');
const presenceRef = ref(rtdb, 'online_users');
let mySessionRef = null;

window.updateMyPresence = function() {
    if (!mySessionRef) return;
    const user = window.currentUser;
    if (user) {
        update(mySessionRef, {
            uid: user.uid,
            name: user.displayName || '匿名者',
            photo: user.photoURL || '',
            score: window.myRankPoints || 0,
            frame: window.equippedFrame || '',
            isGuest: false,
            timestamp: Date.now()
        });
    } else {
        set(mySessionRef, { isGuest: true, timestamp: Date.now() });
    }
};

onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
        mySessionRef = push(presenceRef);
        onDisconnect(mySessionRef).remove();
        window.updateMyPresence();
    }
});

onValue(presenceRef, (snap) => {
    let uniqueUids = new Set();
    let guestCount = 0;
    if (snap.exists()) {
        snap.forEach(childSnap => {
            const data = childSnap.val();
            if (data === true || data.isGuest) guestCount++;
            else if (data.uid) uniqueUids.add(data.uid); 
        });
    }
    let realCount = uniqueUids.size + guestCount;
    if (realCount === 0) realCount = 1; 
    const countEl = document.getElementById('online-count');
    if (countEl) countEl.innerText = realCount;
});

// =====================================
// 帳號登入與登出邏輯 
// =====================================
window.loginWithGoogle = () => {
    const isApp = typeof AndroidBridge !== 'undefined';
    if (isApp) signInWithRedirect(auth, provider).catch(e => window.SilenModal && window.SilenModal.alert("App 登入失敗：" + e.message));
    else signInWithPopup(auth, provider).catch(e => window.SilenModal && window.SilenModal.alert("網頁登入失敗：" + e.message));
};

window.logout = () => {
    if (window.SilenModal) {
        window.SilenModal.confirm("確定要登出嗎？\n登出後本地快取將安全抹除。").then(agreed => { if (agreed) executeSignOut(); });
    } else {
        if (confirm("確定要登出嗎？")) executeSignOut();
    }
};

function executeSignOut() {
    // 【修復】：登出前手動砍掉在線節點，終結幽靈人口
    if (mySessionRef) set(mySessionRef, null);
    
    signOut(auth).then(() => {
        localStorage.removeItem('sv_books');
        localStorage.removeItem('sv_books_timestamp'); 
        window.books = [];
        window.location.reload(); 
    }).catch(e => console.error("登出失敗:", e));
}

// =====================================
// 雲端與本地端資料備份同步引擎
// =====================================
window.syncToCloud = async function(uid, booksData, timestamp) {
    if (!uid) return;
    const ts = timestamp || Date.now();
    try {
        await setDoc(doc(db, "users", uid), { books: booksData, lastUpdated: ts }, { merge: true });
    } catch (error) { console.error("雲端備份錯誤:", error); }
};

window.syncFromCloud = async function(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const cloudData = docSnap.data();
            let cloudTime = cloudData.lastUpdated || 0;
            if (typeof cloudTime === 'string') cloudTime = new Date(cloudTime).getTime() || 0;
            const localTime = parseInt(localStorage.getItem('sv_books_timestamp')) || 0;

            if (localTime > cloudTime && window.books && window.books.length > 0) {
                window.syncToCloud(uid, window.books, localTime);
            } else if (cloudData && cloudData.books) {
                window.books = cloudData.books;
                localStorage.setItem('sv_books', JSON.stringify(window.books));
                localStorage.setItem('sv_books_timestamp', cloudTime.toString());
                if (typeof window.renderBookList === 'function') window.renderBookList();
                if (typeof window.updateHomeSummary === 'function') window.updateHomeSummary();
            }
        } else {
            if (window.books && window.books.length > 0) {
                const now = Date.now();
                localStorage.setItem('sv_books_timestamp', now.toString());
                window.syncToCloud(uid, window.books, now);
            }
        }
    } catch (error) { console.error("雲端同步連線中斷:", error); }
};

let _lastSaveData = null;
setInterval(() => {
    if (window.saveData && window.saveData !== _lastSaveData && window.saveData.name !== 'silenHookedSave') {
        const original = window.saveData;
        window.saveData = function silenHookedSave() {
            if (typeof original === 'function') original();
            const now = Date.now();
            localStorage.setItem('sv_books_timestamp', now.toString());
            if (window.currentUser) {
                window.syncToCloud(window.currentUser.uid, window.books, now);
                set(ref(rtdb, `users/${window.currentUser.uid}/purchasedBundles`), window.purchasedBundles || []);
            }
        };
        _lastSaveData = window.saveData;
    }
}, 500);

// =====================================
// 全站身份驗證狀態變更 (Auth State)
// =====================================
onAuthStateChanged(auth, (user) => {
    const authContainer = document.getElementById('auth-container');
    const mainHeader = document.getElementById('main-header');
    if (!authContainer || !mainHeader) return;
    const urlParams = new URLSearchParams(window.location.search);
    const hasShareLink = urlParams.get('lz') || urlParams.get('s') || urlParams.get('share') || urlParams.get('q');

    if (user) {
        window.currentUser = user;
        mainHeader.classList.remove('hidden');
        authContainer.innerHTML = `
            <div class="avatar-wrapper" style="cursor: pointer;" onclick="window.toggleSidebar()">
                <img src="${user.photoURL}" alt="avatar" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border); display: block; margin: 0;">
                <img id="header-avatar-frame" class="avatar-frame" src="" style="display: none;">
            </div>
        `;
        
        const sbPlaceholder = document.getElementById('sb-avatar-placeholder');
        const sbImg = document.getElementById('sb-avatar-img');
        const sbName = document.getElementById('sb-user-name');
        if(sbPlaceholder) sbPlaceholder.style.display = 'none';
        if(sbImg) { sbImg.src = user.photoURL; sbImg.style.display = 'block'; }
        if(sbName) sbName.innerText = user.displayName;

        const pfPlaceholder = document.getElementById('profile-avatar-placeholder');
        const pfImg = document.getElementById('profile-avatar-img');
        const pfName = document.getElementById('profile-name');
        const pfEmail = document.getElementById('profile-email');
        if(pfPlaceholder) pfPlaceholder.style.display = 'none';
        if(pfImg) { pfImg.src = user.photoURL; pfImg.style.display = 'inline-block'; }
        if(pfName) pfName.innerText = user.displayName;
        if(pfEmail) pfEmail.innerText = user.email;

        const weekId = typeof window.getCurrentWeekId === 'function' ? window.getCurrentWeekId() : 1;

        Promise.all([
            get(ref(rtdb, `users/${user.uid}/storePoints`)),
            get(ref(rtdb, `leaderboard/week_${weekId}/${user.uid}/score`)),
            get(ref(rtdb, `users/${user.uid}/isAdmin`)),
            getDoc(doc(db, "users", user.uid)),
            get(ref(rtdb, `users/${user.uid}/purchasedAccessories`)), 
            get(ref(rtdb, `users/${user.uid}/equippedFrame`)),
            get(ref(rtdb, `users/${user.uid}/purchasedBundles`)) 
        ]).then(async ([snapStore, snapLb, snapAdminRtdb, docSnapAdminDb, snapAcc, snapFrame, snapBundles]) => {
            
            window.myRankPoints = snapLb.exists() ? snapLb.val() : 0;
            window.myStorePoints = snapStore.exists() ? snapStore.val() : 0;

            const tzOptions = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
            const now = new Date();
            const todayStr = now.toLocaleDateString('zh-TW', tzOptions);
            const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toLocaleDateString('zh-TW', tzOptions);

            let dbData = docSnapAdminDb.exists() ? docSnapAdminDb.data() : {};
            let lastDate = dbData.lastCheckInDate || '';
            let streak = dbData.checkInStreak || 0;

            if (lastDate !== todayStr && !window.isGuestMode && !hasShareLink) {
                const token = await user.getIdToken();
                const res = await fetch(`${API_BASE}/api/checkin`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                });
                const data = await res.json();
                if (data.success) {
                    window.myStorePoints = data.newPoints;
                    setTimeout(() => window.SilenModal.alert(`🎉 每日簽到成功！\n這是您連續簽到的第 ${data.streak} 天。\n已為您發放 ${data.rewardPoints} 點商城點數！`), 800);
                }
            }

            window.purchasedAccessories = snapAcc.exists() ? snapAcc.val() : [];
            window.equippedFrame = snapFrame.exists() ? snapFrame.val() : null;
            window.purchasedBundles = snapBundles.exists() ? snapBundles.val() : (JSON.parse(localStorage.getItem('sv_purchased_bundles')) || []);
            
            localStorage.setItem('sv_purchased_acc', JSON.stringify(window.purchasedAccessories));
            localStorage.setItem('sv_purchased_bundles', JSON.stringify(window.purchasedBundles));
            
            if (typeof window.applyAvatarFrame === 'function') window.applyAvatarFrame(window.equippedFrame);

            window.updateMyPresence();

            const elRank = document.getElementById('stat-rank-score');
            const elLbMyScore = document.getElementById('lb-my-score');
            const elStore = document.getElementById('stat-store-points');
            const elStoreMyScore = document.getElementById('store-my-score');
            if (elRank) elRank.innerText = window.myRankPoints;
            if (elLbMyScore) elLbMyScore.innerText = window.myRankPoints;
            if (elStore) elStore.innerText = window.myStorePoints;
            if (elStoreMyScore) elStoreMyScore.innerText = window.myStorePoints;

            set(ref(rtdb, `users/${user.uid}/rankPoints`), window.myRankPoints);
            if (!snapStore.exists()) set(ref(rtdb, `users/${user.uid}/storePoints`), window.myStorePoints);

            let hasAdminPrivilege = false;
            if (snapAdminRtdb.exists() && snapAdminRtdb.val() === true) hasAdminPrivilege = true;
            if (docSnapAdminDb.exists() && docSnapAdminDb.data().isAdmin === true) hasAdminPrivilege = true;
            window.isAdmin = hasAdminPrivilege;
            const adminBtn = document.getElementById('sidebar-admin-btn');
            if (adminBtn) adminBtn.style.display = hasAdminPrivilege ? 'block' : 'none';

        }).finally(() => {
            get(ref(rtdb, `users/${user.uid}/badges`)).then(snap => window.renderMyBadges(snap.exists() ? snap.val() : []));
            window.syncFromCloud(user.uid);
            if (!window.isGuestMode && !hasShareLink && typeof window.goHome === 'function') window.goHome();
        });
    } else {
        window.currentUser = null;
        window.updateMyPresence();
        authContainer.innerHTML = ``;
        if (hasShareLink) {
            mainHeader.classList.remove('hidden');
        } else {
            mainHeader.classList.add('hidden');
            // 【修復】：強制霸王硬上弓顯示 landing 畫面，破解登出卡黑屏的問題
            const landingView = document.getElementById('view-landing');
            if (landingView) {
                document.querySelectorAll('.container > div').forEach(el => {
                    el.classList.add('hidden');
                    el.style.setProperty('display', 'none', 'important');
                });
                landingView.classList.remove('hidden');
                landingView.style.setProperty('display', 'block', 'important');
            } else if (typeof window.switchView === 'function') {
                window.switchView('landing');
            }
        }
    }
});

// =====================================
// 飾品系統 Firebase 同步
// =====================================
window.syncAccessoriesToCloud = async function() {
    if (!window.currentUser) return;
    const uid = window.currentUser.uid;
    try {
        await set(ref(rtdb, `users/${uid}/purchasedAccessories`), window.purchasedAccessories || []);
        await set(ref(rtdb, `users/${uid}/equippedFrame`), window.equippedFrame || '');
        const weekId = window.getCurrentWeekId();
        await set(ref(rtdb, `leaderboard/week_${weekId}/${uid}/frame`), window.equippedFrame || '');
        window.updateMyPresence();
        if (typeof window.applyAvatarFrame === 'function') window.applyAvatarFrame(window.equippedFrame);
    } catch (e) { console.error("飾品同步失敗", e); }
};

window.applyAvatarFrame = function(frameId) {
    window.equippedFrame = frameId;
    localStorage.setItem('sv_equipped_frame', frameId || '');
    let frameUrl = '';
    if (frameId && window.accessoriesCatalog) {
        const item = window.accessoriesCatalog.find(a => a.id === frameId);
        if (item) frameUrl = item.imgUrl;
    }
    const targetEls = ['sb-avatar-frame', 'profile-avatar-frame', 'header-avatar-frame'];
    targetEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (frameUrl) { el.src = frameUrl; el.style.display = 'block'; } 
            else { el.style.display = 'none'; el.src = ''; }
        }
    });
};

// =====================================
// 排行榜與雙軌分數同步邏輯 (解鎖分離上傳版)
// =====================================
window.uploadScoreToCloud = async function(rankPoints, storePoints) {
    if (!window.currentUser || typeof rtdb === 'undefined') return;
    const uid = window.currentUser.uid;
    
    try { await set(ref(rtdb, `users/${uid}/storePoints`), storePoints); } catch(e) { console.warn("商城點數同步延遲", e); }
    try { await set(ref(rtdb, `users/${uid}/rankPoints`), rankPoints); } catch(e) { console.warn("牌位分數同步延遲", e); }
    
    try {
        const weekId = window.getCurrentWeekId();
        await set(ref(rtdb, `leaderboard/week_${weekId}/${uid}`), {
            name: window.currentUser.displayName || '匿名者',
            photo: window.currentUser.photoURL || '',
            score: rankPoints,
            frame: window.equippedFrame || '',
            timestamp: Date.now()
        });
    } catch(e) { console.warn("排行榜同步延遲", e); }
    
    window.updateMyPresence(); 
};

window.fetchLeaderboard = async function(weekId) {
    try {
        const lbRef = query(ref(rtdb, `leaderboard/week_${weekId}`), orderByChild('score'), limitToLast(10));
        const snapshot = await get(lbRef);
        let list = [];
        if (snapshot.exists()) { snapshot.forEach(c => { list.push({ uid: c.key, ...c.val() }); }); }
        list.reverse();
        if (window.renderLeaderboard) window.renderLeaderboard(list, window.myRankPoints);
    } catch(e) { console.error("抓取排行榜失敗", e); }
};

window.updateCloudUserName = async function(newName) {
    if (!window.currentUser) { window.SilenModal.alert("請先登入帳號！"); return; }
    try {
        await updateProfile(window.currentUser, { displayName: newName });
        await setDoc(doc(db, "users", window.currentUser.uid), { name: newName }, { merge: true });
        const weekId = window.getCurrentWeekId();
        const lbRef = ref(rtdb, `leaderboard/week_${weekId}/${window.currentUser.uid}`);
        const snap = await get(lbRef);
        if (snap.exists()) await set(lbRef, { ...snap.val(), name: newName });
        window.updateMyPresence(); 
        window.SilenModal.alert(`改名成功！\n您的 ID 已更新為「${newName}」。`);
        window.fetchLeaderboard(weekId);
    } catch (e) { window.SilenModal.alert("雲端同步失敗，請檢查網路。"); }
};

window.renderMyBadges = function(badges) {
    const container = document.getElementById('profile-badges-container');
    if (!container) return;
    container.innerHTML = '';
    if (!badges || badges.length === 0) {
        container.innerHTML = '<div class="badge-slot">尚未獲得</div><div class="badge-slot">尚未獲得</div><div class="badge-slot">尚未獲得</div>'; return;
    }
    badges.forEach(b => {
        const slot = document.createElement('div'); slot.className = 'badge-slot';
        slot.style.border = `2px solid ${b.color}`; slot.style.color = b.color; slot.style.fontWeight = 'bold'; slot.style.fontSize = '0.8rem';
        slot.style.display = 'flex'; slot.style.flexDirection = 'column'; slot.style.lineHeight = '1.4';
        const lines = b.name.split(' '); slot.innerHTML = `<span>${lines[0]}</span><span>${lines[1]}</span>`;
        container.appendChild(slot);
    });
};

window.fetchPublicBadges = async function(uid) {
    const badgeContainer = document.getElementById('public-badges-container');
    try {
        const snap = await get(ref(rtdb, `users/${uid}/badges`));
        badgeContainer.innerHTML = '';
        if (snap.exists() && snap.val().length > 0) {
            snap.val().forEach(b => {
                const slot = document.createElement('div'); slot.className = 'badge-slot';
                slot.style.border = `2px solid ${b.color}`; slot.style.color = b.color; slot.style.fontWeight = 'bold'; slot.style.fontSize = '0.8rem';
                slot.style.display = 'flex'; slot.style.flexDirection = 'column'; slot.style.lineHeight = '1.4';
                const lines = b.name.split(' '); slot.innerHTML = `<span>${lines[0]}</span><span>${lines[1]}</span>`;
                badgeContainer.appendChild(slot);
            });
        } else badgeContainer.innerHTML = '<div style="color:var(--text-sub); font-size:0.85rem; padding: 20px 0;">該玩家尚未獲得榮譽徽章。</div>';
    } catch(e) { badgeContainer.innerHTML = '<div style="color:var(--error); font-size:0.85rem; padding: 20px 0;">載入失敗</div>'; }
};

// =====================================
// 分享機制
// =====================================
window.uploadShareData = async (shareData) => {
    try { const shareRef = push(ref(rtdb, 'shared_quizzes')); await set(shareRef, { data: JSON.stringify(shareData), timestamp: Date.now() }); return shareRef.key; } 
    catch(e) { return null; }
};
window.downloadShareData = async (shareId) => {
    try { const snap = await get(child(ref(rtdb), `shared_quizzes/${shareId}`)); return snap.exists() ? JSON.parse(snap.val().data) : null; } 
    catch(e) { return null; }
};

// ==========================================
// 系統公告與管理員 (Admin)
// ==========================================
window.pendingAnnouncement = null;
onValue(ref(rtdb, 'system/announcement'), (snap) => {
    const data = snap.val();
    if (data && data.visible) {
        const lastSeen = parseInt(localStorage.getItem('sv_last_seen_announcement')) || 0;
        if (data.timestamp > lastSeen) {
            const isHome = document.getElementById('view-home') && !document.getElementById('view-home').classList.contains('hidden');
            if (isHome) { localStorage.setItem('sv_last_seen_announcement', data.timestamp); window.SilenModal.alert(`[系統公告] ${data.title}\n\n${data.content}`); } 
            else window.pendingAnnouncement = data;
        }
    } else window.pendingAnnouncement = null;
});

window.publishAnnouncement = async function() {
    if (!window.isAdmin) return;
    const title = document.getElementById('admin-announce-title').value.trim();
    const content = document.getElementById('admin-announce-content').value.trim();
    if (!title || !content) { window.SilenModal.alert("標題與內容皆不可為空！"); return; }
    try {
        await set(ref(rtdb, 'system/announcement'), { title, content, visible: true, timestamp: Date.now() });
        window.SilenModal.alert("公告已成功全服廣播！").then(() => window.goHome());
    } catch (e) { window.SilenModal.alert("發布失敗，請檢查資料庫權限。"); }
};

window.revokeAnnouncement = async function() {
    if (!window.isAdmin) return;
    window.SilenModal.confirm("確定要撤回公告嗎？").then(async agreed => {
        if (agreed) { await set(ref(rtdb, 'system/announcement/visible'), false); window.SilenModal.alert("公告已撤銷。"); }
    });
};

window.settleLastSeason = function() {
    if (!window.isAdmin) return;
    window.SilenModal.prompt("請輸入要結算的賽季 (例如: 1)", window.getCurrentWeekId().toString()).then(async input => {
        if (!input) return; const targetWeek = parseInt(input.trim());
        if (isNaN(targetWeek) || targetWeek < 1) return window.SilenModal.alert("請輸入有效的賽季數字。");
        const settleRef = ref(rtdb, `system/settlement/week_${targetWeek}`);
        const settleSnap = await get(settleRef);
        if (settleSnap.exists() && settleSnap.val() === true) return window.SilenModal.alert(`第 ${targetWeek} 賽季已結算！`);
        const lbRef = query(ref(rtdb, `leaderboard/week_${targetWeek}`), orderByChild('score'), limitToLast(3));
        const snap = await get(lbRef);
        if (!snap.exists()) return window.SilenModal.alert(`第 ${targetWeek} 賽季無人參與。`);
        let winners = []; snap.forEach(c => winners.push({ uid: c.key, ...c.val() })); winners.reverse();
        for (let i = 0; i < winners.length; i++) {
            const w = winners[i];
            let badgeColor = (i === 0) ? '#FFD700' : (i === 1) ? '#C0C0C0' : '#CD7F32';
            const userBadgesRef = ref(rtdb, `users/${w.uid}/badges`);
            const ubSnap = await get(userBadgesRef);
            let badges = ubSnap.exists() ? ubSnap.val() : [];
            badges.push({ season: targetWeek, name: `S${targetWeek} ${i===0?'冠軍':i===1?'亞軍':'季軍'}`, color: badgeColor });
            await set(userBadgesRef, badges);
        }
        await set(settleRef, true);
        const usersSnap = await get(ref(rtdb, 'users'));
        if (usersSnap.exists()) {
            const updates = {}; usersSnap.forEach(c => { updates[`users/${c.key}/rankPoints`] = 0; });
            await update(ref(rtdb), updates);
        }
        window.SilenModal.alert(`第 ${targetWeek} 賽季結算成功！全服積分已歸零。`).then(()=>window.location.reload());
    });
};

window.resetAllRankPoints = async function() {
    if (!window.isAdmin) return;
    window.SilenModal.confirm("⚠️ 確定要清空全服所有玩家的 Firebase 牌位積分嗎？").then(async agreed => {
        if (agreed) {
            window.SilenModal.alert("正在清空...");
            const usersSnap = await get(ref(rtdb, 'users'));
            if (usersSnap.exists()) {
                const updates = {}; usersSnap.forEach(c => { updates[`users/${c.key}/rankPoints`] = 0; });
                await update(ref(rtdb), updates);
                window.SilenModal.alert("✅ 全服積分已徹底歸零。").then(()=>window.location.reload());
            }
        }
    });
};

window.refreshAdminOnlineUsers = async function() {
    if (!window.isAdmin) return;
    const container = document.getElementById('admin-online-list');
    container.innerHTML = '<div style="text-align: center; padding: 20px 0; color: var(--text-sub);">連線中...</div>';
    try {
        const snap = await get(ref(rtdb, 'online_users'));
        let uniqueUsers = new Map(); let guestCount = 0;
        if (snap.exists()) {
            snap.forEach(c => {
                const data = c.val();
                if (data === true || data.isGuest) guestCount++;
                else if (data.uid) {
                    if (!uniqueUsers.has(data.uid) || (data.score || 0) > (uniqueUsers.get(data.uid).score || 0)) uniqueUsers.set(data.uid, data);
                }
            });
        }
        let list = Array.from(uniqueUsers.values());
        container.innerHTML = '';
        if (list.length === 0 && guestCount === 0) { container.innerHTML = '<div style="text-align: center; padding: 20px 0; color: var(--text-sub);">目前無人上線</div>'; return; }
        list.sort((a, b) => (b.score || 0) - (a.score || 0));
        list.forEach((user) => {
            let frameHtml = user.frame && window.accessoriesCatalog ? `<img src="${window.accessoriesCatalog.find(a=>a.id===user.frame)?.imgUrl||''}" class="avatar-frame" style="display:block;">` : '';
            const div = document.createElement('div'); div.className = 'lb-item'; div.style.cursor = 'pointer';
            div.onclick = () => window.openPublicProfile(user);
            div.innerHTML = `<div class="avatar-wrapper" style="margin-right: 15px; width: 40px; height: 40px;"><img src="${user.photo || 'https://via.placeholder.com/45'}" class="lb-avatar" style="margin: 0; width: 100%; height: 100%;">${frameHtml}</div><div class="lb-info"><div class="lb-name" style="font-size: 0.95rem;">${user.name}</div></div><div class="lb-score" style="font-size: 0.9rem; color: #4caf50;">${user.score || 0} pts</div>`;
            container.appendChild(div);
        });
        if (guestCount > 0) {
            const div = document.createElement('div'); div.style.textAlign = 'center'; div.style.color = 'var(--text-sub)'; div.style.fontSize = '0.85rem'; div.style.marginTop = '10px'; div.innerText = `+ ${guestCount} 名未登入訪客`; container.appendChild(div);
        }
    } catch(e) { container.innerHTML = '<div style="text-align: center; color: #ff4444;">連線失敗</div>'; }
};

// ==========================================
// 14. 玩家市場系統 (Player Market) Phase 2
// ==========================================
window.currentPublishBookId = null;

window.checkPublishLimit = async function() {
    if (!window.currentUser) return { canUpload: false, remaining: 0 };
    try {
        const docSnap = await getDoc(doc(db, "users", window.currentUser.uid));
        if (docSnap.exists()) {
            const data = docSnap.data();
            const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            let count = data.lastUploadDate === today ? (data.dailyUploadCount || 0) : 0;
            return { canUpload: count < 3, remaining: 3 - count };
        }
        return { canUpload: true, remaining: 3 };
    } catch(e) { return { canUpload: false, remaining: 0 }; }
};

window.openPublishModal = function() {
    if (!window.currentUser) { window.SilenModal.alert("請先登入帳號以使用市場功能。"); return; }
    const eligibleBooks = window.books.filter(b => !b.isStore && b.words.length >= 10);
    const container = document.getElementById('pub-book-list-container');
    container.innerHTML = '';
    if (eligibleBooks.length === 0) {
        container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:20px;">您目前沒有符合條件的單字簿可供上架！</div>';
    } else {
        eligibleBooks.forEach(b => {
            const div = document.createElement('div'); div.className = 'card book-item'; div.style.cursor = 'pointer';
            div.innerHTML = `<strong>${b.name}</strong> <span style="font-size:0.8rem; color:var(--text-sub)">(${b.words.length} 詞)</span>`;
            div.onclick = () => window.selectBookToPublish(b.id); container.appendChild(div);
        });
    }
    document.getElementById('pub-step-1').classList.remove('hidden'); document.getElementById('pub-step-2').classList.add('hidden');
    const overlay = document.getElementById('silen-publish-overlay'); overlay.classList.remove('hidden'); void overlay.offsetWidth; overlay.classList.add('show');
};

window.selectBookToPublish = function(bookId) {
    const book = window.books.find(b => b.id === bookId); if (!book) return;
    window.currentPublishBookId = bookId;
    document.getElementById('pub-book-name').innerText = book.name; document.getElementById('pub-price').value = 100; document.getElementById('pub-desc').value = '';
    document.getElementById('btn-confirm-pub').disabled = true; document.getElementById('pub-limit-text').innerText = "正在檢查每日額度...";
    document.getElementById('pub-step-1').classList.add('hidden'); document.getElementById('pub-step-2').classList.remove('hidden');
    window.checkPublishLimit().then(res => {
        const txt = document.getElementById('pub-limit-text');
        if (res.canUpload) { txt.innerText = `今日上架額度剩餘: ${res.remaining} / 3`; txt.style.color = '#4caf50'; document.getElementById('btn-confirm-pub').disabled = false; } 
        else { txt.innerText = `今日上架額度已達上限，請明日再來！`; txt.style.color = '#ff4444'; }
    });
};

window.backToPublishList = function() { document.getElementById('pub-step-2').classList.add('hidden'); document.getElementById('pub-step-1').classList.remove('hidden'); };
window.closePublishModal = function() { const o = document.getElementById('silen-publish-overlay'); o.classList.remove('show'); setTimeout(() => o.classList.add('hidden'), 200); };

window.confirmPublish = function() {
    const price = parseInt(document.getElementById('pub-price').value); const desc = document.getElementById('pub-desc').value.trim();
    if (isNaN(price) || price < 50) return window.SilenModal.alert("定價最低需為 50 點數。");
    if (!desc) return window.SilenModal.alert("請輸入商品介紹。");
    const book = window.books.find(b => b.id === window.currentPublishBookId);
    if (!book) return window.SilenModal.alert("找不到單字簿。");
    window.closePublishModal(); window.executePublishToMarket(book, price, desc);
};

window.executePublishToMarket = async function(book, price, desc) {
    if (!window.currentUser) return; window.SilenModal.alert("上架處理中...");
    try {
        const userRef = doc(db, "users", window.currentUser.uid);
        const docSnap = await getDoc(userRef); let data = docSnap.exists() ? docSnap.data() : {};
        const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
        let count = data.lastUploadDate === today ? (data.dailyUploadCount || 0) : 0;
        if (count >= 3) return window.SilenModal.alert("今日上架額度已用盡！");
        
        const cleanWords = book.words.map(w => ({ en: w.en, zh: w.zh, pos: w.pos || '' }));
        await addDoc(collection(db, "market_books"), {
            authorUid: window.currentUser.uid, authorName: window.currentUser.displayName || '匿名玩家',
            bookName: book.name, description: desc, price: price, wordCount: cleanWords.length, words: cleanWords, salesCount: 0, timestamp: Date.now()
        });
        await updateDoc(userRef, { dailyUploadCount: count + 1, lastUploadDate: today });
        window.SilenModal.alert("上架成功！").then(() => window.openMarket());
    } catch(e) { window.SilenModal.alert("上架失敗，請檢查連線。"); }
};

window.openMarket = async function() {
    window.switchView('market');
    const el = document.getElementById('market-my-score'); if(el) el.innerText = window.myStorePoints || 0;
    const container = document.getElementById('market-catalog-area');
    container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--text-sub);">載入中...</div>';
    try {
        const q = fsQuery(collection(db, "market_books"), fsOrderBy("timestamp", "desc"), fsLimit(50));
        const querySnapshot = await getDocs(q);
        let books = []; querySnapshot.forEach((docSnap) => { books.push({ id: docSnap.id, ...docSnap.data() }); });
        window.renderMarketCatalog(books);
    } catch (e) { container.innerHTML = '<div style="text-align: center; color: #ff4444;">載入失敗</div>'; }
};

window.renderMarketCatalog = function(marketBooks) {
    const container = document.getElementById('market-catalog-area'); container.innerHTML = '';
    if (marketBooks.length === 0) return container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--text-sub);">目前沒有商品！</div>';
    marketBooks.forEach(book => {
        const card = document.createElement('div'); card.className = 'store-card';
        const isOwned = window.books.some(b => b.marketId === book.id);
        const myUid = window.currentUser ? window.currentUser.uid : '';
        let btnHtml = isOwned ? `<button class="btn btn-small" style="background:#333; color:#aaa;" disabled>已擁有</button>` : 
                     (book.authorUid === myUid ? `<button class="btn btn-small" style="background:#333; color:#aaa;" disabled>您的商品</button>` : 
                     `<button class="btn btn-small" style="background:#fff; color:#000;" onclick="window.purchaseMarketBook('${book.id}', ${book.price}, '${book.bookName.replace(/'/g, "\\'")}', '${book.authorUid}')">${book.price} pts</button>`);
        const safeBookName = book.bookName.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeAuthorName = book.authorName.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeDesc = book.description.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        card.innerHTML = `<div class="store-header"><h4 class="store-title">${safeBookName}</h4><div style="font-size: 0.8rem; color: #ff9800; border: 1px solid #ff9800; padding: 2px 6px; border-radius: 4px;">銷量: ${book.salesCount || 0}</div></div><div style="font-size: 0.85rem; color: var(--text-sub); margin-bottom: 10px;"><span style="background:#222; padding:2px 8px; border-radius:10px;">創作者: ${safeAuthorName}</span></div><div class="store-desc">${safeDesc} <br><span style="color:var(--text-sub); font-size: 0.8rem; opacity: 0.8;">(共 ${book.wordCount} 詞)</span></div><div style="display: flex; justify-content: flex-end;">${btnHtml}</div>`;
        container.appendChild(card);
    });
};

window.purchaseMarketBook = async function(marketBookId, price, bookName, authorUid) {
    if (!window.currentUser) return window.SilenModal.alert("請先登入！");
    if (window.myStorePoints < price) return window.SilenModal.alert(`點數不足！需要 ${price} 點數。`);
    
    window.SilenModal.confirm(`花費 ${price} 點數購買「${bookName}」嗎？`).then(async agreed => {
        if (agreed) {
            window.SilenModal.alert("交易中...");
            const originalPoints = window.myStorePoints;
            window.myStorePoints -= price;
            document.getElementById('market-my-score').innerText = window.myStorePoints;
            
            try {
                const docRef = doc(db, "market_books", marketBookId);
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) throw new Error("商品已下架");
                
            const token = await window.currentUser.getIdToken();
            const tradeRes = await fetch(`${API_BASE}/api/trade`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ sellerUid: authorUid, amount: Math.floor(price * 0.8), itemId: marketBookId })
            });
            const tradeData = await tradeRes.json();
            if (!tradeData.success) return window.SilenModal.alert("交易失敗：" + (tradeData.error || "未知錯誤"));
            window.myStorePoints = tradeData.buyerNewPoints;
            document.getElementById('market-my-score').innerText = window.myStorePoints;

                updateDoc(docRef, { salesCount: (docSnap.data().salesCount || 0) + 1 }).catch(()=>{});

                window.books.push({ id: Date.now(), name: docSnap.data().bookName, tag: "玩家市集", isGSAT: false, isPhrase: false, isStore: false, marketId: marketBookId, words: docSnap.data().words });
                window.saveData(); 
                
                window.SilenModal.alert(`交易成功！\n賣家將獲得 ${sellerRevenue} 點數`).then(() => window.openMarket());
                
            } catch (e) { 
                console.error("交易異常終止", e);
                window.myStorePoints = originalPoints;
                document.getElementById('market-my-score').innerText = window.myStorePoints;
                await set(ref(rtdb, `users/${window.currentUser.uid}/storePoints`), originalPoints).catch(()=>{});
                window.SilenModal.alert("交易失敗，點數已全額退還！\n原因：" + e.message); 
            }
        }
    });
};

// ==========================================
// 15. 外觀飾品系統
// ==========================================
window.openAccessoriesStore = async function() {
    window.switchView('accessories');
    document.getElementById('acc-my-score').innerText = window.myStorePoints || 0;
    const container = document.getElementById('accessories-catalog-area');
    container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px 0; color: var(--text-sub);">載入中...</div>';
    const catalog = await window.loadAccessoriesCatalog();
    window.renderAccessoriesCatalog(catalog);
};

window.renderAccessoriesCatalog = function(catalog) {
    const container = document.getElementById('accessories-catalog-area'); container.innerHTML = '';
    const activeItems = catalog.filter(item => item.active);
    if (activeItems.length === 0) return container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-sub);">沒有飾品。</div>';
    activeItems.forEach(item => {
        const isPurchased = window.purchasedAccessories.includes(item.id);
        const isEquipped = window.equippedFrame === item.id;
        const card = document.createElement('div'); card.className = 'acc-card';
        let btnHtml = isEquipped ? `<button class="btn btn-small" style="background:#f1c40f; color:#000;" onclick="window.equipAccessory('${item.id}')">卸下</button>` : 
                     (isPurchased ? `<button class="btn btn-small btn-outline" style="border-color:#f1c40f; color:#f1c40f;" onclick="window.equipAccessory('${item.id}')">裝備</button>` : 
                     `<button class="btn btn-small" style="background:#fff; color:#000;" onclick="window.purchaseAccessory('${item.id}', ${item.price}, '${item.name}')">${item.price} pts</button>`);
        card.innerHTML = `<div class="acc-img-wrapper"><div class="acc-avatar-dummy"></div><img src="${item.imgUrl}" class="acc-img"></div><div class="acc-title">${item.name}</div><div class="acc-desc">${item.desc}</div><div style="margin-top: 10px;">${btnHtml}</div>`;
        container.appendChild(card);
    });
};

window.purchaseAccessory = async function(id, price, name) {
    if (!window.currentUser) return window.SilenModal.alert("請先登入！");
    if (window.myStorePoints < price) return window.SilenModal.alert(`點數不足！`);
    
    window.SilenModal.confirm(`花費 ${price} 點數購買「${name}」嗎？`).then(async agreed => {
        if (agreed) {
<<<<<<< HEAD
            
            const token = await window.currentUser.getIdToken();
            const purchRes = await fetch(`${API_BASE}/api/purchase`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: id, price: price })
            });
            const purchData = await purchRes.json();
            if (!purchData.success) return window.SilenModal.alert("購買失敗：" + (purchData.error || "未知錯誤"));
            window.myStorePoints = purchData.newPoints;
            window.purchasedAccessories.push(id);
            localStorage.setItem('sv_purchased_acc', JSON.stringify(window.purchasedAccessories));
            window.syncAccessoriesToCloud();
            window.SilenModal.alert(`購買成功！`).then(() => window.openAccessoriesStore());
=======
            const originalPoints = window.myStorePoints;
            window.myStorePoints -= price;
            document.getElementById('acc-my-score').innerText = window.myStorePoints;
            
            try {
                await set(ref(rtdb, `users/${window.currentUser.uid}/storePoints`), window.myStorePoints);
                window.purchasedAccessories.push(id);
                localStorage.setItem('sv_purchased_acc', JSON.stringify(window.purchasedAccessories));
                window.syncAccessoriesToCloud();
                window.SilenModal.alert(`購買成功！`).then(() => window.openAccessoriesStore());
            } catch(e) {
                window.myStorePoints = originalPoints;
                document.getElementById('acc-my-score').innerText = window.myStorePoints;
                window.SilenModal.alert("雲端連線失敗，點數已退還！");
            }
>>>>>>> f9d29ea776cdae44985d7e88752ee24ac07ebace
        }
    });
};

window.equipAccessory = function(id) {
    window.applyAvatarFrame(window.equippedFrame === id ? null : id);
    window.syncAccessoriesToCloud();
    window.openAccessoriesStore();
};

// ==========================================
// 16. 1v1 即時對戰 Firebase 核心
// ==========================================
window.createArenaRoom = async function() {
    if (!window.currentUser) return window.SilenModal.alert("請登入！");
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = ''; for(let i=0; i<5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    const roomRef = ref(rtdb, `arena_rooms/${code}`);
    try {
        await set(roomRef, { status: 'waiting', host: { uid: window.currentUser.uid, name: window.currentUser.displayName, photo: window.currentUser.photoURL, frame: window.equippedFrame, score: 0 }, timestamp: Date.now() });
        onDisconnect(roomRef).remove();
        window.currentArenaRoom = code; window.isArenaHost = true; window.matchStarted = false;
        if (typeof window.showArenaWaiting === 'function') window.showArenaWaiting(code, true, {name:window.currentUser.displayName, photo:window.currentUser.photoURL, frame:window.equippedFrame}, null);
        window.listenToArenaRoom(roomRef);
    } catch(e) { window.SilenModal.alert("建房失敗"); }
};

window.joinArenaRoom = async function() {
    if (!window.currentUser) return window.SilenModal.alert("請登入！");
    const code = document.getElementById('arena-join-code').value.trim().toUpperCase();
    if(code.length !== 5) return window.SilenModal.alert("輸入 5 碼！");
    const roomRef = ref(rtdb, `arena_rooms/${code}`);
    try {
        const snap = await get(roomRef);
        if (!snap.exists()) return window.SilenModal.alert("找不到房間。");
        const roomData = snap.val();
        if (roomData.status !== 'waiting' || roomData.guest) return window.SilenModal.alert("房間已滿或已開始！");
        if (roomData.host.uid === window.currentUser.uid) return window.SilenModal.alert("不能加入自己的房間！");
        const myData = { uid: window.currentUser.uid, name: window.currentUser.displayName, photo: window.currentUser.photoURL, frame: window.equippedFrame, score: 0 };
        await update(roomRef, { guest: myData });
        onDisconnect(child(roomRef, 'guest')).remove();
        window.currentArenaRoom = code; window.isArenaHost = false; window.matchStarted = false;
        if (typeof window.showArenaWaiting === 'function') window.showArenaWaiting(code, false, roomData.host, myData);
        window.listenToArenaRoom(roomRef);
    } catch(e) { window.SilenModal.alert("加入失敗"); }
};

window.listenToArenaRoom = function(roomRef) {
    if (window.arenaUnsubscribe) window.arenaUnsubscribe();
    window.arenaUnsubscribe = onValue(roomRef, (snap) => {
        if (!snap.exists()) return window.matchStarted ? window.handleOpponentFled() : window.handleRoomClosed();
        const data = snap.val();
        if (data.status === 'waiting' && typeof window.updateArenaWaiting === 'function') window.updateArenaWaiting(data);
        else if (data.status === 'playing') {
            if (!window.matchStarted) { window.matchStarted = true; if (typeof window.renderArenaMatch === 'function') window.renderArenaMatch(data.quizPayload, data.host, data.guest); }
            let hScore = data.host.score || 0; let gScore = data.guest.score || 0;
            document.getElementById('am-host-score').innerText = hScore; document.getElementById('am-guest-score').innerText = gScore;
            document.getElementById('am-host-bar').style.width = (hScore / 10 * 100) + '%'; document.getElementById('am-guest-bar').style.width = (gScore / 10 * 100) + '%';
            if (hScore >= 10 || gScore >= 10) window.declareArenaWinner(data, hScore >= 10 ? 'host' : 'guest');
        }
    });
};

window.triggerArenaStart = async function(quizPayload) {
    if (window.currentArenaRoom && window.isArenaHost) await update(ref(rtdb, `arena_rooms/${window.currentArenaRoom}`), { status: 'playing', quizPayload: quizPayload });
};

window.updateArenaScore = async function(newScore) {
    if (window.currentArenaRoom) await set(ref(rtdb, `arena_rooms/${window.currentArenaRoom}/${window.isArenaHost ? 'host' : 'guest'}/score`), newScore);
};

window.declareArenaWinner = async function(roomData, winnerRole) {
    if (window.arenaUnsubscribe) { window.arenaUnsubscribe(); window.arenaUnsubscribe = null; }
    const isWin = ((window.isArenaHost ? 'host' : 'guest') === winnerRole);
    window.currentArenaRoom = null; window.isArenaHost = false; window.matchStarted = false;
    window.SilenModal.alert(isWin ? "🏆 YOU WIN 🏆\n\n太神啦！你率先達陣！" : "💀 YOU LOSE 💀\n\n手速太慢囉！對手率先抵達終點！").then(() => window.switchView('arena'));
    if (window.isArenaHost) setTimeout(() => set(ref(rtdb, `arena_rooms/${roomData.code}`), null), 2000); 
};

window.leaveArenaRoom = async function() {
    if (!window.currentArenaRoom) return;
    const roomRef = ref(rtdb, `arena_rooms/${window.currentArenaRoom}`);
    if (window.arenaUnsubscribe) { window.arenaUnsubscribe(); window.arenaUnsubscribe = null; }
    if (window.isArenaHost) await set(roomRef, null); else await update(roomRef, { guest: null }); 
    onDisconnect(roomRef).cancel(); 
    window.currentArenaRoom = null; window.isArenaHost = false; window.matchStarted = false; window.switchView('arena');
};

window.handleRoomClosed = function() {
    if (window.arenaUnsubscribe) window.arenaUnsubscribe();
    window.currentArenaRoom = null; window.isArenaHost = false; window.matchStarted = false;
    window.SilenModal.alert("房間已解散或連線中斷！").then(() => window.switchView('arena'));
};

window.handleOpponentFled = function() {
    if (window.arenaUnsubscribe) window.arenaUnsubscribe();
    window.currentArenaRoom = null; window.isArenaHost = false; window.matchStarted = false;
    window.SilenModal.alert("對手落荒而逃！\n\n不戰而勝，您贏得了這場對決！").then(() => window.switchView('arena'));
};
