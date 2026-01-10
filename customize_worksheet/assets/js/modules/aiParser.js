/**
 * assets/js/modules/aiParser.js
 * 負責與 Google Gemini API 溝通，進行智慧題目解析
 */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * 驗證 API Key 並取得可用模型列表
 */
export async function fetchAvailableModels(apiKey) {
    try {
        const response = await fetch(`${BASE_URL}/models?key=${apiKey}`);
        if (!response.ok) throw new Error("API Key 無效或網路錯誤");
        
        const data = await response.json();
        // 過濾出支援 generateContent 的 Gemini 模型
        const models = data.models
            .filter(m => m.name.includes('gemini') && m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.replace('models/', '')); // 只留模型名稱
            
        // 排序：優先使用 flash (速度快)
        models.sort((a, b) => {
            if (a.includes('flash') && !b.includes('flash')) return -1;
            if (!a.includes('flash') && b.includes('flash')) return 1;
            return 0;
        });

        return models;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * 呼叫 Gemini 解析文字
 */
export async function parseWithGemini(apiKey, model, text) {
    const url = `${BASE_URL}/models/${model}:generateContent?key=${apiKey}`;
    
    // Prompt Engineering: 強制要求 JSON 格式
    const prompt = `
    你是一個專業的考卷資料結構化專家。請分析以下文字，將其轉換為嚴格的 JSON 陣列格式。
    
    目標結構範例：
    [
      {
        "id": "1", 
        "text": "題目內容包含選項...", 
        "expl": "答案(A)。解析內容..."
      }
    ]

    規則：
    1. "id": 題號（純數字或 1-1, Q1）。
    2. "text": 必須包含題目描述與所有選項 (A, B, C, D...)，保持原本換行格式。
    3. "expl": 必須包含正確答案與詳解。如果原文沒有詳解，此欄位留空字串。
    4. 若原文題目與解析分開，請根據題號自動合併。
    5. 不要輸出任何 Markdown 標記（如 \`\`\`json），只輸出純 JSON 字串。
    6. 忽略無關的頁首頁尾或標題。

    待分析文字：
    ${text}
    `;

    const body = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            temperature: 0.1, // 低隨機性，確保格式穩定
            responseMimeType: "application/json" // 強制 JSON 模式 (Gemini 1.5 支援)
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || "AI 請求失敗");
        }

        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        
        // 清理可能殘留的 Markdown
        const jsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonText);

    } catch (error) {
        console.error("AI 解析失敗:", error);
        throw new Error("AI 解析失敗: " + error.message);
    }
}