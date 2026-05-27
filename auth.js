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
    if (confirm("確定要登出嗎？登出後本機的單字紀錄將會清空（雲端資料不受影響）。")) {
        signOut(auth).then(() => {
            // 🧹 登出的瞬間，把殘留在瀏覽器的前一個使用者的單字清空！
            localStorage.removeItem('sv_books');
            window.books = []; // 同時清空記憶體
            
            // 重新整理網頁，回到最乾淨的初始狀態
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
                console.log("☁️ 成功從雲端同步最新的單字簿！");
            }
        } else {
            console.log("🆕 偵測為新用戶，準備建立雲端檔案。");
            if (window.books && window.books.length > 0) {
                syncToCloud(uid, window.books);
            }
        }
    } catch (error) {
        console.error("從雲端讀取資料失敗:", error);
    }
}

async function syncToCloud(uid, booksData) {
    if (!uid) return;
    try {
        await setDoc(doc(db, "users", uid), {
            books: booksData,
            lastUpdated: new Date().toISOString()
        });
        console.log("💾 資料已安全加密並同步至 Firebase 雲端！");
    } catch (error) {
        console.error("雲端備份失敗:", error);
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
    if (!authContainer) return;

    if (user) {
        currentUser = user;
        authContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <img src="${user.photoURL}" alt="avatar" style="width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border);">
                <span style="font-size: 0.85rem; color: var(--text-main); font-weight: 500;">${user.displayName}</span>
                <button class="btn-icon btn-delete btn-small" style="padding: 2px 8px; font-size: 0.75rem;" onclick="logout()">登出</button>
            </div>
        `;
        syncFromCloud(user.uid);
    } else {
        currentUser = null;
        authContainer.innerHTML = `
            <button class="btn btn-small" style="background-color: #ffffff; color: #000000; border: none; padding: 6px 12px; border-radius: 20px; font-weight: bold; display: flex; align-items: center; gap: 5px; font-size: 0.8rem;" onclick="loginWithGoogle()">
                G 登入 / 備份
            </button>
        `;
    }
});
