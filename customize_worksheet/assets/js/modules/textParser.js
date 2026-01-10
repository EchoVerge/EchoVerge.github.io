// assets/js/modules/textParser.js

/**
 * 主入口：解析題目與解析 (支援分開貼上)
 * @param {String} textQ 題目區文字
 * @param {String} textA 解析區文字 (可選)
 */
export function parseQuestionMixed(textQ, textA = '') {
    // 1. 如果使用者只貼在題目區，但裡面包含明顯的「解析分隔線」，嘗試自動切分
    if (!textA && textQ) {
        const splitKeywords = ['解析篇', '解答篇', 'Answer Key', 'Answers', '解析：', '解答：'];
        // 找最後一次出現的大標題分隔
        for (const kw of splitKeywords) {
            // 簡單判斷：如果關鍵字出現在後半段，且前後有換行
            const idx = textQ.lastIndexOf(kw);
            if (idx > textQ.length * 0.5) { 
                textA = textQ.substring(idx);
                textQ = textQ.substring(0, idx);
                console.log("自動偵測到解析區塊，已分離處理");
                break;
            }
        }
    }

    // 2. 分別解析
    const questions = parseBlock(textQ, 'question');
    const explanations = parseBlock(textA, 'explanation');

    // 3. 合併 (以題目為準，將解析塞進去)
    // 建立索引
    const explMap = {};
    explanations.forEach(item => {
        explMap[normalizeId(item.id)] = item.content;
    });

    // 合併
    questions.forEach(q => {
        const nId = normalizeId(q.id);
        // 如果解析區有對應題號，優先使用
        if (explMap[nId]) {
            q.expl = explMap[nId];
        } 
        // 否則保留原本在題目區抓到的解析 (如果有)
    });

    return questions;
}

/**
 * 內部函式：解析單一區塊
 * @param {String} text 
 * @param {String} type 'question' | 'explanation'
 */
function parseBlock(text, type) {
    if (!text) return [];
    
    const lines = text.split(/\r?\n/);
    const items = [];
    let currentItem = null;

    // 正則：匹配行首的題號
    // 支援：1. / 1、 / (1) / Q1. / Question 1
    const regexId = /^(?:Q|Question)?\s*(\d+|[\(（]\d+[\)）])[\.\、\s]/i;
    
    // 正則：匹配行內的解析關鍵字 (用於混合模式)
    const regexExplParams = /(解析|詳解|答案|Ans|Answer)[:：]/i;

    lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        const idMatch = line.match(regexId);

        if (idMatch) {
            // 遇到新題號 -> 存檔
            if (currentItem) items.push(currentItem);
            
            const idStr = idMatch[1].replace(/[\(\)（）]/g, ''); // 去括號
            let content = line.replace(regexId, '').trim();
            
            currentItem = {
                id: idStr,
                content: content, // 暫存內容
                text: content,    // 題目
                expl: ''          // 解析
            };
        } else {
            // 接續上一題
            if (currentItem) {
                // 如果是題目區，嘗試抓行內解析
                if (type === 'question' && regexExplParams.test(line)) {
                    // 發現解析關鍵字，之後的都算解析
                    currentItem.expl += (currentItem.expl ? '\n' : '') + line;
                } else {
                    // 一般內容追加
                    if (currentItem.expl) {
                        currentItem.expl += '\n' + line;
                    } else {
                        currentItem.text += '\n' + line; // 加到題目
                        currentItem.content += '\n' + line; // 加到原始內容(給解析區用)
                    }
                }
            }
        }
    });

    if (currentItem) items.push(currentItem);
    return items;
}

// 題號正規化 (去除空白、轉字串)
function normalizeId(id) {
    return String(id).trim();
}

// (保留之前的 parseErrorText 不變)
export function parseErrorText(text) {
    // ...維持原樣...
    const lines = text.split(/\r?\n/);
    const students = [];
    lines.forEach(line => {
        const parts = line.split(/[:：]/);
        if (parts.length >= 2) {
            students.push({
                '座號': parts[0].trim(),
                '錯題列表': parts.slice(1).join(':').trim()
            });
        }
    });
    return students;
}