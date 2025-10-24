import { saveData, getData } from './local_db.js';
import { renderFullItemSheet } from './item_renderer.js';
import { renderFullSpellSheet } from './magic_renderer.js';
import { renderFullAttackSheet } from './attack_renderer.js';
import { getAspectRatio } from './settings_manager.js';

const PERICIAS_DATA = {
     "AGILIDADE": [ "Acrobacia", "Iniciativa", "Montaria", "Furtividade", "Pontaria", "Ladinagem", "Reflexos"],
        "CARISMA": ["Adestramento", "Enganação", "Intimidação", "Persuasão"],
        "INTELIGÊNCIA": ["Arcanismo", "História", "Investigação", "Ofício", "Religião", "Tecnologia"],
        "FORÇA": ["Atletismo", "Luta"],
        "SABEDORIA": ["Intuição", "Percepção", "Natureza", "Vontade", "Medicina", "Sobrevivência"],
        "VIGOR": ["Fortitude"]
};

const periciaToAttributeMap = {};
for (const attribute in PERICIAS_DATA) {
    PERICIAS_DATA[attribute].forEach(periciaName => {
        periciaToAttributeMap[periciaName] = attribute;
    });
}


function bufferToBlob(buffer, mimeType) {
    return new Blob([buffer], { type: mimeType });
}

/**
 * Calcula bônus fixos e temporários de itens, magias e buffs ativos.
 * @param {object} characterData - Os dados do personagem.
 * @param {Array} inventoryItems - Array de objetos de item.
 * @param {Array} magicItems - Array de objetos de magia/habilidade.
 * @returns {object} - { totalFixedBonuses, totalTemporaryBonuses }
 */
