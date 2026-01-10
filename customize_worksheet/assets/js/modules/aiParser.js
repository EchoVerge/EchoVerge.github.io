const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export async function fetchAvailableModels(apiKey) {
    const res = await fetch(`${BASE_URL}/models?key=${apiKey}`);
    const data = await res.json();
    return data.models
        .filter(m => m.name.includes('gemini') && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .sort((a,b) => a.includes('flash') ? -1 : 1);
}

export async function parseWithGemini(apiKey, model, text) {
    const prompt = `請將以下試題轉為 JSON 陣列。格式：[{"id":"題號","text":"題目含選項","expl":"解析與答案"}]。純JSON，無Markdown。\n\n${text}`;
    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}

export async function analyzeAnswerSheet(base64Image, model, apiKey, qCount) {
    const prompt = `這是一張答案卡。請辨識：1.座號劃記 2.第1-${qCount}題的劃記(A-E)。回傳 JSON：{"seat":"座號","answers":{"1":"A",...}}。純JSON。`;
    const body = {
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Image } }] }]
    };
    return await callGemini(apiKey, model, body.contents);
}

export async function generateSimilarQuestions(qText, model, apiKey) {
    const prompt = `請根據此題生成1題類題。格式 JSON：{"id":"類題","text":"...","expl":"..."}。\n原題：${qText}`;
    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}

export async function rewriteExplanation(expl, qText, style, model, apiKey) {
    const prompt = `題目：${qText}\n解析：${expl}\n請${style==='simple'?'用白話文':'用引導式'}改寫解析。純文字輸出。`;
    const res = await fetch(`${BASE_URL}/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
}

async function callGemini(key, model, contents) {
    const res = await fetch(`${BASE_URL}/models/${model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { responseMimeType: "application/json" } })
    });
    const data = await res.json();
    if(data.error) throw new Error(data.error.message);
    const text = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
}