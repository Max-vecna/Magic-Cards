// local_db.js
let db;

const DB_CONFIG = {
    name: 'RPGCardsDB',
    version: 1,
    stores: {
        rpgCards: { keyPath: 'id' },
        rpgSpells: { keyPath: 'id' },
        rpgItems: { keyPath: 'id' },
        rpgAttacks: { keyPath: 'id' },
        rpgCategories: { keyPath: 'id' },
        rpgGrimoires: { keyPath: 'id' }
    }
};

export function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

        request.onerror = (event) => {
            console.error("Database error:", event.target.errorCode);
            reject(event.target.errorCode);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log("Database opened successfully.");
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            const transaction = event.target.transaction;
            console.log(`Upgrading database from version ${event.oldVersion} to ${event.newVersion}`);

            Object.keys(DB_CONFIG.stores).forEach(storeName => {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, DB_CONFIG.stores[storeName]);
                    console.log(`Object store '${storeName}' created.`);
                }
            });

             // Exemplo de limpeza de stores antigas se necessário
            for (let i = 0; i < db.objectStoreNames.length; i++) {
                const storeName = db.objectStoreNames[i];
                if (!DB_CONFIG.stores[storeName]) {
                    db.deleteObjectStore(storeName);
                    console.log(`Old object store '${storeName}' deleted.`);
                }
            }
        };
    });
}

export function saveData(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject("Database not open.");
            return;
        }
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export function getData(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject("Database not open.");
            return;
        }
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        
        const request = key ? store.get(key) : store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export function removeData(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject("Database not open.");
            return;
        }
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}


export async function exportDatabase() {
    const exportedData = {};
    const storeNames = Object.keys(DB_CONFIG.stores);

    for (const storeName of storeNames) {
        const data = await getData(storeName);
        // Converte ArrayBuffers para base64 para que possam ser serializados em JSON
        if (Array.isArray(data)) {
             exportedData[storeName] = data.map(item => {
                const newItem = { ...item };
                if (newItem.image instanceof ArrayBuffer) {
                    newItem.image = arrayBufferToBase64(newItem.image);
                }
                if (newItem.backgroundImage instanceof ArrayBuffer) {
                    newItem.backgroundImage = arrayBufferToBase64(newItem.backgroundImage);
                }
                return newItem;
            });
        }
    }

    const jsonString = JSON.stringify(exportedData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rpg_cards_backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function importDatabase(file) {
    const content = await file.text();
    const importedData = JSON.parse(content);

    for (const storeName of Object.keys(importedData)) {
        if (db.objectStoreNames.contains(storeName)) {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            await new Promise(resolve => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = resolve;
            });

            for (const item of importedData[storeName]) {
                 // Converte base64 de volta para ArrayBuffer
                if (item.image && typeof item.image === 'string') {
                    item.image = base64ToArrayBuffer(item.image);
                }
                if (item.backgroundImage && typeof item.backgroundImage === 'string') {
                    item.backgroundImage = base64ToArrayBuffer(item.backgroundImage);
                }
                await store.put(item);
            }
        }
    }
}


export async function exportImagesAsPng() {
    const zip = new JSZip();
    const allCards = await getData('rpgCards');

    const renderPromises = allCards.map(async (card) => {
        const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm');
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '0px';
        document.body.appendChild(container);

        // Renderiza o card com tamanho fixo para consistência
        const cardHtml = await renderFullCharacterSheet(card, false, false, container);
        container.innerHTML = cardHtml;
        const cardElement = container.querySelector('[id^="character-sheet-"]');

        if (cardElement) {
            const canvas = await html2canvas(cardElement, {
                backgroundColor: null,
                scale: 2 
            });
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const safeTitle = card.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            zip.file(`${safeTitle}.png`, blob);
        }
        
        document.body.removeChild(container);
    });

    await Promise.all(renderPromises);

    zip.generateAsync({ type: "blob" }).then(content => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = "personagens_rpg.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    });
}


// Funções auxiliares de conversão
function arrayBufferToBase64(buffer) {
    if (!buffer) return null;
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
    if (!base64) return null;
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}