function calculateBonuses(characterData, inventoryItems, magicItems) {
    const totalFixedBonuses = {
        vida: 0, mana: 0, armadura: 0, esquiva: 0, bloqueio: 0, deslocamento: 0,
        agilidade: 0, carisma: 0, forca: 0, inteligencia: 0, sabedoria: 0, vigor: 0,
        pericias: {}
    };
    const totalTemporaryBonuses = {};

    // Processar bônus fixos
    [...inventoryItems, ...magicItems].filter(Boolean).forEach(source => {
        if (Array.isArray(source.aumentos)) {
            source.aumentos.forEach(aumento => {
                if (aumento.tipo === 'fixo') {
                    const statName = (aumento.nome || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    if (totalFixedBonuses.hasOwnProperty(statName)) {
                        totalFixedBonuses[statName] += (aumento.valor || 0);
                    } else {
                        // Assume it's a pericia if not a main stat
                        totalFixedBonuses.pericias[aumento.nome] = (totalFixedBonuses.pericias[aumento.nome] || 0) + (aumento.valor || 0);
                    }
                }
            });
        }
    });

    // Processar bônus temporários (activeBuffs)
    if (Array.isArray(characterData.activeBuffs)) {
        characterData.activeBuffs.forEach(buffSource => {
            if(Array.isArray(buffSource.buffs)) {
                buffSource.buffs.forEach(buff => {
                     // Check if buff value is valid before adding
                    if (typeof buff.valor === 'number' && !isNaN(buff.valor) && buff.nome) { // Check buff.nome exists
                        const statName = buff.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        totalTemporaryBonuses[statName] = (totalTemporaryBonuses[statName] || 0) + buff.valor;
                    } else {
                        console.warn(`Invalid buff name or value found in source ${buffSource.sourceName}:`, buff);
                    }
                });
            }
        });
    }
    
    return { totalFixedBonuses, totalTemporaryBonuses };
}

/**
 * Atualiza apenas os elementos visuais de stats na ficha.
 * Esta função é exportada para ser usada pelo navigation_manager.
 * @param {HTMLElement} sheetContainer - O contêiner da ficha (DOM element).
 * @param {object} characterData - Os dados atualizados do personagem.
 */
export async function updateStatDisplay(sheetContainer, characterData) {
    if (!sheetContainer || !characterData) return;

    // Recalcula os bônus com base nos dados mais recentes
    const inventoryItems = characterData.items ? (await Promise.all(characterData.items.map(id => getData('rpgItems', id)))).filter(Boolean) : [];
    const magicItems = characterData.spells ? (await Promise.all(characterData.spells.map(id => getData('rpgSpells', id)))).filter(Boolean) : [];
    const { totalFixedBonuses, totalTemporaryBonuses } = calculateBonuses(characterData, inventoryItems, magicItems);

    const permanentMaxVida = (characterData.attributes.vida || 0) + (totalFixedBonuses.vida || 0);
    const permanentMaxMana = (characterData.attributes.mana || 0) + (totalFixedBonuses.mana || 0);

    // Atualiza Vida
    const vidaEl = sheetContainer.querySelector('[data-stat-current="vida"]');
    if (vidaEl) {
        const tempVidaHtml = (totalTemporaryBonuses.vida || 0) > 0 ? `<span class="text-blue-400 font-semibold ml-1">+${totalTemporaryBonuses.vida}</span>` : '';
        vidaEl.innerHTML = `${characterData.attributes.vidaAtual || 0}${tempVidaHtml}`;
    }
    const vidaMaxContainer = sheetContainer.querySelector('[data-stat-type="vida"]');
    if (vidaMaxContainer) {
        vidaMaxContainer.dataset.statMax = permanentMaxVida; // Atualiza o dataset para o editor
        // *** MODIFICAÇÃO: Seletor mais robusto ***
        const vidaMaxEl = vidaMaxContainer.querySelector('[data-stat-max-display="vida"]');
        if (vidaMaxEl) vidaMaxEl.textContent = permanentMaxVida;
    }


    // Atualiza Mana
    const manaEl = sheetContainer.querySelector('[data-stat-current="mana"]');
    if (manaEl) {
        const tempManaHtml = (totalTemporaryBonuses.mana || 0) > 0 ? `<span class="text-blue-400 font-semibold ml-1">+${totalTemporaryBonuses.mana}</span>` : '';
        manaEl.innerHTML = `${characterData.attributes.manaAtual || 0}${tempManaHtml}`;
    }
    const manaMaxContainer = sheetContainer.querySelector('[data-stat-type="mana"]');
     if (manaMaxContainer) {
        manaMaxContainer.dataset.statMax = permanentMaxMana; // Atualiza o dataset para o editor
        // *** MODIFICAÇÃO: Seletor mais robusto ***
        const manaMaxEl = manaMaxContainer.querySelector('[data-stat-max-display="mana"]');
        if (manaMaxEl) manaMaxEl.textContent = permanentMaxMana;
    }

    // Atualiza Dinheiro
    const dinheiroEl = sheetContainer.querySelector('[data-stat-current="dinheiro"]');
    if (dinheiroEl) {
        dinheiroEl.textContent = characterData.dinheiro || 0;
    }
    
    // ATUALIZAÇÃO BÔNUS: Atualiza também os stats de combate e atributos
    
    // Stats de Combate
    const combatStats = { armadura: 'CA', esquiva: 'ES', bloqueio: 'BL', deslocamento: 'DL' };
    // Target the specific container for combat stats for robustness
    const combatStatsContainer = sheetContainer.querySelector('.grid.grid-cols-6.gap-x-4.gap-y-1.text-xs');
    if (combatStatsContainer) {
        Object.entries(combatStats).forEach(([stat, label]) => {
            // Find the div more reliably by checking the label inside
            const el = Array.from(combatStatsContainer.querySelectorAll('.text-center')).find(e => e.textContent.includes(label));
            if (el) {
                const baseValue = characterData.attributes[stat] || 0;
                const fixedBonus = totalFixedBonuses[stat] || 0;
                const tempBonus = totalTemporaryBonuses[stat] || 0;
                const totalValue = baseValue + fixedBonus + tempBonus; // Calculate total including temp
                const fixedBonusHtml = fixedBonus !== 0 ? `<span class="text-green-400 font-bold ml-1">${fixedBonus > 0 ? '+ ' : ''}${fixedBonus}</span>` : '';
                // MODIFICATION: Show tempBonus for combat stats
                const tempBonusHtml = tempBonus !== 0 ? `<span class="text-blue-400 font-bold ml-1">${tempBonus > 0 ? '+ ' : ''}${tempBonus}</span>` : '';
                const suffix = stat === 'deslocamento' ? 'm' : '';
                // Displaying base + fixed + temp, or just total depending on preference. Let's show base + bonuses.
                // el.innerHTML = `${label}<br>${totalValue}${suffix}`; // Alternative: Show total
                el.innerHTML = `${label}<br>${baseValue}${suffix}${fixedBonusHtml}${tempBonusHtml}`;
            }
        });
        // Atualiza CD (Sabedoria might have temp bonus)
        const sabTotal = (parseInt(characterData.attributes.sabedoria) || 0) + (totalFixedBonuses.sabedoria || 0) + (totalTemporaryBonuses.sabedoria || 0);
        const cdValue = 10 + (parseInt(characterData.level) || 0) + sabTotal;
        const cdEl = Array.from(combatStatsContainer.querySelectorAll('.text-center')).find(e => e.textContent.includes('CD'));
        if(cdEl) cdEl.innerHTML = `CD<br>${cdValue}`;
    }

    // Atributos Principais
    const mainAttributes = ['agilidade', 'carisma', 'forca', 'inteligencia', 'sabedoria', 'vigor'];
    const attributeContainers = sheetContainer.querySelectorAll('.mt-2.flex.items-center.space-x-2.text-xs');
    
    // Calculate max value based on *current* totals including temporary bonuses for scaling
     const currentAttributeValues = mainAttributes.map(attr =>
        (parseInt(characterData.attributes[attr]) || 0) +
        (totalFixedBonuses[attr] || 0) +
        (totalTemporaryBonuses[attr] || 0)
    );
    const maxAttributeValue = Math.max(...currentAttributeValues, 1);

    attributeContainers.forEach(attrContainer => {
        const attrLabelElement = attrContainer.querySelector('span.font-bold.w-8');
        if (!attrLabelElement) return;

        const key = attrLabelElement.getAttribute('title'); // Use title to reliably get the key
        if (!mainAttributes.includes(key)) return; // Ensure it's one of the main attributes

            const baseValue = parseInt(characterData.attributes[key]) || 0;
            const fixedBonus = totalFixedBonuses[key] || 0;
            const tempBonus = totalTemporaryBonuses[key] || 0;
            const fixedBonusHtml = fixedBonus !== 0 ? ` <span class="text-green-400 font-semibold">${fixedBonus > 0 ? '+ ' : ''}${fixedBonus}</span>` : '';
            // MODIFICATION: Show temporary bonus on attributes
            const tempBonusHtml = tempBonus !== 0 ? ` <span class="text-blue-400 font-semibold">${tempBonus > 0 ? '+ ' : ''}${tempBonus}</span>` : '';
            const totalValue = baseValue + fixedBonus + tempBonus;
            const percentage = maxAttributeValue > 0 ? (totalValue * 100) / maxAttributeValue : 0;
            
            const barEl = attrContainer.querySelector('.stat-fill');
            if (barEl) barEl.style.width = `${percentage}%`;
            
            const valueEl = attrContainer.querySelector('.text-xs.font-bold.ml-auto');
            if(valueEl) valueEl.innerHTML = `${baseValue}${fixedBonusHtml}${tempBonusHtml}`; // Show base + bonuses
    });

    // Pericias need full rerender if bonuses change, handle separately if needed
}


async function populateInventory(container, characterData, uniqueId) {
    const scrollArea = container.querySelector(`#inventory-magic-scroll-area-${uniqueId}`);
    if (!scrollArea) return;

    scrollArea.innerHTML = '<div class="p-4 text-center"><i class="fas fa-spinner fa-spin text-gray-400"></i></div>';

    // --- INVENTÁRIO ---
    let inventoryHtml = `<div><h4 class="font-bold text-amber-300 border-b border-amber-300/30 pb-1 mb-2 px-2">Inventário</h4>`;
    if (characterData.items && characterData.items.length > 0) {
        const itemPromises = characterData.items.map(id => getData('rpgItems', id));
        const items = (await Promise.all(itemPromises)).filter(Boolean);
        if (items.length > 0) {
            inventoryHtml += '<div class="grid grid-cols-2 gap-x-4 gap-y-1 px-2">';
            items.forEach(item => {
                let iconHtml = '';
                if (item.image) {
                    const imageUrl = URL.createObjectURL(bufferToBlob(item.image, item.imageMimeType));
                    iconHtml = `<img src="${imageUrl}" class="w-5 h-5 rounded-full object-cover flex-shrink-0" style="image-rendering: pixelated;">`;
                } else {
                    iconHtml = `<i class="fas fa-box w-5 text-center text-gray-400"></i>`;
                }
                inventoryHtml += `
                    <div class="text-xs p-1 rounded hover:bg-white/10 cursor-pointer flex items-center gap-2 truncate" data-id="${item.id}" data-type="item" title="${item.name}">
                        ${iconHtml}
                        <span class="truncate">${item.name}</span>
                    </div>`;
            });
            inventoryHtml += '</div>';
        } else {
             inventoryHtml += '<p class="text-xs text-gray-400 italic px-2">Vazio</p>';
        }
    } else {
        inventoryHtml += '<p class="text-xs text-gray-400 italic px-2">Vazio</p>';
    }
    inventoryHtml += '</div>';

    // --- MAGIAS E HABILIDADES ---
    let magicsHtml = '';
    let skillsHtml = '';

    if (characterData.spells && characterData.spells.length > 0) {
        const magicPromises = characterData.spells.map(id => getData('rpgSpells', id));
        const magicsAndSkills = (await Promise.all(magicPromises)).filter(Boolean);

        const spells = magicsAndSkills.filter(ms => ms.type === 'magia' || !ms.type);
        const skills = magicsAndSkills.filter(ms => ms.type === 'habilidade');

        // --- MAGIAS ---
        magicsHtml = `<div><h4 class="font-bold text-teal-300 border-b border-teal-300/30 pb-1 mb-2 px-2">Magias</h4>`;
        if (spells.length > 0) {
            magicsHtml += '<div class="grid grid-cols-2 gap-x-4 gap-y-1 px-2">';
            spells.forEach(magic => {
                let iconHtml = '';
                if (magic.image) {
                    const imageUrl = URL.createObjectURL(bufferToBlob(magic.image, magic.imageMimeType));
                    iconHtml = `<img src="${imageUrl}" class="w-5 h-5 rounded-full object-cover flex-shrink-0" style="image-rendering: pixelated;">`;
                } else {
                    iconHtml = `<i class="fas fa-magic w-5 text-center text-gray-400"></i>`;
                }
                magicsHtml += `
                    <div class="text-xs p-1 rounded hover:bg-white/10 cursor-pointer flex items-center gap-2 truncate" data-id="${magic.id}" data-type="spell" title="${magic.name}">
                        ${iconHtml}
                        <span class="truncate">${magic.name}</span>
                    </div>`;
            });
            magicsHtml += '</div>';
        } else {
            magicsHtml += '<p class="text-xs text-gray-400 italic px-2">Nenhuma</p>';
        }
        magicsHtml += '</div>';

        // --- HABILIDADES ---
        skillsHtml = `<div><h4 class="font-bold text-cyan-300 border-b border-cyan-300/30 pb-1 mb-2 px-2">Habilidades</h4>`;
        if (skills.length > 0) {
            skillsHtml += '<div class="grid grid-cols-2 gap-x-4 gap-y-1 px-2">';
            skills.forEach(skill => {
                let iconHtml = '';
                if (skill.image) {
                    const imageUrl = URL.createObjectURL(bufferToBlob(skill.image, skill.imageMimeType));
                    iconHtml = `<img src="${imageUrl}" class="w-5 h-5 rounded-full object-cover flex-shrink-0" style="image-rendering: pixelated;">`;
                } else {
                    iconHtml = `<i class="fas fa-fist-raised w-5 text-center text-gray-400"></i>`;
                }
                skillsHtml += `
                    <div class="text-xs p-1 rounded hover:bg-white/10 cursor-pointer flex items-center gap-2 truncate" data-id="${skill.id}" data-type="spell" title="${skill.name}">
                        ${iconHtml}
                        <span class="truncate">${skill.name}</span>
                    </div>`;
            });
            skillsHtml += '</div>';
        } else {
            skillsHtml += '<p class="text-xs text-gray-400 italic px-2">Nenhuma</p>';
        }
        skillsHtml += '</div>';

    } else {
        magicsHtml = `<div><h4 class="font-bold text-teal-300 border-b border-teal-300/30 pb-1 mb-2 px-2">Magias</h4><p class="text-xs text-gray-400 italic px-2">Nenhuma</p></div>`;
        skillsHtml = `<div><h4 class="font-bold text-cyan-300 border-b border-cyan-300/30 pb-1 mb-2 px-2">Habilidades</h4><p class="text-xs text-gray-400 italic px-2">Nenhuma</p></div>`;
    }

    // --- ATAQUES ---
    let attacksHtml = '';
    if (characterData.attacks && characterData.attacks.length > 0) {
        const attackPromises = characterData.attacks.map(id => getData('rpgAttacks', id));
        const attacks = (await Promise.all(attackPromises)).filter(Boolean);

        attacksHtml = `<div><h4 class="font-bold text-red-400 border-b border-red-400/30 pb-1 mb-2 px-2">Ataques</h4>`;
        if (attacks.length > 0) {
            attacksHtml += '<div class="grid grid-cols-2 gap-x-4 gap-y-1 px-2">';
            attacks.forEach(attack => {
                let iconHtml = '';
                if (attack.image) {
                    const imageUrl = URL.createObjectURL(bufferToBlob(attack.image, attack.imageMimeType));
                    iconHtml = `<img src="${imageUrl}" class="w-5 h-5 rounded-full object-cover flex-shrink-0" style="image-rendering: pixelated;">`;
                } else {
                    iconHtml = `<i class="fas fa-khanda w-5 text-center text-gray-400"></i>`;
                }
                attacksHtml += `
                    <div class="text-xs p-1 rounded hover:bg-white/10 cursor-pointer flex items-center gap-2 truncate" data-id="${attack.id}" data-type="attack" title="${attack.name}">
                        ${iconHtml}
                        <span class="truncate">${attack.name}</span>
                    </div>`;
            });
            attacksHtml += '</div>';
        } else {
            attacksHtml += '<p class="text-xs text-gray-400 italic px-2">Nenhum</p>';
        }
        attacksHtml += '</div>';
    } else {
         attacksHtml = `<div><h4 class="font-bold text-red-400 border-b border-red-400/30 pb-1 mb-2 px-2">Ataques</h4><p class="text-xs text-gray-400 italic px-2">Nenhum</p></div>`;
    }

    scrollArea.innerHTML =  magicsHtml + skillsHtml + attacksHtml + inventoryHtml;

    scrollArea.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-id][data-type]');
        if (!target) return;

        const { id, type } = target.dataset;
        if (type === 'item') {
            const itemData = await getData('rpgItems', id);
            if (itemData) await renderFullItemSheet(itemData, true);
        } else if (type === 'spell') {
            const spellData = await getData('rpgSpells', id);
            if (spellData) await renderFullSpellSheet(spellData, true);
        } else if (type === 'attack') {
            const attackData = await getData('rpgAttacks', id);
            if (attackData) await renderFullAttackSheet(attackData, true);
        }
    });
}

