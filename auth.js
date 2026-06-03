// =====================================
// Firebase 模組引入 (版本統一至 10.12.2)
// =====================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
            
            if (cloudData.isAdmin === true) {
                window.isAdmin = true;
                const adminBtn = document.getElementById('sidebar-admin-btn');
                if (adminBtn) adminBtn.style.display = 'block';
            } else {
                window.isAdmin = false;
            }

            if (cloudData && cloudData.books) {
                window.books = cloudData.books;
                localStorage.setItem('sv_books', JSON.stringify(window.books));
                if (typeof window.renderBookList === 'function') window.renderBookList();
                if (typeof window.updateHomeSummary === 'function') window.updateHomeSummary();
                console.log("雲端資料已成功同步。");
            }
        } else {
            console.log("偵測到新註冊帳戶，進行雲端檔案初始化...");
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
        console.log("進度已備份至雲端。");
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
            get(ref(rtdb, `leaderboard/week_${weekId}/${user.uid}/score`))
        ]).then(([snapRank, snapStore, snapTotal, snapLb]) => {
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
        });

        syncFromCloud(user.uid);
        if (!window.isGuestMode && !hasShareLink) {
            window.goHome();
        }
    } else {
        currentUser = null;
        authContainer.innerHTML = ``;
        if (hasShareLink) {
            mainHeader.classList.remove('hidden');
        } else {
            mainHeader.classList.add('hidden');
            window.switchView('landing');
        }
    }
});

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
// 系統全伺服器即時公告系統 (Admin & Global)
// ==========================================
const announcementRef = ref(rtdb, 'system/announcement');
onValue(announcementRef, (snap) => {
    const data = snap.val();
    const card = document.getElementById('home-announcement-card');
    
    if (data && data.visible) {
        if (card) {
            card.classList.remove('hidden');
            document.getElementById('announcement-title').innerText = '[系統公告] ' + data.title;
            document.getElementById('announcement-content').innerText = data.content;
            
            const titleInput = document.getElementById('admin-announce-title');
            const contentInput = document.getElementById('admin-announce-content');
            if (titleInput && !titleInput.value) titleInput.value = data.title;
            if (contentInput && !contentInput.value) contentInput.value = data.content;
        }
    } else {
        if (card) card.classList.add('hidden');
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
        window.SilenModal.alert("公告已成功全服廣播！\n\n所有在線玩家將立即看到此訊息。").then(() => window.goHome());
    } catch (e) {
        console.error("發布失敗", e);
        window.SilenModal.alert("發布失敗，請檢查資料庫權限。");
    }
};

window.revokeAnnouncement = async function() {
    if (!window.isAdmin) return;
    
    window.SilenModal.confirm("確定要撤回當前公告嗎？\n(撤回後所有玩家首頁的公告將瞬間消失)").then(async agreed => {
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
