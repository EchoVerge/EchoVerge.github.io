/**
 * assets/js/modules/dbManager.js
 * 負責 Firestore 資料庫操作：交易增刪改查、投資組合、帳戶設定
 */
import { state } from './state.js';
import { portfolioApi } from './portfolioApi.js';

export const dbManager = {
    db: null,
    unsubscribeTx: null,
    unsubscribePf: null,

    init() {
        // 使用 compat 語法 (因為 index.html 引入的是 compat SDK)
        this.db = firebase.firestore();
    },

    // --- 交易紀錄 (Transactions) ---

    async addTransaction(formData) {
        if (!state.currentUser) return { success: false, error: "未登入" };
        
        const txRef = this.db.collection('users').doc(state.currentUser.uid)
                             .collection('transactions');
        
        try {
            // 標籤處理：逗號分隔字串轉陣列
            const tagArray = formData.tags 
                ? formData.tags.split(/[,，]/).map(t => t.trim()).filter(t => t) 
                : [];

            await txRef.add({
                date: formData.date,
                type: formData.type,
                category: formData.category,
                account: formData.account,
                item: formData.item,
                amount: parseFloat(formData.amount),
                notes: formData.notes || "",
                tags: tagArray,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (e) {
            console.error("新增失敗", e);
            return { success: false, error: e.message };
        }
    },

    /**
     * [新增] 更新交易紀錄
     */
    async updateTransaction(id, updatedData) {
        if (!state.currentUser) return { success: false, error: "未登入" };
        
        try {
            const tagArray = updatedData.tags 
                ? (Array.isArray(updatedData.tags) ? updatedData.tags : updatedData.tags.split(/[,，]/).map(t => t.trim()).filter(t => t))
                : [];

            await this.db.collection('users').doc(state.currentUser.uid)
                         .collection('transactions').doc(id).update({
                date: updatedData.date,
                type: updatedData.type,
                category: updatedData.category,
                account: updatedData.account,
                item: updatedData.item,
                amount: parseFloat(updatedData.amount),
                notes: updatedData.notes || "",
                tags: tagArray,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (e) {
            console.error("更新失敗", e);
            return { success: false, error: e.message };
        }
    },

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
     * 監聽交易紀錄
     * 策略：抓取全部 (或最近一年)，篩選交給前端做，以確保總資產計算正確
     */
    listenTransactions(filters, callback) {
        if (!state.currentUser) return;
        if (this.unsubscribeTx) this.unsubscribeTx();

        // 預設抓取全部並按日期排序
        let query = this.db.collection('users').doc(state.currentUser.uid)
                           .collection('transactions')
                           .orderBy('date', 'desc');

        this.unsubscribeTx = query.onSnapshot(snapshot => {
            const transactions = [];
            snapshot.forEach(doc => {
                transactions.push({ id: doc.id, ...doc.data() });
            });
            callback(transactions);
        }, error => {
            console.error("監聽交易失敗", error);
        });
    },

    // --- 帳戶與設定 ---

    async initDefaultSettings() {
        if (!state.currentUser) return;
        const userRef = this.db.collection('users').doc(state.currentUser.uid);
        
        const doc = await userRef.get();
        if (!doc.exists) {
            await userRef.set({
                initialized: true,
                categories: ["餐飲", "交通", "薪資", "轉帳", "帳目調整", "投資支出", "投資收入"],
                accounts: [
                    { name: "現金", initial: 0 },
                    { name: "銀行轉帳", initial: 0 },
                    { name: "投資帳戶 (Portfolio)", initial: 0 }
                ]
            }, { merge: true });
        }
    },

    async getAccounts() {
        if (!state.currentUser) return [];
        const doc = await this.db.collection('users').doc(state.currentUser.uid).get();
        if (doc.exists && doc.data().accounts) {
            return doc.data().accounts;
        }
        return [];
    },

    async getCategories() {
        if (!state.currentUser) return [];
        const doc = await this.db.collection('users').doc(state.currentUser.uid).get();
        if (doc.exists && doc.data().categories) {
            return doc.data().categories;
        }
        return [];
    },

    // --- 投資組合 ---

    listenPortfolio(callback) {
        if (!state.currentUser) return;
        if (this.unsubscribePf) this.unsubscribePf();

        this.unsubscribePf = this.db.collection('users').doc(state.currentUser.uid)
                      .collection('portfolio')
                      .onSnapshot(async snapshot => {
                          const holdings = [];
                          let totalValue = 0;

                          const promises = snapshot.docs.map(async doc => {
                              const data = doc.data();
                              const priceInfo = await portfolioApi.getPrice(data.ticker);
                              const currentPrice = priceInfo ? priceInfo.currentPrice : 0;
                              const value = currentPrice * (parseFloat(data.quantity) || 0);
                              
                              return {
                                  id: doc.id,
                                  ticker: data.ticker,
                                  quantity: data.quantity,
                                  price: currentPrice,
                                  change: priceInfo ? priceInfo.change : 0,
                                  percent: priceInfo ? priceInfo.percent : 0,
                                  value: value
                              };
                          });

                          const results = await Promise.all(promises);
                          results.forEach(h => {
                              holdings.push(h);
                              totalValue += h.value;
                          });
                          
                          callback(holdings, totalValue);
                      });
    },

    async updateHolding(ticker, quantity) {
        if (!state.currentUser) return { success: false, error: "未登入" };
        if (!ticker) return { success: false, error: "請輸入股票代號" };

        const ref = this.db.collection('users').doc(state.currentUser.uid)
                           .collection('portfolio').doc(ticker);

        try {
            const qty = parseFloat(quantity);
            if (qty === 0) {
                await ref.delete();
            } else {
                await ref.set({
                    ticker: ticker,
                    quantity: qty,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            return { success: true };
        } catch (e) {
            console.error("更新持股失敗", e);
            return { success: false, error: e.message };
        }
    },
};