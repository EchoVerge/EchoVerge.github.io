import { db } from './db.js';
import { checkProStatus, openSettingsModal } from './settings.js'; // 引入權限檢查

// Firebase 設定
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

export function loginGoogle() {
    // 登入前檢查是否有啟用碼 (UX 優化)
    if (!checkProStatus()) {
        const confirmSponsor = confirm("☁️ 雲端同步是贊助會員專屬功能。\n是否前往輸入啟用碼？");
        if (confirmSponsor) {
            openSettingsModal();
            // 切換到贊助分頁
            setTimeout(() => {
                const btn = document.getElementById('about-tab');
                if(btn) btn.click();
            }, 200);
        }
        return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => alert(error.message));
}

export function logoutGoogle() {
    auth.signOut();
}

export function initCloudAuth() {
    if (!auth) return;
    auth.onAuthStateChanged(user => {
        currentUser = user;
        const btnLogin = document.getElementById('btnLogin');
        const userInfo = document.getElementById('userInfo');
        const userEmail = document.getElementById('userEmail');

        if (user) {
            btnLogin.style.display = 'none';
            userInfo.style.display = 'block';
            userEmail.innerText = user.email;
            checkCloudData(user.uid);
        } else {
            btnLogin.style.display = 'block';
            userInfo.style.display = 'none';
        }
    });
}

// [新增] 註冊啟用碼到雲端 (這是驗證的關鍵)
async function registerCloudKey() {
    if (!currentUser) return false;
    const userKey = localStorage.getItem('site_pro_key') || "";

    try {
        // 將 Key 寫入專門的驗證路徑
        await firestore.collection('users').doc(currentUser.uid)
            .collection('account').doc('info')
            .set({ activationKey: userKey }, { merge: true });
        return true;
    } catch (e) {
        console.error("啟用碼同步失敗", e);
        return false;
    }
}

export async function syncData() {
    if (!currentUser) return;

    if (!checkProStatus()) {
        alert("請先輸入啟用碼。");
        return;
    }

    // 1. 先嘗試將 Key 同步上去 (為了通過伺服器驗證)
    const keySynced = await registerCloudKey();
    if(!keySynced) {
        alert("無法連接雲端伺服器進行驗證。");
        return;
    }

    const choice = confirm("請選擇同步方式：\n\n[確定] = 上傳本機資料到雲端 (備份)\n[取消] = 從雲端下載資料回本機 (還原)");
    
    // [修改] 資料存放在受保護的子集合 data/backup
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
            // 如果啟用碼錯誤，這裡會被 Firebase Rules 擋下
            await backupDocRef.set({ backupData: JSON.stringify(data) });
            alert("✅ 上傳成功！資料已同步到雲端。");
        } catch (e) {
            console.error(e);
            if (e.code === 'permission-denied') {
                alert("⛔ 驗證失敗：啟用碼無效或已過期。\n請檢查您的代碼是否輸入正確。");
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
                alert("⛔ 驗證失敗：啟用碼無效。\n無法下載資料。");
            } else {
                alert("下載失敗：" + e.message);
            }
        }
    }
}

async function checkCloudData(uid) {
    // 檢查功能也需要通過驗證，這裡簡化處理，若失敗就不顯示
    try {
        const doc = await firestore.collection('users').doc(uid)
            .collection('data').doc('backup').get();
        if (doc.exists) {
            const data = JSON.parse(doc.data().backupData);
            console.log("雲端有備份資料，最後更新：", data.lastUpdated);
        }
    } catch(e) {
        // 靜默失敗 (因為可能是還沒驗證 Key)
    }
}