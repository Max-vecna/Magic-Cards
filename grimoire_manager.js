import { saveData, getData, removeData } from './local_db.js';
import { populateCharacterSelect } from './character_manager.js';
import { showCustomAlert, showCustomConfirm } from './ui_utils.js';

let currentPageIndex = 0;
let currentGrimoireData = null;
let entryImageFile = null;

// Funções auxiliares para manipulação de arquivos
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e.target.error);
        reader.readAsArrayBuffer(file);
    });
}

function bufferToBlob(buffer, mimeType) {
    return new Blob([buffer], { type: mimeType });
}


/**
 * Função principal para renderizar a tela de gerenciamento de grimórios.
 */
export async function renderGrimoireScreen() {
    const contentDisplay = document.getElementById('content-display');
    contentDisplay.innerHTML = `
        <div class="p-6 w-full max-w-6xl mx-auto">
            <h2 class="text-3xl font-bold text-yellow-300 mb-6 border-b-2 border-gray-700 pb-2">Grimórios e Diários</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- Coluna para adicionar novo -->
                <div class="bg-gray-900/50 p-6 rounded-xl border border-gray-700 h-fit">
                    <h3 class="text-xl font-semibold text-white mb-4">Novo Grimório</h3>
                    <form id="grimoire-form">
                        <div class="space-y-4">
                            <div>
                                <label for="grimoire-title" class="block text-sm font-semibold mb-1">Título</label>
                                <input type="text" id="grimoire-title" placeholder="Ex: Diário de Bordo" required class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600">
                            </div>
                            <div>
                                <label for="grimoire-character" class="block text-sm font-semibold mb-1">Personagem Associado</label>
                                <select id="grimoire-character" required class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"></select>
                            </div>
                            <button type="submit" class="w-full py-2 px-6 rounded-lg font-bold text-white bg-yellow-600 hover:bg-yellow-700 transition-colors">Criar Grimório</button>
                        </div>
                    </form>
                </div>

                <!-- Lista de grimórios existentes -->
                <div id="grimoire-list-container" class="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 h-fit">
                    <!-- Grimórios serão listados aqui -->
                </div>
            </div>
            
            <!-- Modal de Edição de Metadados do Grimório -->
            <div id="edit-metadata-modal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[300]">
                <div class="bg-gray-900 border-2 border-yellow-800/50 text-white rounded-2xl shadow-2xl w-full max-w-md">
                    <div class="p-6">
                        <h3 class="text-xl font-bold text-yellow-300 mb-4">Editar Detalhes do Grimório</h3>
                        <form id="edit-grimoire-metadata-form">
                            <input type="hidden" id="edit-grimoire-id">
                            <div class="space-y-4">
                                <div>
                                    <label for="edit-grimoire-title" class="block text-sm font-semibold mb-1">Título</label>
                                    <input type="text" id="edit-grimoire-title" required class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600">
                                </div>
                                <div>
                                    <label for="edit-grimoire-character" class="block text-sm font-semibold mb-1">Personagem Associado</label>
                                    <select id="edit-grimoire-character" required class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"></select>
                                </div>
                                <div class="flex justify-end gap-3 pt-2">
                                    <button type="button" id="cancel-edit-btn" class="py-2 px-6 rounded-lg font-bold text-white bg-gray-600 hover:bg-gray-700 transition-colors">Cancelar</button>
                                    <button type="submit" class="py-2 px-6 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 transition-colors">Salvar Alterações</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
            
        </div>
    `;

    // Garante que o dropdown de personagem para o novo grimório seja populado
    await populateCharacterSelect('grimoire-character', false);
    
    // Adiciona o dropdown para o modal de edição
    await populateCharacterSelect('edit-grimoire-character', false);
    
    // Adiciona event listeners para o modal de edição de metadados
    setupMetadataModalEventListeners();


    await loadAndDisplayGrimoires();

    document.getElementById('grimoire-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('grimoire-title').value;
        const characterId = document.getElementById('grimoire-character').value;
        
        if (title && characterId) {
            const grimoireData = {
                id: Date.now().toString(),
                title: title,
                characterId: characterId,
                entries: []
            };
            await saveData('rpgGrimoires', grimoireData);
            document.getElementById('grimoire-form').reset();
            await loadAndDisplayGrimoires();
        } else {
            showCustomAlert('Por favor, preencha todos os campos.');
        }
    });
}

