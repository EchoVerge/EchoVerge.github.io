/**
 * assets/js/modules/aiParser.js
 * V2.4: 修正 analyzeAnswerSheetBatch 變數引用錯誤 (base64 is not defined)
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
    // 1. 發送前：記錄請求 (增加 RPM，Token=0，isUpdate=false)
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
        
        // 2. 成功後：補登 Token (Token=實際值，isUpdate=true)
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
    const prompt = `試題轉JSON [id,text,expl,ans]。內容：${text}`;
    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}

// 2. [修正] 批次閱卷 (一次處理多張圖片)
export async function analyzeAnswerSheetBatch(base64Images, model, apiKey, qCount) {
    const promptText = `
    你將收到 ${base64Images.length} 張答案卡圖片。
    請依序辨識每一張圖片的：
    1. 座號 (seat): 若無法辨識回傳 "unknown"。
    2. 作答 (answers): 第 1-${qCount} 題。
    
    【重要】：請回傳一個 JSON 陣列 (Array)，順序必須對應圖片順序。
    範例格式：
    [
        {"seat": "01", "answers": {"1":"A", "2":"B"}},
        {"seat": "05", "answers": {"1":"C", "2":"D"}}
    ]
    `;

    const parts = [{ text: promptText }];
    
    // [修正點] 這裡原本寫錯變數名稱，現已修正為 b64
    base64Images.forEach(b64 => {
        parts.push({
            inlineData: { mimeType: "image/jpeg", data: b64 }
        });
    });

    return await callGemini(apiKey, model, [{ parts: parts }]);
}

// 3. 單張閱卷 (相容性)
export async function analyzeAnswerSheet(base64Image, model, apiKey, qCount) {
    const result = await analyzeAnswerSheetBatch([base64Image], model, apiKey, qCount);
    return result[0];
}

// 4. 批次生成類題
export async function generateSimilarQuestionsBatch(questions, model, apiKey) {
    const simpleList = questions.map(q => ({ id: q.id, text: q.text, ans: q.ans }));
    const prompt = `
    請為以下題目列表產生「複習類題」。
    規則：改數字或情境、禁止複製原題。
    回傳 JSON 陣列：[{"id":"1", "similarText":"...", "similarExpl":"..."}]
    
    題目列表：
    ${JSON.stringify(simpleList)}
    `;
    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}