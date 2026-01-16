/**
 * assets/js/modules/toast.js
 * 輕量級通知系統 V2.1
 * Update: 優化圖示結構，支援獨立動畫 (解決旋轉時文字跟著轉的問題)
 */

export function showToast(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // 圖示設定 (移除尾端空白，改由 CSS 控制間距，確保旋轉中心準確)
    let icon = '';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'loading') icon = '⏳';
    else icon = 'ℹ️';

    // 將 icon 獨立包裹，以便單獨套用動畫
    toast.innerHTML = `<span><span class="toast-icon">${icon}</span>${message}</span>`;

    container.appendChild(toast);

    const removeToast = () => {
        if (!toast.classList.contains('hide')) {
            toast.classList.add('hide');
            toast.addEventListener('animationend', () => {
                if(toast.parentElement) toast.remove();
            });
        }
    };

    if (duration > 0) {
        setTimeout(removeToast, duration);
    }

    return {
        remove: removeToast,
        updateMessage: (newMsg) => {
            // 更新時保留 icon
            const contentSpan = toast.querySelector('span');
            if(contentSpan) {
                contentSpan.innerHTML = `<span class="toast-icon">${icon}</span>${newMsg}`;
            }
        }
    };
}