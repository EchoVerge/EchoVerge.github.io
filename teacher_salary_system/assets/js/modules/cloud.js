import { db } from './db.js';
import { state } from './state.js';

// Firebase Config
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
let cloudModal = null; // BS5 Modal Instance

try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    firestore = firebase.firestore();
} catch (e) {
    console.error("Firebase 初始化失敗", e);
}

// 開啟選單
export function openCloudModal() {
    if (!cloudModal) {
        const el = document.getElementById('cloudModal');
        if (el) cloudModal = new bootstrap.Modal(el);
    }
    // 更新 UI 狀態
    updateCloudUI();
    if(cloudModal) cloudModal.show();
}

function updateCloudUI() {
    const emailEl = document.getElementById('cloudUserEmail');
    const statusEl = document.getElementById('cloudProStatus');
    const redeemSec = document.getElementById('cloudRedeemSection');
    
    if (currentUser) {
        emailEl.textContent = currentUser.email;
        if (state.isPro) {
            statusEl.innerHTML = `<i class="bi bi-check-circle-fill"></i> 專業版已啟用`;
            statusEl.className = "small text-success fw-bold";
            if(redeemSec) redeemSec.style.display = 'none';
        } else {
            statusEl.innerHTML = `<i class="bi bi-x-circle-fill"></i> 未啟用 / 已過期`;
            statusEl.className = "small text-danger fw-bold";
            if(redeemSec) redeemSec.style.display = 'block';
        }
    }
}

// 登入
export function loginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => alert(error.message));
}

// 登出
export function logoutGoogle() {
    auth.signOut();
    localStorage.removeItem('site_pro_key');
    localStorage.removeItem('site_pro_expiry');
    state.isPro = false;
    location.reload();
}

export function initCloudAuth() {
    if (!auth) return;
    auth.onAuthStateChanged(async user => {
        currentUser = user;
        const btnLogin = document.getElementById('btnLogin');
        const userInfo = document.getElementById('userInfo');
        const userEmail = document.getElementById('userEmail');

        if (user) {
            if(btnLogin) btnLogin.style.display = 'none';
            if(userInfo) userInfo.style.display = 'block';
            if(userEmail) userEmail.innerText = user.email;
            await checkRemoteStatus(user.uid);
        } else {
            if(btnLogin) btnLogin.style.display = 'block';
            if(userInfo) userInfo.style.display = 'none';
            state.isPro = false;
        }
    });
}

async function checkRemoteStatus(uid) {
    try {
        const doc = await firestore.collection('users').doc(uid).collection('account').doc('info').get();
        if (doc.exists) {
            const data = doc.data();
            const now = new Date();
            const expiryDate = data.expiryDate ? data.expiryDate.toDate() : null;

            if (data.activeCode && expiryDate && expiryDate > now) {
                state.isPro = true;
                localStorage.setItem('site_pro_key', data.activeCode);
                localStorage.setItem('site_pro_expiry', expiryDate.toISOString());
            } else {
                state.isPro = false;
                localStorage.removeItem('site_pro_key');
            }
            updateCloudUI(); // 更新 Modal UI
        }
    } catch (e) {
        console.error("檢查權限失敗", e);
    }
}

// Modal 內的啟用按鈕
export async function redeemCodeInModal() {
    const input = document.getElementById('cloudRedeemCode');
    if(input && input.value.trim()) {
        await redeemCode(input.value.trim());
    }
}

// 核心啟用邏輯
export async function redeemCode(inputCode) {
    if (!currentUser) return alert("請先登入");

    const codeRef = firestore.collection('sys_codes').doc(inputCode);
    const userAccountRef = firestore.collection('users').doc(currentUser.uid).collection('account').doc('info');

    try {
        await firestore.runTransaction(async (transaction) => {
            const codeDoc = await transaction.get(codeRef);
            if (!codeDoc.exists) throw "無效的序號";

            const codeData = codeDoc.data();
            if (codeData.boundTo && codeData.boundTo !== currentUser.uid) throw "此序號已被使用";

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

        alert("🎉 啟用成功！");
        await checkRemoteStatus(currentUser.uid);
    } catch (e) {
        alert("啟用失敗：" + (typeof e === 'string' ? e : e.message));
    }
}

// [拆分] 上傳
export async function syncUpload() {
    if (!currentUser) return;
    if (!state.isPro) return alert("請先啟用專業版權限。");

    if(!confirm("確定要【備份】本機資料到雲端嗎？\n(這會覆蓋雲端上舊的備份)")) return;

    const backupDocRef = firestore.collection('users').doc(currentUser.uid).collection('data').doc('backup');

    const data = { 
        semesters: await db.semesters.toArray(), 
        records: await db.records.toArray(), 
        settings: await db.settings.toArray(),
        lastUpdated: new Date().toISOString()
    };
    
    try {
        await backupDocRef.set({ backupData: JSON.stringify(data) });
        alert("✅ 上傳成功！資料已備份。");
        if(cloudModal) cloudModal.hide();
    } catch (e) {
        console.error(e);
        alert("上傳失敗：" + e.message);
    }
}

// [拆分] 下載
export async function syncDownload() {
    if (!currentUser) return;
    if (!state.isPro) return alert("請先啟用專業版權限。");

    if(!confirm("確定要從雲端【還原】資料嗎？\n(這會清除本機目前的所有資料！)")) return;

    const backupDocRef = firestore.collection('users').doc(currentUser.uid).collection('data').doc('backup');

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
            alert("✅ 下載成功！頁面將重新整理。");
            location.reload();
        } else {
            alert("雲端尚無備份資料。");
        }
    } catch (e) {
        alert("下載失敗：" + e.message);
    }
}