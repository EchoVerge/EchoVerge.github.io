/**
 * assets/js/modules/dbManager.js
 * 修正：標籤陣列化、Merge 初始化、監聽器優化、新增 getCategories
 */
import { state } from './state.js';
import { portfolioApi } from './portfolioApi.js';

export const dbManager = {
    db: null,
    unsubscribeTx: null,
    unsubscribePf: null,

    init() {
        // 使用 compat 語法，因為 index.html 引入的是 compat SDK
        this.db = firebase.firestore();
    },

    // --- 交易紀錄 ---

    async addTransaction(formData) {
        if (!state.currentUser) return { success: false, error: "未登入" };
        
        const txRef = this.db.collection('users').doc(state.currentUser.uid)
                             .collection('transactions');
        
        try {
            // [修正] 標籤字串轉陣列
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
                tags: tagArray, // 存為 Array 以利 Firestore 查詢
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (e) {
            console.error("新增失敗", e);
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

    listenTransactions(filters, callback) {
        if (!state.currentUser) return;
        if (this.unsubscribeTx) this.unsubscribeTx(); // 取消舊監聽

        let query = this.db.collection('users').doc(state.currentUser.uid)
                           .collection('transactions')
                           .orderBy('date', 'desc');

        if (filters.startDate) query = query.where('date', '>=', filters.startDate);
        if (filters.endDate) query = query.where('date', '<=', filters.endDate);

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

    // --- 帳戶與投資 ---

    async initDefaultSettings() {
        if (!state.currentUser) return;
        const userRef = this.db.collection('users').doc(state.currentUser.uid);
        
        const doc = await userRef.get();
        if (!doc.exists) {
            // [修正] 使用 merge: true 防止意外覆蓋
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

    /**
     * 獲取所有帳戶的初始設定 (用於計算餘額與下拉選單)
     */
    async getAccounts() {
        if (!state.currentUser) return [];
        const doc = await this.db.collection('users').doc(state.currentUser.uid).get();
        if (doc.exists && doc.data().accounts) {
            return doc.data().accounts;
        }
        return [];
    },

    /**
     * [新增] 獲取分類設定 (用於下拉選單)
     */
    async getCategories() {
        if (!state.currentUser) return [];
        const doc = await this.db.collection('users').doc(state.currentUser.uid).get();
        if (doc.exists && doc.data().categories) {
            return doc.data().categories;
        }
        return [];
    },

    listenPortfolio(callback) {
        if (!state.currentUser) return;
        if (this.unsubscribePf) this.unsubscribePf();

        this.unsubscribePf = this.db.collection('users').doc(state.currentUser.uid)
                      .collection('portfolio')
                      .onSnapshot(async snapshot => {
                          const holdings = [];
                          let totalValue = 0;

                          // 注意：這裡使用 Promise.all 並行處理 API 請求
                          const promises = snapshot.docs.map(async doc => {
                              const data = doc.data();
                              // [修正] 使用帶有快取的 API 方法
                              const priceInfo = await portfolioApi.getPrice(data.ticker);
                              const currentPrice = priceInfo ? priceInfo.currentPrice : 0;
                              const value = currentPrice * (parseFloat(data.quantity) || 0);
                              
                              return {
                                  id: doc.id,
                                  ticker: data.ticker, // 假設 ticker 存在 data 中，或直接用 doc.id
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
                await ref.delete(); // 數量設為 0 即為刪除
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