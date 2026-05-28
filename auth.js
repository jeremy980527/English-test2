// =====================================
// 🌐 Firebase 模組引入 (加入 signInWithPopup)
// =====================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithRedirect, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref, onValue, onDisconnect, set, push, get, child } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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
        authContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <img src="${user.photoURL}" alt="avatar" style="width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--border);">
                <span style="font-size: 0.85rem; color: var(--text-main); font-weight: 500; letter-spacing: 0.5px;">${user.displayName}</span>
            </div>
        `;
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
