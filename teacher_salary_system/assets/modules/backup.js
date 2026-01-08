import { db } from './db.js';
import { formatDate } from './utils.js';

let backupModal;

export function initBackupModal() {
    backupModal = new bootstrap.Modal(document.getElementById('backupModal'));
}

export function openBackupModal() { backupModal.show(); }

export async function exportBackup() {
    const data = { 
        semesters: await db.semesters.toArray(), 
        records: await db.records.toArray(), 
        settings: await db.settings.toArray() 
    };
    const blob = new Blob([JSON.stringify(data)], {type: "application/json;charset=utf-8"});
    saveAs(blob, `TeacherSalary_Backup_${formatDate(new Date())}.json`);
}

export async function importBackup() {
    const fileInput = document.getElementById('importFile');
    if(!fileInput.files.length) return;
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            await db.transaction('rw', db.semesters, db.records, db.settings, async () => {
                await db.semesters.clear(); await db.records.clear(); await db.settings.clear();
                if(data.semesters) await db.semesters.bulkAdd(data.semesters);
                if(data.records) await db.records.bulkAdd(data.records);
                if(data.settings) await db.settings.bulkAdd(data.settings);
            });
            alert('還原成功！'); location.reload();
        } catch(err) { alert('檔案格式錯誤'); }
    };
    reader.readAsText(file);
}