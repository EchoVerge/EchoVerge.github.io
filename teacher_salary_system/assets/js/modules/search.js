import { db } from './db.js';
import { formatDate } from './utils.js';
import { jumpToSpecificDate } from './calendar.js';

// 初始化搜尋功能
export function initSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (query.length > 0) {
                performSearch(query);
            } else {
                // 清空搜尋時，恢復顯示原本的側邊欄 (需依賴 calendar.js 的全域重繪，或簡單清空)
                // 這裡我們選擇重新呼叫全域的 renderSidebar (透過 window 介面或重新導向)
                // 為求簡單，若清空則顯示「請輸入關鍵字」或切回預設視圖
                document.getElementById('sidebarList').innerHTML = '<div class="text-center text-muted mt-3"><small>請輸入關鍵字搜尋<br>或點擊「回到本週」</small></div>';
            }
        });
    }
}

// 執行搜尋
async function performSearch(query) {
    const list = document.getElementById('sidebarList');
    list.innerHTML = '<div class="text-center text-muted mt-3"><small>搜尋中...</small></div>';

    try {
        // 搜尋 Records (備註、班級、類型)
        // Dexie 的 Table 搜尋能力有限，這裡使用 filter (資料量不大時效能可接受)
        const records = await db.records.filter(r => {
            const q = query.toLowerCase();
            return (r.note && r.note.toLowerCase().includes(q)) || 
                   (r.className && r.className.toLowerCase().includes(q)) ||
                   (r.type && r.type.toLowerCase().includes(q)) ||
                   (r.date && r.date.includes(q));
        }).toArray();

        // 排序：日期新到舊
        records.sort((a, b) => new Date(b.date) - new Date(a.date));

        renderSearchResults(records);

    } catch (err) {
        console.error(err);
        list.innerHTML = '<div class="text-danger text-center mt-3"><small>搜尋發生錯誤</small></div>';
    }
}

// 渲染搜尋結果
function renderSearchResults(records) {
    const list = document.getElementById('sidebarList');
    list.innerHTML = '';

    if (records.length === 0) {
        list.innerHTML = '<div class="text-center text-muted mt-3"><small>找不到符合的紀錄</small></div>';
        return;
    }

    records.forEach(r => {
        list.innerHTML += `
            <div class="week-card" onclick="jumpToSpecificDate('${r.date}')">
                <div class="d-flex justify-content-between">
                    <strong>${r.date}</strong>
                    <span class="badge bg-secondary">${r.type}</span>
                </div>
                <div class="small text-muted text-truncate">
                    ${r.className ? `班級:${r.className}` : ''} 
                    ${r.note ? `備註:${r.note}` : ''}
                </div>
            </div>`;
    });
}