function setupStatEditor(characterData, container, initialTempBonuses) { // Renamed parameter
    const sheetContainer = container || document.getElementById('character-sheet-container');
    const modal = document.getElementById('stat-editor-modal');
    if (!sheetContainer || !modal) return;

    const modalContent = modal.querySelector('#stat-editor-content');
    const titleTextEl = modal.querySelector('#stat-editor-title-text');
    const iconEl = modal.querySelector('#stat-editor-icon');
    const inputEl = modal.querySelector('#stat-editor-value');
    const addBtn = modal.querySelector('#stat-editor-add-btn');
    const subtractBtn = modal.querySelector('#stat-editor-subtract-btn');
    // MODIFICAÇÃO: Selecionar o novo botão
    const addTempBtn = modal.querySelector('#stat-editor-add-temp-btn');
    const closeBtn = modal.querySelector('#stat-editor-close-btn');
    const tempContainer = modal.querySelector('#stat-editor-temp-container');
    const tempValueInput = modal.querySelector('#stat-editor-temp-value');

    let currentStat = null;
    let statMax = Infinity; // Permanent max
    let currentTempBonuses = {}; // Local state for temporary bonuses

    const STAT_CONFIG = {
        vida: { title: 'Vida', icon: 'fa-heart', color: 'text-red-400', border: 'border-red-500' },
        mana: { title: 'Mana', icon: 'fa-fire', color: 'text-blue-400', border: 'border-blue-500' },
        dinheiro: { title: 'Dinheiro', icon: 'fa-coins', color: 'text-amber-400', border: 'border-amber-500' }
    };

    const openModal = async (type, max) => { // *** CORREÇÃO: Tornar async
        currentStat = type;
        statMax = max; // Store permanent max
        
        // === CORREÇÃO INÍCIO ===
        // Recarrega os dados do personagem do DB para garantir que 'activeBuffs' está atualizado
        // Isso é crucial porque 'characterData' na closure pode estar obsoleto
        const freshCharacterData = await getData('rpgCards', characterData.id);
        if (freshCharacterData) {
            // Atualiza o objeto 'characterData' na closure com os dados frescos
            // Usamos Object.assign para manter a referência do objeto, mas atualizar suas propriedades
            Object.assign(characterData, freshCharacterData);
        }
        // === CORREÇÃO FIM ===

        const config = STAT_CONFIG[type] || { title: type, icon: 'fa-edit', color: 'text-gray-400', border: 'border-gray-500' };

        Object.values(STAT_CONFIG).forEach(c => {
            modalContent.classList.remove(c.border);
            titleTextEl.parentElement.classList.remove(c.color);
        });

        modalContent.classList.add(config.border);
        titleTextEl.parentElement.classList.add(config.color);
        iconEl.className = `fas ${config.icon}`;
        titleTextEl.textContent = `Editar ${config.title}`;
        inputEl.value = '';
        inputEl.focus();

        // Recalcula bônus temporários AO ABRIR o modal (agora com dados frescos)
        currentTempBonuses = {}; // Reset before recalculating
         if (Array.isArray(characterData.activeBuffs)) {
            characterData.activeBuffs.forEach(buffSource => {
                if(Array.isArray(buffSource.buffs)) {
                    buffSource.buffs.forEach(buff => {
                        if (typeof buff.valor === 'number' && !isNaN(buff.valor) && buff.nome) {
                            const statName = buff.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                            currentTempBonuses[statName] = (currentTempBonuses[statName] || 0) + buff.valor;
                        }
                    });
                }
            });
        }
        // --- FIM Recalculo ---


        if (type === 'vida' || type === 'mana') {
             const tempValue = currentTempBonuses[type.toLowerCase()] || 0;
             // *** DEBUGGING START ***
             console.log(`[DEBUG openModal] Stat: ${type}, Max: ${max}, Calculated Temp Bonus: ${tempValue}`);
             console.log(`[DEBUG openModal] tempValueInput element found:`, tempValueInput ? 'Yes' : 'No');
             // *** DEBUGGING END ***
             if (tempValue > 0) {
                 if (tempValueInput) { // Verifica se o elemento existe
                    tempValueInput.value = tempValue; // Define o valor
                    console.log(`[DEBUG openModal] Successfully set tempValueInput (${tempValueInput.id}) value to:`, tempValue);
                 } else {
                     console.error(`[DEBUG openModal] Element with ID 'stat-editor-temp-value' not found!`);
                 }
                 tempContainer.classList.remove('hidden');
             } else {
                 if (tempValueInput) tempValueInput.value = ''; // Limpa o campo se não houver bônus
                 tempContainer.classList.add('hidden');
             }
        } else {
            tempContainer.classList.add('hidden');
        }

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.add('visible');
        }, 10);
    };

    const closeModal = () => {
        modal.classList.remove('visible');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    };

    const updateStat = (amount) => {
        if (!currentStat || isNaN(amount) || amount === 0) {
            if (amount === 0) closeModal(); // Close if input is 0
            return;
        }

        if (currentStat === 'vida' || currentStat === 'mana') {
            let tempStatName = currentStat.toLowerCase();
            let statCurrent = currentStat === 'vida' ? 'vidaAtual' : 'manaAtual';

            let currentTemp = currentTempBonuses[tempStatName] || 0; // Usa os bônus calculados ao abrir
            let currentValue = characterData.attributes[statCurrent]; // Get current actual points

            if (amount < 0) { // --- Subtracting (Losing HP/Mana) ---
                let remainingDamage = Math.abs(amount);

                // 1. Subtract from temporary points first
                const damageToTemp = Math.min(remainingDamage, currentTemp);
                currentTemp -= damageToTemp;
                remainingDamage -= damageToTemp;

                // --- INÍCIO DA CORREÇÃO ---
                // 2. Update the buff(s) in DB if it was changed
                if (damageToTemp > 0) {
                    let damageToApply = damageToTemp; // Tracker for damage to apply to buffs

                    if (characterData.activeBuffs) {
                        // Iterate through all buff sources
                        for (const buffSource of characterData.activeBuffs) {
                            if (damageToApply === 0) break; // Stop if all damage is applied
                            if (!buffSource.buffs) continue;

                            // Iterate through specific buffs within that source
                            for (const specificBuff of buffSource.buffs) {
                                if (damageToApply === 0) break;

                                // Check if the buff matches the stat being depleted
                                const buffNameNormalized = specificBuff.nome?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                
                                if (buffNameNormalized === tempStatName && specificBuff.valor > 0) {
                                    // Apply damage to this buff
                                    const reduction = Math.min(specificBuff.valor, damageToApply);
                                    specificBuff.valor -= reduction;
                                    damageToApply -= reduction;
                                }
                            }
                        }
                    }
                     
                     // Update local state immediately based on the total damage taken
                     currentTempBonuses[tempStatName] = Math.max(0, currentTemp); // currentTemp was already correctly calculated (currentTemp -= damageToTemp)
                }
                // --- FIM DA CORREÇÃO ---


                // 3. Subtract remaining damage from actual points
                if (remainingDamage > 0) {
                    currentValue = Math.max(0, currentValue - remainingDamage);
                    characterData.attributes[statCurrent] = currentValue;
                }

            } else { // --- Adding (Gaining HP/Mana) ---
                // Add only to actual points, capping at permanent maximum
                let newValue = Math.min(statMax, currentValue + amount);
                characterData.attributes[statCurrent] = newValue;
                // Temporary points are NOT affected by healing/gaining mana
            }

        } else if (currentStat === 'dinheiro') {
            let currentValue = characterData.dinheiro || 0;
            characterData.dinheiro = Math.max(0, currentValue + amount);
        }

        // Clean up buffs that reached zero value (optional, depends on rules)
        if (characterData.activeBuffs) {
            characterData.activeBuffs = characterData.activeBuffs.map(bs => {
                bs.buffs = bs.buffs.filter(b => b.valor > 0); // Remove buffs com valor 0
                return bs;
            }).filter(bs => bs.buffs.length > 0); // Remove fontes de buff que não têm mais buffs
        }


        saveData('rpgCards', characterData).then(async () => { // Make async
             // --- INÍCIO DA MODIFICAÇÃO ---
             // Atualiza apenas o DOM de forma assíncrona
             await updateStatDisplay(sheetContainer, characterData); // await here
             closeModal(); // Fecha o modal após salvar e atualizar o DOM
             // --- FIM DA MODIFICAÇÃO ---
        }).catch(err => {
            console.error("Failed to save character data:", err);
            closeModal(); // Still close modal on error
        });
    };

    // MODIFICAÇÃO: Nova função para adicionar/remover bônus temporário
    const updateTempStat = (amount) => {
        if (!currentStat || isNaN(amount) || amount === 0 || (currentStat !== 'vida' && currentStat !== 'mana')) {
            if (amount === 0) closeModal();
            return;
        }

        if (!characterData.activeBuffs) {
            characterData.activeBuffs = [];
        }

        // Cria um novo objeto de buff
        const newBuff = {
            nome: currentStat, // 'vida' or 'mana'
            valor: amount
        };

        // Procura por uma fonte de "Ajuste Manual"
        const manualBuffSourceId = 'manual-buff-source';
        let manualBuffSource = characterData.activeBuffs.find(bs => bs.sourceId === manualBuffSourceId);

        if (manualBuffSource) {
            // Se a fonte existe, procura por um buff existente para este stat
            let existingBuff = manualBuffSource.buffs.find(b => b.nome === currentStat);
            if (existingBuff) {
                existingBuff.valor += amount; // Adiciona ou subtrai do buff manual existente
            } else {
                manualBuffSource.buffs.push(newBuff); // Adiciona um novo buff (vida ou mana) a esta fonte
            }
        } else {
            // Se a fonte não existe, cria uma nova
            manualBuffSource = {
                sourceId: manualBuffSourceId,
                sourceName: "Ajuste Manual",
                buffs: [newBuff]
            };
            characterData.activeBuffs.push(manualBuffSource);
        }

        // --- Lógica de Limpeza ---
        // Remove buffs com valor 0 ou negativo desta fonte
        manualBuffSource.buffs = manualBuffSource.buffs.filter(b => b.valor > 0);
        // Remove a fonte de buff manual se ela não tiver mais buffs
        characterData.activeBuffs = characterData.activeBuffs.filter(bs => bs.buffs.length > 0);

        // Salva, atualiza a UI e fecha
        saveData('rpgCards', characterData).then(async () => {
            await updateStatDisplay(sheetContainer, characterData);
            closeModal();
        }).catch(err => {
            console.error("Failed to save character data:", err);
            closeModal();
        });
    };


    // --- Event Listener Setup ---
    // Clone and replace buttons to ensure old listeners are removed
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    const newSubtractBtn = subtractBtn.cloneNode(true);
    subtractBtn.parentNode.replaceChild(newSubtractBtn, subtractBtn);
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    // MODIFICAÇÃO: Clonar e substituir o novo botão
    const newAddTempBtn = addTempBtn.cloneNode(true);
    addTempBtn.parentNode.replaceChild(newAddTempBtn, addTempBtn);


    newAddBtn.addEventListener('click', () => updateStat(Math.abs(parseInt(inputEl.value, 10) || 0)));
    newSubtractBtn.addEventListener('click', () => updateStat(-Math.abs(parseInt(inputEl.value, 10) || 0)));
    // MODIFICAÇÃO: Adicionar listener para o botão de tempo
    // Usa o valor exato (positivo ou negativo) do input
    newAddTempBtn.addEventListener('click', () => updateTempStat(parseInt(inputEl.value, 10) || 0));
    newCloseBtn.addEventListener('click', closeModal);

    // Close modal on Escape key
     modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
     // Handle overlay click to close
     modal.addEventListener('click', (e) => {
         if (e.target === modal) {
             closeModal();
         }
     });


    // --- Setup Click Listeners for Stat Icons ---
    sheetContainer.querySelectorAll('[data-action="edit-stat"]').forEach(el => {
        // Clone and replace to remove previous listeners if the sheet is rerendered
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        newEl.addEventListener('click', async () => { // *** CORREÇÃO: Tornar async
            const type = newEl.dataset.statType;
            // Reads the most current max value from the data attribute at click time
            const max = newEl.dataset.statMax ? parseInt(newEl.dataset.statMax, 10) : Infinity;
            await openModal(type, max); // *** CORREÇÃO: Adicionar await
        });
    });
}


