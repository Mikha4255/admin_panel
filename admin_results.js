// === ШИФРОВАНИЕ (ключ спрятан) ===
const _k = String.fromCharCode(83,65,66,76) + "2026";

async function _enc(txt, pwd) {
    const te = new TextEncoder();
    const keyMat = await crypto.subtle.importKey("raw", te.encode(pwd), {name:"PBKDF2"}, false, ["deriveKey"]);
    const aesKey = await crypto.subtle.deriveKey(
        {name:"PBKDF2", salt:te.encode("sabl_salt_2026"), iterations:100000, hash:"SHA-256"},
        keyMat,
        {name:"AES-GCM", length:256},
        false,
        ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({name:"AES-GCM", iv}, aesKey, te.encode(txt));
    return btoa(String.fromCharCode(...iv) + String.fromCharCode(...new Uint8Array(ct)));
}

async function _dec(b64, pwd) {
    const bin = atob(b64);
    const iv = new Uint8Array(bin.slice(0,12).split('').map(c => c.charCodeAt(0)));
    const ct = new Uint8Array(bin.slice(12).split('').map(c => c.charCodeAt(0)));
    const te = new TextEncoder();
    const keyMat = await crypto.subtle.importKey("raw", te.encode(pwd), {name:"PBKDF2"}, false, ["deriveKey"]);
    const aesKey = await crypto.subtle.deriveKey(
        {name:"PBKDF2", salt:te.encode("sabl_salt_2026"), iterations:100000, hash:"SHA-256"},
        keyMat,
        {name:"AES-GCM", length:256},
        false,
        ["decrypt"]
    );
    const pt = await crypto.subtle.decrypt({name:"AES-GCM", iv}, aesKey, ct);
    return new TextDecoder().decode(pt);
}

/* ---------- КОНСТАНТЫ ---------- */
const STORAGE_MAIN = 'https://school-vote-42-default-rtdb.europe-west1.firebasedatabase.app/votes.json';
const STORAGE_BACKUP = 'https://school-vote-42-default-rtdb.europe-west1.firebasedatabase.app/backup.json';

const mainView = document.getElementById('mainView');
const backupView = document.getElementById('backupView');

/* ---------- FETCH (ЗАШИФРОВАННЫЙ) ---------- */
async function getData(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return {};
        const json = await res.json();
        if (json === null) return {};
        if (typeof json.v === "string") {
            const plain = await _dec(json.v, _k);
            const data = JSON.parse(plain);
            if (Array.isArray(data) || typeof data !== 'object' || data === null) return {};
            return data;
        }
        return json;
    } catch {
        alert('Ошибка чтения данных');
        return {};
    }
}

async function postData(url, data) {
    try {
        const plain = JSON.stringify(data);
        const encrypted = await _enc(plain, _k);
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ v: encrypted })
        });
        return res.ok;
    } catch {
        alert('Ошибка записи данных');
        return false;
    }
}

/* ---------- ПОКАЗ ---------- */
document.getElementById('loadMain').addEventListener('click', async () => {
    const data = await getData(STORAGE_MAIN);
    mainView.textContent = JSON.stringify(data, null, 2);
    renderStats(data);
});

document.getElementById('loadBackup').addEventListener('click', async () => {
    const data = await getData(STORAGE_BACKUP);
    backupView.textContent = JSON.stringify(data, null, 2);
});

/* ---------- BACKUP ---------- */
document.getElementById('copyStorage').addEventListener('click', async () => {
    const data = await getData(STORAGE_MAIN);
    if (await postData(STORAGE_BACKUP, data)) {
        backupView.textContent = JSON.stringify(data, null, 2);
        alert('Backup создан');
    }
});

