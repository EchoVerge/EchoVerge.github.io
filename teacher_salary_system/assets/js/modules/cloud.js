import { db } from './db.js';
import { state } from './state.js';
import { openSettingsModal } from './settings.js'; 

// Firebase 設定 (請保持您原本的設定)
const firebaseConfig = {
  apiKey: "AIzaSyDIda8VOxiHP2okFRjOGl8bYPmlKjDc2lc",
  authDomain: "echoverge-tw.firebaseapp.com",
  projectId: "echoverge-tw",
  storageBucket: "echoverge-tw.firebasestorage.app",
  messagingSenderId: "203660574697",
  appId: "1:203660574697:web:206c3aabe953274db39578",
  measurementId: "G-K1G4C4R67D"
};

let app, auth, firestore;
let currentUser = null;

try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    firestore = firebase.firestore();
} catch (e) {
    console.error("Firebase 初始化失敗", e);
}

// 登入
export function loginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => alert(error.message));
}

// 登出
export function logoutGoogle() {
    auth.signOut();
    localStorage.removeItem('site_pro_key'); // 清除本地權限
    localStorage.removeItem('site_pro_expiry');
    state.isPro = false;
    location.reload();
}

// 監聽登入狀態
export function initCloudAuth() {
    if (!auth) return;
    auth.onAuthStateChanged(async user => {
        currentUser = user;
        const btnLogin = document.getElementById('btnLogin');
        const userInfo = document.getElementById('userInfo');
        const userEmail = document.getElementById('userEmail');

        if (user) {
            btnLogin.style.display = 'none';
            userInfo.style.display = 'block';
            userEmail.innerText = user.email;
            
            // 登入後，自動檢查雲端權限 (解決換裝置需重輸入的問題)
            await checkRemoteStatus(user.uid);
        } else {
            btnLogin.style.display = 'block';
            userInfo.style.display = 'none';
            // 登出後清除 Pro 狀態
            state.isPro = false;
        }
    });
}

// [核心] 檢查雲端權限狀態 (換裝置登入時自動執行)
async function checkRemoteStatus(uid) {
    try {
        const doc = await firestore.collection('users').doc(uid).collection('account').doc('info').get();
        if (doc.exists) {
            const data = doc.data();
            const now = new Date();
            const expiryDate = data.expiryDate ? data.expiryDate.toDate() : null;

            // 檢查是否過期
            if (data.activeCode && expiryDate && expiryDate > now) {
                console.log("雲端權限驗證成功，效期至", expiryDate);
                // 同步回本地
                state.isPro = true;
                localStorage.setItem('site_pro_key', data.activeCode);
                localStorage.setItem('site_pro_expiry', expiryDate.toISOString());
            } else {
                console.log("權限已過期或無效");
                state.isPro = false;
                localStorage.removeItem('site_pro_key');
            }
        }
    } catch (e) {
        console.error("檢查權限失敗", e);
    }
}

// [核心] 啟用序號 (綁定邏輯)
export async function redeemCode(inputCode) {
    if (!currentUser) {
        alert("請先登入 Google 帳號才能綁定序號。");
        return false;
    }

    const codeRef = firestore.collection('sys_codes').doc(inputCode);
    const userAccountRef = firestore.collection('users').doc(currentUser.uid).collection('account').doc('info');

    try {
        await firestore.runTransaction(async (transaction) => {
            // 1. 讀取序號文件
            const codeDoc = await transaction.get(codeRef);
            if (!codeDoc.exists) {
                throw "無效的序號 (Code not found)";
            }

            const codeData = codeDoc.data();

            // 2. 檢查是否已被綁定
            if (codeData.boundTo && codeData.boundTo !== currentUser.uid) {
                throw "此序號已被其他人使用！";
            }

            // 3. 檢查是否是重複啟用 (如果是自己綁定的，視為恢復)
            if (codeData.boundTo === currentUser.uid) {
                // 已經是自己的，直接更新使用者端資料即可
            } else {
                // 4. 執行綁定 (第一次使用)
                const now = new Date();
                const expiryDays = codeData.expiryDays || 365; // 預設一年
                const expiryDate = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

                transaction.update(codeRef, {
                    boundTo: currentUser.uid,
                    redeemedAt: now,
                    status: 'used'
                });

                transaction.set(userAccountRef, {
                    activeCode: inputCode,
                    expiryDate: expiryDate,
                    activatedAt: now
                }, { merge: true });
            }
        });

        alert("🎉 啟用成功！序號已綁定至您的帳號。");
        // 重新拉取狀態
        await checkRemoteStatus(currentUser.uid);
        return true;

    } catch (e) {
        console.error(e);
        const msg = typeof e === 'string' ? e : e.message;
        alert("啟用失敗：" + msg);
        return false;
    }
}

// 同步資料 (備份邏輯)
export async function syncData() {
    if (!currentUser) return;

    // 1. 本地檢查
    if (!state.isPro) {
        alert("權限無效或已過期，請重新輸入序號。");
        openSettingsModal(); // 方便用戶去輸入
        return;
    }

    const choice = confirm("請選擇同步方式：\n\n[確定] = 上傳本機資料到雲端 (備份)\n[取消] = 從雲端下載資料回本機 (還原)");
    
    // 改為儲存在受保護的 data/backup 路徑
    const backupDocRef = firestore.collection('users').doc(currentUser.uid)
        .collection('data').doc('backup');

    if (choice) {
        // 上傳
        const data = { 
            semesters: await db.semesters.toArray(), 
            records: await db.records.toArray(), 
            settings: await db.settings.toArray(),
            lastUpdated: new Date().toISOString()
        };
        
        try {
            await backupDocRef.set({ backupData: JSON.stringify(data) });
            alert("✅ 上傳成功！資料已同步到雲端。");
        } catch (e) {
            console.error(e);
            if (e.code === 'permission-denied') {
                alert("⛔ 權限不足：您的序號可能已過期或無效。\n資料庫拒絕寫入。");
            } else {
                alert("上傳失敗：" + e.message);
            }
        }

    } else {
        // 下載
        try {
            const doc = await backupDocRef.get();
            if (doc.exists && doc.data().backupData) {
                const cloudJson = JSON.parse(doc.data().backupData);
                
                await db.transaction('rw', db.semesters, db.records, db.settings, async () => {
                    await db.semesters.clear(); await db.records.clear(); await db.settings.clear();
                    if(cloudJson.semesters) await db.semesters.bulkAdd(cloudJson.semesters);
                    if(cloudJson.records) await db.records.bulkAdd(cloudJson.records);
                    if(cloudJson.settings) await db.settings.bulkAdd(cloudJson.settings);
                });
                alert("✅ 下載成功！已還原雲端資料。");
                location.reload();
            } else {
                alert("雲端尚無備份資料。");
            }
        } catch (e) {
            if (e.code === 'permission-denied') {
                alert("⛔ 權限不足：您的序號可能已過期或無效。");
            } else {
                alert("下載失敗：" + e.message);
            }
        }
    }
}