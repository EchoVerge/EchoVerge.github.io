/**
 * assets/js/modules/cloudManager.js
 * V3.0: 支援 IndexedDB (Dexie) 資料庫備份與還原
 */
import { state } from './state.js';
// [修改] 引入 db 實例，直接操作資料庫
import { db } from './db.js';

// Firebase Config (維持不變)
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

export function initCloudManager() {
    try {
        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
        } else {
            app = firebase.app();
        }
        auth = firebase.auth();
        firestore = firebase.firestore();
        
        bindEvents();
        initAuthListener();
    } catch (e) {
        console.error("Firebase 初始化失敗", e);
    }
}

function bindEvents() {
    const el = {
        btnOpen: document.getElementById('btn-cloud-settings'),
        modal: document.getElementById('modal-cloud-settings'),
        closeBtns: document.querySelectorAll('.close-modal'),
        btnLogin: document.getElementById('btn-google-login'),
        btnLogout: document.getElementById('btn-google-logout'),
        btnUpload: document.getElementById('btn-cloud-upload'),
        btnDownload: document.getElementById('btn-cloud-download'),
        btnRedeem: document.getElementById('btn-redeem'),
        inputCode: document.getElementById('input-redeem-code')
    };

    if(el.btnOpen) el.btnOpen.addEventListener('click', () => el.modal.style.display = 'flex');
    if(el.closeBtns) el.closeBtns.forEach(b => b.addEventListener('click', () => el.modal.style.display = 'none'));

    if(el.btnLogin) el.btnLogin.addEventListener('click', loginGoogle);
    if(el.btnLogout) el.btnLogout.addEventListener('click', logoutGoogle);
    if(el.btnUpload) el.btnUpload.addEventListener('click', syncUpload);
    if(el.btnDownload) el.btnDownload.addEventListener('click', syncDownload);
    
    if(el.btnRedeem) {
        el.btnRedeem.addEventListener('click', () => {
            const code = el.inputCode.value.trim();
            if(code) redeemCode(code);
        });
    }
}

function loginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => alert(error.message));
}

function logoutGoogle() {
    auth.signOut();
    localStorage.removeItem('ws_pro_key'); 
    localStorage.removeItem('ws_pro_expiry');
    state.isPro = false;
    updateUI(null);
    location.reload(); 
}

function initAuthListener() {
    auth.onAuthStateChanged(async user => {
        currentUser = user;
        updateUI(user);
        if (user) {
            await checkRemoteStatus(user.uid);
        } else {
            state.isPro = false;
        }
    });
}

function updateUI(user) {
    const loginSec = document.getElementById('cloud-login-section');
    const userSec = document.getElementById('cloud-user-section');
    const userEmail = document.getElementById('cloud-user-email');
    const proStatus = document.getElementById('cloud-pro-status');

    if (user) {
        if(loginSec) loginSec.style.display = 'none';
        if(userSec) userSec.style.display = 'block';
        if(userEmail) userEmail.textContent = user.email;
    } else {
        if(loginSec) loginSec.style.display = 'block';
        if(userSec) userSec.style.display = 'none';
        if(proStatus) {
            proStatus.textContent = "未啟用專業版";
            proStatus.style.color = "#d32f2f";
        }
    }
}

// [核心權限檢查]
async function checkRemoteStatus(uid) {
    const proStatus = document.getElementById('cloud-pro-status');
    const redeemSection = document.getElementById('redeem-section');

    try {
        const doc = await firestore.collection('users').doc(uid).collection('account').doc('info').get();
        
        if (doc.exists) {
            const data = doc.data();
            const now = new Date();
            const expiryDate = data.expiryDate ? data.expiryDate.toDate() : null;

            // 檢查是否有效
            if (data.activeCode && expiryDate && expiryDate > now) {
                state.isPro = true;
                localStorage.setItem('ws_pro_key', data.activeCode);
                localStorage.setItem('ws_pro_expiry', expiryDate.toISOString());
                
                if(proStatus) {
                    proStatus.innerHTML = `✅ 專業版已啟用 (全站通用)<br><small>效期至 ${expiryDate.toLocaleDateString()}</small>`;
                    proStatus.style.color = "#2e7d32";
                }
                if(redeemSection) redeemSection.style.display = 'none';

            } else {
                state.isPro = false;
                if(proStatus) {
                    proStatus.textContent = "❌ 權限已過期";
                    proStatus.style.color = "#d32f2f";
                }
                if(redeemSection) redeemSection.style.display = 'block';
            }
        } else {
            if(redeemSection) redeemSection.style.display = 'block';
        }
    } catch (e) {
        console.error("檢查權限失敗", e);
    }
}