export async function renderFullCharacterSheet(characterData, isModal, isInPlay, targetContainer) {
    const sheetContainer = targetContainer || document.getElementById('character-sheet-container');
    if (!sheetContainer && (isModal || isInPlay)) return '';

    if (isModal) {
        const index = document.getElementsByClassName('visible').length;
        sheetContainer.style.zIndex = 100000000 + index;
        sheetContainer.classList.remove('hidden');
    }

    // --- Lógica de cálculo de bônus (agora usa a função) ---
    const inventoryItems = characterData.items ? (await Promise.all(characterData.items.map(id => getData('rpgItems', id)))).filter(Boolean) : [];
    const magicItems = characterData.spells ? (await Promise.all(characterData.spells.map(id => getData('rpgSpells', id)))).filter(Boolean) : [];
    const { totalFixedBonuses, totalTemporaryBonuses } = calculateBonuses(characterData, inventoryItems, magicItems);
    // --- Fim da lógica de bônus ---


    let aspectRatio = isModal || isInPlay ? getAspectRatio() : 10/16;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    let finalWidth, finalHeight;

      if ((windowWidth / aspectRatio) > windowHeight) {
        finalHeight = windowHeight * 0.9;
        finalWidth = finalHeight * aspectRatio;
    } else {
        finalWidth = windowWidth * 0.9;
        finalHeight = finalWidth / aspectRatio;
    }

    const imageUrl = characterData.image ? URL.createObjectURL(bufferToBlob(characterData.image, characterData.imageMimeType)) : 'https://placehold.co/800x600/4a5568/a0aec0?text=Personagem';
    const imageBack = characterData.backgroundImage ? URL.createObjectURL(bufferToBlob(characterData.backgroundImage, characterData.backgroundMimeType)) : imageUrl; // Fallback to char image if no background


    const uniqueId = `char-${characterData.id}-${Date.now()}`;
    const predominantColor = characterData.predominantColor || { color100: '#4a5568' };

    const mainAttributes = ['agilidade', 'carisma', 'forca', 'inteligencia', 'sabedoria', 'vigor'];
    characterData.attributes = characterData.attributes || {};

    // Max attribute for scaling bar should consider temporary bonuses
     const currentAttributeValues = mainAttributes.map(attr =>
        (parseInt(characterData.attributes[attr]) || 0) +
        (totalFixedBonuses[attr] || 0) +
        (totalTemporaryBonuses[attr] || 0)
    );
    const maxAttributeValue = Math.max(...currentAttributeValues, 1);

    const sabTotal = (parseInt(characterData.attributes.sabedoria) || 0) + (totalFixedBonuses.sabedoria || 0) + (totalTemporaryBonuses.sabedoria || 0);
    const cdValue = 10 + (parseInt(characterData.level) || 0) + sabTotal;
    const palette = { borderColor: predominantColor.color100 };

    const origin = isModal || isInPlay ? "" : "transform-origin: top left";

    const transformProp = (isModal || isInPlay) ? 'transform: scale(0.9);' : '';

    let periciasHtml = '<p class="text-xs text-gray-400 italic px-2">Nenhuma perícia selecionada.</p>';
    const allPericias = {};
    if (characterData.attributes.pericias) {
        characterData.attributes.pericias.forEach(p => {
            allPericias[p.name] = { base: p.value, bonus: 0, tempBonus: 0 };
        });
    }

    for (const pName in totalFixedBonuses.pericias) {
        if (!allPericias[pName]) allPericias[pName] = { base: 0, bonus: 0, tempBonus: 0 };
        allPericias[pName].bonus += totalFixedBonuses.pericias[pName];
    }
    for (const pName in totalTemporaryBonuses) {
        // Ensure it's a pericia by checking the map (case-insensitive check might be needed)
        const isPericia = Object.keys(periciaToAttributeMap).some(key => key.toLowerCase() === pName.toLowerCase());
        if (isPericia) {
             // Find the exact name used in allPericias keys, case-insensitively
             const normalizedPName = Object.keys(allPericias).find(k => k.toLowerCase() === pName.toLowerCase());
             if (normalizedPName) { // Check if the character actually has this pericia
                 // if (!allPericias[normalizedPName]) allPericias[normalizedPName] = { base: 0, bonus: 0, tempBonus: 0 }; // Should not be needed if populated from characterData first
                 allPericias[normalizedPName].tempBonus += totalTemporaryBonuses[pName];
            } else {
                 // Handle case where a buff applies to a pericia the character doesn't have trained?
                 // Maybe add it with base 0? Or ignore? Let's add it with base 0.
                 // Find the canonical name from the map first
                 const canonicalName = Object.keys(periciaToAttributeMap).find(key => key.toLowerCase() === pName.toLowerCase());
                 if (canonicalName) {
                    allPericias[canonicalName] = { base: 0, bonus: 0, tempBonus: totalTemporaryBonuses[pName] };
                 }
            }
        }
    }


    const periciasForGrouping = Object.entries(allPericias).map(([name, values]) => ({ name, ...values }));

    if (periciasForGrouping.length > 0) {
        const groupedPericias = periciasForGrouping.reduce((acc, pericia) => {
            const attribute = periciaToAttributeMap[pericia.name] || 'OUTRAS'; // Find attribute based on canonical name
            if (!acc[attribute]) acc[attribute] = [];
            acc[attribute].push(pericia);
            return acc;
        }, {});

        const sortedAttributes = Object.keys(groupedPericias).sort();
        periciasHtml = sortedAttributes.map(attribute => {
            const periciasList = groupedPericias[attribute].sort((a,b) => a.name.localeCompare(b.name)).map(p => { // Sort pericias within group
                const bonusHtml = p.bonus !== 0 ? ` <span class="text-green-400 font-semibold">${p.bonus > 0 ? '+ ' : ''}${p.bonus}</span>` : '';
                // MODIFICATION: Show temporary bonus for pericias
                const tempBonusHtml = p.tempBonus !== 0 ? ` <span class="text-blue-400 font-semibold">${p.tempBonus > 0 ? '+ ' : ''}${p.tempBonus}</span>` : '';
                return `<span class="text-xs text-gray-300">${p.name} ${p.base}${bonusHtml}${tempBonusHtml};</span>`;
            }).join(' ');
            return `<div class="text-left mt-1"><p class="text-xs font-bold text-gray-200 uppercase" style="font-size: 11px;">${attribute}</p><div class="flex flex-wrap gap-x-2 gap-y-1 mb-1">${periciasList}</div></div>`;
        }).join('');
    }

    const combatStats = { armadura: 'CA', esquiva: 'ES', bloqueio: 'BL', deslocamento: 'DL' };
    const combatStatsHtml = Object.entries(combatStats).map(([stat, label]) => {
        const baseValue = characterData.attributes[stat] || 0;
        const fixedBonus = totalFixedBonuses[stat] || 0;
        const tempBonus = totalTemporaryBonuses[stat] || 0;
        const fixedBonusHtml = fixedBonus !== 0 ? `<span class="text-green-400 font-bold ml-1" style='transform>${fixedBonus > 0 ? '+ ' : ''}${fixedBonus}</span>` : '';
        // MODIFICATION: Show temporary bonus for combat stats
        const tempBonusHtml = tempBonus !== 0 ? `<span class="text-blue-400 font-bold ml-1">${tempBonus > 0 ? '+ ' : ''}${tempBonus}</span>` : '';
        const suffix = stat === 'deslocamento' ? 'm' : '';
        // Display base + fixed + temp bonuses
        return `<div class="text-center">${label}<br>${baseValue}${suffix}${fixedBonusHtml}${tempBonusHtml}</div>`;
    }).join('');

    let relationshipsHtml = '';
    if (characterData.relationships && characterData.relationships.length > 0) {
        const relatedCharsData = (await Promise.all(
            characterData.relationships.map(id => getData('rpgCards', id))
        )).filter(Boolean);

        if (relatedCharsData.length > 0) {
            const relationshipCardsHtml = await Promise.all(relatedCharsData.map(async (char) => {
                const miniSheetHtml = await renderFullCharacterSheet(char, false, false);
                return `
                    <div class="related-character-grid-item" data-id="${char.id}">
                        ${miniSheetHtml}
                    </div>
                `;
            }));

            relationshipsHtml = `
                <div id="relationships-grid-${uniqueId}" class="relationships-grid">
                     ${relationshipCardsHtml.join('')}
                </div>
            `;
        }
    }

    // Calculate permanent maximums
    const permanentMaxVida = (characterData.attributes.vida || 0) + (totalFixedBonuses.vida || 0);
    const permanentMaxMana = (characterData.attributes.mana || 0) + (totalFixedBonuses.mana || 0);


    const sheetHtml = `
            <div class="absolute top-6 right-6 z-20 flex flex-col gap-2">
                 <button id="close-sheet-btn-${uniqueId}" class="bg-red-600 hover:text-white thumb-btn" style="display: ${isModal ? 'flex' : 'none'}"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div id="character-sheet-${uniqueId}" class="w-full h-full rounded-lg shadow-2xl overflow-hidden relative text-white" style="${origin}; background-image: url('${imageUrl}'); background-size: cover; background-position: center; box-shadow: 0 0 20px ${predominantColor.color100}; width: ${finalWidth}px; height: ${finalHeight}px; ${transformProp} margin: 0 auto;">
            <div class="w-full h-full" style="background: linear-gradient(-180deg, #000000a4, transparent, transparent, #0000008f, #0000008f, #000000a4); display: flex; align-items: center; justify-content: center;">
                <div class="rounded-lg" style="width: 96%; height: 96%; border: 3px solid ${predominantColor.color100};"></div>
            </div>
            <!-- Vida Display -->
            <div class="absolute top-6 right-4 p-2 rounded-full text-center cursor-pointer" data-action="edit-stat" data-stat-type="vida" data-stat-max="${permanentMaxVida}">
                <i class="fas fa-heart text-red-500 text-5xl fa-beat"></i>
                <div class="absolute inset-0 flex flex-col items-center justify-center font-bold text-white text-xs pointer-events-none">
                    <span data-stat-current="vida">
                        ${characterData.attributes.vidaAtual || 0}
                        ${(totalTemporaryBonuses.vida || 0) > 0 ? `<span class="text-blue-400 font-semibold">+ ${totalTemporaryBonuses.vida}</span>` : ''}
                    </span>
                    <hr style="width: 15px;">
                    <span data-stat-max-display="vida">
                        ${permanentMaxVida}
                    </span>
                </div>
            </div>
            <div class="absolute top-6 left-1/2 -translate-x-1/2 text-center z-10">
                <h3 class="text-2xl font-bold">${characterData.title}</h3>
                <p class="text-md italic text-gray-300">${characterData.subTitle}</p>
            </div>
             <!-- Mana Display -->
            <div class="absolute top-6 left-4 p-2 rounded-full text-center cursor-pointer" style="display: flex; justify-content: center; flex-direction: column;">
                <div class="icon-container mana-icon-container" data-action="edit-stat" data-stat-type="mana" data-stat-max="${permanentMaxMana}">
                    <i class="fas fa-fire text-blue-500 text-5xl"></i>
                    <div class="absolute left-0 right-0 flex flex-col items-center justify-center font-bold text-white text-xs pointer-events-none" style="top: 20px;">
                        <span data-stat-current="mana">
                            ${characterData.attributes.manaAtual || 0}
                            ${(totalTemporaryBonuses.mana || 0) > 0 ? `<span class="text-blue-400 font-semibold">+ ${totalTemporaryBonuses.mana}</span>` : ''}
                        </span>
                        <hr style="width: 15px;">
                        <!-- *** MODIFICAÇÃO: Atributo de dados adicionado *** -->
                        <span data-stat-max-display="mana" style="bottom: 12px;">
                           ${permanentMaxMana}
                        </span>
                    </div>
                </div>
                <div id="lore-icon-${uniqueId}" class="mt-4 rounded-full p-3 flex items-center justify-center text-lg text-yellow-200 cursor-pointer" data-action="toggle-lore" style="top:90px">
                    <i class="fas fa-book" style="font-size: 14px;"></i>
                </div>
                <div class="money-container mt-4 rounded-full p-2 flex items-center justify-center text-sm text-amber-300 font-bold cursor-pointer" data-action="edit-stat" data-stat-type="dinheiro" title="Alterar Dinheiro" style="writing-mode: vertical-rl; text-orientation: upright; top: 141px;">
                    💰$<span data-stat-current="dinheiro">${characterData.dinheiro || 0}</span>
                </div>
            </div>
           

            <div id="lore-modal-${uniqueId}" class="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 hidden transition-opacity duration-300">
                <div class="bg-gray-800 p-8 rounded-lg max-w-xl w-full text-white shadow-lg relative">
                    <button id="close-lore-modal-btn-${uniqueId}" class="absolute top-6 right-6 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full leading-none w-8 h-8 flex items-center justify-center">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                    <h2 class="text-2xl font-bold mb-4 border-b pb-2">Lore do Personagem</h2>
                    <div id="lore-content" class="text-sm leading-relaxed overflow-y-auto max-h-96">
                        <h4>História</h4>
                        <p class="mb-4">${characterData.lore?.historia || "Nenhuma história definida."}</p>
                        <h4>Personalidade</h4>
                        <p class="mb-4">${characterData.lore?.personalidade || "Nenhuma personalidade definida."}</p>
                        <h4>Motivação</h4>
                        <p>${characterData.lore?.motivacao || "Nenhuma motivação definida."}</p>
                    </div>
                </div>
            </div>

            <div class="absolute bottom-0 w-full p-4">
                <div class="pb-4 scrollable-content text-sm text-left" style="display: flex; flex-direction: row; overflow-y: scroll;gap: 12px; scroll-snap-type: x mandatory;">
                    <!-- Página 1: Atributos -->
                    <div class="rounded-3xl w-full" style="scroll-snap-align: start;flex-shrink: 0;min-width: 100%; border-color: ${palette.borderColor}; position: relative; z-index: 1; overflow-y: visible; display: flex; flex-direction: column; justify-content: flex-end;padding: 10px;">
                    <!-- RELATIONSHIPS_BAR -->
                    <div class="grid grid-cols-6 gap-x-4 gap-y-1 text-xs my-2 mb-4">
                            <div class="text-center font-bold" style="color: rgb(0 247 85);">LV<br>${characterData.level || 0}</div>
                            ${combatStatsHtml}
                            <div class="text-center">CD<br>${cdValue}</div>
                        </div>
                        ${mainAttributes.map(key => {
                        const baseValue = parseInt(characterData.attributes[key]) || 0;
                        const fixedBonus = totalFixedBonuses[key] || 0;
                        const tempBonus = totalTemporaryBonuses[key] || 0;
                        const fixedBonusHtml = fixedBonus !== 0 ? ` <span class="text-green-400 font-semibold">${fixedBonus > 0 ? '+ ' : ''}${fixedBonus}</span>` : '';
                         // MODIFICATION: Show temporary bonus on attributes display
                        const tempBonusHtml = tempBonus !== 0 ? ` <span class="text-blue-400 font-semibold">${tempBonus > 0 ? '+ ' : ''}${tempBonus}</span>` : '';
                        const totalValue = baseValue + fixedBonus + tempBonus; // Total value including temp for bar scaling
                        const percentage = maxAttributeValue > 0 ? (totalValue * 100) / maxAttributeValue : 0;
                        return `
                        <div class="mt-2 flex items-center space-x-2 text-xs">
                            <span class="font-bold w-8" title="${key}">${key.slice(0, 3).toUpperCase()}</span>
                            <div class="stat-bar flex-grow rounded-3xl" style="margin-top: 0">
                                <div class="stat-fill h-full rounded-3xl" style="width: ${percentage}%; background: ${palette.borderColor}"></div>
                            </div>
                            <span class="text-xs font-bold ml-auto">${baseValue}${fixedBonusHtml}${tempBonusHtml}</span>
                        </div>
                        `;
                        }).join('')}
                    </div>
                    <!-- Página 2: Perícias -->
                    <div class="pb-4 rounded-3xl w-full" style="scroll-snap-align: start;flex-shrink: 0;min-width: 100%; border-color: ${palette.borderColor}; position: relative; z-index: 1; overflow-y: visible; display: flex; flex-direction: column; justify-content: flex-end;">
                        <div class="pericias-scroll-area flex flex-col gap-2 px-2" style="overflow-y: auto; max-height: 250px;">
                            ${periciasHtml}
                        </div>
                    </div>
                    <!-- Página 3: Inventário & Magias -->
                    <div class="pb-4 rounded-3xl w-full" style="scroll-snap-align: start;flex-shrink: 0;min-width: 100%; position: relative; z-index: 1; display: flex; flex-direction: column; justify-content: flex-end;">
                        <div id="inventory-magic-scroll-area-${uniqueId}" class="space-y-2" style="overflow-y: auto; max-height: 250px;">
                        </div>
                    </div>
                </div>
            </div>

        </div>
    `;

    const finalHtml = sheetHtml.replace('<!-- RELATIONSHIPS_BAR -->', relationshipsHtml);

    sheetContainer.style.background = `url('${imageBack}')`;
    sheetContainer.style.backgroundSize = 'cover';
    sheetContainer.style.backgroundPosition = 'center';
    sheetContainer.style.boxShadow = 'inset 0px 0px 10px 0px black';
    sheetContainer.innerHTML = finalHtml;

    if (isInPlay) {
        sheetContainer.classList.add('in-play-animation');
    }

    const relationshipsGrid = sheetContainer.querySelector(`#relationships-grid-${uniqueId}`);
    if (relationshipsGrid) {
        relationshipsGrid.addEventListener('click', (e) => {
            if (e.target === relationshipsGrid) {
                relationshipsGrid.classList.toggle('expanded');
            }
        });
    }

    sheetContainer.querySelectorAll('.related-character-grid-item').forEach(card => {
        card.addEventListener('click', async (e) => {
            e.stopPropagation();
            const grid = card.parentElement;

            if (!grid.classList.contains('expanded')) {
                grid.classList.add('expanded');
            } else {
                const relatedCharData = await getData('rpgCards', card.dataset.id);
                if (relatedCharData) {
                    const nestedContainer = document.getElementById('nested-sheet-container');
                    await renderFullCharacterSheet(relatedCharData, true, false, nestedContainer);
                }
            }
        });
    });

   // Delay scaling to ensure elements are rendered
   setTimeout(() => {
    sheetContainer.querySelectorAll('.related-character-grid-item').forEach(item => {
        const charSheet = item.querySelector('[id^="character-sheet-"]');
        if (charSheet) {
            // Use clientWidth/Height as getBoundingClientRect might be affected by scale
            const sheetWidth = charSheet.clientWidth;
            const sheetHeight = charSheet.clientHeight;
             if (sheetWidth > 0 && sheetHeight > 0) {
                 item.style.width = `${sheetWidth * 0.11}px`; // Apply scaled width/height
                 item.style.height = `${sheetHeight * 0.11}px`;
            }
        }
    });
}, 100); // Increased delay slightly


    populateInventory(sheetContainer, characterData, uniqueId);

    if (isModal || isInPlay) {
        setTimeout(() => sheetContainer.classList.add('visible'), 10);
    }

    const loreIcon = sheetContainer.querySelector(`#lore-icon-${uniqueId}`);
    const loreModal = sheetContainer.querySelector(`#lore-modal-${uniqueId}`);
    const closeLoreModalBtn = sheetContainer.querySelector(`#close-lore-modal-btn-${uniqueId}`);
    const closeSheetBtn = sheetContainer.querySelector(`#close-sheet-btn-${uniqueId}`);

    const closeSheet = () => {
        sheetContainer.classList.remove('visible');
        const handler = () => {
            sheetContainer.classList.add('hidden');
            sheetContainer.innerHTML = '';
            // Only revoke if they were created
            if (imageUrl && imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
            if (imageBack && imageBack.startsWith('blob:')) URL.revokeObjectURL(imageBack);
            sheetContainer.removeEventListener('transitionend', handler);
        };
        sheetContainer.addEventListener('transitionend', handler);
    };

    if (loreIcon && loreModal && closeLoreModalBtn) {
        loreIcon.addEventListener('click', () => loreModal.classList.remove('hidden'));
        closeLoreModalBtn.addEventListener('click', () => loreModal.classList.add('hidden'));
         // Close lore modal on Escape key
         loreModal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                loreModal.classList.add('hidden');
            }
        });
         // Close lore modal on overlay click
         loreModal.addEventListener('click', (e) => {
             if (e.target === loreModal) {
                 loreModal.classList.add('hidden');
             }
         });
    }

    if (closeSheetBtn) {
         // Clone and replace to remove previous listeners
         const newCloseBtn = closeSheetBtn.cloneNode(true);
         closeSheetBtn.parentNode.replaceChild(newCloseBtn, closeSheetBtn);
        if (isInPlay) {
            newCloseBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('navigateHome'));
            });
        } else {
            newCloseBtn.addEventListener('click', closeSheet);
        }
    }

    // Close sheet on overlay click (only if it's the main modal container)
     sheetContainer.addEventListener('click', (e) => {
        if (e.target === sheetContainer && sheetContainer.id === 'character-sheet-container') { // Check ID
            closeSheet();
        }
    });
     // Close sheet on Escape key (only if it's the main modal container)
     document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sheetContainer.id === 'character-sheet-container' && sheetContainer.classList.contains('visible')) {
            closeSheet();
        }
     });


    if (isModal || isInPlay) {
        // Passa os bônus temporários calculados inicialmente para o editor
        setupStatEditor(characterData, sheetContainer, totalTemporaryBonuses);
    }
    return finalHtml;
}
