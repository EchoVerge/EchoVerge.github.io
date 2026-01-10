/**
 * 全域狀態管理：負責跨模組的資料共享
 */
export const state = {
    students: [],
    questions: [], // 這是核心，一定要有資料
    mode: 'quiz',
    ai: { key: '', model: '', available: false },
    sourceType: 'text'
};

export function setAiConfig(key, model) {
    state.ai = { key, model, available: true };
}