// [序號啟用]
async function redeemCode(inputCode) {
    if (!currentUser) return alert("請先登入");

    const codeRef = firestore.collection('sys_codes').doc(inputCode);
    const userAccountRef = firestore.collection('users').doc(currentUser.uid).collection('account').doc('info');

    try {
        await firestore.runTransaction(async (transaction) => {
            const codeDoc = await transaction.get(codeRef);
            if (!codeDoc.exists) throw "無效的序號";

            const codeData = codeDoc.data();
            if (codeData.boundTo && codeData.boundTo !== currentUser.uid) throw "此序號已被其他人使用";

            if (codeData.boundTo !== currentUser.uid) {
                const now = new Date();
                const expiryDays = codeData.expiryDays || 365;
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

        alert("🎉 啟用成功！您現在擁有全站完整權限。");
        await checkRemoteStatus(currentUser.uid);
    } catch (e) {
        alert("啟用失敗：" + (typeof e === 'string' ? e : e.message));
    }
}

// --- 資料同步 (IndexedDB + LocalStorage) ---
// LocalStorage 只存設定，題庫存 DB
const LOCAL_STORAGE_KEYS = [
    'worksheet_generator_config', 
    'gemini_key',
    'gemini_model'
];

async function syncUpload() {
    if (!currentUser) return;
    if (!state.isPro) return alert("請先啟用專業版權限 (或使用薪資系統序號)。");

    if(!confirm("確定要將本機資料上傳備份嗎？\n(這會覆蓋雲端上舊的【考卷系統】備份)")) return;

    // 1. 收集 LocalStorage 設定
    const backupData = {};
    LOCAL_STORAGE_KEYS.forEach(key => {
        const val = localStorage.getItem(key);
        if(val) backupData[key] = val;
    });
    
    // 2. [新增] 收集 IndexedDB 題庫
    try {
        backupData.history = await db.history.toArray();
    } catch(e) {
        console.error("DB Export Error:", e);
        return alert("資料庫匯出失敗，請重試");
    }

    backupData.lastUpdated = new Date().toISOString();
    backupData.system = "worksheet_system_v2"; // 標記為 V2

    const backupRef = firestore.collection('users').doc(currentUser.uid)
        .collection('data').doc('worksheet_backup'); 

    try {
        // 因圖片可能很大，Firestore 單文件限制 1MB。
        // 若備份失敗，提示使用者。(未來可優化為 Storage)
        const jsonString = JSON.stringify(backupData);
        if (jsonString.length > 900000) { // 保守估計 900KB
             if(!confirm("⚠️ 您的題庫包含大量圖片，可能會超出雲端單檔限制。\n確定要嘗試上傳嗎？")) return;
        }

        await backupRef.set({ backupData: jsonString });
        alert("✅ 考卷資料備份成功！");
    } catch (e) {
        console.error(e);
        alert("上傳失敗：" + e.message + "\n(若檔案過大，請嘗試刪除部分圖片後重試)");
    }
}

async function syncDownload() {
    if (!currentUser) return;
    if (!state.isPro) return alert("請先啟用專業版權限。");

    if(!confirm("確定要從雲端還原資料嗎？\n這將【覆蓋】目前本機的考卷與設定資料！")) return;

    const backupRef = firestore.collection('users').doc(currentUser.uid)
        .collection('data').doc('worksheet_backup');

    try {
        const doc = await backupRef.get();
        if (doc.exists && doc.data().backupData) {
            const data = JSON.parse(doc.data().backupData);
            
            // 1. 還原 LocalStorage
            LOCAL_STORAGE_KEYS.forEach(key => {
                if(data[key]) localStorage.setItem(key, data[key]);
            });

            // 2. [新增] 還原 IndexedDB
            if (data.history && Array.isArray(data.history)) {
                await db.history.clear();
                await db.history.bulkAdd(data.history);
            }

            alert("✅ 還原成功！頁面將重新整理。");
            location.reload();
        } else {
            alert("雲端尚無考卷系統的備份資料。");
        }
    } catch (e) {
        console.error(e);
        alert("下載失敗：" + e.message);
    }
}