/**
 * assets/js/modules/aiParser.js
 * V2.7: 更新閱卷 Prompt，適應四欄式佈局 (左一為座號)
 */

import { recordRequest, handleApiError } from './usageMonitor.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export async function fetchAvailableModels(apiKey) {
    try {
        const res = await fetch(`${BASE_URL}/models?key=${apiKey}`);
        if(!res.ok) throw new Error("Key 無效");
        const data = await res.json();
        return data.models
            .filter(m => m.name.includes('gemini') && m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.replace('models/', ''))
            .sort((a,b) => a.includes('flash') ? -1 : 1);
    } catch(e) { throw e; }
}

async function callGemini(key, model, contents) {
    recordRequest(0, false); 

    const url = `${BASE_URL}/models/${model}:generateContent?key=${key}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: contents,
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "AI 連線錯誤");
        }

        const data = await response.json();
        if (data.usageMetadata && data.usageMetadata.totalTokenCount) {
             recordRequest(data.usageMetadata.totalTokenCount, true);
        }

        let text = data.candidates[0].content.parts[0].text;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("AI 非 JSON:", text);
            throw new Error("AI 解析失敗");
        }
    } catch (e) {
        if (handleApiError(e)) throw new Error("API 額度限制");
        throw e;
    }
}

// 1. 題目解析
export async function parseWithGemini(apiKey, model, text) {
    const prompt = `試題轉 JSON。格式：[{"id":"1","text":"...","expl":"...","ans":"A"}]。請自動偵測答案。內容：${text}`;
    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}

// 2. 批次閱卷 (更新版)
export async function analyzeAnswerSheetBatch(base64Images, model, apiKey, qCount) {
    const promptText = `
    你將收到 ${base64Images.length} 張答案卡圖片。
    
    [版面結構]
    試卷主體分為「四個直欄」：
    1. 最左側第一欄：【座號劃記區】。包含「十」、「個」兩行，下方為 0-9 的圓圈。
    2. 右側三欄：【題目作答區】。包含第 1-15、16-30、31-45 題的選項。

    [任務目標]
    請依序辨識每一張圖片：
    1. 座號 (seat): 
       - 請聚焦於圖片【最左側】的座號區。
       - 辨識「十位」與「個位」哪兩個圓圈被塗黑。
       - 例如：十位塗0、個位塗5，則座號為 "05"。
       - 若無法辨識劃記，回傳 "unknown"。
       
    2. 作答 (answers): 
       - 忽略最左側的座號區，辨識右側題目區的塗黑選項 (A-E)。
       - 題號範圍：1 到 ${qCount}。
    
    回傳 JSON 陣列：
    [
        {"seat": "01", "answers": {"1":"A", "2":"B"}},
        {"seat": "05", "answers": {"1":"C", "2":"D"}}
    ]
    `;

    const parts = [{ text: promptText }];
    base64Images.forEach(b64 => {
        parts.push({
            inlineData: { mimeType: "image/jpeg", data: b64 }
        });
    });

    return await callGemini(apiKey, model, [{ parts: parts }]);
}

// 3. 單張閱卷
export async function analyzeAnswerSheet(base64Image, model, apiKey, qCount) {
    const result = await analyzeAnswerSheetBatch([base64Image], model, apiKey, qCount);
    return result[0];
}

// 4. 批次生成類題
export async function generateSimilarQuestionsBatch(questions, model, apiKey) {
    const simpleList = questions.map(q => ({ id: q.id, text: q.text, ans: q.ans }));
    
    const prompt = `
    請為以下題目列表產生「複習類題」。
    規則：
    1. 改編數字或情境、禁止直接複製原題。
    2. 必須提供類題的正確答案 (similarAns)。
    3. 必須提供類題的解析 (similarExpl)。
    
    回傳 JSON 陣列格式：
    [{"id":"1", "similarText":"...", "similarExpl":"...", "similarAns":"..."}]
    
    題目列表：
    ${JSON.stringify(simpleList)}
    `;
    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}

// 5. Vision 解析題目
export async function parseImageWithGemini(apiKey, model, base64Images) {
    const images = Array.isArray(base64Images) ? base64Images : [base64Images];
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const imageParts = images.map(img => {
        const cleanBase64 = img.split(',')[1];
        return {
            inline_data: {
                mime_type: "image/jpeg",
                data: cleanBase64
            }
        };
    });

    const prompt = `
    請分析這些圖片(這是一份試卷的各個頁面)，並將其提取為 JSON 格式。
    
    [重要規則]
    1. 請將所有頁面的題目合併處理，即使圖片包含多題，也要全部列出。
    2. 如果圖片有數學公式，請轉換為 LaTeX 格式 (用 $ 包裹)。
    3. 忽略圖片中的手寫筆跡或雜訊，只提取題目印刷文字。
    4. 直接回傳 JSON Array，不要有 Markdown 標記。

    JSON 結構：
    [
      { "id": "1", "text": "題目內容(含選項)", "ans": "答案(若有)", "expl": "解析(若有)" }
    ]
    `;

    const payload = {
        contents: [{
            parts: [
                { text: prompt },
                ...imageParts 
            ]
        }]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errObj = await response.json();
        throw new Error("Vision API 錯誤: " + (errObj.error?.message || response.statusText));
    }

    const data = await response.json();
    try {
        const rawText = data.candidates[0].content.parts[0].text;
        const jsonText = rawText.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("AI Response:", data);
        throw new Error("無法解析 AI 回傳的資料 (可能圖片模糊或無文字)");
    }
}

// 6. 批次自動解題
export async function autoSolveQuestionsBatch(questions, model, apiKey) {
    const simpleList = questions.map(q => ({ id: q.id, text: q.text }));
    
    const prompt = `
    你是一位學科專家。請為以下題目提供正確答案與詳細解析。
    
    [輸入題目]
    ${JSON.stringify(simpleList)}

    [輸出規則]
    請回傳一個 JSON 陣列，包含原本的 id 以及生成的 ans (答案) 和 expl (解析)。
    格式範例：
    [
      { "id": "1", "ans": "A", "expl": "因為..." },
      { "id": "2", "ans": "C", "expl": "解題步驟..." }
    ]
    `;

    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}