/* ---------- УДАЛИТЬ ВСЁ — ОТДЕЛЬНО ДЛЯ КАЖДОГО ХРАНИЛИЩА ---------- */
document.getElementById('clearMain').addEventListener('click', async () => {
    if (!confirm('⚠️ Удалить ВСЕ данные из основного хранилища?')) return;
    
    if (await postData(STORAGE_MAIN, {})) {
        mainView.textContent = '{}';
        document.getElementById('stats').innerHTML = '';
        alert('Основное хранилище очищено');
    }
});

document.getElementById('clearBackup').addEventListener('click', async () => {
    if (!confirm('⚠️ Удалить ВСЕ данные из backup-хранилища?')) return;
    
    if (await postData(STORAGE_BACKUP, {})) {
        backupView.textContent = '{}';
        alert('Backup-хранилище очищено');
    }
});

/* ---------- ДОБАВИТЬ В BACKUP ВРУЧНУЮ ---------- */
document.getElementById('addToBackup').addEventListener('click', async () => {
    const raw = document.getElementById('manualData').value.trim();
    if (!raw) return alert('Введите данные в формате JSON');

    try {
        const newData = JSON.parse(raw);
        const current = await getData(STORAGE_BACKUP);
        const merged = { ...current, ...newData };

        if (await postData(STORAGE_BACKUP, merged)) {
            backupView.textContent = JSON.stringify(merged, null, 2);
            document.getElementById('manualData').value = '';
            alert('Данные добавлены в backup');
        }
    } catch (e) {
        alert('Неверный формат JSON');
    }
});

/* ---------- УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ---------- */
document.getElementById('removeUserBtn').addEventListener('click', () => {
    const key = document.getElementById('removeFIO').value.trim();
    if (!key) return alert('Введите полный ключ: "Фамилия Имя|Класс"');
    removeUserByKey(STORAGE_MAIN, mainView, key, 'removeFIO');
});

document.getElementById('removeUserBackupBtn').addEventListener('click', () => {
    const key = document.getElementById('removeFIOBackup').value.trim();
    if (!key) return alert('Введите полный ключ: "Фамилия Имя|Класс"');
    removeUserByKey(STORAGE_BACKUP, backupView, key, 'removeFIOBackup');
});

async function removeUserByKey(url, view, userKey, inputId) {
    const data = await getData(url);
    if (!data[userKey]) {
        const fioOnly = userKey.split('|')[0];
        const matches = Object.keys(data).filter(k => k.startsWith(fioOnly + '|'));
        if (matches.length > 0) {
            let msg = `Не найден точный ключ "${userKey}".\n\nВозможные варианты:\n`;
            msg += matches.map(m => `- ${m}`).join('\n');
            alert(msg);
        } else {
            alert('Пользователь не найден');
        }
        return;
    }

    // Удаляем без проверки на "последнего"
    delete data[userKey];

    if (await postData(url, data)) {
        view.textContent = JSON.stringify(data, null, 2);
        document.getElementById(inputId).value = '';
        alert('Удалено успешно');
        if (url === STORAGE_MAIN) renderStats(data);
    }
}

/* ---------- СТАТИСТИКА ---------- */
function renderStats(data) {
    let statsBlock = document.getElementById('stats');
    if (!statsBlock) {
        statsBlock = document.createElement('div');
        statsBlock.id = 'stats';
        document.body.appendChild(statsBlock);
    }

    const counts = {};
    Object.values(data).forEach(list => {
        if (!Array.isArray(list)) return;
        list.forEach(nom => {
            counts[nom] = (counts[nom] || 0) + 1;
        });
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    let html = `<h2>📊 Подсчёт голосов</h2><pre>`;
    sorted.forEach(([name, count]) => {
        html += `${name}: ${count}\n`;
    });
    html += `</pre>`;

    html += `<h2>🏆 Рейтинг номинаций</h2><pre>`;
    sorted.forEach(([name, count], i) => {
        html += `${i + 1}. ${name} — ${count}\n`;
    });
    html += `</pre>`;

    statsBlock.innerHTML = html;
}