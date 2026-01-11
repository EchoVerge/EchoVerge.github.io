/**
 * assets/js/modules/toast.js
 * 輕量級通知系統
 */

export function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // 圖示
    let icon = '';
    if (type === 'success') icon = '✅ ';
    else if (type === 'error') icon = '❌ ';
    else if (type === 'warning') icon = '⚠️ ';
    else icon = 'ℹ️ ';

    toast.innerHTML = `<span>${icon}${message}</span>`;

    container.appendChild(toast);

    // 3秒後自動消失
    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3000);
}