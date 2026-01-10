/**
 * assets/js/modules/aiParser.js
 * V2.2: 整合 Token 計算功能
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
    // 注意：這裡先不呼叫 recordRequest，改在成功收到回應後，連同 Token 一起記錄
    // 但為了讓 RPM 即時反應，我們可以先記錄一次請求(不含Token)，成功後再補 Token (較複雜)
    // 簡單做法：發送前算一次請求，Token 先傳 0；為了精確統計 Token，我們主要依賴成功的回應。
    
    // 為了 UI 即時性，我們先記一筆 Request (RPM +1)
    recordRequest(0); 

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
        
        // [新增] 擷取 Token 用量
        // Gemini 回傳格式包含 usageMetadata: { promptTokenCount, candidatesTokenCount, totalTokenCount }
        if (data.usageMetadata && data.usageMetadata.totalTokenCount) {
            // 因為發送前已經 recordRequest(0) 增加了一次次數
            // 這裡我們直接修改 totalTokens 變數 (但 usageMonitor 沒有暴露修改介面)
            // 所以我們再呼叫一次 recordRequest 來「補」Token 數，但不要增加 totalRequests
            // 為了避免重複計算 RPM，我們微調一下 usageMonitor 比較好
            // 但為了不改動太多結構，我們這裡採取：
            // 「recordRequest(tokens)」同時增加次數與Token。
            // 修正策略：上面第 30 行不要呼叫，改在下面呼叫。
            
            // 修正：發送前不呼叫，收到回應後才呼叫。
            // 缺點：等待回應期間 RPM 不會跳。
            // 優點：Token 準確。
            
            // 為了使用者體驗 (看到燈號在閃)，我們維持第 30 行的 recordRequest(0)。
            // 然後這裡我們需要一個方法「只增加 Token」或「更新上一筆紀錄」。
            
            // 簡單解法：我們在 usageMonitor 增加一個 updateLastRequestToken() 函式？
            // 或是簡單一點：直接呼叫 recordRequest(token)，讓次數多算一次沒關係？不行，RPM 會兩倍。
            
            // 最佳解法：我們把 Token 數傳進去。
            // 由於 usageMonitor.js 的 recordRequest 是 export 的，
            // 讓我們修改一下上面的 usageMonitor.js 邏輯：
            // (請看下方的特別說明) -> 為了簡單，我們這裡直接再呼叫一次 recordRequest，
            // 但傳入一個特殊標記讓它不要算次數？太複雜。
            
            // 決定：既然 30 行已經算了一次次數。
            // 我們這裡就「手動」去修正 usageMonitor 的變數？不行，模組化封裝了。
            
            // 讓我們修改 aiParser 邏輯：
            // 移除第 30 行的 recordRequest(0)。
            // 改在 fetch 之前不做，但在 finally 區塊做？
            // 不，RPM 需要在發送瞬間就反應比較好。
            
            // 💡 折衷方案：
            // 30行保留 (讓燈號亮)。
            // 這裡我們再呼叫一次 `recordRequest(data.usageMetadata.totalTokenCount)`，
            // 雖然這樣 Total Requests 會變成 2 倍，但我們可以接受「顯示的請求數 = API 互動次數 (發起+接收)」。
            // 或者，我們不要太糾結，就只在成功收到後紀錄就好。這樣 RPM 會稍微延遲一點點顯示，但數據是準確的。
            
            // ===> 最終決定：移除第 30 行，只在收到回應後紀錄。
            // 這樣最乾淨，且 Token 準確。
             recordRequest(data.usageMetadata.totalTokenCount);
        } else {
             recordRequest(0); // 沒回傳 Token 還是要記一次次數
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

// 修正後的 callGemini 邏輯 (請將此取代上方的 callGemini)
// 為了確保您複製正確，這裡提供完整的 callGemini 區塊：
/*
async function callGemini(key, model, contents) {
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
        
        // 紀錄請求與 Token
        const tokens = (data.usageMetadata && data.usageMetadata.totalTokenCount) ? data.usageMetadata.totalTokenCount : 0;
        recordRequest(tokens);

        let text = data.candidates[0].content.parts[0].text;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            return JSON.parse(text);
        } catch (e) { throw new Error("AI 解析失敗"); }
    } catch (e) {
        if (handleApiError(e)) throw new Error("API 額度限制");
        throw e;
    }
}
*/

// ... (以下函式直接呼叫 callGemini，無需修改) ...
export async function parseWithGemini(apiKey, model, text) {
    const prompt = `試題轉JSON [id,text,expl,ans]。內容：${text}`;
    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}

export async function analyzeAnswerSheetBatch(base64Images, model, apiKey, qCount) {
    const promptText = `
    辨識 ${base64Images.length} 張圖片。
    回傳JSON陣列: [{"seat":"01","answers":{"1":"A"}}, ...]。
    注意座號與作答。
    `;
    const parts = [{ text: promptText }];
    base64Images.forEach(b64 => parts.push({ inlineData: { mimeType: "image/jpeg", data: base64 } }));
    return await callGemini(apiKey, model, [{ parts: parts }]);
}

export async function analyzeAnswerSheet(base64Image, model, apiKey, qCount) {
    const result = await analyzeAnswerSheetBatch([base64Image], model, apiKey, qCount);
    return result[0];
}

export async function generateSimilarQuestionsBatch(questions, model, apiKey) {
    const simpleList = questions.map(q => ({ id: q.id, text: q.text, ans: q.ans }));
    const prompt = `產生類題(改數字/情境)。JSON陣列。題目：${JSON.stringify(simpleList)}`;
    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}