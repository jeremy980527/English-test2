import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwZ9dQlbx9oMRut4kuAkHpSL8rmfAGOvo",
  authDomain: "silenvocab.firebaseapp.com",
  projectId: "silenvocab",
  storageBucket: "silenvocab.firebasestorage.app",
  messagingSenderId: "307375326136",
  appId: "1:307375326136:web:8e6c28182f29f8805c854d",
  measurementId: "G-FPJ44BRH2N"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;

window.loginWithGoogle = () => {
    signInWithPopup(auth, provider).catch((error) => alert("登入失敗：" + error.message));
};

window.logout = () => {
    if (confirm("確定要登出嗎？登出後將切換回介紹頁面，本地快取將安全抹除。")) {
        signOut(auth).then(() => {
            // 🔒 物理清空，確保切換帳號不交叉繼承
            localStorage.removeItem('sv_books');
            window.books = [];
            window.location.reload(); 
        });
    }
};

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
                console.log("☁️ 雲端資料同步完成。");
            }
        } else {
            console.log("🆕 新帳戶檔案初始化。");
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
        console.log("💾 變更已安全加密備份至雲端。");
    } catch (error) {
        console.error("備份傳輸錯誤:", error);
    }
}

window.addEventListener('load', () => {
    const originalSaveData = window.saveData;
    window.saveData = function() {
        if (typeof originalSaveData === 'function') originalSaveData();
        if (currentUser) syncToCloud(currentUser.uid, window.books);
    };
});

onAuthStateChanged(auth, (user) => {
    const authContainer = document.getElementById('auth-container');
    const mainHeader = document.getElementById('main-header');
    if (!authContainer || !mainHeader) return;

    // 取得是否有分享代碼，若有則判定為特殊訪客對戰模式，不阻擋
    const urlParams = new URLSearchParams(window.location.search);
    const hasShareLink = urlParams.get('lz') || urlParams.get('s') || urlParams.get('share');

    if (user) {
        currentUser = user;
        mainHeader.classList.remove('hidden');
        authContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <img src="${user.photoURL}" alt="avatar" style="width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--border);">
                <span style="font-size: 0.85rem; color: var(--text-main); font-weight: 500; letter-spacing: 0.5px;">${user.displayName}</span>
                <button class="btn-icon btn-delete btn-small" style="padding: 3px 10px; font-size: 0.75rem;" onclick="logout()">登出</button>
            </div>
        `;
        syncFromCloud(user.uid);
        
        // 若非處於分享連結狀態，則自動進入主頁
        if (!window.isGuestMode && !hasShareLink) {
            window.goHome();
        }
    } else {
        currentUser = null;
        authContainer.innerHTML = ``;
        
        if (hasShareLink) {
            // 允許執行訪客分享測驗，不進入登入攔截頁
            mainHeader.classList.remove('hidden');
        } else {
            // 強制切換至落地介紹頁面並隱藏頂部導覽列
            mainHeader.classList.add('hidden');
            window.switchView('landing');
        }
    }
});
