// =====================================
// 🌐 Firebase 模組引入
// =====================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithRedirect, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref, onValue, onDisconnect, set, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// =====================================
// 🔑 Firebase 專案配置 (包含 Realtime Database 網址)
// =====================================
const firebaseConfig = {
    apiKey: "AIzaSyDwZ9dQlbx9oMRut4kuAkHpSL8rmfAGOvo",
    authDomain: "silenvocab.firebaseapp.com",
    projectId: "silenvocab",
    storageBucket: "silenvocab.firebasestorage.app",
    messagingSenderId: "307375326136",
    appId: "1:307375326136:web:8e6c28182f29f8805c854d",
    measurementId: "G-FPJ44BRH2N",
    // 🔗 你的專案專屬即時資料庫網址
    databaseURL: "https://silenvocab-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// =====================================
// 🚀 初始化 Firebase 服務
// =====================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app); 
const provider = new GoogleAuthProvider();

// 全局當前使用者變數
let currentUser = null;

// =====================================
// 🟢 即時在線陪伴系統 (Presence System)
// =====================================
const connectedRef = ref(rtdb, '.info/connected');
const presenceRef = ref(rtdb, 'online_users');
let mySessionRef = null;

// 監聽與即時資料庫的連線狀態
onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
        // 當使用者連線成功，在 online_users 底下推播一個新的工作階段
        mySessionRef = push(presenceRef);
        
        // 🌟 核心魔法：設定當使用者滑掉 App、斷網或關閉網頁時，伺服器會自動刪除這個節點
        onDisconnect(mySessionRef).remove();
        
        // 將此節點設定為在線狀態
        set(mySessionRef, true);
    }
});

// 監聽全站總在線人數變化，並即時反映在畫面上
onValue(presenceRef, (snap) => {
    // 取得當前 online_users 底下的節點總數
    const count = snap.size || 1; 
    const countEl = document.getElementById('online-count');
    if (countEl) {
        countEl.innerText = count;
    }
});

// =====================================
// 🔐 帳號登入與登出邏輯 (已換上自訂彈窗)
// =====================================

// Google 帳戶登入：改為 Redirect 模式，完美修復 Android APK 登入卡死與白屏問題
window.loginWithGoogle = () => {
    signInWithRedirect(auth, provider).catch((error) => {
        if (window.SilenModal) {
            window.SilenModal.alert("登入跳轉失敗：" + error.message);
        } else {
            console.error("登入失敗:", error.message);
        }
    });
};

// 安全登出機制
window.logout = () => {
    if (window.SilenModal) {
        window.SilenModal.confirm("確定要登出嗎？\n登出後將切換回介紹頁面，本地快取將安全抹除。").then((agreed) => {
            if (agreed) {
                executeSignOut();
            }
        });
    } else {
        // 防禦性後援
        if (confirm("確定要登出嗎？")) {
            executeSignOut();
        }
    }
};

// 執行安全登出清理
function executeSignOut() {
    signOut(auth).then(() => {
        // 🔒 清空本地端的快取資料，確保切換帳號時不會發生進度交叉繼承
        localStorage.removeItem('sv_books');
        window.books = [];
        // 重新整理網頁，徹底重組認證狀態
        window.location.reload(); 
    }).catch((error) => {
        console.error("登出失敗:", error);
    });
}

// =====================================
// ☁️ 雲端與本地端資料備份同步引擎 (Firestore)
// =====================================

// 從雲端下載資料
async function syncFromCloud(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const cloudData = docSnap.data();
            if (cloudData && cloudData.books) {
                // 將雲端資料覆蓋至本地快取
                window.books = cloudData.books;
                localStorage.setItem('sv_books', JSON.stringify(window.books));
                
                // 即時觸發前端畫面重繪
                if (typeof window.renderBookList === 'function') window.renderBookList();
                if (typeof window.updateHomeSummary === 'function') window.updateHomeSummary();
                console.log("☁️ 雲端資料已成功無痛同步至本地端。");
            }
        } else {
            console.log("🆕 偵測到新註冊帳戶，進行雲端檔案初始化...");
            if (window.books && window.books.length > 0) {
                // 如果使用者在未登入前有建立暫時單字簿，登入後自動幫他推上雲端
                syncToCloud(uid, window.books);
            }
        }
    } catch (error) {
        console.error("雲端同步連線中斷:", error);
    }
}

// 將資料上傳備份至雲端
async function syncToCloud(uid, booksData) {
    if (!uid) return;
    try {
        await setDoc(doc(db, "users", uid), {
            books: booksData,
            lastUpdated: new Date().toISOString()
        });
        console.log("💾 進度變更已安全加密備份至 Firebase 雲端。");
    } catch (error) {
        console.error("雲端備份傳輸錯誤:", error);
    }
}

// 攔截並擴充 app.js 的主動儲存邏輯，讓本地端儲存時同步推上雲端
window.addEventListener('load', () => {
    const originalSaveData = window.saveData;
    window.saveData = function() {
        // 先執行原本 app.js 寫入 localStorage 的動作
        if (typeof originalSaveData === 'function') originalSaveData();
        // 如果當前有登入帳戶，順手推上雲端資料庫
        if (currentUser) {
            syncToCloud(currentUser.uid, window.books);
        }
    };
});

// =====================================
// 👁️ 核心監聽：全站身份驗證狀態變更 (Auth State)
// =====================================
onAuthStateChanged(auth, (user) => {
    const authContainer = document.getElementById('auth-container');
    const mainHeader = document.getElementById('main-header');
    if (!authContainer || !mainHeader) return;

    // 取得網址列參數，判斷是否為特殊的訪客對戰/免登入分享連結
    const urlParams = new URLSearchParams(window.location.search);
    const hasShareLink = urlParams.get('lz') || urlParams.get('s') || urlParams.get('share');

    if (user) {
        // ------ 🟢 使用者已登入狀態 ------
        currentUser = user;
        
        // 顯示頂部導覽列
        mainHeader.classList.remove('hidden');
        
        // 渲染高質感的使用者資訊與極簡登出區塊
        authContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <img src="${user.photoURL}" alt="avatar" style="width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--border);">
                <span style="font-size: 0.85rem; color: var(--text-main); font-weight: 500; letter-spacing: 0.5px;">${user.displayName}</span>
            </div>
        `;
        
        // 啟動雲端多端同步
        syncFromCloud(user.uid);
        
        // 若不是在打訪客分享測驗，登入成功就自動進入 Home 主畫面
        if (!window.isGuestMode && !hasShareLink) {
            window.goHome();
        }
    } else {
        // ------ 🔴 使用者未登入狀態 ------
        currentUser = null;
        authContainer.innerHTML = ``;
        
        if (hasShareLink) {
            // 💡 特殊例外：如果是點開別人的分享測驗連結，允許不登入，直接放行顯示導覽列
            mainHeader.classList.remove('hidden');
        } else {
            // 強制攔截：隱藏頂部導覽列，強制切換回產品 Landing Page 落地介紹頁
            mainHeader.classList.add('hidden');
            window.switchView('landing');
        }
    }
});