/**
 * Configura os event listeners para o modal de edição de metadados do grimório.
 */
function setupMetadataModalEventListeners() {
    const modal = document.getElementById('edit-metadata-modal');
    const form = document.getElementById('edit-grimoire-metadata-form');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    
    // Fechar o modal
    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Submissão do formulário de edição
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const grimoireId = document.getElementById('edit-grimoire-id').value;
        const title = document.getElementById('edit-grimoire-title').value;
        const characterId = document.getElementById('edit-grimoire-character').value;
        
        if (grimoireId && title && characterId) {
            let grimoire = await getData('rpgGrimoires', grimoireId);
            if (grimoire) {
                grimoire.title = title;
                grimoire.characterId = characterId;
                await saveData('rpgGrimoires', grimoire);
                showCustomAlert('Grimório atualizado com sucesso!');
                modal.classList.add('hidden');
                await loadAndDisplayGrimoires(); // Recarrega a lista
            }
        } else {
            showCustomAlert('Por favor, preencha todos os campos.');
        }
    });
}

/**
 * Abre o modal para edição do título e personagem de um grimório.
 */
async function editGrimoireMetadata(grimoireId) {
    const grimoire = await getData('rpgGrimoires', grimoireId);
    if (!grimoire) {
        showCustomAlert("Grimório não encontrado.");
        return;
    }

    // Preenche o modal
    document.getElementById('edit-grimoire-id').value = grimoire.id;
    document.getElementById('edit-grimoire-title').value = grimoire.title;
    document.getElementById('edit-grimoire-character').value = grimoire.characterId;
    
    // Abre o modal
    document.getElementById('edit-metadata-modal').classList.remove('hidden');
}

/**
 * Carrega e exibe a lista de grimórios existentes.
 */
