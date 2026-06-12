// =====================================
// Firebase 模組引入 (版本統一至 10.12.2)
// =====================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs, query as fsQuery, orderBy as fsOrderBy, limit as fsLimit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

// 綁定 Vultr VPS Cloudflare Tunnel 後端網址
const API_BASE = 'https://api.tralingo.app';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app); 
const provider = new GoogleAuthProvider();

window.purchasedBundles = JSON.parse(localStorage.getItem('sv_purchased_bundles')) || []; 

// =====================================
// 即時在線陪伴系統 (單一 UID 綁定防幽靈版)
// =====================================
const connectedRef = ref(rtdb, '.info/connected');
let mySessionRef = null;

window.updateMyPresence = function() {
    const user = auth.currentUser;
    if (user) {
        // 核心修改：捨棄隨機 push() 亂碼，改用單一 UID 綁定在線節點，徹底消除網頁殘留幽靈
        mySessionRef = ref(rtdb, `online_users/${user.uid}`);
        onDisconnect(mySessionRef).remove();
        
        set(mySessionRef, {
            uid: user.uid,
            name: user.displayName || '匿名者',
            photo: user.photoURL || '',
            score: window.myRankPoints || 0,
            frame: window.equippedFrame || '',
            isGuest: false,
            timestamp: Date.now()
        });
    }
};

onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
        window.updateMyPresence();
    }
});

onValue(ref(rtdb, 'online_users'), (snap) => {
    let realCount = 0;
    if (snap.exists()) {
        snap.forEach(childSnap => {
            const data = childSnap.val();
            // 只計算帶有合法 UID 資訊的真實上線用戶
            if (data && data.uid) realCount++; 
        });
    }
    if (realCount === 0) realCount = 1; 
    const countEl = document.getElementById('online-count');
    if (countEl) countEl.innerText = realCount;
});

// 當玩家直接關閉分頁、視窗或滑掉網頁時，強制瞬間抹除在線狀態
window.addEventListener('beforeunload', () => {
    if (mySessionRef) set(mySessionRef, null);
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
    if (mySessionRef) set(mySessionRef, null);
    signOut(auth).then(() => {
        localStorage.removeItem('sv_books');
        localStorage.removeItem('sv_books_timestamp'); 
        localStorage.removeItem('sv_campaign_data'); // 登出時一併清空本地闖關紀錄
        window.books = [];
        window.campaignData = {};
        window.location.reload(); 
    }).catch(e => console.error("登出失敗:", e));
}

// =====================================
// 雲端與本地端資料備份同步引擎 (支援多 Level 闖關進度)
// =====================================
window.syncToCloud = async function(uid, booksData, timestamp) {
    if (!uid) return;
    const ts = timestamp || Date.now();
    try {
        let dataObj = { books: booksData, lastUpdated: ts };
        // 核心修改：將多 Level 獨立的地圖資料一併打包上傳至 Firestore 備份
        if (window.campaignData) {
            dataObj.campaignData = window.campaignData;
        }
        await setDoc(doc(db, "users", uid), dataObj, { merge: true });
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

            // 以最新存檔時間戳記為單一核心標準，實現跨裝置完美同步
            if (cloudTime > localTime) {
                // 1. 同步單字庫
                if (cloudData.books) {
                    window.books = cloudData.books;
                    localStorage.setItem('sv_books', JSON.stringify(window.books));
                    if (typeof window.renderBookList === 'function') window.renderBookList();
                    if (typeof window.updateHomeSummary === 'function') window.updateHomeSummary();
                }
                
                // 2. 同步學測多等級闖關地圖進度
                if (cloudData.campaignData) {
                    window.campaignData = cloudData.campaignData;
                    localStorage.setItem('sv_campaign_data', JSON.stringify(window.campaignData));
                    
                    // 如果玩家當前正停留在地圖畫面，UI 立即重新生成渲染
                    const viewCampaign = document.getElementById('view-campaign');
                    if (viewCampaign && !viewCampaign.classList.contains('hidden') && typeof window.renderCampaignMap === 'function') {
                        window.renderCampaignMap();
                    }
                }
                
                localStorage.setItem('sv_books_timestamp', cloudTime.toString());
                
            } else if (localTime > cloudTime) {
                // 本地資料較新，強制覆蓋雲端
                window.syncToCloud(uid, window.books, localTime);
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
            if (auth.currentUser) {
                window.syncToCloud(auth.currentUser.uid, window.books, now);
                set(ref(rtdb, `users/${auth.currentUser.uid}/purchasedBundles`), window.purchasedBundles || []);
            }
        };
        _lastSaveData = window.saveData;
    }
}, 500);

