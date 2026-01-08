import { db } from './db.js';
import { exportBackup, importBackup } from './backup.js'; // 借用備份邏輯來做同步

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

// 初始化 Firebase
let app, auth, firestore;
let currentUser = null;

try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    firestore = firebase.firestore();
} catch (e) {
    console.error("Firebase 初始化失敗 (可能是還沒設定 Config)", e);
}

// 登入
export function loginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => alert(error.message));
}

// 登出
export function logoutGoogle() {
    auth.signOut();
}

// 監聽登入狀態
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
            // 登入後自動檢查雲端有沒有資料
            checkCloudData(user.uid);
        } else {
            btnLogin.style.display = 'block';
            userInfo.style.display = 'none';
        }
    });
}

// 同步資料 (上傳本機資料覆蓋雲端，或下載雲端覆蓋本機)
export async function syncData() {
    if (!currentUser) return;
    
    const choice = confirm("請選擇同步方式：\n\n[確定] = 上傳本機資料到雲端 (備份)\n[取消] = 從雲端下載資料回本機 (還原)");
    
    const userDocRef = firestore.collection('users').doc(currentUser.uid);

    if (choice) {
        // 上傳 (Upload)
        // 1. 取得所有本機資料
        const data = { 
            semesters: await db.semesters.toArray(), 
            records: await db.records.toArray(), 
            settings: await db.settings.toArray(),
            lastUpdated: new Date().toISOString()
        };
        
        try {
            // 2. 寫入 Firestore (轉成 JSON 字串存，因為 Firestore 有層級限制，存字串最簡單)
            await userDocRef.set({ backupData: JSON.stringify(data) });
            alert("上傳成功！資料已同步到雲端。");
        } catch (e) {
            alert("上傳失敗：" + e.message);
        }

    } else {
        // 下載 (Download)
        try {
            const doc = await userDocRef.get();
            if (doc.exists && doc.data().backupData) {
                const cloudJson = JSON.parse(doc.data().backupData);
                
                // 3. 寫入本機 Dexie (借用 import 邏輯)
                await db.transaction('rw', db.semesters, db.records, db.settings, async () => {
                    await db.semesters.clear(); await db.records.clear(); await db.settings.clear();
                    if(cloudJson.semesters) await db.semesters.bulkAdd(cloudJson.semesters);
                    if(cloudJson.records) await db.records.bulkAdd(cloudJson.records);
                    if(cloudJson.settings) await db.settings.bulkAdd(cloudJson.settings);
                });
                alert("下載成功！已還原雲端資料。");
                location.reload();
            } else {
                alert("雲端尚無備份資料。");
            }
        } catch (e) {
            alert("下載失敗：" + e.message);
        }
    }
}

// 檢查雲端資料 (僅提示)
async function checkCloudData(uid) {
    const doc = await firestore.collection('users').doc(uid).get();
    if (doc.exists) {
        console.log("雲端有備份資料，最後更新：", doc.data().lastUpdated);
    }
}