async function loadAndDisplayGrimoires() {
    const listContainer = document.getElementById('grimoire-list-container');
    const allGrimoires = (await getData('rpgGrimoires') || []).sort((a, b) => a.title.localeCompare(b.title));
    const allCharacters = await getData('rpgCards') || [];

    const charactersById = allCharacters.reduce((acc, char) => ({ ...acc, [char.id]: char }), {});

    if (allGrimoires.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500 italic md:col-span-2">Nenhum grimório criado ainda.</p>';
        return;
    }

    listContainer.innerHTML = allGrimoires.map(g => {
        const owner = charactersById[g.characterId];
        const ownerName = owner ? owner.title : 'Desconhecido';
        const pageCount = g.entries?.length || 0;

        return `
            <div class="bg-gray-800/50 rounded-lg overflow-hidden border border-yellow-800/30 flex flex-col justify-between transition-all duration-300 hover:border-yellow-600/50 hover:shadow-2xl hover:shadow-yellow-900/40">
                <div class="p-5 flex-grow">
                    <div class="flex items-start gap-4">
                        <i class="fas fa-book-open text-3xl text-yellow-400/70 mt-1 flex-shrink-0"></i>
                        <div>
                            <h4 class="font-bold text-lg text-yellow-200 truncate" title="${g.title}">${g.title}</h4>
                            <p class="text-xs text-gray-400">Propriedade de: ${ownerName}</p>
                            <p class="text-xs text-gray-400">${pageCount} ${pageCount === 1 ? 'página escrita' : 'páginas escritas'}</p>
                        </div>
                    </div>
                </div>
                <div class="bg-black/20 px-4 py-2 flex gap-2">
                    <button class="flex-1 py-2 px-3 text-sm rounded-md bg-indigo-600 hover:bg-indigo-700 font-semibold flex items-center justify-center gap-2" data-action="view" data-id="${g.id}">
                        <i class="fas fa-book-reader"></i> Abrir
                    </button>
                     <button class="flex-1 py-2 px-3 text-sm rounded-md bg-green-600 hover:bg-green-700 font-semibold flex items-center justify-center gap-2" data-action="edit" data-id="${g.id}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="py-2 px-3 text-sm rounded-md bg-red-700 hover:bg-red-800" data-action="delete" data-id="${g.id}" title="Excluir">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // CORREÇÃO: Adicionando o event listener que estava faltando ou falhando
    // O event listener para os botões "view", "edit" e "delete" do grimório
    listContainer.querySelectorAll('button[data-action]').forEach(button => {
        button.addEventListener('click', async (e) => {
            const action = button.dataset.action;
            const id = button.dataset.id;
            
            if (action === 'delete') {
                if (await showCustomConfirm('Tem certeza que deseja excluir este grimório e todas as suas páginas?')) {
                    await removeData('rpgGrimoires', id);
                    await loadAndDisplayGrimoires();
                }
            } else if (action === 'view') {
                // Abrir Grimório (Visualizar Páginas)
                await openGrimoireViewer(id);
            } else if (action === 'edit') {
                // Editar Metadados (Título/Personagem)
                await editGrimoireMetadata(id);
            }
        });
    });
}

/**
 * Abre o visualizador/editor de um grimório específico.
 */
async function openGrimoireViewer(grimoireId) {
    currentGrimoireData = await getData('rpgGrimoires', grimoireId);
    if (!currentGrimoireData) {
        showCustomAlert("Grimório não encontrado.");
        return;
    }
    
    if (!Array.isArray(currentGrimoireData.entries)) {
        currentGrimoireData.entries = [];
    }

    currentPageIndex = 0;

    // Garante que o container esteja no DOM antes de tentar acessá-lo
    let container = document.getElementById('grimoire-editor-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'grimoire-editor-container';
        container.classList.add('hidden');
        document.body.appendChild(container);
    }
    
    container.innerHTML = `
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-4 z-[200]">
            <div id="grimoire-modal-content" class="bg-gray-900 border-2 border-yellow-800/50 text-white rounded-2xl shadow-2xl w-full max-w-4xl h-[95vh] flex flex-col">
                <div class="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 class="text-2xl font-bold text-yellow-300 truncate">${currentGrimoireData.title}</h2>
                    <button id="close-grimoire-btn" class="text-gray-400 hover:text-white text-2xl w-8 h-8 rounded-full hover:bg-gray-700">&times;</button>
                </div>
                
                <div class="flex-grow flex flex-col md:flex-row p-2 md:p-4 gap-4 overflow-hidden relative">
                    <!-- Coluna de visualização da página -->
                    <div id="page-viewer" class="w-full h-full flex flex-col bg-black/20 rounded-lg p-4 overflow-y-auto"></div>

                    <!-- Botão para abrir o editor em mobile -->
                    <button id="toggle-editor-btn" class="md:hidden absolute bottom-4 right-4 z-20 w-12 h-12 bg-yellow-600 rounded-full flex items-center justify-center text-white shadow-lg">
                        <i class="fas fa-pen"></i>
                    </button>

                    <!-- Coluna de edição/adição (painel deslizante/escondido em mobile) -->
                    <div id="editor-panel" class="absolute md:relative z-10 inset-0 md:inset-auto bg-gray-900 md:bg-transparent transform translate-x-full md:transform-none transition-transform duration-300 ease-in-out md:w-80 flex-shrink-0 flex flex-col gap-4 p-4 md:p-0">
                        <div class="flex justify-between items-center md:hidden">
                            <h3 class="text-lg font-bold text-yellow-200">Editor de Página</h3>
                            <button id="close-editor-panel-btn" class="w-8 h-8 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
                        </div>
                        <div id="page-list" class="bg-black/20 rounded-lg p-2 overflow-y-auto h-32 md:h-40"></div>
                        <form id="page-entry-form" class="bg-black/20 rounded-lg p-4 space-y-3 flex-grow flex flex-col">
                            <h4 id="form-mode-title" class="font-semibold text-lg">Nova Página</h4>
                            <input type="hidden" id="editing-page-index" value="-1">
                            <div>
                                <label for="entry-subtitle" class="text-sm font-medium">Subtítulo</label>
                                <input type="text" id="entry-subtitle" class="w-full mt-1 px-3 py-1.5 bg-gray-700 rounded-md text-sm">
                            </div>
                            <div class="flex-grow flex flex-col">
                                <label for="entry-content" class="text-sm font-medium">Conteúdo</label>
                                <textarea id="entry-content" class="w-full mt-1 px-3 py-1.5 bg-gray-700 rounded-md text-sm flex-grow resize-none"></textarea>
                            </div>
                            <div>
                                <label for="entry-image" class="text-sm font-medium">Imagem</label>
                                <input type="file" id="entry-image" accept="image/*" class="w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-yellow-600 file:text-white hover:file:bg-yellow-700">
                                <img id="entry-image-preview" class="mt-2 w-full h-24 object-contain hidden rounded-md bg-black/20">
                            </div>
                            <div class="flex gap-2">
                                <button type="submit" id="save-entry-btn" class="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 font-bold text-sm">Salvar Página</button>
                                <button type="button" id="clear-form-btn" class="py-2 px-3 rounded-lg bg-gray-600 hover:bg-gray-500 font-bold text-sm" title="Limpar Formulário"><i class="fas fa-undo"></i></button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;
    container.classList.remove('hidden');

    renderCurrentPage();
    renderPageList();
    setupGrimoireEventListeners();
}

/**
 * Renderiza a página atual no painel de visualização.
 */
function renderCurrentPage() {
    const viewer = document.getElementById('page-viewer');
    const entry = currentGrimoireData.entries[currentPageIndex];

    if (!entry) {
        viewer.innerHTML = `<div class="m-auto text-center text-gray-500">
            <i class="fas fa-book-dead text-4xl mb-2"></i>
            <p>Este grimório está vazio.</p>
            <p class="text-sm">Use o formulário ao lado para adicionar a primeira página.</p>
        </div>`;
        return;
    }

    let imageUrl = '';
    if (entry.image && entry.imageMimeType) {
        const blob = bufferToBlob(entry.image, entry.imageMimeType);
        imageUrl = URL.createObjectURL(blob);
    }
    
    // Início da alteração: Estrutura para text wrap (float)
    const imageElement = imageUrl 
        ? `<div class="float-left mr-4 mb-4 sm:max-w-xs md:max-w-sm" style="max-width: 40%;">
               <img src="${imageUrl}" class="w-full h-auto object-contain rounded-md shadow-lg border border-gray-700">
           </div>` 
        : '';

    // O contentElement agora contém tanto a imagem flutuante quanto o texto
    const pageContent = `
        <div class="clearfix">
            ${imageElement}
            <div class="prose prose-invert prose-sm max-w-none text-gray-300 whitespace-pre-wrap">${entry.content || 'Esta página está em branco.'}</div>
        </div>
    `;
    // Fim da alteração
    
    viewer.innerHTML = `
        <div class="flex justify-between items-center mb-4 flex-shrink-0">
            <h3 class="text-xl font-bold text-yellow-100">${entry.subtitle || 'Sem subtítulo'}</h3>
            <span class="text-sm text-gray-400">Página ${currentPageIndex + 1}</span>
        </div>
        
        <!-- Container principal para o conteúdo da página com scroll -->
        <div class="flex-grow overflow-y-auto pr-2">
            ${pageContent}
        </div>
        
        <div class="flex justify-center items-center gap-4 mt-4 pt-4 border-t border-gray-700 flex-shrink-0">
            <button id="prev-page-btn" class="px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50" ${currentPageIndex === 0 ? 'disabled' : ''}>Anterior</button>
            <span>${currentPageIndex + 1} de ${currentGrimoireData.entries.length}</span>
            <button id="next-page-btn" class="px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50" ${currentPageIndex >= currentGrimoireData.entries.length - 1 ? 'disabled' : ''}>Próxima</button>
        </div>
    `;
}

/**
 * Renderiza a lista de páginas para seleção rápida.
 */
function renderPageList() {
    const listEl = document.getElementById('page-list');
    if (currentGrimoireData.entries.length === 0) {
        listEl.innerHTML = '<p class="text-center text-xs text-gray-500 p-2">Nenhuma página.</p>';
        return;
    }

    listEl.innerHTML = currentGrimoireData.entries.map((entry, index) => `
        <div class="flex justify-between items-center p-1.5 rounded-md cursor-pointer ${index === currentPageIndex ? 'bg-indigo-600' : 'hover:bg-gray-700/50'}" data-page-index="${index}">
            <span class="text-xs truncate">${index + 1}. ${entry.subtitle || 'Página sem título'}</span>
            <div class="flex items-center">
                <button class="text-green-400 hover:text-green-300 w-5 h-5 text-xs" title="Editar" data-action="edit-page" data-page-index="${index}"><i class="fas fa-pen"></i></button>
                <button class="text-red-500 hover:text-red-400 w-5 h-5 text-xs" title="Excluir" data-action="delete-page" data-page-index="${index}"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}


/**
 * Configura todos os event listeners para o modal do grimório.
 */
function setupGrimoireEventListeners() {
    const container = document.getElementById('grimoire-editor-container');
    
    // Fechar Modal
    container.querySelector('#close-grimoire-btn').addEventListener('click', () => container.classList.add('hidden'));

    // Navegação de páginas
    const viewer = document.getElementById('page-viewer');
    viewer.addEventListener('click', (e) => {
        if (e.target.id === 'prev-page-btn' && currentPageIndex > 0) {
            currentPageIndex--;
            renderCurrentPage();
            renderPageList();
        }
        if (e.target.id === 'next-page-btn' && currentPageIndex < currentGrimoireData.entries.length - 1) {
            currentPageIndex++;
            renderCurrentPage();
            renderPageList();
        }
    });

    // Toggle do painel de edição em mobile
    const toggleEditorBtn = container.querySelector('#toggle-editor-btn');
    const editorPanel = container.querySelector('#editor-panel');
    const closeEditorPanelBtn = container.querySelector('#close-editor-panel-btn');

    if (toggleEditorBtn && editorPanel && closeEditorPanelBtn) {
        toggleEditorBtn.addEventListener('click', () => {
            editorPanel.classList.remove('translate-x-full');
        });
        closeEditorPanelBtn.addEventListener('click', () => {
            editorPanel.classList.add('translate-x-full');
        });
    }


    // Formulário
    const form = document.getElementById('page-entry-form');
    const imageInput = document.getElementById('entry-image');
    const imagePreview = document.getElementById('entry-image-preview');

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            entryImageFile = file;
            imagePreview.src = URL.createObjectURL(file);
            imagePreview.classList.remove('hidden');
        } else {
            entryImageFile = null;
            imagePreview.classList.add('hidden');
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const subtitle = document.getElementById('entry-subtitle').value;
        const content = document.getElementById('entry-content').value;
        const editingIndex = parseInt(document.getElementById('editing-page-index').value, 10);
        
        const imageBuffer = entryImageFile ? await readFileAsArrayBuffer(entryImageFile) : null;
        const imageMimeType = entryImageFile ? entryImageFile.type : null;

        if (editingIndex > -1) { // Editando
            const page = currentGrimoireData.entries[editingIndex];
            page.subtitle = subtitle;
            page.content = content;
            if (entryImageFile) {
                page.image = imageBuffer;
                page.imageMimeType = imageMimeType;
            } else if (document.getElementById('entry-image').value === '' && !imagePreview.classList.contains('hidden')) {
                 // Mantém a imagem existente se nada foi alterado no input de arquivo e há uma prévia
                 // Nenhuma ação necessária, os dados originais (page.image, page.imageMimeType) são mantidos
            } else if (document.getElementById('entry-image').value === '' && imagePreview.classList.contains('hidden')) {
                // Se o campo de arquivo está vazio E a prévia está escondida, assume-se que a imagem foi removida
                page.image = null;
                page.imageMimeType = null;
            }
            
            // Se a imagem for removida manualmente pelo usuário:
            // Isso requer uma forma de o usuário sinalizar a remoção (um botão 'Remover Imagem'),
            // mas como não existe, manteremos a imagem a menos que um novo arquivo seja carregado.
            // A lógica acima foi ajustada para cobrir a submissão de um novo arquivo ou a manutenção do existente.
            
        } else { // Adicionando
            const newPage = {
                subtitle,
                content,
                image: imageBuffer,
                imageMimeType: imageMimeType
            };
            currentGrimoireData.entries.push(newPage);
            currentPageIndex = currentGrimoireData.entries.length - 1;
        }

        // Salva e atualiza o visualizador/lista
        await saveData('rpgGrimoires', currentGrimoireData);
        clearEntryForm();
        renderCurrentPage();
        renderPageList();
    });

    document.getElementById('clear-form-btn').addEventListener('click', clearEntryForm);

    // Lista de páginas
    const pageList = document.getElementById('page-list');
    pageList.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-page-index]');
        if (!target) return;

        const index = parseInt(target.dataset.pageIndex, 10);
        const action = e.target.closest('[data-action]')?.dataset.action;

        if (action === 'edit-page') {
            const entry = currentGrimoireData.entries[index];
            document.getElementById('form-mode-title').textContent = `Editando Página ${index + 1}`;
            document.getElementById('editing-page-index').value = index;
            document.getElementById('entry-subtitle').value = entry.subtitle || '';
            document.getElementById('entry-content').value = entry.content || '';
            
            // Popula a prévia da imagem existente (se houver)
            if (entry.image && entry.imageMimeType) {
                imagePreview.src = URL.createObjectURL(bufferToBlob(entry.image, entry.imageMimeType));
                imagePreview.classList.remove('hidden');
            } else {
                imagePreview.classList.add('hidden');
            }
            
            // Reseta o estado do arquivo recém-selecionado (se houver) e o input file
            entryImageFile = null;
            document.getElementById('entry-image').value = '';

        } else if (action === 'delete-page') {
            if(await showCustomConfirm(`Deseja excluir a página ${index + 1}?`)) {
                currentGrimoireData.entries.splice(index, 1);
                await saveData('rpgGrimoires', currentGrimoireData);
                // Ajusta o índice da página atual após a exclusão
                currentPageIndex = Math.min(currentPageIndex, currentGrimoireData.entries.length - 1);
                currentPageIndex = Math.max(0, currentPageIndex); // Garante que não é menor que 0
                renderCurrentPage();
                renderPageList();
                clearEntryForm(); // Limpa o formulário após a exclusão
            }

        } else { // Clicou para visualizar
            currentPageIndex = index;
            renderCurrentPage();
            renderPageList();
        }
    });
}

/**
 * Limpa o formulário de edição de página.
 */
function clearEntryForm() {
    document.getElementById('page-entry-form').reset();
    document.getElementById('editing-page-index').value = -1;
    document.getElementById('form-mode-title').textContent = 'Nova Página';
    document.getElementById('entry-image-preview').classList.add('hidden');
    document.getElementById('entry-image-preview').src = '';
    entryImageFile = null;
}
