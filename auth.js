// =====================================
// Firebase 模組引入 (版本統一至 10.12.2)
// =====================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs, query as fsQuery, orderBy as fsOrderBy, limit as fsLimit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref, set, get, child, onValue, query, orderByChild, limitToLast, push, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// =====================================
// Firebase 專案配置
// =====================================
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app); 
const provider = new GoogleAuthProvider();

let currentUser = null;

// =====================================
// 即時在線陪伴系統
// =====================================
const connectedRef = ref(rtdb, '.info/connected');
const presenceRef = ref(rtdb, 'online_users');
let mySessionRef = null;

onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
        mySessionRef = push(presenceRef);
        onDisconnect(mySessionRef).remove();
        set(mySessionRef, true);
    }
});

onValue(presenceRef, (snap) => {
    const count = snap.size || 1; 
    const countEl = document.getElementById('online-count');
    if (countEl) {
        countEl.innerText = count;
    }
});

// =====================================
// 帳號登入與登出邏輯 
// =====================================
window.loginWithGoogle = () => {
    const isApp = typeof AndroidBridge !== 'undefined';

    if (isApp) {
        signInWithRedirect(auth, provider).catch((error) => {
            if (window.SilenModal) window.SilenModal.alert("App 登入失敗：" + error.message);
        });
    } else {
        signInWithPopup(auth, provider).catch((error) => {
            if (window.SilenModal) window.SilenModal.alert("網頁登入失敗：" + error.message);
        });
    }
};

window.logout = () => {
    if (window.SilenModal) {
        window.SilenModal.confirm("確定要登出嗎？\n登出後將切換回介紹頁面，本地快取將安全抹除。").then((agreed) => {
            if (agreed) executeSignOut();
        });
    } else {
        if (confirm("確定要登出嗎？")) executeSignOut();
    }
};

function executeSignOut() {
    signOut(auth).then(() => {
        localStorage.removeItem('sv_books');
        window.books = [];
        window.location.reload(); 
    }).catch((error) => {
        console.error("登出失敗:", error);
    });
}

// =====================================
// 雲端與本地端資料備份同步引擎
// =====================================
async function syncFromCloud(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const cloudData = docSnap.data();

            if (cloudData && cloudData.books) {
                window.books = cloudData.books;
                localStorage.setItem('sv_books', JSON.stringify(window.books));
                if (typeof window.renderBookList === 'function') window.renderBookList();
                if (typeof window.updateHomeSummary === 'function') window.updateHomeSummary();
            }
        } else {
            if (window.books && window.books.length > 0) {
                syncToCloud(uid, window.books);
            }
        }
    } catch (error) {
        console.error("雲端同步連線中斷:", error);
    }
}

async function syncToCloud(uid, booksData) {
    if (!uid) return;
    try {
        await setDoc(doc(db, "users", uid), {
            books: booksData,
            lastUpdated: new Date().toISOString()
        }, { merge: true });
    } catch (error) {
        console.error("雲端備份錯誤:", error);
    }
}

