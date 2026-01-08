// Dexie 已經在 index.html 全域引入

export const db = new Dexie("TeacherSalaryDB");

db.version(1).stores({
    semesters: "++id, name, startDate, endDate",
    records: "++id, [date+period], date, type, semesterId",
    settings: "key" 
});

const defaultTypes = [
    { id: 1, name: '基本鐘點', rate: 0, color: '#0d6efd' },
    { id: 2, name: '超鐘點', rate: 420, color: '#198754' },
    { id: 3, name: '代課', rate: 420, color: '#ffc107' },
    { id: 4, name: '晚自習', rate: 550, color: '#6f42c1' },
    { id: 5, name: '請假', rate: 0, color: '#dc3545' }
];

export async function loadSettings() {
    let types = await db.settings.get('courseTypes');
    if (!types) {
        await db.settings.put({ key: 'courseTypes', value: defaultTypes });
        return defaultTypes;
    } else {
        return types.value;
    }
}