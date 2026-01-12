// js/services/auth.js
import { auth, provider, db } from "../config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 全域狀態 (🔥 新增 subscriptionDetails)
export const AuthState = {
    user: null,
    isPremium: false,
    loading: true,
    subscription: {
        type: "Free",
        expiry: "N/A",
        code: ""
    }
};

// 登入
export async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (error) {
        console.error("登入失敗", error);
        throw error;
    }
}

// 登出
export async function logout() {
    try {
        await signOut(auth);
        AuthState.user = null;
        AuthState.isPremium = false;
        AuthState.subscription = { type: "Free", expiry: "N/A", code: "" };
        window.location.reload();
    } catch (error) {
        console.error("登出失敗", error);
    }
}

// 檢查會員資格 (🔥 更新：回傳詳細資訊)
export async function checkSubscriptionStatus(uid) {
    if (!uid) return false;
    
    // 預設回傳值
    const result = { isPremium: false, type: "Free", expiry: "無期限", code: "" };

    try {
        const docRef = doc(db, "users", uid, "account", "info");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            
            if (data.activeCode) {
                result.code = data.activeCode; // 紀錄啟用碼 (遮罩處理可在 UI 做)

                // 1. 永久授權
                if (!data.expiryDate) {
                    result.isPremium = true;
                    result.type = "PRO (永久)";
                    result.expiry = "終身授權";
                } 
                // 2. 有期限授權
                else {
                    let expiry;
                    if (typeof data.expiryDate.toDate === 'function') {
                        expiry = data.expiryDate.toDate();
                    } else if (data.expiryDate.seconds) {
                        expiry = new Date(data.expiryDate.seconds * 1000);
                    } else {
                        expiry = new Date(data.expiryDate);
                    }
                    
                    if (expiry > new Date()) {
                        result.isPremium = true;
                        result.type = "PRO (訂閱中)";
                        result.expiry = expiry.toLocaleDateString();
                    } else {
                        result.type = "已過期";
                        result.expiry = expiry.toLocaleDateString();
                    }
                }
            }
        }
    } catch (error) {
        console.error("檢查會員資格失敗:", error);
    }
    
    // 更新全域狀態
    AuthState.isPremium = result.isPremium;
    AuthState.subscription = {
        type: result.type,
        expiry: result.expiry,
        code: result.code
    };

    return AuthState.isPremium;
}

// 初始化監聽器
export function initAuthListener(callback) {
    onAuthStateChanged(auth, async (user) => {
        AuthState.user = user;
        if (user) {
            console.log("用戶已登入:", user.email);
            await checkSubscriptionStatus(user.uid);
        } else {
            AuthState.isPremium = false;
            AuthState.subscription = { type: "Free", expiry: "N/A", code: "" };
        }
        AuthState.loading = false;
        if (callback) callback(AuthState);
    });
}