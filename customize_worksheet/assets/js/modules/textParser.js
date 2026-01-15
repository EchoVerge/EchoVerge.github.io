/**
 * assets/js/modules/textParser.js
 * V3.0 Fix: 
 * 1. 修正多選題答案擷取邏輯 (支援 ABC, A,B 格式)
 * 2. 移除必須標記 M 的限制，只要答案有多個選項即視為多選
 */

// ==========================================
// 1. 題目解析核心 (Step 1 用)
// ==========================================
export function parseQuestionMixed(text, defaultExpl = '') {
    if (!text) return [];

    // 預處理：統一換行符號
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 嘗試分割題目 (常見格式：數字開頭 + 點/頓號)
    // Regex: 抓取 "1. " 或 "1、" 開頭
    const regex = /(\d+)[.、\s]([\s\S]*?)(?=(?:\n\d+[.、\s])|$)/g;
    
    let matches;
    const questions = [];
    
    // 如果 Regex 找不到任何題目，嘗試用雙換行分割 (備用模式)
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
    const explRegex = /\n(解析|說明|詳解|Note)[:：]([\s\S]*)/i;
    const explMatch = text.match(explRegex);
    
    if (explMatch) {
        expl = explMatch[2].trim();
        text = text.replace(explMatch[0], '').trim(); 
    }

    // 2. 嘗試擷取答案 (Answer) - 支援多選
    // 修改點：([A-E]) 改為 ([A-E,\s]+)，允許抓取多個字母
    const ansRegex = /(?:答案|Ans|Answer)[:：\s]*([A-E,\s]+)(?:\)|\])?/i;
    // 行尾括號判定：(ABC) 或 [AB]
    const bracketAnsRegex = /[\(\[]([A-E,\s]+)[\)\]]$/m; 

    let ansMatch = text.match(ansRegex) || expl.match(ansRegex);
    
    if (!ansMatch) {
        ansMatch = text.match(bracketAnsRegex) || expl.match(bracketAnsRegex);
    }

    if (ansMatch) {
        // 正規化答案：轉大寫 -> 移除逗號與空白 -> 排序
        // 例如 "A, C" -> "AC"
        ans = ansMatch[1].toUpperCase().replace(/[^A-E]/g, '').split('').sort().join('');
    }

    return {
        id: id,
        text: text,
        expl: expl,
        ans: ans // 現在可以是 "AC" 或 "ABC"
    };
}

// ==========================================
// 2. 錯題速記解析 (Step 2 用)
// ==========================================
export function parseErrorText(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const result = [];
    
    lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        if (line.startsWith('[已匯入')) return;
        
        const parts = line.split(/[:：]/);
        if (parts.length >= 2) {
            const seat = parts[0].trim();
            const errorStr = parts[1].trim();
            
            let errors = [];
            if (errorStr && errorStr !== '全對' && errorStr !== '無錯題' && errorStr !== '無') {
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