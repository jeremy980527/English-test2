// =====================================
// 🌐 Firebase 模組引入 (加入 signInWithPopup)
// =====================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithRedirect, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref, set, get, child, onValue, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// =====================================
// 🔑 Firebase 專案配置
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
// 🟢 即時在線陪伴系統
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
// 🔐 帳號登入與登出邏輯 (🌟 雙軌機制實作)
// =====================================
window.loginWithGoogle = () => {
    // 判斷是否在 Android App 殼中
    const isApp = typeof AndroidBridge !== 'undefined';

    if (isApp) {
        // App 環境：使用跳轉 (避開 WebView 無法彈窗的問題)
        signInWithRedirect(auth, provider).catch((error) => {
            if (window.SilenModal) window.SilenModal.alert("App 登入失敗：" + error.message);
        });
    } else {
        // 網頁環境：使用彈出視窗 (完美避開手機瀏覽器跨網域 Cookie 遺失問題)
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
// ☁️ 雲端與本地端資料備份同步引擎
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
                console.log("☁️ 雲端資料已成功同步。");
            }
        } else {
            console.log("🆕 偵測到新註冊帳戶，進行雲端檔案初始化...");
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
        });
        console.log("💾 進度已備份至雲端。");
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
// 👁️ 全站身份驗證狀態變更 (Auth State)
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
        
        // 更新首頁右上角迷你頭像
        authContainer.innerHTML = `
            <img src="${user.photoURL}" alt="avatar" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border); cursor: pointer;" onclick="window.toggleSidebar()">
        `;
        
        // 更新側邊欄 Sidebar
        const sbPlaceholder = document.getElementById('sb-avatar-placeholder');
        const sbImg = document.getElementById('sb-avatar-img');
        const sbName = document.getElementById('sb-user-name');
        if(sbPlaceholder) sbPlaceholder.style.display = 'none';
        if(sbImg) { sbImg.src = user.photoURL; sbImg.style.display = 'block'; }
        if(sbName) sbName.innerText = user.displayName;

        // 更新個人主頁 Profile
        const pfPlaceholder = document.getElementById('profile-avatar-placeholder');
        const pfImg = document.getElementById('profile-avatar-img');
        const pfName = document.getElementById('profile-name');
        const pfEmail = document.getElementById('profile-email');
        if(pfPlaceholder) pfPlaceholder.style.display = 'none';
        if(pfImg) { pfImg.src = user.photoURL; pfImg.style.display = 'inline-block'; }
        if(pfName) pfName.innerText = user.displayName;
        if(pfEmail) pfEmail.innerText = user.email;

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
// 🔗 雲端短網址分享機制核心
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
// 🏆 賽季排行榜與分數同步邏輯
// =====================================
window.uploadScoreToCloud = async function(totalScore, seasonPointsToAdd) {
    if (!currentUser || typeof database === 'undefined') return;
    const uid = currentUser.uid;
    
    try {
        // 更新個人的生涯總分 (這個未來會顯示在個人主頁)
        await set(ref(database, `users/${uid}/totalScore`), totalScore);
        
        // 如果這個分數是被允許計入排位賽的 (seasonPointsToAdd > 0)
        if (seasonPointsToAdd > 0) {
            const weekId = window.getCurrentWeekId();
            const lbRef = ref(database, `leaderboard/week_${weekId}/${uid}`);
            
            // 先取得目前的賽季分數
            const snapshot = await get(lbRef);
            let currentSeasonScore = 0;
            if (snapshot.exists()) {
                currentSeasonScore = snapshot.val().score || 0;
            }
            
            const newSeasonScore = currentSeasonScore + seasonPointsToAdd;
            
            // 寫入更新後的分數與玩家資訊
            await set(lbRef, {
                name: currentUser.displayName || '匿名者',
                photo: currentUser.photoURL || '',
                score: newSeasonScore,
                timestamp: Date.now()
            });
        }
    } catch(e) { console.error("上傳分數失敗", e); }
};

window.fetchLeaderboard = async function(weekId) {
    if (typeof database === 'undefined') return;
    try {
        // 🔥 關鍵效能優化：只抓取本週分數最高的前 10 名
        const lbRef = query(ref(database, `leaderboard/week_${weekId}`), orderByChild('score'), limitToLast(10));
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
                    mySeasonScore = data.score; // 順便偷看自己的賽季分數
                }
            });
        }
        
        // Firebase orderByChild 是從小排到大，所以我們要反轉陣列，讓第一名在最上面
        list.reverse();
        
        if (window.renderLeaderboard) {
            window.renderLeaderboard(list, mySeasonScore);
        }
    } catch(e) {
        console.error("抓取排行榜失敗", e);
    }
};
