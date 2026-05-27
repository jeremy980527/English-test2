import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// 🌟 新增引入 Realtime Database
import { getDatabase, ref, onValue, onDisconnect, set, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwZ9dQlbx9oMRut4kuAkHpSL8rmfAGOvo",
  authDomain: "silenvocab.firebaseapp.com",
  projectId: "silenvocab",
  storageBucket: "silenvocab.firebasestorage.app",
  messagingSenderId: "307375326136",
  appId: "1:307375326136:web:8e6c28182f29f8805c854d",
  measurementId: "G-FPJ44BRH2N",
  // 🌟 貼上你剛剛建立的即時資料庫網址
  databaseURL: "https://silenvocab-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app); // 啟動即時資料庫
const provider = new GoogleAuthProvider();

let currentUser = null;

// =====================================
// 🟢 即時在線人數系統 (Presence System)
// =====================================
const connectedRef = ref(rtdb, '.info/connected');
const presenceRef = ref(rtdb, 'online_users');
let mySessionRef = null;

// 監聽自己的連線狀態，一上線就寫入，一斷線伺服器就自動刪除
onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
        mySessionRef = push(presenceRef);
        onDisconnect(mySessionRef).remove(); // 魔法在這裡：斷線自動銷毀
        set(mySessionRef, true);
    }
});

// 監聽總人數變化並更新畫面
onValue(presenceRef, (snap) => {
    const count = snap.size; // 取得當前總連線數
    const countEl = document.getElementById('online-count');
    if (countEl) countEl.innerText = count;
});

// =====================================
// 帳號認證與雲端存檔邏輯
// =====================================
window.loginWithGoogle = () => {
    signInWithPopup(auth, provider).catch((error) => window.SilenModal.alert("登入失敗：" + error.message));
};

window.logout = () => {
    window.SilenModal.confirm("確定要登出嗎？\n登出後將切換回介紹頁面，本地快取將安全抹除。").then((agreed) => {
        if (agreed) {
            signOut(auth).then(() => {
                localStorage.removeItem('sv_books');
                window.books = [];
                window.location.reload(); 
            });
        }
    });
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
            }
        } else {
            if (window.books && window.books.length > 0) syncToCloud(uid, window.books);
        }
    } catch (error) { console.error("雲端同步連線中斷:", error); }
}

async function syncToCloud(uid, booksData) {
    if (!uid) return;
    try {
        await setDoc(doc(db, "users", uid), {
            books: booksData,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) { console.error("備份傳輸錯誤:", error); }
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

    const urlParams = new URLSearchParams(window.location.search);
    const hasShareLink = urlParams.get('lz') || urlParams.get('s') || urlParams.get('share');

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
        if (!window.isGuestMode && !hasShareLink) window.goHome();
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
