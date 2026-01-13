/**
 * assets/js/modules/scoreCalculator.js
 * 負責處理單題的計分邏輯，包含送分題與多選題部分給分
 */

export const ScoringModes = {
    STRICT: 'strict',      // 全對才給分
    DEDUCT_20: 'deduct_20', // 錯一個選項扣 20% (1/5)
    DEDUCT_40: 'deduct_40', // 錯一個選項扣 40% (2/5)
    HALF: 'half'            // 錯一個選項扣 50%
};

/**
 * 計算單題得分比例
 * @param {string} studentAns 學生答案 (例如 "AB")
 * @param {string} keyAns 標準答案 (例如 "AC")
 * @param {object} questionMeta 題目資料 (包含 isBonus 屬性)
 * @param {string} mode 計分模式 (ScoringModes)
 * @returns {number} 得分比例 0~1
 */
export function calculateScoreRatio(studentAns, keyAns, questionMeta, mode = ScoringModes.STRICT) {
    // 1. 處理送分題 (Bonus)
    if (questionMeta && questionMeta.isBonus) {
        return 1; // 直接滿分
    }

    // 資料正規化 (轉大寫、去除空白、排序)
    const s = normalize(studentAns);
    const k = normalize(keyAns);

    // 空白答案直接 0 分
    if (!s) return 0;

    // 2. 完全正確
    if (s === k) return 1;

    // 3. 單選題邏輯 (如果不相等就是 0 分)
    // 判斷方式：如果標準答案只有一個字元，視為單選 (或使用者明確定義)
    if (k.length <= 1) {
        return 0;
    }

    // 4. 多選題計分邏輯
    if (mode === ScoringModes.STRICT) {
        return 0;
    } else {
        // 計算錯誤選項數 (少選 + 多選)
        const mistakes = calculateMistakes(s, k);
        let penaltyPerMistake = 0;

        switch (mode) {
            case ScoringModes.DEDUCT_20: penaltyPerMistake = 0.2; break;
            case ScoringModes.DEDUCT_40: penaltyPerMistake = 0.4; break;
            case ScoringModes.HALF: penaltyPerMistake = 0.5; break;
            default: return 0;
        }

        const score = 1 - (mistakes * penaltyPerMistake);
        return Math.max(0, score); // 最低 0 分
    }
}

// 輔助：正規化答案字串 "A, C" -> "AC"
function normalize(str) {
    if (!str) return "";
    // 取出所有英文字母，轉大寫，排序，接合
    return (str.match(/[a-zA-Z]/g) || []).map(c => c.toUpperCase()).sort().join('');
}

// 輔助：計算錯誤選項數量 (A與B的差異數)
// 例如 Key: ABC, Stu: AB (少C, 錯1), Stu: ABD (少C多D, 錯2)
function calculateMistakes(studentStr, keyStr) {
    const sSet = new Set(studentStr.split(''));
    const kSet = new Set(keyStr.split(''));
    
    let mistakes = 0;
    
    // 檢查多選的 (選了但不該選)
    sSet.forEach(char => {
        if (!kSet.has(char)) mistakes++;
    });

    // 檢查少選的 (該選但沒選)
    kSet.forEach(char => {
        if (!sSet.has(char)) mistakes++;
    });

    return mistakes;
}