// =====================================
// 全站身份驗證狀態變更 (Auth State)
// =====================================
onAuthStateChanged(auth, (user) => {

    window.listenForAnnouncements();
    
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
            
            let dbData = docSnapAdminDb.exists() ? docSnapAdminDb.data() : {};
            let lastDate = dbData.lastCheckInDate || '';

            // 安全對接每日簽到 Node.js API
            if (lastDate !== todayStr && !window.isGuestMode && !hasShareLink) {
                try {
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
                } catch(e) { console.warn("簽到 API 失敗", e); }
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
            const landingView = document.getElementById('view-landing');
            if (landingView) {
                document.querySelectorAll('.container > div').forEach(el => {
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
// 17. 伺服器端防作弊加分系統 API (安全對接端點)
// =====================================
window.addStorePoints = async function(points, mode = 'normal', correctCount = 1, force = false) {
    if (window.isGuestMode) return; 
    
    const now = Date.now();
    if (!force && window.lastStoreScoreTime && now - window.lastStoreScoreTime < 500) return;
    window.lastStoreScoreTime = now;

    try {
        const user = auth.currentUser; 
        if (!user) return;
        const idToken = await user.getIdToken();

        // 帶著防作弊驗證參數發送 POST 請求至 Express API
        const response = await fetch(`${API_BASE}/api/addpoints`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ 
                amount: points, 
                mode: mode, 
                correctCount: correctCount 
            })
        });

        const result = await response.json();

        if (result.success) {
            window.myStorePoints = result.newPoints;
            const elStore = document.getElementById('stat-store-points');
            const elStoreMyScore = document.getElementById('store-my-score');
            if (elStore) elStore.innerText = window.myStorePoints;
            if (elStoreMyScore) elStoreMyScore.innerText = window.myStorePoints;
            
            if (typeof window.uploadScoreToCloud === 'function') {
                window.uploadScoreToCloud(window.myRankPoints, window.myStorePoints);
            }
        } else {
            console.error("加分遭伺服器拒絕:", result.error);
        }
    } catch (error) {
        console.error("呼叫加分 API 發生錯誤:", error);
    }
};

// =====================================
// 飾品系統 Firebase 同步
// =====================================
window.syncAccessoriesToCloud = async function() {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
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
// 排行榜與雙軌分數同步邏輯
// =====================================
window.uploadScoreToCloud = async function(rankPoints, storePoints) {
    if (!auth.currentUser || typeof rtdb === 'undefined') return;
    const uid = auth.currentUser.uid;
    try { await set(ref(rtdb, `users/${uid}/storePoints`), storePoints); } catch(e) { console.warn("商城點數同步延遲", e); }
    // 下面這行的 ] 已經被我改回 ) 了！
    try { await set(ref(rtdb, `users/${uid}/rankPoints`), rankPoints); } catch(e) { console.warn("牌位分數同步延遲", e); }
    try {
        const weekId = window.getCurrentWeekId();
        await set(ref(rtdb, `leaderboard/week_${weekId}/${uid}`), {
            name: auth.currentUser.displayName || '匿名者',
            photo: auth.currentUser.photoURL || '',
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
    if (!auth.currentUser) { window.SilenModal.alert("請先登入帳號！"); return; }
    try {
        await updateProfile(auth.currentUser, { displayName: newName });
        await setDoc(doc(db, "users", auth.currentUser.uid), { name: newName }, { merge: true });
        const weekId = window.getCurrentWeekId();
        const lbRef = ref(rtdb, `leaderboard/week_${weekId}/${auth.currentUser.uid}`);
        const snap = await get(lbRef);
        if (snap.exists()) await set(lbRef, { ...snap.val(), name: newName });
        window.updateMyPresence(); 
        window.SilenModal.alert(`改名成功！\n您的 ID 已更新為「${newName}」。`);
        window.fetchLeaderboard(weekId);
    } catch (e) { window.SilenModal.alert("雲端同步失敗，請檢查網路。"); }
};

// =====================================
// 替換 1：個人主頁徽章渲染 (超帥發光版)
// =====================================
window.renderMyBadges = function(badges) {
    const container = document.getElementById('profile-badges-container');
    if (!container) return;
    container.innerHTML = '';
    container.style.display = 'flex'; container.style.gap = '10px'; container.style.flexWrap = 'wrap';
    
    const myBadges = badges || {};
    const badgeArray = Object.values(myBadges).sort((a, b) => b.timestamp - a.timestamp);

    if (badgeArray.length === 0) {
        container.innerHTML = '<div style="color:var(--text-sub); font-size:0.85rem; padding: 10px 0;">尚未獲得</div>';
        return;
    }
    
    badgeArray.forEach(badge => {
        const slot = document.createElement('div');
        const borderColor = badge.rank === 1 ? '#FFD700' : (badge.rank === 2 ? '#E0E0E0' : '#CD7F32');
        const bgGlow = badge.rank === 1 ? 'rgba(255, 215, 0, 0.15)' : (badge.rank === 2 ? 'rgba(224, 224, 224, 0.15)' : 'rgba(205, 127, 50, 0.15)');
        
        slot.style.width = '60px'; slot.style.height = '60px';
        slot.style.borderRadius = '50%'; slot.style.border = `2px solid ${borderColor}`;
        slot.style.background = bgGlow; slot.style.boxShadow = `0 0 12px ${bgGlow}`;
        slot.style.display = 'flex'; slot.style.flexDirection = 'column';
        slot.style.justifyContent = 'center'; slot.style.alignItems = 'center';
        
        const medalIcon = badge.rank === 1 ? '🥇' : (badge.rank === 2 ? '🥈' : '🥉');
        slot.innerHTML = `<div style="font-size: 1.6rem; line-height: 1.2;">${medalIcon}</div><div style="font-size: 0.7rem; color: ${borderColor}; font-weight: bold; letter-spacing: 1px;">S${badge.season}</div>`;
        container.appendChild(slot);
    });
};
// =====================================
// 替換 2：公開主頁 (別人看你) 徽章渲染 (完整防呆版)
// =====================================
window.fetchPublicBadges = async function(uid) {
    const badgeContainer = document.getElementById('public-badges-container');
    if (!badgeContainer) return;

    try {
        const snap = await get(ref(rtdb, `users/${uid}/badges`));
        badgeContainer.innerHTML = '';
        badgeContainer.style.display = 'flex'; 
        badgeContainer.style.gap = '10px'; 
        badgeContainer.style.flexWrap = 'wrap';
        
        if (snap.exists()) {
            const theirBadges = snap.val() || {};
            const badgeArray = Object.values(theirBadges).sort((a, b) => b.timestamp - a.timestamp);
            
            if (badgeArray.length === 0) {
                badgeContainer.innerHTML = '<div style="color:var(--text-sub); font-size:0.85rem; padding: 10px 0;">該玩家尚未獲得榮譽徽章。</div>';
            } else {
                badgeArray.forEach(badge => {
                    const slot = document.createElement('div');
                    const borderColor = badge.rank === 1 ? '#FFD700' : (badge.rank === 2 ? '#E0E0E0' : '#CD7F32');
                    const bgGlow = badge.rank === 1 ? 'rgba(255, 215, 0, 0.15)' : (badge.rank === 2 ? 'rgba(224, 224, 224, 0.15)' : 'rgba(205, 127, 50, 0.15)');
                    
                    slot.style.width = '60px'; slot.style.height = '60px';
                    slot.style.borderRadius = '50%'; slot.style.border = `2px solid ${borderColor}`;
                    slot.style.background = bgGlow; slot.style.boxShadow = `0 0 12px ${bgGlow}`;
                    slot.style.display = 'flex'; slot.style.flexDirection = 'column';
                    slot.style.justifyContent = 'center'; slot.style.alignItems = 'center';
                    
                    const medalIcon = badge.rank === 1 ? '🥇' : (badge.rank === 2 ? '🥈' : '🥉');
                    slot.innerHTML = `<div style="font-size: 1.6rem; line-height: 1.2;">${medalIcon}</div><div style="font-size: 0.7rem; color: ${borderColor}; font-weight: bold; letter-spacing: 1px;">S${badge.season}</div>`;
                    badgeContainer.appendChild(slot);
                });
            }
        } else {
            // 補回：找不到任何資料時的顯示
            badgeContainer.innerHTML = '<div style="color:var(--text-sub); font-size:0.85rem; padding: 20px 0;">該玩家尚未獲得榮譽徽章。</div>';
        }
    } catch(e) {
        // 補回：網路連線失敗或權限阻擋時的錯誤顯示
        badgeContainer.innerHTML = '<div style="color:var(--error); font-size:0.85rem; padding: 20px 0;">載入失敗</div>';
        console.error("載入公開徽章失敗:", e);
    }
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

window.settleLastSeason = async function() {
    const confirmed = await window.SilenModal.confirm("⚠️ 終極警告\n\n確定要進行賽季結算嗎？\n系統將自動發放徽章給前三名，並且【強制清空】全伺服器玩家的牌位積分！");
    if (!confirmed) return;

    // 取得當前賽季的 ID
    const currentWeekId = typeof window.getCurrentWeekId === 'function' ? window.getCurrentWeekId() : '未知';

    window.SilenModal.alert("伺服器結算中，請勿關閉視窗...");

    try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch(`${API_BASE}/api/settleseason`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ weekId: currentWeekId })
        });

        const data = await res.json();
        
        if (data.success) {
            window.SilenModal.alert(`✅ 結算大成功！\n\n${data.message}`);
            // 結算後把畫面上的分數歸零，並重新整理列表
            window.myRankPoints = 0;
            if (typeof window.updateMyPresence === 'function') window.updateMyPresence();
            if (typeof window.openLeaderboard === 'function') window.openLeaderboard();
        } else {
            window.SilenModal.alert("❌ 結算失敗：" + data.error);
        }
    } catch (error) {
        window.SilenModal.alert("❌ 伺服器連線失敗，請檢查網路。\n" + error.message);
    }
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
// 14. 玩家市場系統 (Player Market)
// ==========================================
window.currentPublishBookId = null;

window.checkPublishLimit = async function() {
    if (!auth.currentUser) return { canUpload: false, remaining: 0 };
    try {
        const docSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
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
    if (!auth.currentUser) { window.SilenModal.alert("請先登入帳號以使用市場功能。"); return; }
    // 【全新防斂財機制】：除了過濾掉商城包，也把學測單字 (!b.isGSAT) 徹底擋在市場門外
    const eligibleBooks = window.books.filter(b => !b.isStore && !b.isGSAT && b.words.length >= 10);
    const container = document.getElementById('pub-book-list-container');
    container.innerHTML = '';
    if (eligibleBooks.length === 0) {
        container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:20px;">您目前沒有符合條件的單字簿可供上架！<br><br><span style="font-size:0.8rem;color:#ff9800;">(提示：學測單字庫無法上架至玩家市場)</span></div>';
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
    if (!auth.currentUser) return; window.SilenModal.alert("上架處理中...");
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const docSnap = await getDoc(userRef); let data = docSnap.exists() ? docSnap.data() : {};
        const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
        let count = data.lastUploadDate === today ? (data.dailyUploadCount || 0) : 0;
        if (count >= 3) return window.SilenModal.alert("今日上架額度已用盡！");
        const cleanWords = book.words.map(w => ({ en: w.en, zh: w.zh, pos: w.pos || '' }));
        await addDoc(collection(db, "market_books"), {
            authorUid: auth.currentUser.uid, authorName: auth.currentUser.displayName || '匿名玩家',
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
        const myUid = auth.currentUser ? auth.currentUser.uid : '';
        
        // 【核心修改】：判斷如果是自己的商品，顯示「管理」按鈕
        let btnHtml = '';
        if (book.authorUid === myUid) {
            btnHtml = `<button class="btn btn-small btn-outline" style="border-color:#ff9800; color:#ff9800; margin:0;" onclick="window.manageMarketBook('${book.id}', ${book.price})">管理</button>`;
        } else if (isOwned) {
            btnHtml = `<button class="btn btn-small" style="background:#333; color:#aaa; margin:0;" disabled>已擁有</button>`;
        } else {
            btnHtml = `<button class="btn btn-small" style="background:#fff; color:#000; margin:0;" onclick="window.purchaseMarketBook('${book.id}', ${book.price}, '${book.bookName.replace(/'/g, "\\'")}', '${book.authorUid}')">${book.price} pts</button>`;
        }
        
        const safeBookName = book.bookName.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeAuthorName = book.authorName.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeDesc = book.description.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        card.innerHTML = `<div class="store-header"><h4 class="store-title">${safeBookName}</h4><div style="font-size: 0.8rem; color: #ff9800; border: 1px solid #ff9800; padding: 2px 6px; border-radius: 4px;">銷量: ${book.salesCount || 0}</div></div><div style="font-size: 0.85rem; color: var(--text-sub); margin-bottom: 10px;"><span style="background:#222; padding:2px 8px; border-radius:10px;">創作者: ${safeAuthorName}</span></div><div class="store-desc">${safeDesc} <br><span style="color:var(--text-sub); font-size: 0.8rem; opacity: 0.8;">(共 ${book.wordCount} 詞)</span></div><div style="display: flex; justify-content: flex-end;">${btnHtml}</div>`;
        container.appendChild(card);
    });
};

// 【全新】：創作者管理商品邏輯 (改價 / 下架)
window.manageMarketBook = function(marketBookId, currentPrice) {
    window.SilenModal.prompt("⚙️ 管理您的商品：\n\n請輸入新的價格 (最低 50)。\n(⚠️ 若輸入 0 將永久下架此商品)", currentPrice.toString()).then(async input => {
        if (input === null) return; 
        const newPrice = parseInt(input.trim());
        if (isNaN(newPrice)) { window.SilenModal.alert("請輸入有效的數字！"); return; }

        if (newPrice === 0) {
            // 輸入 0 觸發下架流程
            window.SilenModal.confirm("確定要將此單字簿【永久下架】嗎？\n\n下架後其他玩家將無法再購買，但已購買的玩家不會受影響。").then(async agreed => {
                if (agreed) {
                    window.SilenModal.alert("商品下架中...");
                    try {
                        await deleteDoc(doc(db, "market_books", marketBookId));
                        window.SilenModal.alert("✅ 已成功下架！").then(() => window.openMarket());
                    } catch(e) { window.SilenModal.alert("下架失敗，請檢查網路連線。"); }
                }
            });
        } else if (newPrice < 50) {
            window.SilenModal.alert("定價最低需為 50 點數。");
        } else if (newPrice !== currentPrice) {
            // 更新價格流程
            window.SilenModal.alert("價格更新中...");
            try {
                await updateDoc(doc(db, "market_books", marketBookId), { price: newPrice });
                window.SilenModal.alert("✅ 價格已成功更新！").then(() => window.openMarket());
            } catch(e) { window.SilenModal.alert("更新失敗，請檢查網路連線。"); }
        }
    });
};

window.purchaseMarketBook = async function(marketBookId, price, bookName, authorUid) {
    if (!auth.currentUser) return window.SilenModal.alert("請先登入！");
    if (window.myStorePoints < price) return window.SilenModal.alert(`點數不足！需要 ${price} 點數。`);
    window.SilenModal.confirm(`花費 ${price} 點數購買「${bookName}」嗎？`).then(async agreed => {
        if (agreed) {
            window.SilenModal.alert("交易中...");
            try {
                const docRef = doc(db, "market_books", marketBookId);
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) throw new Error("商品已下架");

                const token = await auth.currentUser.getIdToken();
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
                const sellerRevenue = Math.floor(price * 0.8);
                window.books.push({ id: Date.now(), name: docSnap.data().bookName, tag: "玩家市集", isGSAT: false, isPhrase: false, isStore: false, marketId: marketBookId, words: docSnap.data().words });
                window.saveData(); 
                window.SilenModal.alert(`交易成功！\n賣家將獲得 ${sellerRevenue} 點數`).then(() => window.openMarket());
            } catch (e) { 
                console.error("交易異常終止", e);
                window.SilenModal.alert("交易失敗！\n原因：" + e.message); 
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
    if (!auth.currentUser) return window.SilenModal.alert("請先登入！");
    if (window.myStorePoints < price) return window.SilenModal.alert(`點數不足！`);
    window.SilenModal.confirm(`花費 ${price} 點數購買「${name}」嗎？`).then(async agreed => {
        if (agreed) {
            try {
                const token = await auth.currentUser.getIdToken();
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
            } catch(e) {
                window.SilenModal.alert("購買失敗，請檢查連線。");
            }
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
    if (!auth.currentUser) return window.SilenModal.alert("請登入！");
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = ''; for(let i=0; i<5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    const roomRef = ref(rtdb, `arena_rooms/${code}`);
    try {
        await set(roomRef, { status: 'waiting', host: { uid: auth.currentUser.uid, name: auth.currentUser.displayName, photo: auth.currentUser.photoURL, frame: window.equippedFrame, score: 0 }, timestamp: Date.now() });
        onDisconnect(roomRef).remove();
        window.currentArenaRoom = code; window.isArenaHost = true; window.matchStarted = false;
        if (typeof window.showArenaWaiting === 'function') window.showArenaWaiting(code, true, {name:auth.currentUser.displayName, photo:auth.currentUser.photoURL, frame:window.equippedFrame}, null);
        window.listenToArenaRoom(roomRef);
    } catch(e) { window.SilenModal.alert("建房失敗"); }
};

window.joinArenaRoom = async function() {
    if (!auth.currentUser) return window.SilenModal.alert("請登入！");
    const code = document.getElementById('arena-join-code').value.trim().toUpperCase();
    if(code.length !== 5) return window.SilenModal.alert("輸入 5 碼！");
    const roomRef = ref(rtdb, `arena_rooms/${code}`);
    try {
        const snap = await get(roomRef);
        if (!snap.exists()) return window.SilenModal.alert("找不到房間。");
        const roomData = snap.val();
        if (roomData.status !== 'waiting' || roomData.guest) return window.SilenModal.alert("房間已滿或已開始！");
        if (roomData.host.uid === auth.currentUser.uid) return window.SilenModal.alert("不能加入自己的房間！");
        const myData = { uid: auth.currentUser.uid, name: auth.currentUser.displayName, photo: auth.currentUser.photoURL, frame: window.equippedFrame, score: 0 };
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

// --- 系統公告廣播接收器 ---
window.listenForAnnouncements = function() {
    if (typeof rtdb === 'undefined') return;
    
    const announceRef = ref(rtdb, 'system/announcement');
    onValue(announceRef, (snapshot) => {
        const data = snapshot.val();
        
        // 如果有公告，且包含時間戳記
        if (data && data.timestamp) {
            const lastRead = localStorage.getItem('sv_last_announcement_id');
            const currentId = data.timestamp.toString();
            
            // 如果這則公告的 ID 跟本機紀錄的不同，代表是「未讀」的新公告
            if (lastRead !== currentId) {
                // 延遲 1 秒顯示，避免跟剛登入時的畫面切換動畫衝突
                setTimeout(() => {
                    window.SilenModal.alert(`📢 系統公告：${data.title}\n\n${data.content}`).then(() => {
                        // 玩家點擊確認後，將這則公告標記為「已讀」
                        localStorage.setItem('sv_last_announcement_id', currentId);
                    });
                }, 1000);
            }
        }
    });
};
