/**
 * assets/js/modules/dbManager.js
 * 負責 Firestore 財務資料操作 (取代原本的 Code.gs 邏輯)
 */
import { state } from './state.js';
import { portfolioApi } from './portfolioApi.js';

export const dbManager = {
    db: null,

    init() {
        this.db = firebase.firestore();
    },

    // --- 1. 交易紀錄 (Transactions) ---

    /**
     * 新增交易紀錄 (取代 addTransaction)
     */
    async addTransaction(formData) {
        if (!state.currentUser) return { success: false, error: "未登入" };
        
        const txRef = this.db.collection('users').doc(state.currentUser.uid)
                             .collection('transactions');
        
        try {
            await txRef.add({
                date: formData.date,
                type: formData.type,        // 支出 / 收入
                category: formData.category,
                account: formData.account,
                item: formData.item,
                amount: parseFloat(formData.amount),
                notes: formData.notes || "",
                tags: formData.tags || "",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (e) {
            console.error("新增失敗", e);
            return { success: false, error: e.message };
        }
    },

    /**
     * 刪除交易紀錄
     */
    async deleteTransaction(id) {
        if (!state.currentUser) return;
        try {
            await this.db.collection('users').doc(state.currentUser.uid)
                         .collection('transactions').doc(id).delete();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    /**
     * 實時監聽交易紀錄 (取代 getTransactions)
     * 會根據篩選條件自動執行回呼
     */
    listenTransactions(filters, callback) {
        if (!state.currentUser) return;

        let query = this.db.collection('users').doc(state.currentUser.uid)
                           .collection('transactions')
                           .orderBy('date', 'desc');

        if (filters.startDate) query = query.where('date', '>=', filters.startDate);
        if (filters.endDate) query = query.where('date', '<=', filters.endDate);

        return query.onSnapshot(snapshot => {
            const transactions = [];
            snapshot.forEach(doc => {
                transactions.push({ id: doc.id, ...doc.data() });
            });
            callback(transactions);
        }, error => {
            console.error("監聽交易失敗", error);
        });
    },

    // --- 2. 帳戶與資產管理 ---

    /**
     * 初始化使用者設定 (預設類別與帳戶)
     */
    async initDefaultSettings() {
        if (!state.currentUser) return;
        const userRef = this.db.collection('users').doc(state.currentUser.uid);
        
        const settings = await userRef.get();
        if (!settings.exists) {
            await userRef.set({
                initialized: true,
                categories: [
                    { name: "餐飲", type: "支出" },
                    { name: "交通", type: "支出" },
                    { name: "薪資", type: "收入" },
                    { name: "轉帳", type: "支出" },
                    { name: "帳目調整", type: "支出" }
                ],
                accounts: [
                    { name: "現金", initial: 0 },
                    { name: "銀行轉帳", initial: 10000 },
                    { name: "投資帳戶 (Portfolio)", initial: 0 }
                ]
            });
        }
    },

    /**
     * 監聽持股並計算價值 (取代 getPortfolio)
     */
    listenPortfolio(callback) {
        if (!state.currentUser) return;

        return this.db.collection('users').doc(state.currentUser.uid)
                      .collection('portfolio')
                      .onSnapshot(async snapshot => {
                          const holdings = [];
                          let totalValue = 0;

                          for (const doc of snapshot.docs) {
                              const data = doc.data();
                              const priceInfo = await portfolioApi.getPrice(data.ticker);
                              const value = priceInfo ? priceInfo.currentPrice * data.quantity : 0;
                              
                              holdings.push({
                                  ticker: doc.id,
                                  quantity: data.quantity,
                                  price: priceInfo?.currentPrice || 0,
                                  value: value
                              });
                              totalValue += value;
                          }
                          callback(holdings, totalValue);
                      });
    }
};