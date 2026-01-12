/**
 * assets/js/modules/authManager.js
 * 負責身份驗證與 EchoVerge 全域權限校驗
 */
import { state } from './state.js';

export const authManager = {
    auth: null,
    db: null,

    init() {
        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.initAuthListener();
    },

    // 監聽登入狀態變更
    initAuthListener() {
        this.auth.onAuthStateChanged(async (user) => {
            state.currentUser = user;
            if (user) {
                console.log("使用者已登入:", user.email);
                await this.checkRemoteStatus(user.uid);
            } else {
                state.isPro = false;
                console.log("使用者未登入");
            }
            // 觸發 UI 更新 (由 main.js 處理)
            window.dispatchEvent(new CustomEvent('auth-status-changed', { detail: user }));
        });
    },

    // [核心] 檢查全站通用付費狀態
    async checkRemoteStatus(uid) {
        try {
            // 讀取 EchoVerge 統一權限節點
            const doc = await this.db.collection('users').doc(uid)
                                     .collection('account').doc('info').get();
            
            if (doc.exists) {
                const data = doc.data();
                const now = new Date();
                const expiryDate = data.expiryDate ? data.expiryDate.toDate() : null;

                // 驗證序號是否存在且未過期
                if (data.activeCode && expiryDate && expiryDate > now) {
                    state.isPro = true;
                    console.log(`✅ 專業版權限有效。效期至: ${expiryDate.toLocaleDateString()}`);
                } else {
                    state.isPro = false;
                    console.log("❌ 專業版權限已過期或未啟用");
                }
            } else {
                state.isPro = false;
            }
        } catch (e) {
            console.error("檢查權限失敗:", e);
        }
    },

    // 登入方法
    login() {
        const provider = new firebase.auth.GoogleAuthProvider();
        return this.auth.signInWithPopup(provider);
    },

    // 登出方法
    logout() {
        return this.auth.signOut().then(() => {
            location.reload();
        });
    }
};