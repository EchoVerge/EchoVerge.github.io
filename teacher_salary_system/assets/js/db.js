// 初始化 Dexie 資料庫
const db = new Dexie("TeacherSalaryDB");

// 定義資料庫結構 (Schema)
db.version(1).stores({
    semesters: "++id, name, startDate, endDate", // 學期
    records: "++id, [date+period], date, type, semesterId", // 課程異動紀錄
    settings: "key" // 系統設定 (課程類別等)
});

// 預設課程類別資料 (當第一次使用時載入)
const defaultTypes = [
    { id: 1, name: '基本鐘點', rate: 0, color: '#0d6efd' },
    { id: 2, name: '超鐘點', rate: 420, color: '#198754' },
    { id: 3, name: '代課', rate: 420, color: '#ffc107' },
    { id: 4, name: '晚自習', rate: 550, color: '#6f42c1' },
    { id: 5, name: '請假', rate: 0, color: '#dc3545' }
];

// 初始化設定函式 (供 app.js 呼叫)
async function loadSettings() {
    let types = await db.settings.get('courseTypes');
    if (!types) {
        await db.settings.put({ key: 'courseTypes', value: defaultTypes });
        return defaultTypes;
    } else {
        return types.value;
    }
}