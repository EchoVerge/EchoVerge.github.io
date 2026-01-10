/**
 * assets/js/modules/settingsController.js
 * 負責 AI Key 設定、模型驗證、LocalStorage 存取
 */
import { state, setAiConfig } from './state.js';
import { fetchAvailableModels } from './aiParser.js';

export function initSettingsController() {
    const el = {
        btnOpen: document.getElementById('btn-ai-settings'),
        modal: document.getElementById('modal-ai-settings'),
        inputKey: document.getElementById('input-api-key'),
        btnCheck: document.getElementById('btn-check-models'),
        btnSave: document.getElementById('btn-save-ai'),
        selectModel: document.getElementById('select-model'),
        areaModel: document.getElementById('model-select-area')
    };

    // Load saved
    const savedKey = localStorage.getItem('gemini_key');
    const savedModel = localStorage.getItem('gemini_model');
    if(savedKey && savedModel) {
        setAiConfig(savedKey, savedModel);
        el.inputKey.value = savedKey;
    }

    // Events
    el.btnOpen.addEventListener('click', () => el.modal.style.display = 'flex');
    document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => el.modal.style.display = 'none'));

    el.btnCheck.addEventListener('click', async () => {
        if(!el.inputKey.value) return alert("請輸入 Key");
        try {
            const models = await fetchAvailableModels(el.inputKey.value);
            el.selectModel.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
            el.areaModel.style.display = 'block';
        } catch(e) { alert(e.message); }
    });

    el.btnSave.addEventListener('click', () => {
        const key = el.inputKey.value;
        const model = el.selectModel.value;
        if(key && model) {
            setAiConfig(key, model);
            localStorage.setItem('gemini_key', key);
            localStorage.setItem('gemini_model', model);
            el.modal.style.display = 'none';
            alert("設定已儲存");
        }
    });
}