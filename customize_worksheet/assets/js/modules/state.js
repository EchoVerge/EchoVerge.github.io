/**
 * assets/js/modules/state.js
 * 全域狀態管理：負責跨模組的資料共享
 */

export const state = {
    // 資料層
    questions: [], // 題目物件陣列
    students: [],  // 學生/錯題資料陣列
    
    // 設定層
    mode: 'quiz', // 'quiz' | 'error'
    
    // AI 設定
    ai: {
        key: '',
        model: '',
        available: false
    },

    // 狀態標記
    sourceType: 'text' // 'text' | 'file'
};

// 簡單的資料操作 helper (選用)
export function setQuestions(data) { state.questions = data; }
export function setStudents(data) { state.students = data; }
export function setAiConfig(key, model) {
    state.ai.key = key;
    state.ai.model = model;
    state.ai.available = true;
}