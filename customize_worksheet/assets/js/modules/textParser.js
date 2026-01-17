/**
 * assets/js/modules/textParser.js
 * V3.1: 支援解析題目配分 (例如: "(5分)") 與 答案擷取優化
 */

// ==========================================
// 1. 題目解析核心
// ==========================================
export function parseQuestionMixed(text, defaultExpl = '') {
    if (!text) return [];

    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Regex: 抓取 "1. " 或 "1、" 開頭
    const regex = /(\d+)[.、\s]([\s\S]*?)(?=(?:\n\d+[.、\s])|$)/g;
    
    let matches;
    const questions = [];
    
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
 * 內部 Helper: 分離「本文」、「解析」、「答案」與「配分」
 */
function extractAnswerFromBlock(id, content, defaultExpl) {
    let text = content;
    let expl = defaultExpl;
    let ans = '';
    let score = 0; // 預設 0 (代表未設定，後續會用平均分填補)

    // 1. [新增] 嘗試擷取配分 (例如: (2分), [5pt], 10%)
    // 放在最前面處理，避免被當成題目文字
    const scoreRegex = /^[\(\[\{（【]\s*(\d+(\.\d+)?)\s*(?:分|pt|%|pts)\s*[\)\]\}）】]/i;
    const scoreMatch = text.match(scoreRegex);
    if (scoreMatch) {
        score = parseFloat(scoreMatch[1]);
        // 移除配分文字，讓題目更乾淨
        text = text.replace(scoreMatch[0], '').trim();
    }

    // 2. 嘗試擷取解析
    const explRegex = /\n(解析|說明|詳解|Note)[:：]([\s\S]*)/i;
    const explMatch = text.match(explRegex);
    
    if (explMatch) {
        expl = explMatch[2].trim();
        text = text.replace(explMatch[0], '').trim(); 
    }

    // 3. 嘗試擷取答案
    const ansRegex = /(?:答案|Ans|Answer)[:：\s]*([A-E,\s]+)(?:\)|\])?/i;
    const bracketAnsRegex = /[\(\[]([A-E,\s]+)[\)\]]$/m; 

    let ansMatch = text.match(ansRegex) || expl.match(ansRegex);
    if (!ansMatch) {
        ansMatch = text.match(bracketAnsRegex) || expl.match(bracketAnsRegex);
    }

    if (ansMatch) {
        // 正規化答案：只保留 A-E
        ans = ansMatch[1].toUpperCase().replace(/[^A-E]/g, '').split('').sort().join('');
    }

    return {
        id: id,
        text: text,
        expl: expl,
        ans: ans,
        score: score // 新增此屬性
    };
}

// 2. 錯題速記解析 (保持不變)
export function parseErrorText(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const result = [];
    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('[已匯入')) return;
        const parts = line.split(/[:：]/);
        if (parts.length >= 2) {
            const seat = parts[0].trim();
            const errorStr = parts[1].trim();
            let errors = [];
            if (errorStr && !['全對','無錯題','無'].includes(errorStr)) {
                errors = errorStr.split(/[,，\s]+/).filter(x => x);
            }
            result.push({ seat: seat, errors: errors });
        }
    });
    return result;
}