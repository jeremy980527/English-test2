const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

// ==========================================
// 1. 每日簽到（後端版）
// ==========================================
exports.dailyCheckIn = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "請先登入");

    const uid = request.auth.uid;
    const db = getFirestore();
    const rtdb = getDatabase();

    const tzOptions = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
    const now = new Date();
    const todayStr = now.toLocaleDateString('zh-TW', tzOptions);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('zh-TW', tzOptions);

    const userRef = db.collection("users").doc(uid);
    const docSnap = await userRef.get();
    const data = docSnap.exists ? docSnap.data() : {};

    // 已經簽到過了
    if (data.lastCheckInDate === todayStr) {
        return { success: false, message: "今天已經簽到過了！" };
    }

    let streak = data.checkInStreak || 0;
    streak = (data.lastCheckInDate === yesterdayStr) ? (streak % 7) + 1 : 1;

    const rewards = [0, 200, 300, 400, 500, 650, 800, 1300];
    const rewardPoints = rewards[streak];

    // 從資料庫讀現有點數
    const pointsSnap = await rtdb.ref(`users/${uid}/storePoints`).get();
    const currentPoints = pointsSnap.exists() ? pointsSnap.val() : 0;
    const newPoints = currentPoints + rewardPoints;

    // 後端寫入，不信任前端傳來的數字
    await rtdb.ref(`users/${uid}/storePoints`).set(newPoints);
    await userRef.set({ lastCheckInDate: todayStr, checkInStreak: streak }, { merge: true });

    return { success: true, streak, rewardPoints, newPoints };
});

// ==========================================
// 2. 增加點數（答題獎勵）
// ==========================================
exports.addStorePoints = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "請先登入");

    const uid = request.auth.uid;
    const { amount } = request.data;

    // 每次最多只能加 500 點（防止亂傳大數字）
    if (typeof amount !== "number" || amount < 0 || amount > 500) {
        throw new HttpsError("invalid-argument", "點數數量不合法");
    }

    const rtdb = getDatabase();
    const ref = rtdb.ref(`users/${uid}/storePoints`);
    const snap = await ref.get();
    const current = snap.exists() ? snap.val() : 0;
    const newVal = current + amount;

    await ref.set(newVal);
    return { success: true, newPoints: newVal };
});

// ==========================================
// 3. 增加排行榜積分
// ==========================================
exports.addRankPoints = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "請先登入");

    const uid = request.auth.uid;
    const { amount, weekId, name, photo, frame } = request.data;

    if (typeof amount !== "number" || amount < 0 || amount > 300) {
        throw new HttpsError("invalid-argument", "積分數量不合法");
    }

    const rtdb = getDatabase();
    const rankRef = rtdb.ref(`users/${uid}/rankPoints`);
    const snap = await rankRef.get();
    const current = snap.exists() ? snap.val() : 0;
    const newVal = Math.min(current + amount, 100000);

    await rankRef.set(newVal);
    await rtdb.ref(`leaderboard/week_${weekId}/${uid}`).set({
        name: name || "匿名者",
        photo: photo || "",
        score: newVal,
        frame: frame || "",
        timestamp: Date.now()
    });

    return { success: true, newRankPoints: newVal };
});

// ==========================================
// 4. 購買飾品
// ==========================================
exports.purchaseAccessory = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "請先登入");

    const uid = request.auth.uid;
    const { itemId, price } = request.data;

    if (!itemId || typeof price !== "number" || price < 0) {
        throw new HttpsError("invalid-argument", "參數不合法");
    }

    const rtdb = getDatabase();
    const pointsRef = rtdb.ref(`users/${uid}/storePoints`);
    const accRef = rtdb.ref(`users/${uid}/purchasedAccessories`);

    const [pointsSnap, accSnap] = await Promise.all([pointsRef.get(), accRef.get()]);
    const currentPoints = pointsSnap.exists() ? pointsSnap.val() : 0;
    const purchased = accSnap.exists() ? accSnap.val() : [];

    if (purchased.includes(itemId)) throw new HttpsError("already-exists", "已擁有此飾品");
    if (currentPoints < price) throw new HttpsError("failed-precondition", "點數不足");

    await pointsRef.set(currentPoints - price);
    await accRef.set([...purchased, itemId]);

    return { success: true, newPoints: currentPoints - price };
});