window.addEventListener('load', () => {
    const originalSaveData = window.saveData;
    window.saveData = function() {
        if (typeof originalSaveData === 'function') originalSaveData();
        if (currentUser) {
            syncToCloud(currentUser.uid, window.books);
        }
    };
});

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
        currentUser = user;
        mainHeader.classList.remove('hidden');
        
        authContainer.innerHTML = `
            <img src="${user.photoURL}" alt="avatar" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border); cursor: pointer;" onclick="window.toggleSidebar()">
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

        const elRank = document.getElementById('stat-rank-score');
        const elStore = document.getElementById('stat-store-points');
        const elStoreMyScore = document.getElementById('store-my-score');

        const weekId = typeof window.getCurrentWeekId === 'function' ? window.getCurrentWeekId() : 1;

        Promise.all([
            get(ref(rtdb, `users/${user.uid}/rankPoints`)),
            get(ref(rtdb, `users/${user.uid}/storePoints`)),
            get(ref(rtdb, `users/${user.uid}/totalScore`)),
            get(ref(rtdb, `leaderboard/week_${weekId}/${user.uid}/score`)),
            get(ref(rtdb, `users/${user.uid}/isAdmin`)),
            getDoc(doc(db, "users", user.uid)) 
        ]).then(([snapRank, snapStore, snapTotal, snapLb, snapAdminRtdb, docSnapAdminDb]) => {
            const oldTotalScore = snapTotal.exists() ? snapTotal.val() : 0;
            const currentRank = snapRank.exists() ? snapRank.val() : 0;
            const currentStore = snapStore.exists() ? snapStore.val() : 0;
            const lbScore = snapLb.exists() ? snapLb.val() : 0;
            
            window.myRankPoints = Math.max(currentRank, oldTotalScore, lbScore);
            window.myStorePoints = Math.max(currentStore, oldTotalScore, lbScore);

            if (elRank) elRank.innerText = window.myRankPoints;
            if (elStore) elStore.innerText = window.myStorePoints;
            if (elStoreMyScore) elStoreMyScore.innerText = window.myStorePoints;

            if (window.myRankPoints > currentRank || window.myStorePoints > currentStore || !snapRank.exists() || !snapStore.exists()) {
                set(ref(rtdb, `users/${user.uid}/rankPoints`), window.myRankPoints);
                set(ref(rtdb, `users/${user.uid}/storePoints`), window.myStorePoints);
            }

            let hasAdminPrivilege = false;
            if (snapAdminRtdb.exists() && snapAdminRtdb.val() === true) hasAdminPrivilege = true;
            if (docSnapAdminDb.exists() && docSnapAdminDb.data().isAdmin === true) hasAdminPrivilege = true;

            if (hasAdminPrivilege) {
                window.isAdmin = true;
                const adminBtn = document.getElementById('sidebar-admin-btn');
                if (adminBtn) adminBtn.style.display = 'block';
            } else {
                window.isAdmin = false;
            }

        }).catch(err => {
            console.error("資料庫讀取異常", err);
        }).finally(() => {
            get(ref(rtdb, `users/${user.uid}/badges`)).then(snap => {
                window.renderMyBadges(snap.exists() ? snap.val() : []);
            });

            syncFromCloud(user.uid);
            if (!window.isGuestMode && !hasShareLink) {
                if (typeof window.goHome === 'function') window.goHome();
            }
        });

    } else {
        currentUser = null;
        authContainer.innerHTML = ``;
        if (hasShareLink) {
            mainHeader.classList.remove('hidden');
        } else {
            mainHeader.classList.add('hidden');
            if (typeof window.switchView === 'function') window.switchView('landing');
        }
    }
});

// =====================================
// 個人主頁與公有主頁的徽章渲染引擎
// =====================================
window.renderMyBadges = function(badges) {
    const container = document.getElementById('profile-badges-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (!badges || badges.length === 0) {
        container.innerHTML = '<div class="badge-slot">尚未獲得</div><div class="badge-slot">尚未獲得</div><div class="badge-slot">尚未獲得</div>';
        return;
    }
    
    badges.forEach(b => {
        const slot = document.createElement('div');
        slot.className = 'badge-slot';
        slot.style.border = `2px solid ${b.color}`;
        slot.style.color = b.color;
        slot.style.fontWeight = 'bold';
        slot.style.fontSize = '0.8rem';
        slot.style.display = 'flex';
        slot.style.flexDirection = 'column';
        slot.style.lineHeight = '1.4';
        
        const lines = b.name.split(' ');
        slot.innerHTML = `<span>${lines[0]}</span><span>${lines[1]}</span>`;
        container.appendChild(slot);
    });
};

window.fetchPublicBadges = async function(uid) {
    const badgeContainer = document.getElementById('public-badges-container');
    try {
        const snap = await get(ref(rtdb, `users/${uid}/badges`));
        badgeContainer.innerHTML = '';
        if (snap.exists() && snap.val().length > 0) {
            const badges = snap.val();
            badges.forEach(b => {
                const slot = document.createElement('div');
                slot.className = 'badge-slot';
                slot.style.border = `2px solid ${b.color}`;
                slot.style.color = b.color;
                slot.style.fontWeight = 'bold';
                slot.style.fontSize = '0.8rem';
                slot.style.display = 'flex';
                slot.style.flexDirection = 'column';
                slot.style.lineHeight = '1.4';
                
                const lines = b.name.split(' ');
                slot.innerHTML = `<span>${lines[0]}</span><span>${lines[1]}</span>`;
                badgeContainer.appendChild(slot);
            });
        } else {
            badgeContainer.innerHTML = '<div style="color:var(--text-sub); font-size:0.85rem; padding: 20px 0;">該玩家尚未獲得榮譽徽章。</div>';
        }
    } catch(e) {
        badgeContainer.innerHTML = '<div style="color:var(--error); font-size:0.85rem; padding: 20px 0;">載入失敗</div>';
    }
};

// =====================================
// 雲端短網址分享機制核心
// =====================================
window.uploadShareData = async (shareData) => {
    try {
        const shareRef = push(ref(rtdb, 'shared_quizzes'));
        await set(shareRef, {
            data: JSON.stringify(shareData),
            timestamp: Date.now()
        });
        return shareRef.key; 
    } catch(error) {
        console.error("上傳分享資料失敗:", error);
        return null;
    }
};

window.downloadShareData = async (shareId) => {
    try {
        const snapshot = await get(child(ref(rtdb), `shared_quizzes/${shareId}`));
        if (snapshot.exists()) {
            return JSON.parse(snapshot.val().data);
        }
    } catch(error) {
        console.error("下載分享資料失敗:", error);
    }
    return null;
};

// =====================================
// 賽季排行榜與雙軌分數同步邏輯
// =====================================
window.uploadScoreToCloud = async function(rankPoints, storePoints) {
    if (!currentUser || typeof rtdb === 'undefined') return;
    const uid = currentUser.uid;
    
    try {
        await set(ref(rtdb, `users/${uid}/rankPoints`), rankPoints);
        await set(ref(rtdb, `users/${uid}/storePoints`), storePoints);
        
        const weekId = window.getCurrentWeekId();
        const lbRef = ref(rtdb, `leaderboard/week_${weekId}/${uid}`);
            
        await set(lbRef, {
            name: currentUser.displayName || '匿名者',
            photo: currentUser.photoURL || '',
            score: rankPoints,
            timestamp: Date.now()
        });
        
    } catch(e) { console.error("上傳分數失敗", e); }
};

window.fetchLeaderboard = async function(weekId) {
    if (typeof rtdb === 'undefined') return;
    try {
        const lbRef = query(ref(rtdb, `leaderboard/week_${weekId}`), orderByChild('score'), limitToLast(10));
        const snapshot = await get(lbRef);
        
        let list = [];
        let mySeasonScore = 0;
        const myUid = currentUser ? currentUser.uid : null;

        if (snapshot.exists()) {
            snapshot.forEach((childSnap) => {
                const data = childSnap.val();
                data.uid = childSnap.key;
                list.push(data);
                if (data.uid === myUid) {
                    mySeasonScore = data.score; 
                }
            });
        }
        
        list.reverse();
        
        if (window.renderLeaderboard) {
            window.renderLeaderboard(list, mySeasonScore);
        }
    } catch(e) {
        console.error("抓取排行榜失敗", e);
    }
};

// ==========================================
// 同步更新使用者名稱至 Firebase 雲端與排行榜
// ==========================================
window.updateCloudUserName = async function(newName) {
    const user = auth.currentUser;
    if (!user) {
        window.SilenModal.alert("請先登入帳號，才能將名稱同步至雲端排行榜！");
        return;
    }

    const btn = document.querySelector('.profile-header .btn');
    if (btn) btn.innerText = "同步中...";

    try {
        await updateProfile(user, { displayName: newName });
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, { name: newName }, { merge: true });

        if (typeof window.getCurrentWeekId === 'function') {
            const weekId = window.getCurrentWeekId();
            const lbRef = ref(rtdb, `leaderboard/week_${weekId}/${user.uid}`);
            const snap = await get(lbRef);
            if (snap.exists()) {
                await set(lbRef, { ...snap.val(), name: newName });
            }
        }

        if (btn) btn.innerText = "更改名稱";
        window.SilenModal.alert(`改名成功！\n\n您在排行榜上的 ID 已更新為「${newName}」。`);
        
        if (typeof window.fetchLeaderboard === 'function' && typeof window.getCurrentWeekId === 'function') {
            window.fetchLeaderboard(window.getCurrentWeekId());
        }

    } catch (error) {
        console.error("雲端名稱同步失敗:", error);
        if (btn) btn.innerText = "更改名稱";
        window.SilenModal.alert("雲端同步失敗，請檢查網路連線或資料庫權限。");
    }
};

// ==========================================
// 系統全伺服器即時彈窗公告系統 (Admin & Global)
// ==========================================
window.pendingAnnouncement = null;

window.showAnnouncementModal = function(data) {
    localStorage.setItem('sv_last_seen_announcement', data.timestamp);
    window.pendingAnnouncement = null;
    window.SilenModal.alert(`[系統公告] ${data.title}\n\n${data.content}`);
};

const announcementRef = ref(rtdb, 'system/announcement');
onValue(announcementRef, (snap) => {
    const data = snap.val();
    
    if (data && data.visible) {
        const lastSeen = parseInt(localStorage.getItem('sv_last_seen_announcement')) || 0;
        
        if (data.timestamp > lastSeen) {
            const homeView = document.getElementById('view-home');
            const isHome = homeView && !homeView.classList.contains('hidden');

            if (isHome) {
                window.showAnnouncementModal(data);
            } else {
                window.pendingAnnouncement = data;
            }
        }
        
        const titleInput = document.getElementById('admin-announce-title');
        const contentInput = document.getElementById('admin-announce-content');
        if (titleInput && !titleInput.value) titleInput.value = data.title;
        if (contentInput && !contentInput.value) contentInput.value = data.content;
    } else {
        window.pendingAnnouncement = null;
    }
});

window.publishAnnouncement = async function() {
    if (!window.isAdmin) {
        window.SilenModal.alert("您沒有權限執行此操作。");
        return;
    }
    const title = document.getElementById('admin-announce-title').value.trim();
    const content = document.getElementById('admin-announce-content').value.trim();
    
    if (!title || !content) {
        window.SilenModal.alert("標題與內容皆不可為空！");
        return;
    }

    try {
        await set(ref(rtdb, 'system/announcement'), {
            title: title,
            content: content,
            visible: true,
            timestamp: Date.now()
        });
        window.SilenModal.alert("公告已成功全服廣播！\n\n所有在線玩家將立即收到彈窗通知。").then(() => {
            if (typeof window.goHome === 'function') window.goHome();
        });
    } catch (e) {
        console.error("發布失敗", e);
        window.SilenModal.alert("發布失敗，請檢查資料庫權限。");
    }
};

window.revokeAnnouncement = async function() {
    if (!window.isAdmin) return;
    
    window.SilenModal.confirm("確定要撤回當前公告嗎？\n(撤回後未讀玩家將不會再收到彈窗)").then(async agreed => {
        if (agreed) {
            try {
                await set(ref(rtdb, 'system/announcement/visible'), false);
                document.getElementById('admin-announce-title').value = '';
                document.getElementById('admin-announce-content').value = '';
                window.SilenModal.alert("公告已撤銷。");
            } catch (e) {
                console.error("撤回失敗", e);
            }
        }
    });
};

// ==========================================
// 賽季結算與徽章發放引擎 (Admin)
// ==========================================
window.settleLastSeason = function() {
    if (!window.isAdmin) return;
    window.SilenModal.prompt("請輸入要結算的賽季 (例如: 1) \n系統將為該賽季前三名發放徽章。", window.getCurrentWeekId().toString()).then(async input => {
        if (!input) return;
        const targetWeek = parseInt(input.trim());
        if (isNaN(targetWeek) || targetWeek < 1) {
            window.SilenModal.alert("請輸入有效的賽季數字。"); return;
        }

        const settleRef = ref(rtdb, `system/settlement/week_${targetWeek}`);
        const settleSnap = await get(settleRef);
        if (settleSnap.exists() && settleSnap.val() === true) {
            window.SilenModal.alert(`第 ${targetWeek} 賽季已經結算並發放過徽章了！`);
            return;
        }

        const lbRef = query(ref(rtdb, `leaderboard/week_${targetWeek}`), orderByChild('score'), limitToLast(3));
        const snap = await get(lbRef);

        if (!snap.exists()) {
            window.SilenModal.alert(`第 ${targetWeek} 賽季無人參與。`);
            return;
        }

        let winners = [];
        snap.forEach(childSnap => {
            winners.push({ uid: childSnap.key, ...childSnap.val() });
        });
        winners.reverse();

        for (let i = 0; i < winners.length; i++) {
            const winner = winners[i];
            let rankText = (i === 0) ? '冠軍' : (i === 1) ? '亞軍' : '季軍';
            let badgeColor = (i === 0) ? '#FFD700' : (i === 1) ? '#C0C0C0' : '#CD7F32';

            const userBadgesRef = ref(rtdb, `users/${winner.uid}/badges`);
            const ubSnap = await get(userBadgesRef);
            let badges = ubSnap.exists() ? ubSnap.val() : [];
            badges.push({
                season: targetWeek,
                name: `S${targetWeek} ${rankText}`,
                color: badgeColor
            });
            await set(userBadgesRef, badges);
        }

        await set(settleRef, true);
        
        if (auth.currentUser) {
            const myBadgeSnap = await get(ref(rtdb, `users/${auth.currentUser.uid}/badges`));
            if (myBadgeSnap.exists() && window.renderMyBadges) {
                window.renderMyBadges(myBadgeSnap.val());
            }
        }

        window.SilenModal.alert(`第 ${targetWeek} 賽季結算成功！\n徽章已自動掛載至玩家個人主頁。`);
    });
};

// ==========================================
// 14. 玩家市場系統 (Player Market) Phase 2
// ==========================================

window.currentPublishBookId = null;

window.checkPublishLimit = async function() {
    const user = auth.currentUser;
    if (!user) return { canUpload: false, remaining: 0 };
    try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            let count = data.dailyUploadCount || 0;
            let lastDate = data.lastUploadDate || '';
            
            if (lastDate !== today) {
                count = 0;
            }
            return { canUpload: count < 3, remaining: 3 - count };
        }
        return { canUpload: true, remaining: 3 };
    } catch(e) {
        console.error("讀取額度失敗", e);
        return { canUpload: false, remaining: 0 };
    }
};

window.openPublishModal = function() {
    if (!auth.currentUser) {
        window.SilenModal.alert("請先登入帳號以使用市場功能。"); return;
    }

    const eligibleBooks = window.books.filter(b => !b.isStore && b.words.length >= 10);
    const container = document.getElementById('pub-book-list-container');
    container.innerHTML = '';
    
    if (eligibleBooks.length === 0) {
        container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:20px; line-height: 1.6;">您目前沒有符合條件的單字簿可供上架！<br>(為了維持市場品質，請確保題庫內至少包含 10 個單字)</div>';
    } else {
        eligibleBooks.forEach(b => {
            const div = document.createElement('div');
            div.className = 'card book-item';
            div.style.cursor = 'pointer';
            div.style.marginBottom = '0';
            div.innerHTML = `<strong>${b.name}</strong> <span style="font-size:0.8rem; color:var(--text-sub)">(${b.words.length} 詞)</span>`;
            div.onclick = () => window.selectBookToPublish(b.id);
            container.appendChild(div);
        });
    }

    document.getElementById('pub-step-1').classList.remove('hidden');
    document.getElementById('pub-step-2').classList.add('hidden');
    
    const overlay = document.getElementById('silen-publish-overlay');
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    overlay.classList.add('show');
};

window.selectBookToPublish = function(bookId) {
    const book = window.books.find(b => b.id === bookId);
    if (!book) return;
    
    window.currentPublishBookId = bookId;
    document.getElementById('pub-book-name').innerText = book.name;
    document.getElementById('pub-price').value = 100;
    document.getElementById('pub-desc').value = '';
    document.getElementById('btn-confirm-pub').disabled = true;
    document.getElementById('pub-limit-text').innerText = "正在檢查每日額度...";
    
    document.getElementById('pub-step-1').classList.add('hidden');
    document.getElementById('pub-step-2').classList.remove('hidden');
    
    window.checkPublishLimit().then(res => {
        const txt = document.getElementById('pub-limit-text');
        if (res.canUpload) {
            txt.innerText = `今日上架額度剩餘: ${res.remaining} / 3`;
            txt.style.color = '#4caf50';
            document.getElementById('btn-confirm-pub').disabled = false;
        } else {
            txt.innerText = `今日上架額度已達上限 (3 / 3)，請明日再來！`;
            txt.style.color = '#ff4444';
        }
    });
};

window.backToPublishList = function() {
    document.getElementById('pub-step-2').classList.add('hidden');
    document.getElementById('pub-step-1').classList.remove('hidden');
};

window.closePublishModal = function() {
    const overlay = document.getElementById('silen-publish-overlay');
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 200);
};

window.confirmPublish = function() {
    const price = parseInt(document.getElementById('pub-price').value);
    const desc = document.getElementById('pub-desc').value.trim();
    
    if (isNaN(price) || price < 50) {
        window.SilenModal.alert("定價最低需為 50 點數。"); return;
    }
    if (!desc) {
        window.SilenModal.alert("請輸入簡單的商品介紹。"); return;
    }
    
    const book = window.books.find(b => b.id === window.currentPublishBookId);
    if (!book) {
        window.SilenModal.alert("找不到指定的單字簿。"); return;
    }

    window.closePublishModal();
    if (typeof window.executePublishToMarket === 'function') {
        window.executePublishToMarket(book, price, desc);
    }
};

window.executePublishToMarket = async function(book, price, desc) {
    const user = auth.currentUser;
    if (!user) return;
    
    window.SilenModal.alert("上架處理中，請稍候...");
    try {
        const userRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(userRef);
        let data = docSnap.exists() ? docSnap.data() : {};
        const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
        
        let count = data.dailyUploadCount || 0;
        let lastDate = data.lastUploadDate || '';
        
        if (lastDate !== today) {
            count = 0;
        }
        
        if (count >= 3) {
            window.SilenModal.alert("您今日的上架額度已用盡，請明日再來！");
            return;
        }
        
        const cleanWords = book.words.map(w => ({
            en: w.en,
            zh: w.zh,
            pos: w.pos || ''
        }));

        const marketRef = collection(db, "market_books");
        await addDoc(marketRef, {
            authorUid: user.uid,
            authorName: user.displayName || '匿名玩家',
            bookName: book.name,
            description: desc,
            price: price,
            wordCount: cleanWords.length,
            words: cleanWords,
            salesCount: 0,
            timestamp: Date.now()
        });
        
        await updateDoc(userRef, {
            dailyUploadCount: count + 1,
            lastUploadDate: today
        });
        
        window.SilenModal.alert("上架成功！\n您的單字簿已發布至玩家交易市場。").then(() => {
            window.openMarket();
        });
        
    } catch(e) {
        console.error("上架失敗", e);
        window.SilenModal.alert("上架失敗，請檢查網路連線。");
    }
};

window.openMarket = async function() {
    window.switchView('market');
    const el = document.getElementById('market-my-score');
    if(el) el.innerText = window.myStorePoints || 0;

    const container = document.getElementById('market-catalog-area');
    container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--text-sub); letter-spacing: 1px;">正在從伺服器載入市場資料...</div>';

    try {
        const marketRef = collection(db, "market_books");
        const q = fsQuery(marketRef, fsOrderBy("timestamp", "desc"), fsLimit(50));
        const querySnapshot = await getDocs(q);

        let books = [];
        querySnapshot.forEach((docSnap) => {
            books.push({ id: docSnap.id, ...docSnap.data() });
        });

        window.renderMarketCatalog(books);
    } catch (e) {
        console.error("載入市場失敗", e);
        container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: #ff4444; letter-spacing: 1px;">載入失敗，請檢查網路連線或資料庫權限。</div>';
    }
};

window.renderMarketCatalog = function(marketBooks) {
    const container = document.getElementById('market-catalog-area');
    container.innerHTML = '';

    if (marketBooks.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--text-sub); letter-spacing: 1px;">目前市場上還沒有任何商品，快去上架第一本吧！</div>';
        return;
    }

    marketBooks.forEach(book => {
        const card = document.createElement('div');
        card.className = 'store-card';
        
        const isOwned = window.books.some(b => b.marketId === book.id);
        const myUid = auth.currentUser ? auth.currentUser.uid : '';

        let btnHtml = '';
        if (isOwned) {
            btnHtml = `<button class="btn btn-small" style="margin:0; background:#333; color:#aaa; border:1px solid #444;" disabled>已擁有</button>`;
        } else if (book.authorUid === myUid) {
            btnHtml = `<button class="btn btn-small" style="margin:0; background:#333; color:#aaa; border:1px solid #444;" disabled>您的商品</button>`;
        } else {
            btnHtml = `<button class="btn btn-small" style="margin:0; background:#fff; color:#000;" onclick="window.purchaseMarketBook('${book.id}', ${book.price}, '${book.bookName.replace(/'/g, "\\'")}', '${book.authorUid}')">${book.price} pts</button>`;
        }

        const safeBookName = book.bookName.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeAuthorName = book.authorName.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeDesc = book.description.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        card.innerHTML = `
            <div class="store-header">
                <h4 class="store-title">${safeBookName}</h4>
                <div style="font-size: 0.8rem; color: #ff9800; border: 1px solid #ff9800; padding: 2px 6px; border-radius: 4px;">銷量: ${book.salesCount || 0}</div>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-sub); margin-bottom: 10px; display:flex; align-items:center; gap:5px;">
                <span style="background:#222; padding:2px 8px; border-radius:10px;">創作者: ${safeAuthorName}</span>
            </div>
            <div class="store-desc">${safeDesc} <br><span style="color:var(--text-sub); font-size: 0.8rem; opacity: 0.8;">(共 ${book.wordCount} 個單字)</span></div>
            <div style="display: flex; justify-content: flex-end; align-items: center;">
                ${btnHtml}
            </div>
        `;
        container.appendChild(card);
    });
};

