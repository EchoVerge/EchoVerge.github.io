/**
 * assets/js/modules/textParser.js
 * 負責文字解析：
 * 1. 將純文字轉換為題目物件 (含答案擷取)
 * 2. 解析錯題速記文字 (座號: 錯題)
 */

// ==========================================
// 1. 題目解析核心 (Step 1 用)
// ==========================================
export function parseQuestionMixed(text, defaultExpl = '') {
    if (!text) return [];

    // 預處理：統一換行符號
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 嘗試分割題目 (常見格式：數字開頭 + 點/頓號)
    // Regex 邏輯：找到 "1. " 或 "1、" 開頭的段落，直到下一個數字開頭前
    const regex = /(\d+)[.、\s]([\s\S]*?)(?=(?:\n\d+[.、\s])|$)/g;
    
    let matches;
    const questions = [];
    
    // 如果 Regex 找不到任何題目，嘗試用雙換行分割
    if (!text.match(regex)) {
        const blocks = text.split(/\n\n+/);
        return blocks.map((block, i) => extractAnswerFromBlock(i + 1, block.trim(), defaultExpl));
    }

    while ((matches = regex.exec(text)) !== null) {
        const id = matches[1];
        const content = matches[2].trim();
        questions.push(extractAnswerFromBlock(id, content, defaultExpl));
    }

    return questions;
}

/**
 * 內部 Helper: 從題目區塊中分離「題目本文」、「解析」與「答案」
 */
function extractAnswerFromBlock(id, content, defaultExpl) {
    let text = content;
    let expl = defaultExpl;
    let ans = '';

    // 1. 嘗試擷取解析 (Explanation)
    // 常見關鍵字：解析、說明、詳解
    const explRegex = /\n(解析|說明|詳解|Note)[:：]([\s\S]*)/i;
    const explMatch = text.match(explRegex);
    
    if (explMatch) {
        expl = explMatch[2].trim();
        text = text.replace(explMatch[0], '').trim(); // 從本文移除解析部分
    }

    // 2. 嘗試擷取答案 (Answer) - 從本文或解析中找
    // 支援格式： (A), [B], 答案：C, Ans: D
    // 優先找獨立一行的答案
    const ansRegex = /(?:答案|Ans|Answer)[:：\s]*([A-E])(?:\)|\])?/i;
    const bracketAnsRegex = /[\(\[]([A-E])[\)\]]$/m; // 行尾的 (A) 或 [A]

    // 先找明確標示 "答案：A" 的
    let ansMatch = text.match(ansRegex) || expl.match(ansRegex);
    
    if (ansMatch) {
        ans = ansMatch[1].toUpperCase();
    } else {
        // 若沒找到，找行尾括號 (A)
        ansMatch = text.match(bracketAnsRegex) || expl.match(bracketAnsRegex);
        if (ansMatch) ans = ansMatch[1].toUpperCase();
    }

    return {
        id: id,
        text: text,
        expl: expl,
        ans: ans // 標準答案欄位
    };
}

// ==========================================
// 2. [補回] 錯題速記解析 (Step 2 用)
// ==========================================
export function parseErrorText(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const result = [];
    
    lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        if (line.startsWith('[已匯入')) return; // 跳過系統訊息行
        
        // 格式範例: "05: 1, 3, 5" 或 "06: 全對"
        // 抓取冒號前的座號，與冒號後的內容
        const parts = line.split(/[:：]/);
        if (parts.length >= 2) {
            const seat = parts[0].trim();
            const errorStr = parts[1].trim();
            
            // 分割錯題 ID
            let errors = [];
            if (errorStr && errorStr !== '全對' && errorStr !== '無錯題' && errorStr !== '無') {
                // 支援逗號、空格分隔
                errors = errorStr.split(/[,，\s]+/).filter(x => x);
            }
            
            result.push({
                seat: seat,
                errors: errors
            });
        }
    });
    return result;
}