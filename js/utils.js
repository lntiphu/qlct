export function goBackToHome(){location.replace(new URL('../index.html',import.meta.url));}
export async function loadComponent(name){
 const response=await fetch(new URL(`../components/${name}.html`,import.meta.url));
 if(!response.ok)throw new Error('Không tải được thành phần: '+name);
 const template=document.createElement('template');template.innerHTML=await response.text();return template.content;
}
export function onReady(fn){if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn,{once:true});else fn();}
export function normalizeSupportText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
}

export function normalizeDuplicateText(value) {
    return normalizeSupportText(value).replace(/\s+/g, ' ').trim();
}

const LUCIDE_EMOJI_FALLBACKS = {
    "layout-dashboard": "📊",
    "receipt": "📝",
    "plus": "➕",
    "pie-chart": "📈",
    "calendar": "📅",
    "trending-up": "📈",
    "credit-card": "💳",
    "database": "💾",
    "search": "🔍",
    "tag": "🏷️",
    "file-text": "📄",
    "check": "✅",
    "x": "❌",
    "trash-2": "🗑️",
    "camera": "📷",
    "image": "🖼️",
    "inbox": "📥",
    "layout-grid": "⊞",
    "piggy-bank": "🐷",
    "landmark": "🏦",
    "target": "🎯",
    "alert-circle": "⚠️",
    "sigma": "∑",
    "bookmark": "🔖",
    "sparkles": "✨",
    "edit-3": "✏️",
    "minus": "➖",
    "wallet": "👛",
    "zap": "⚡",
    "trending-up": "📈",
    "power": "⏻"
};

// Hàm bổ trợ gọi Lucide Icons an toàn
export function createLucideIcons() {
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    } else {
        console.warn("Lucide Icons is not loaded. Using emoji fallback.");
        const icons = document.querySelectorAll('i[data-lucide]');
        icons.forEach(icon => {
            const iconName = icon.getAttribute('data-lucide');
            const fallbackEmoji = LUCIDE_EMOJI_FALLBACKS[iconName];
            if (fallbackEmoji) {
                icon.innerHTML = fallbackEmoji;
                icon.style.fontStyle = 'normal';
                icon.style.fontSize = '1.25rem';
                icon.style.display = 'inline-flex';
                icon.style.alignItems = 'center';
                icon.style.justifyContent = 'center';
            }
        });
    }
}

export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
