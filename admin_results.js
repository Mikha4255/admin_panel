// === ОБФУСЦИРОВАННЫЙ МОДУЛЬ ШИФРОВАНИЯ ===
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
});

document.getElementById('loadBackup').addEventListener('click', async () => {
    const data = await getData(STORAGE_BACKUP);
    backupView.textContent = JSON.stringify(data, null, 2);
});

/* ---------- BACKUP ---------- */
document.getElementById('copyStorage').addEventListener('click', async () => {
    const data = await getData(STORAGE_MAIN);
    if (Object.keys(data).length === 0) {
        alert('Основное хранилище пустое');
        return;
    }
    if (await postData(STORAGE_BACKUP, data)) {
        backupView.textContent = JSON.stringify(data, null, 2);
        alert('Backup создан');
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
    const keys = Object.keys(data);

    if (!data[userKey]) {
        const fioOnly = userKey.split('|')[0];
        const matches = keys.filter(k => k.startsWith(fioOnly + '|'));
        if (matches.length > 0) {
            let msg = `Не найден точный ключ "${userKey}".\n\nВозможные варианты:\n`;
            msg += matches.map(m => `- ${m}`).join('\n');
            alert(msg);
        } else {
            alert('Пользователь не найден');
        }
        return;
    }

    if (keys.length <= 1) {
        alert('Нельзя удалить последнего голосующего');
        return;
    }

    if (!confirm(`Удалить запись:\n"${userKey}"?`)) return;

    delete data[userKey];

    if (await postData(url, data)) {
        view.textContent = JSON.stringify(data, null, 2);
        document.getElementById(inputId).value = '';
        alert('Удалено успешно');
    }
}
// === ФУНКЦИЯ: получить статистику по номинациям ===
async function getNominationStats() {
    const data = await getData(STORAGE_MAIN);
    if (!data || Object.keys(data).length === 0) {
        return null;
    }

    var counts = {};
    var key;
    var entry;
    var nominations;
    var i;
    var nom;

    for (key in data) {
        entry = data[key];
        nominations = [];

        if (Array.isArray(entry)) {
            nominations = entry;
        } else if (entry && typeof entry === 'object' && Array.isArray(entry.nominations)) {
            nominations = entry.nominations;
        }

        for (i = 0; i < nominations.length; i++) {
            nom = nominations[i];
            if (counts[nom]) {
                counts[nom] = counts[nom] + 1;
            } else {
                counts[nom] = 1;
            }
        }
    }

    // Сортировка
    var sorted = [];
    var name;
    for (name in counts) {
        sorted.push([name, counts[name]]);
    }
    sorted.sort(function(a, b) {
        return b[1] - a[1];
    });

    return sorted;
}

// === КНОПКА: Статистика ===
document.getElementById('showStats').addEventListener('click', function() {
    var container = document.getElementById('stats-block');
    if (container.style.display === 'block') {
        container.style.display = 'none';
        return;
    }

    getNominationStats().then(function(stats) {
        if (!stats) {
            alert('Нет данных');
            return;
        }

        var text = '';
        var i;
        for (i = 0; i < stats.length; i++) {
            text = text + stats[i][0] + ': ' + stats[i][1] + '\n';
        }
        document.getElementById('stats-text').textContent = text;
        container.style.display = 'block';
    });
});

// === КНОПКА: Рейтинг ===
document.getElementById('showRating').addEventListener('click', function() {
    var container = document.getElementById('rating-block');
    if (container.style.display === 'block') {
        container.style.display = 'none';
        return;
    }

    getNominationStats().then(function(stats) {
        if (!stats) {
            alert('Нет данных');
            return;
        }

        var text = '';
        var i;
        for (i = 0; i < stats.length; i++) {
            text = text + (i + 1) + '. ' + stats[i][0] + ' — ' + stats[i][1] + '\n';
        }
        document.getElementById('rating-text').textContent = text;
        container.style.display = 'block';
    });
});

// === КНОПКА: Диаграмма ===
document.getElementById('showChart').addEventListener('click', function() {
    var container = document.getElementById('chart-block');
    if (container.style.display === 'block') {
        container.style.display = 'none';
        return;
    }

    getNominationStats().then(function(stats) {
        if (!stats) {
            alert('Нет данных');
            return;
        }

        var canvas = document.getElementById('nominationsChart');
        var oldChart = Chart.getChart(canvas);
        if (oldChart) {
            oldChart.destroy();
        }

        // Ограничиваем до 15 номинаций
        var displayData = stats.slice(0, 15);
        
        // Создаём массивы для Chart.js
        var labels = [];
        var dataValues = [];
        var i;
        for (i = 0; i < displayData.length; i++) {
            labels.push(displayData[i][0]);
            dataValues.push(displayData[i][1]);
        }

        // Создаём диаграмму
        var ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Голоса',
                    data: dataValues,
                    backgroundColor: '#ff6600',
                    borderColor: '#ff4800',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#ebdecc'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#ebdecc',
                            autoSkip: true,
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

        container.style.display = 'block';
    });
});