window.purchaseMarketBook = async function(marketBookId, price, bookName, authorUid) {
    const user = auth.currentUser;
    if (!user) {
        window.SilenModal.alert("請先登入！"); return;
    }

    if (window.myStorePoints < price) {
        window.SilenModal.alert(`點數不足！\n\n購買此單字包需要 ${price} 點數，您目前只有 ${window.myStorePoints} 點數。`);
        return;
    }

    window.SilenModal.confirm(`確定要花費 ${price} 點數購買「${bookName}」嗎？`).then(async agreed => {
        if (agreed) {
            window.SilenModal.alert("交易處理中，請稍候...");

            try {
                const docRef = doc(db, "market_books", marketBookId);
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                    window.SilenModal.alert("此商品已不存在。"); return;
                }
                const bookData = docSnap.data();

                window.myStorePoints -= price;
                const el1 = document.getElementById('market-my-score');
                const el2 = document.getElementById('store-my-score');
                if(el1) el1.innerText = window.myStorePoints;
                if(el2) el2.innerText = window.myStorePoints;
                
                await set(ref(rtdb, `users/${user.uid}/storePoints`), window.myStorePoints);

                const sellerRevenue = Math.floor(price * 0.8);
                const sellerRef = ref(rtdb, `users/${authorUid}/storePoints`);
                const sellerSnap = await get(sellerRef);
                const currentSellerPoints = sellerSnap.exists() ? sellerSnap.val() : 0;
                await set(sellerRef, currentSellerPoints + sellerRevenue);

                await updateDoc(docRef, {
                    salesCount: (bookData.salesCount || 0) + 1
                });

                window.books.push({
                    id: Date.now(),
                    name: bookData.bookName,
                    tag: "玩家市集",
                    isGSAT: false,
                    isPhrase: false, 
                    isStore: false, 
                    marketId: marketBookId,
                    words: bookData.words
                });

                window.saveData(); 
                
                window.SilenModal.alert(`交易成功！\n\n「${bookName}」已加入您的題庫中。\n(賣家將獲得扣除 20% 稅金後的 ${sellerRevenue} 點數)`).then(() => {
                    window.openMarket(); 
                });

            } catch (e) {
                console.error("交易失敗", e);
                window.SilenModal.alert("交易失敗，請檢查網路連線。");
            }
        }
    });
};
