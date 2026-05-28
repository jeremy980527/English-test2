// =====================================
// 🌟 1. 自訂彈窗與設定引擎 (Modal & Settings)
// =====================================
window.SilenModal = {
    overlay: null, msg: null, input: null, textarea: null, btnCancel: null, btnConfirm: null, resolvePromise: null,
    
    init: function() {
        this.overlay = document.getElementById('silen-modal-overlay');
        this.msg = document.getElementById('silen-modal-msg');
        this.input = document.getElementById('silen-modal-input');
        this.textarea = document.getElementById('silen-modal-textarea');
        this.btnCancel = document.getElementById('silen-modal-btn-cancel');
        this.btnConfirm = document.getElementById('silen-modal-btn-confirm');

        this.btnConfirm.onclick = () => this.close(true);
        this.btnCancel.onclick = () => this.close(false);
    },
    
    open: function(type, message, defaultValue = '') {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.msg.innerText = message;
            this.input.classList.add('hidden');
            this.textarea.classList.add('hidden');
            this.btnCancel.classList.add('hidden');

            if (type === 'confirm') {
                this.btnCancel.classList.remove('hidden');
            } else if (type === 'prompt') {
                this.btnCancel.classList.remove('hidden');
                if (defaultValue.includes('\n') || defaultValue.length > 40) {
                    this.textarea.classList.remove('hidden');
                    this.textarea.value = defaultValue;
                    setTimeout(() => { this.textarea.focus(); this.textarea.select(); }, 150);
                } else {
                    this.input.classList.remove('hidden');
                    this.input.value = defaultValue;
                    setTimeout(() => { this.input.focus(); this.input.select(); }, 150);
                }
            }

            this.overlay.classList.remove('hidden');
            void this.overlay.offsetWidth; 
            this.overlay.classList.add('show');
        });
    },
    
    close: function(isConfirm) {
        this.overlay.classList.remove('show');
        setTimeout(() => {
            this.overlay.classList.add('hidden');
            if (this.resolvePromise) {
                if (this.btnCancel.classList.contains('hidden')) {
                    this.resolvePromise(true); 
                } else if (this.input.classList.contains('hidden') && this.textarea.classList.contains('hidden')) {
                    this.resolvePromise(isConfirm); 
                } else {
                    if (!isConfirm) {
                        this.resolvePromise(null); 
                    } else {
                        let val = !this.textarea.classList.contains('hidden') ? this.textarea.value : this.input.value;
                        this.resolvePromise(val); 
                    }
                }
                this.resolvePromise = null;
            }
        }, 200);
    },
    
    alert: function(message) { return this.open('alert', message); },
    confirm: function(message) { return this.open('confirm', message); },
    prompt: function(message, defaultValue) { return this.open('prompt', message, defaultValue); }
};

window.SilenSettings = {
    overlay: null,
    
    init: function() {
        this.overlay = document.getElementById('silen-settings-overlay');
        this.render();
    },
    
    open: function() {
        this.render();
        this.overlay.classList.remove('hidden');
        void this.overlay.offsetWidth;
        this.overlay.classList.add('show');
    },
    
    close: function() {
        this.overlay.classList.remove('show');
        setTimeout(() => this.overlay.classList.add('hidden'), 200);
    },
    
    render: function() {
        const elPronounce = document.getElementById('set-pronounce');
        const elSequential = document.getElementById('set-sequential');
        const elPresence = document.getElementById('set-presence');
        
        if (elPronounce) elPronounce.checked = autoPronounce;
        if (elSequential) elSequential.checked = isSequentialMode;
        if (elPresence) elPresence.checked = showPresence;
        
        const badge = document.getElementById('online-presence-badge');
        if(badge) {
            badge.style.display = showPresence ? 'flex' : 'none';
        }
    }
};

window.toggleSetting = function(type) {
    if (type === 'pronounce') { 
        autoPronounce = !autoPronounce; 
        localStorage.setItem('sv_autoPronounce', autoPronounce); 
    }
    if (type === 'sequential') { 
        isSequentialMode = !isSequentialMode; 
        localStorage.setItem('sv_sequential', isSequentialMode); 
    }
    if (type === 'presence') { 
        showPresence = !showPresence; 
        localStorage.setItem('sv_showPresence', showPresence); 
    }
    window.SilenSettings.render();
};

// =====================================
// 2. 全局變數與基礎邏輯 (Globals)
// =====================================
window.books = JSON.parse(localStorage.getItem('sv_books')) || [];
let autoPronounce = JSON.parse(localStorage.getItem('sv_autoPronounce')) ?? true; 
let isSequentialMode = JSON.parse(localStorage.getItem('sv_sequential')) ?? false;
let showPresence = JSON.parse(localStorage.getItem('sv_showPresence')) ?? true;

let currentBookId = null;
let practiceQueue = [];
let currentCardIndex = 0;
let initialQueueLength = 0;
let completedCount = 0;
let currentMode = '';
let selectedBookIds = new Set();
let lastAnswerCorrect = false;

let puzzleCurrentWord = null, puzzleUserAnswer = [], puzzleSourceLetters = [];
let memoryCards = [], memoryFlipped = [], memoryLocked = false, memoryMatchedCount = 0;

let isGuestMode = false;
let guestWords = [];

let recognition = null;
try {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
    }
} catch(e) {
    console.error("語音 API 初始化失敗", e);
}

window.saveData = function() { 
    localStorage.setItem('sv_books', JSON.stringify(window.books)); 
};

// 🌟 視窗陣列加入了 'profile'
const views = ['landing', 'home', 'book-select', 'edit', 'practice', 'mcq', 'speaking', 'puzzle', 'memory', 'youglish', 'mastery', 'profile'];

window.switchView = function(viewName) {
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) {
            if (v === viewName) { 
                el.classList.remove('hidden'); 
                el.style.setProperty('display', 'block', 'important'); 
            } else { 
                el.classList.add('hidden'); 
                el.style.setProperty('display', 'none', 'important'); 
            }
        }
    });
};

function setDisplayState(id, isDisplay, displayType = 'block') {
    const el = document.getElementById(id);
    if (el) {
        if (isDisplay) { 
            el.classList.remove('hidden'); 
            el.style.setProperty('display', displayType, 'important'); 
        } else { 
            el.classList.add('hidden'); 
            el.style.setProperty('display', 'none', 'important'); 
        }
    }
}

window.goHome = function() { 
    if (typeof window.updateHomeSummary === 'function') window.updateHomeSummary(); 
    if (window.SilenSettings && typeof window.SilenSettings.render === 'function') window.SilenSettings.render(); 
    window.switchView('home'); 
};

window.openBookSelect = function() { 
    if (typeof window.renderBookList === 'function') window.renderBookList(); 
    window.switchView('book-select'); 
};

window.quitPractice = function() { 
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
    }
    
    if (isGuestMode) {
        isGuestMode = false;
        document.querySelectorAll('.btn-quit').forEach(btn => btn.innerText = '結束');
        document.querySelectorAll('.export-quiz-btn').forEach(btn => btn.style.setProperty('display', 'inline-block', 'important'));
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.reload();
        return;
    }
    window.goHome(); 
};

// 🌟 側邊導覽列開關邏輯
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar || !overlay) return;
    
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('show');
    }
};

// =====================================
// 🌟 3. 發聲核心
// =====================================
function speakEnglishWord(word) {
    if (!autoPronounce && !window.forceSpeak) return; 
    
    if (window.AndroidBridge && typeof window.AndroidBridge.speak === 'function') {
        try {
            window.AndroidBridge.speak(word);
        } catch (e) {
            console.error("Bridge Error:", e);
        }
    } else if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = 'en-US'; 
        utterance.rate = 0.95; 
        window.speechSynthesis.speak(utterance);
    }
    window.forceSpeak = false;
}

window.replayAudio = function() { 
    window.forceSpeak = true; 
    if (practiceQueue[currentCardIndex]) {
        speakEnglishWord(practiceQueue[currentCardIndex].en); 
    }
};

function requeueWord(word) {
    let remaining = practiceQueue.length - 1 - currentCardIndex;
    if (remaining <= 0) {
        practiceQueue.push(word);
    } else {
        let minIndex = currentCardIndex + 1;
        if (remaining > 1) minIndex = currentCardIndex + 2; 
        let maxIndex = practiceQueue.length;
        let randomIndex = Math.floor(Math.random() * (maxIndex - minIndex + 1)) + minIndex;
        practiceQueue.splice(randomIndex, 0, word);
    }
}

function endQuiz() {
    if (isGuestMode) {
        window.SilenModal.confirm("測驗結束。\n\n您要將這份分享的單字庫儲存到您的雲端帳戶中嗎？").then((agreed) => {
            if (agreed) {
                window.SilenModal.prompt("請為這份單字簿命名：", "分享引入的單字簿").then((newName) => {
                    if (newName) {
                        window.books.push({ id: Date.now(), name: newName, tag: "外部分享", words: guestWords });
                        window.saveData();
                        window.SilenModal.alert("已成功匯入單字庫中。").then(() => window.quitPractice());
                    } else {
                        window.quitPractice();
                    }
                });
            } else {
                window.quitPractice();
            }
        });
    } else {
        window.SilenModal.alert("測驗結束，做得好。").then(() => window.quitPractice());
    }
}

// =====================================
// 🌟 4. 分享與連網功能
// =====================================
window.shareCurrentQuiz = async function() {
    if (typeof window.uploadShareData !== 'function') {
        window.SilenModal.alert("系統雲端模組載入中，請稍候重試。");
        return;
    }

    let wordsToShare = practiceQueue;
    if (practiceQueue.length > 50) {
        window.SilenModal.alert("提醒：為了最優化傳輸，系統將截取前 50 個單字作為測驗分享包。");
        wordsToShare = practiceQueue.slice(0, 50);
    }
    
    let view = 'practice';
    if (!document.getElementById('view-mcq').classList.contains('hidden')) view = 'mcq';
    else if (!document.getElementById('view-speaking').classList.contains('hidden')) view = 'speaking';
    else if (!document.getElementById('view-puzzle').classList.contains('hidden')) view = 'puzzle';
    else if (!document.getElementById('view-memory').classList.contains('hidden')) view = 'memory';
    else if (!document.getElementById('view-youglish').classList.contains('hidden')) view = 'youglish';

    const minifiedWords = wordsToShare.map(w => [w.en, ...w.zh]);
    const shareData = [view, currentMode, isSequentialMode ? 1 : 0, minifiedWords];

    const btn = document.querySelector('.export-quiz-btn');
    let oldText = "分享測驗";
    if (btn) {
        oldText = btn.innerText;
        btn.innerText = "產生中...";
        btn.disabled = true;
    }

    const shareId = await window.uploadShareData(shareData);
    
    if (btn) {
        btn.innerText = oldText;
        btn.disabled = false;
    }

    if (!shareId) {
        window.SilenModal.alert("產生失敗，請檢查網路連線。");
        return;
    }

    const shareUrl = window.location.origin + window.location.pathname + '?q=' + shareId;

    if (navigator.share) {
        navigator.share({
            title: 'SilenVocab 英文挑戰',
            text: '我建立了一個專屬單字測驗，快來挑戰看看吧！',
            url: shareUrl
        }).catch((e) => console.log("分享選單關閉", e));
    } else if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            window.SilenModal.alert("短網址已成功複製到剪貼簿！\n\n" + shareUrl);
        }).catch(() => {
            window.SilenModal.prompt("請手動複製以下短網址：", shareUrl);
        });
    } else {
        window.SilenModal.prompt("請手動複製以下短網址：", shareUrl);
    }
};

function checkShareUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    
    const qId = urlParams.get('q');
    if (qId) {
        const tryDownload = () => {
            if (typeof window.downloadShareData === 'function') {
                window.downloadShareData(qId).then(decoded => {
                    if (decoded) {
                        const finalData = { 
                            v: decoded[0], 
                            m: decoded[1], 
                            s: decoded[2] === 1, 
                            w: decoded[3].map(arr => ({ en: arr[0], zh: arr.slice(1) })) 
                        };
                        window.isGuestMode = true; 
                        startGuestMode(finalData);
                    } else {
                        window.SilenModal.alert("這份分享測驗已失效或不存在。").then(() => {
                            window.history.replaceState({}, document.title, window.location.pathname);
                            window.location.reload();
                        });
                    }
                });
            } else {
                setTimeout(tryDownload, 100); 
            }
        };
        tryDownload();
        return true; 
    }
    
    const lzCode = urlParams.get('lz');
    if (lzCode) {
        try {
            if (typeof LZString === 'undefined') { 
                setTimeout(checkShareUrl, 100); 
                return true; 
            }
            const jsonStr = LZString.decompressFromEncodedURIComponent(lzCode);
            if (!jsonStr) throw new Error("解壓縮失敗");
            
            const decoded = JSON.parse(jsonStr);
            const finalData = { 
                v: decoded[0], 
                m: decoded[1], 
                s: decoded[2] === 1, 
                w: decoded[3].map(arr => ({ en: arr[0], zh: arr.slice(1) })) 
            };
            window.isGuestMode = true; 
            startGuestMode(finalData); 
            return true;
        } catch(e) { 
            window.SilenModal.alert("無效的分享連結。"); 
            return false; 
        }
    }
    
    let shareCode = urlParams.get('s') || urlParams.get('share');
    if (shareCode) {
        try {
            shareCode = shareCode.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
            while (shareCode.length % 4) { shareCode += '='; }
            const jsonStr = decodeURIComponent(escape(atob(shareCode)));
            const decoded = JSON.parse(jsonStr);
            
            let finalData;
            if (Array.isArray(decoded)) { 
                finalData = { 
                    v: decoded[0], 
                    m: decoded[1], 
                    s: decoded[2] === 1, 
                    w: decoded[3].map(arr => ({ en: arr[0], zh: arr.slice(1) })) 
                }; 
            } else { 
                finalData = decoded; 
            }
            window.isGuestMode = true;
            startGuestMode(finalData); 
            return true;
        } catch(e) { 
            window.SilenModal.alert("過期的分享連結。"); 
            return false; 
        }
    }
    return false;
}

function startGuestMode(data) {
    isGuestMode = true; 
    guestWords = data.w; 
    practiceQueue = [...data.w]; 
    currentMode = data.m; 
    isSequentialMode = data.s;
    
    initialQueueLength = practiceQueue.length; 
    completedCount = 0; 
    currentCardIndex = 0;

    document.querySelectorAll('.export-quiz-btn').forEach(btn => btn.style.setProperty('display', 'none', 'important'));
    document.querySelectorAll('.btn-quit').forEach(btn => btn.innerText = '離開');

    if (data.v === 'mcq') {
        document.getElementById('mcq-mode-display').innerText = (currentMode === 'zh-to-en' ? '中選英' : '英選中') + ' (分享對戰)';
        setDisplayState('mcq-seq-badge', isSequentialMode, 'inline-block'); 
        window.switchView('mcq'); 
        showMcqNextCard();
    } else if (data.v === 'speaking') { 
        window.switchView('speaking'); 
        showNextSpeakingCard();
    } else if (data.v === 'puzzle') { 
        setDisplayState('puzzle-seq-badge', isSequentialMode, 'inline-block'); 
        window.switchView('puzzle'); 
        loadPuzzleLevel();
    } else if (data.v === 'memory') { 
        setupMemoryModeGuest();
    } else if (data.v === 'youglish') { 
        window.switchView('youglish'); 
        loadYouglishCard();
    } else {
        document.getElementById('mode-display').innerText = (currentMode === 'zh-to-en' ? '中翻英' : '英翻中') + ' (分享對戰)';
        setDisplayState('sequential-badge', isSequentialMode, 'inline-block'); 
        setDisplayState('hint-btn', currentMode === 'zh-to-en', 'inline-block');
        window.switchView('practice'); 
        showNextCard();
    }
}

// =====================================
// 🌟 5. 單字簿管理 (包含 SortableJS 拖曳排序)
// =====================================
window.updateHomeSummary = function() {
    const summaryEl = document.getElementById('home-book-summary');
    if (!summaryEl) return;
    
    let selectedCount = 0, wordCount = 0;
    window.books.forEach(b => { 
        if (selectedBookIds.has(b.id)) { 
            selectedCount++; 
            wordCount += b.words.length; 
        } 
    });
    
    if (selectedCount === 0) {
        summaryEl.innerHTML = '<span style="color:var(--text-sub);">尚未勾選範圍。請進入控制區選取單字簿。</span>';
    } else {
        summaryEl.innerHTML = `已選取 <span style="color:var(--accent); font-weight:500;">${selectedCount}</span> 本單字簿，共計 <span style="color:var(--accent); font-weight:500;">${wordCount}</span> 字`;
    }
};

window.renderBookList = function() {
    const normalList = document.getElementById('normal-book-list');
    const gsatList = document.getElementById('gsat-book-list');
    
    if (normalList) normalList.innerHTML = '';
    if (gsatList) gsatList.innerHTML = '';

    const renderGroup = (booksToRender, container, emptyMsg, isGsat) => {
        if (booksToRender.length === 0) {
            container.innerHTML = `<div style="color:var(--text-sub); text-align:center; padding: 20px;">${emptyMsg}</div>`;
            return;
        }
        
        const groups = {};
        booksToRender.forEach(book => {
            const t = (book.tag && book.tag.trim() !== '') ? book.tag.trim() : '未分類';
            if (!groups[t]) groups[t] = [];
            groups[t].push(book);
        });

        const keys = Object.keys(groups).sort((a, b) => {
            if (a === '未分類') return 1;
            if (b === '未分類') return -1;
            return a.localeCompare(b);
        });

        keys.forEach(k => {
            const headerWrap = document.createElement('div');
            headerWrap.style.display = 'flex';
            headerWrap.style.justifyContent = 'space-between';
            headerWrap.style.alignItems = 'center';
            headerWrap.style.marginTop = '15px';
            headerWrap.style.marginBottom = '10px';

            const header = document.createElement('div');
            header.className = 'group-title';
            header.innerText = k;
            header.style.margin = '0';

            const sortBtn = document.createElement('button');
            sortBtn.className = 'btn-icon sort-toggle';
            sortBtn.innerHTML = '⋮'; 
            sortBtn.title = '排序單字簿';

            headerWrap.appendChild(header);
            headerWrap.appendChild(sortBtn);
            container.appendChild(headerWrap);

            const listContainer = document.createElement('div');
            listContainer.className = 'sortable-group';
            listContainer.dataset.tag = k;

            sortBtn.onclick = (e) => {
                const isActive = listContainer.classList.toggle('sorting-active');
                e.currentTarget.classList.toggle('active', isActive);
                listContainer.querySelectorAll('.drag-handle').forEach(el => el.classList.toggle('hidden', !isActive));
                listContainer.querySelectorAll('.book-checkbox').forEach(el => el.classList.toggle('hidden', isActive));
                listContainer.querySelectorAll('.edit-btn').forEach(el => el.classList.toggle('hidden', isActive));
            };

            groups[k].forEach(book => {
                const div = document.createElement('div');
                div.className = `card book-item ${selectedBookIds.has(book.id) ? 'selected' : ''}`;
                div.dataset.id = book.id; 
                
                const wrapper = document.createElement('div');
                wrapper.className = 'checkbox-wrapper';
                wrapper.style.flex = '1';
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';

                const dragHandle = document.createElement('span');
                dragHandle.className = 'drag-handle hidden';
                dragHandle.innerHTML = '☰';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'book-checkbox';
                checkbox.checked = selectedBookIds.has(book.id);
                checkbox.style.pointerEvents = 'none';
                
                const info = document.createElement('div');
                info.style.flex = '1';
                info.style.marginLeft = '15px';
                info.innerHTML = `<strong>${book.name}</strong> <span style="font-size:0.8rem; color:var(--text-sub)">(${book.words.length} 字)</span>`;
                
                wrapper.appendChild(dragHandle);
                wrapper.appendChild(checkbox);
                wrapper.appendChild(info);
                
                const editBtn = document.createElement('button');
                editBtn.className = 'btn-icon edit-btn';
                editBtn.innerHTML = '編輯'; 
                editBtn.onclick = (e) => {
                    e.stopPropagation();
                    window.openEditBook(book.id);
                };
                
                div.appendChild(wrapper);
                div.appendChild(editBtn);
                
                div.onclick = (e) => {
                    if (listContainer.classList.contains('sorting-active')) return;
                    if (selectedBookIds.has(book.id)) {
                        selectedBookIds.delete(book.id);
                    } else {
                        selectedBookIds.add(book.id);
                    }
                    window.renderBookList();
                };
                listContainer.appendChild(div);
            });

            container.appendChild(listContainer);

            if (typeof Sortable !== 'undefined') {
                new Sortable(listContainer, {
                    handle: '.drag-handle',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    touchStartThreshold: 3, 
                    onEnd: function() {
                        window.handleSortEnd(k, listContainer, isGsat);
                    }
                });
            }
        });
    };

    const normalBooks = window.books.filter(b => !b.isGSAT);
    const gsatBooks = window.books.filter(b => b.isGSAT);

    if (normalList) renderGroup(normalBooks, normalList, '資料庫無單字簿，請在下方建立。', false);
    if (gsatList) renderGroup(gsatBooks, gsatList, '尚無學測單字簿，請在下方抽取。', true);

    if(typeof window.updateHomeSummary === 'function') window.updateHomeSummary();
};

window.handleSortEnd = function(tag, listContainer, isGsat) {
    const newOrderIds = Array.from(listContainer.children).map(el => Number(el.dataset.id));
    let indices = [];
    
    window.books.forEach((b, index) => {
        const t = (b.tag && b.tag.trim() !== '') ? b.tag.trim() : '未分類';
        const bIsGsat = !!b.isGSAT;
        if (t === tag && bIsGsat === isGsat) {
            indices.push(index);
        }
    });

    if (indices.length !== newOrderIds.length) return;

    let bookMap = {};
    window.books.forEach(b => bookMap[b.id] = b);

    indices.forEach((globalIndex, i) => {
        const newId = newOrderIds[i];
        window.books[globalIndex] = bookMap[newId];
    });

    window.saveData();
};

window.handleFileUpload = function(event) {
    const file = event.target.files[0]; 
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) { 
        document.getElementById('import-content').value = e.target.result; 
        event.target.value = ''; 
    };
    reader.readAsText(file);
};

window.toggleImportArea = function() {
    const area = document.getElementById('import-area');
    if (area.classList.contains('hidden')) { 
        setDisplayState('import-area', true); 
        setDisplayState('btn-create-simple', false); 
    } else { 
        setDisplayState('import-area', false); 
        setDisplayState('btn-create-simple', true); 
    }
};

window.addBookSimple = function() {
    const name = document.getElementById('new-book-name').value.trim();
    const tag = document.getElementById('new-book-tag').value.trim();
    if (!name) { window.SilenModal.alert("請輸入單字簿名稱"); return; }
    window.books.push({ id: Date.now(), name: name, tag: tag, words: [], isGSAT: false }); 
    window.saveData(); 
    document.getElementById('new-book-name').value = ''; 
    document.getElementById('new-book-tag').value = ''; 
    window.renderBookList();
};

window.addBookWithImport = function() {
    const name = document.getElementById('new-book-name').value.trim();
    const tag = document.getElementById('new-book-tag').value.trim();
    const rawText = document.getElementById('import-content').value.trim();
    if (!name) { window.SilenModal.alert("請輸入單字簿名稱"); return; } 
    if (!rawText) { window.SilenModal.alert("請輸入轉換內容"); return; }
    
    const lines = rawText.split('\n');
    const newWords = [];
    lines.forEach(line => {
        let separatorIndex = line.indexOf('-'); 
        if (separatorIndex === -1) separatorIndex = line.indexOf('–'); 
        if (separatorIndex > 0) {
            const en = line.substring(0, separatorIndex).trim();
            const zhStr = line.substring(separatorIndex + 1).trim();
            if (en && zhStr) {
                const zh = zhStr.split(/[;；,，\/]/).map(s => s.trim()).filter(s => s);
                newWords.push({ en: en, zh: zh });
            }
        }
    });
    
    if (newWords.length === 0) { 
        window.SilenModal.alert("格式解析失敗，請採用「英文 - 中文」結構"); 
        return; 
    }
    window.books.push({ id: Date.now(), name: name, tag: tag, words: newWords, isGSAT: false }); 
    window.saveData();
    document.getElementById('new-book-name').value = ''; 
    document.getElementById('new-book-tag').value = ''; 
    document.getElementById('import-content').value = ''; 
    window.toggleImportArea(); 
    window.renderBookList(); 
    window.SilenModal.alert(`成功匯入 ${newWords.length} 個單字。`);
};

window.toggleExportMenu = function() {
    const menu = document.getElementById('export-menu'); 
    menu.classList.toggle('active');
};

window.exportBook = function(type) {
    const book = window.books.find(b => b.id === currentBookId);
    if (!book || book.words.length === 0) { 
        window.SilenModal.alert("無可用數據匯出。"); 
        window.toggleExportMenu(); 
        return; 
    }
    const content = book.words.map(w => `${w.en} - ${w.zh.join(' / ')}`).join('\n');
    if (type === 'copy') {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(content).then(() => window.SilenModal.alert("已複製到剪貼簿。"))
            .catch(() => window.SilenModal.prompt("請複製以下內容：", content));
        } else {
            window.SilenModal.prompt("請複製以下內容：", content);
        }
    } else if (type === 'download') {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob); 
        const a = document.createElement('a'); 
        a.href = url;
        a.download = `${book.name || 'Export'}.txt`; 
        document.body.appendChild(a); 
        a.click();
        document.body.removeChild(a); 
        URL.revokeObjectURL(url);
    }
    window.toggleExportMenu();
};

document.addEventListener('click', function(event) {
    const menu = document.getElementById('export-menu'); 
    const exportBtn = document.querySelector('.nav-bar-right .btn-icon');
    if (menu && menu.classList.contains('active') && !menu.contains(event.target) && event.target !== exportBtn) {
        menu.classList.remove('active');
    }
});

window.deleteCurrentBook = function() {
    window.SilenModal.confirm('確定要永久刪除此單字簿嗎？').then((agreed) => {
        if(agreed) { 
            window.books = window.books.filter(b => b.id !== currentBookId); 
            selectedBookIds.delete(currentBookId); 
            window.saveData(); 
            window.openBookSelect(); 
        }
    });
};

window.openEditBook = function(id) { 
    currentBookId = id; 
    const book = window.books.find(b => b.id === id);
    document.getElementById('edit-book-name-input').value = book.name; 
    document.getElementById('edit-book-tag-input').value = book.tag || '';
    document.getElementById('export-menu').classList.remove('active'); 
    renderWordList(); 
    window.switchView('edit'); 
};

window.saveBookInfo = function() {
    const book = window.books.find(b => b.id === currentBookId); 
    if(!book) return;
    const newName = document.getElementById('edit-book-name-input').value.trim(); 
    const newTag = document.getElementById('edit-book-tag-input').value.trim();
    if(!newName) { window.SilenModal.alert('單字簿名稱不能為空。'); return; }
    book.name = newName; 
    book.tag = newTag; 
    window.saveData(); 
    window.SilenModal.alert('資訊已更新。');
};

function renderWordList() {
    const book = window.books.find(b => b.id === currentBookId); 
    const list = document.getElementById('word-list'); 
    list.innerHTML = '';
    [...book.words].reverse().forEach((word, index) => {
        const div = document.createElement('div'); 
        div.className = 'word-item';
        div.innerHTML = `
            <div>
                <div class="word-en">${word.en}</div>
                <div class="word-zh">${word.zh.join(', ')}</div>
            </div>
            <button class="btn-icon btn-delete" style="border:none;" onclick="deleteWord(${book.words.length - 1 - index})">✕</button>
        `;
        list.appendChild(div);
    });
}

window.addWord = function() {
    const en = document.getElementById('input-en').value.trim(); 
    const zhStr = document.getElementById('input-zh').value.trim();
    if(!en || !zhStr) { window.SilenModal.alert("欄位不完整"); return; }
    const zhArray = zhStr.split(/[;；,，\/]/).map(s => s.trim()).filter(s => s);
    window.books.find(b => b.id === currentBookId).words.push({ en: en, zh: zhArray }); 
    window.saveData();
    document.getElementById('input-en').value = ''; 
    document.getElementById('input-zh').value = ''; 
    document.getElementById('input-en').focus(); 
    renderWordList();
};

window.deleteWord = function(index) { 
    window.books.find(b => b.id === currentBookId).words.splice(index, 1); 
    window.saveData(); 
    renderWordList(); 
};

function getPracticeWords() {
    if (selectedBookIds.size === 0) { window.SilenModal.alert("請先選取單字簿範圍。"); return []; }
    let queue = []; 
    window.books.forEach(book => { if (selectedBookIds.has(book.id)) queue.push(...book.words); });
    if (queue.length === 0) { window.SilenModal.alert("範圍內不含單字。"); return []; } 
    return queue;
}

function getSelectedWordsPool() {
    if (isGuestMode) return guestWords;
    let pool = []; 
    window.books.forEach(book => { if (selectedBookIds.has(book.id)) pool.push(...book.words); }); 
    return pool;
}

// =====================================
// 🚀 6. 雙軌精通模式 (Mastery Mode)
// =====================================
let masteryPool = [];
let currentMasteryTarget = null;
let masteryModeType = 'comprehensive';
let delayWaitTurns = 4;

window.setupMasteryMode = function(type) {
    let words = getPracticeWords(); 
    if(words.length === 0) return;
    
    masteryModeType = type; 
    masteryPool = words.map(w => ({ en: w.en, zh: w.zh, level: 0, delay: 0 })); 
    masteryPool.sort(() => Math.random() - 0.5);
    
    const headerTitle = document.getElementById('mastery-header-title'); 
    const progressBar = document.getElementById('mastery-progress-bar');
    const l0Card = document.getElementById('mastery-l0-card'); 
    const nextBtns = document.querySelectorAll('#view-mastery .btn:not(.btn-icon):not(.btn-outline)');

    if (masteryModeType === 'comprehensive') {
        headerTitle.innerText = "綜合精通模式"; 
        headerTitle.style.color = "#9c27b0"; 
        progressBar.style.background = "#9c27b0"; 
        l0Card.style.borderColor = "#9c27b0";
        nextBtns.forEach(b => { 
            b.className = "btn mastery-btn-comp btn-next-big"; 
            if (['mastery-btn-l0', 'mastery-btn-puzzle', 'mastery-btn-typing', 'mastery-btn-finish'].includes(b.id)) {
                b.classList.remove('btn-next-big'); 
            }
        });
    } else {
        headerTitle.innerText = "連結力訓練模式"; 
        headerTitle.style.color = "#009688"; 
        progressBar.style.background = "#009688"; 
        l0Card.style.borderColor = "#009688";
        nextBtns.forEach(b => { 
            b.className = "btn mastery-btn-conn btn-next-big"; 
            if (['mastery-btn-l0', 'mastery-btn-puzzle', 'mastery-btn-typing', 'mastery-btn-finish'].includes(b.id)) {
                b.classList.remove('btn-next-big'); 
            }
        });
    }
    window.switchView('mastery'); 
    updateMasteryProgress(); 
    nextMasteryTurn();
};

function updateMasteryProgress() {
    let targetLevel = (masteryModeType === 'comprehensive') ? 5 : 4;
    let mastered = masteryPool.filter(w => w.level === targetLevel).length;
    document.getElementById('mastery-progress-bar').style.width = ((mastered / masteryPool.length) * 100) + '%';
    document.getElementById('mastery-status-text').innerText = `精通進度: ${mastered} / ${masteryPool.length}`;
    return mastered === masteryPool.length;
}

function nextMasteryTurn() {
    if (updateMasteryProgress()) {
        hideAllMasteryAreas(); 
        document.getElementById('mastery-success-title').style.color = (masteryModeType === 'comprehensive') ? "#9c27b0" : "#009688";
        setDisplayState('mastery-success-area', true); 
        return;
    }
    hideAllMasteryAreas();

    let l0 = masteryPool.filter(w => w.level === 0);
    if (l0.length > 0) { 
        currentMasteryTarget = l0[0]; 
        showMasteryL0(currentMasteryTarget); 
        return; 
    }

    let delayReady = masteryPool.filter(w => w.level === 3.9 || w.level === 2.9);
    if (delayReady.length > 0) {
        currentMasteryTarget = delayReady.sort(() => Math.random() - 0.5)[0];
        if (masteryModeType === 'comprehensive') {
            showMasteryTyping(currentMasteryTarget, true); 
        } else {
            showMasteryMCQ(currentMasteryTarget, true); 
        }
        return;
    }

    let active = masteryPool.filter(w => w.level >= 1 && w.level <= 3 && Number.isInteger(w.level));
    if (active.length > 0) {
        currentMasteryTarget = active.sort(() => Math.random() - 0.5)[0];
        if (currentMasteryTarget.level === 1) {
            showMasteryMCQ(currentMasteryTarget, false);
        } else if (currentMasteryTarget.level === 2) {
            if (masteryModeType === 'comprehensive') {
                showMasteryPuzzle(currentMasteryTarget); 
            } else {
                showMasteryMatch(currentMasteryTarget);
            }
        } else if (currentMasteryTarget.level === 3) {
            showMasteryTyping(currentMasteryTarget, false);
        }
        return;
    }

    let waiting = masteryPool.filter(w => w.level === 3.5 || w.level === 2.5);
    if (waiting.length > 0) {
        let forceTarget = waiting[0]; 
        forceTarget.level = forceTarget.level === 3.5 ? 3.9 : 2.9; 
        currentMasteryTarget = forceTarget;
        if (masteryModeType === 'comprehensive') {
            showMasteryTyping(currentMasteryTarget, true); 
        } else {
            showMasteryMCQ(currentMasteryTarget, true);
        }
        return;
    }
}

function tickMasteryDelays() { 
    masteryPool.forEach(w => { 
        if (w.level === 3.5 || w.level === 2.5) { 
            w.delay--; 
            if (w.delay <= 0) {
                w.level = (w.level === 3.5) ? 3.9 : 2.9; 
            }
        } 
    }); 
}

function hideAllMasteryAreas() { 
    ['mastery-l0-area', 'mastery-mcq-area', 'mastery-match-area', 'mastery-puzzle-area', 'mastery-typing-area', 'mastery-feedback-area', 'mastery-success-area'].forEach(id => { 
        setDisplayState(id, false); 
    }); 
}

function showMasteryL0(word) {
    setDisplayState('mastery-l0-area', true); 
    document.getElementById('mastery-l0-en').innerText = word.en; 
    document.getElementById('mastery-l0-zh').innerText = word.zh.join(' / ');
    
    window.forceSpeak = true;
    speakEnglishWord(word.en); 
}

window.masteryL0Next = function() { 
    if ('speechSynthesis' in window) window.speechSynthesis.cancel(); 
    currentMasteryTarget.level = 1; 
    nextMasteryTurn(); 
};

function showMasteryMCQ(word, isDelayed) {
    setDisplayState('mastery-mcq-area', true);
    document.getElementById('mastery-mcq-badge').innerText = isDelayed ? "Lv 3: 延遲固化 (畢業評測)" : "Lv 1: 視覺辨識";
    document.getElementById('mastery-mcq-q').innerText = word.zh.join(' / ');
    
    let options = [word]; 
    let distractors = masteryPool.filter(w => w.en !== word.en).sort(() => Math.random() - 0.5); 
    options.push(...distractors.slice(0, 3));
    
    if (options.length < 4) { 
        let fallback = getSelectedWordsPool().filter(w => w.en !== word.en).sort(() => Math.random() - 0.5); 
        options.push(...fallback.slice(0, 4 - options.length)); 
    }
    options = options.slice(0, 4).sort(() => Math.random() - 0.5);
    
    const optArea = document.getElementById('mastery-mcq-options'); 
    optArea.innerHTML = '';
    
    options.forEach(opt => { 
        let btn = document.createElement('button'); 
        btn.className = 'btn-mcq'; 
        btn.innerText = opt.en; 
        btn.onclick = () => checkMasteryAnswer(opt.en === word.en); 
        optArea.appendChild(btn); 
    });
}

let matchEnSelected = null, matchZhSelected = null, matchMistake = false, matchPairsLeft = 4;
function showMasteryMatch(word) {
    setDisplayState('mastery-match-area', true); 
    matchMistake = false;
    
    let pool = masteryPool.filter(w => w.en !== word.en).sort(() => Math.random() - 0.5); 
    let selectedDistractors = pool.slice(0, 3);
    
    if (selectedDistractors.length < 3) { 
        let globalPool = getSelectedWordsPool().filter(w => w.en !== word.en).sort(() => Math.random() - 0.5); 
        selectedDistractors.push(...globalPool.slice(0, 3 - selectedDistractors.length)); 
    }
    
    let currentMatchPairs = [word, ...selectedDistractors].slice(0, 4); 
    matchPairsLeft = currentMatchPairs.length;
    
    renderMatchColumns(
        currentMatchPairs.map(w => ({ text: w.en, ref: w })).sort(() => Math.random() - 0.5), 
        currentMatchPairs.map(w => ({ text: w.zh[0], ref: w })).sort(() => Math.random() - 0.5)
    );
}

function renderMatchColumns(enList, zhList) {
    const enCol = document.getElementById('match-col-en'); 
    const zhCol = document.getElementById('match-col-zh');
    enCol.innerHTML = ''; 
    zhCol.innerHTML = ''; 
    matchEnSelected = null; 
    matchZhSelected = null;
    
    enList.forEach((item) => { 
        let btn = document.createElement('button'); 
        btn.className = 'match-btn'; 
        btn.innerText = item.text; 
        btn.onclick = () => handleMatchClick('en', item, btn); 
        enCol.appendChild(btn); 
    });
    
    zhList.forEach((item) => { 
        let btn = document.createElement('button'); 
        btn.className = 'match-btn'; 
        btn.innerText = item.text; 
        btn.onclick = () => handleMatchClick('zh', item, btn); 
        zhCol.appendChild(btn); 
    });
}

function handleMatchClick(type, item, btnElement) {
    if (btnElement.classList.contains('matched')) return;
    
    if (type === 'en') {
        if (matchEnSelected) matchEnSelected.btn.classList.remove('selected');
        matchEnSelected = { item, btn: btnElement }; 
        btnElement.classList.add('selected');
        
        window.forceSpeak = true;
        speakEnglishWord(item.text); 
    } else {
        if (matchZhSelected) matchZhSelected.btn.classList.remove('selected');
        matchZhSelected = { item, btn: btnElement }; 
        btnElement.classList.add('selected');
    }
    
    if (matchEnSelected && matchZhSelected) {
        checkMatchPair();
    }
}

function checkMatchPair() {
    let en = matchEnSelected, zh = matchZhSelected;
    
    if (en.item.ref.en === zh.item.ref.en) { 
        en.btn.classList.remove('selected'); 
        zh.btn.classList.remove('selected'); 
        en.btn.classList.add('matched'); 
        zh.btn.classList.add('matched');
        
        matchEnSelected = null; 
        matchZhSelected = null; 
        matchPairsLeft--;
        
        if (matchPairsLeft === 0) {
            setTimeout(() => { checkMasteryAnswer(!matchMistake); }, 400);
        }
    } else { 
        matchMistake = true; 
        en.btn.classList.add('wrong'); 
        zh.btn.classList.add('wrong');
        
        setTimeout(() => { 
            en.btn.classList.remove('wrong', 'selected'); 
            zh.btn.classList.remove('wrong', 'selected'); 
            matchEnSelected = null; 
            matchZhSelected = null; 
        }, 500);
    }
}

function showMasteryPuzzle(word) {
    setDisplayState('mastery-puzzle-area', true); 
    document.getElementById('mastery-puzzle-q').innerText = word.zh.join(' / '); 
    document.getElementById('mastery-puzzle-hint-display').innerText = ''; 
    
    puzzleUserAnswer = []; 
    let letters = word.en.toLowerCase().split('');
    
    for (let i = letters.length - 1; i > 0; i--) { 
        const j = Math.floor(Math.random() * (i + 1)); 
        [letters[i], letters[j]] = [letters[j], letters[i]]; 
    }
    
    puzzleSourceLetters = letters.map((l, i) => ({ id: i, char: l, used: false })); 
    renderMasteryPuzzleBoard();
}

window.showMasteryPuzzleHint = function() {
    const word = currentMasteryTarget.en; 
    if (word.length <= 2) { 
        document.getElementById('mastery-puzzle-hint-display').innerText = word; 
        return; 
    }
    document.getElementById('mastery-puzzle-hint-display').innerText = `${word.charAt(0)}${'_'.repeat(word.length - 2)}${word.charAt(word.length - 1)}`;
};

function renderMasteryPuzzleBoard() {
    const ansArea = document.getElementById('mastery-puzzle-ans'); 
    const poolArea = document.getElementById('mastery-puzzle-pool');
    ansArea.innerHTML = ''; 
    poolArea.innerHTML = '';
    
    puzzleUserAnswer.forEach((letterObj, idx) => { 
        const tile = document.createElement('div'); 
        tile.className = 'letter-tile'; 
        tile.innerText = letterObj.char; 
        tile.onclick = () => { 
            puzzleUserAnswer[idx].used = false; 
            puzzleUserAnswer.splice(idx, 1); 
            renderMasteryPuzzleBoard(); 
        }; 
        ansArea.appendChild(tile); 
    });
    
    if (puzzleUserAnswer.length < currentMasteryTarget.en.length) { 
        const placeholder = document.createElement('div'); 
        placeholder.className = 'letter-tile empty'; 
        placeholder.innerText = '_'; 
        ansArea.appendChild(placeholder); 
    }
    
    puzzleSourceLetters.forEach(letterObj => { 
        if (!letterObj.used) { 
            const tile = document.createElement('div'); 
            tile.className = 'letter-tile'; 
            tile.innerText = letterObj.char; 
            tile.onclick = () => { 
                letterObj.used = true; 
                puzzleUserAnswer.push(letterObj); 
                renderMasteryPuzzleBoard(); 
                window.checkMasteryPuzzle(false); 
            }; 
            poolArea.appendChild(tile); 
        } 
    });
}

window.checkMasteryPuzzle = function(forced = false) {
    const currentString = puzzleUserAnswer.map(o => o.char).join(''); 
    const targetString = currentMasteryTarget.en.toLowerCase();
    if (puzzleUserAnswer.length === targetString.length || forced) {
        checkMasteryAnswer(currentString === targetString);
    }
};

function showMasteryTyping(word, isDelayed) {
    setDisplayState('mastery-typing-area', true); 
    document.getElementById('mastery-typing-badge').innerText = isDelayed ? "Lv 5: 延遲固化 (畢業評測)" : "Lv 3: 主動輸出";
    document.getElementById('mastery-typing-q').innerText = word.zh.join(' / ');
    
    const input = document.getElementById('mastery-typing-input'); 
    input.value = ''; 
    setTimeout(() => input.focus(), 50); 
    
    input.onkeypress = (e) => { 
        if(e.key === 'Enter') { 
            e.preventDefault(); 
            checkMasteryTyping(); 
        } 
    };
}

window.checkMasteryTyping = function() {
    const val = document.getElementById('mastery-typing-input').value.trim().toLowerCase(); 
    const target = currentMasteryTarget.en.toLowerCase(); 
    checkMasteryAnswer(val === target);
};

function checkMasteryAnswer(isCorrect) {
    hideAllMasteryAreas(); 
    setDisplayState('mastery-feedback-area', true, 'flex');
    
    const icon = document.getElementById('mastery-fb-icon'); 
    const status = document.getElementById('mastery-fb-status'); 
    const msg = document.getElementById('mastery-fb-msg');
    document.getElementById('mastery-fb-ans').innerText = currentMasteryTarget.en;
    
    window.forceSpeak = true;
    speakEnglishWord(currentMasteryTarget.en); 
    
    tickMasteryDelays(); 
    let lvl = currentMasteryTarget.level;

    if (masteryModeType === 'comprehensive') {
        if (isCorrect) {
            icon.innerText = '✔'; 
            icon.className = 'big-icon icon-correct'; 
            status.innerText = '正確'; 
            status.className = 'result-status status-correct';
            
            if (lvl === 1) { 
                currentMasteryTarget.level = 2; 
                msg.innerText = "升級至 Level 2 結構重組。"; 
            } else if (lvl === 2) { 
                currentMasteryTarget.level = 3; 
                msg.innerText = "升級至 Level 3 主動輸出。"; 
            } else if (lvl === 3) { 
                currentMasteryTarget.level = 3.5; 
                currentMasteryTarget.delay = delayWaitTurns; 
                msg.innerText = "進入記憶固化潛伏期，系統稍後將觸發延遲評測。"; 
            } else if (lvl === 3.9) { 
                currentMasteryTarget.level = 5; 
                msg.innerText = "通過延遲評測，該單字已完全精通。"; 
            }
        } else {
            icon.innerText = '✘'; 
            icon.className = 'big-icon icon-wrong'; 
            status.innerText = '錯誤'; 
            status.className = 'result-status status-wrong';
            currentMasteryTarget.level = 1; 
            msg.innerText = "降級重回 Level 1 視覺辨識。";
        }
    } else {
        if (isCorrect) {
            icon.innerText = '✔'; 
            icon.className = 'big-icon icon-correct'; 
            status.innerText = '正確'; 
            status.className = 'result-status status-correct';
            
            if (lvl === 1) { 
                currentMasteryTarget.level = 2; 
                msg.innerText = "升級至 Level 2 雙向連接。"; 
            } else if (lvl === 2) { 
                currentMasteryTarget.level = 2.5; 
                currentMasteryTarget.delay = delayWaitTurns; 
                msg.innerText = "進入記憶固化潛伏期，系統稍後將觸發延遲評測。"; 
            } else if (lvl === 2.9) { 
                currentMasteryTarget.level = 4; 
                msg.innerText = "通過延遲評測，單字連接力建立完成。"; 
            }
        } else {
            icon.innerText = '✘'; 
            icon.className = 'big-icon icon-wrong'; 
            status.innerText = '錯誤'; 
            status.className = 'result-status status-wrong';
            currentMasteryTarget.level = 1; 
            msg.innerText = "降級重回 Level 1 視覺辨識。";
        }
    }
}

window.masteryFeedbackNext = function() { 
    nextMasteryTurn(); 
};

window.replayMasteryAudio = function() { 
    if (currentMasteryTarget) { 
        window.forceSpeak = true;
        speakEnglishWord(currentMasteryTarget.en); 
    } 
};

// =====================================
// 7. 原版 8 大練習模式 (Original 8 Modes)
// =====================================
window.setupPractice = function(mode) { 
    practiceQueue = getPracticeWords(); 
    if (!practiceQueue.length) return; 
    
    if (!isSequentialMode) practiceQueue.sort(() => Math.random() - 0.5); 
    
    currentMode = mode; 
    currentCardIndex = 0; 
    initialQueueLength = practiceQueue.length; 
    completedCount = 0; 
    
    document.getElementById('mode-display').innerText = mode === 'zh-to-en' ? '中翻英' : '英翻中'; 
    setDisplayState('sequential-badge', isSequentialMode, 'inline-block'); 
    setDisplayState('hint-btn', mode === 'zh-to-en', 'inline-block'); 
    
    window.switchView('practice'); 
    showNextCard(); 
};

function showNextCard() { 
    if (currentCardIndex >= practiceQueue.length) return endQuiz(); 
    
    const w = practiceQueue[currentCardIndex]; 
    setDisplayState('interaction-area', true, 'block'); 
    setDisplayState('feedback-area', false); 
    
    document.getElementById('answer-input').value = ''; 
    document.getElementById('hint-display').innerText = ''; 
    document.getElementById('progress-display').innerText = isSequentialMode ? `第 ${currentCardIndex+1} 關` : `${completedCount}/${initialQueueLength}`; 
    document.getElementById('answer-input').focus(); 
    
    const q = currentMode === 'zh-to-en' ? w.zh.join(' / ') : w.en; 
    document.getElementById('question-display').innerText = q; 
    document.getElementById('feedback-question-copy').innerText = q; 
}

window.showHint = function() { 
    let w = practiceQueue[currentCardIndex].en; 
    document.getElementById('hint-display').innerText = w.length <= 2 ? w : `${w.charAt(0)}${'_'.repeat(w.length-2)}${w.charAt(w.length-1)}`; 
};

window.checkAnswer = function() { 
    const v = document.getElementById('answer-input').value.trim(); 
    const w = practiceQueue[currentCardIndex]; 
    let c = false; 
    
    if (v !== '') { 
        if (currentMode === 'zh-to-en') { 
            c = (v.toLowerCase() === w.en.toLowerCase()); 
        } else { 
            c = w.zh.some(m => m.trim().includes(v) && v.length > 0); 
        } 
    } 
    
    lastAnswerCorrect = c; 
    if (!c && !isSequentialMode) requeueWord(w); 
    showFeedback(c, w); 
};

function showFeedback(c, w) { 
    setDisplayState('interaction-area', false); 
    setDisplayState('feedback-area', true, 'flex'); 
    
    const i = document.getElementById('feedback-icon'); 
    const s = document.getElementById('feedback-status'); 
    document.getElementById('feedback-answer').innerText = currentMode === 'zh-to-en' ? w.en : w.zh.join(', '); 
    
    if (c) { 
        i.innerText = '✔'; 
        i.className = 'big-icon icon-correct'; 
        s.innerText = '正確'; 
        s.className = 'result-status status-correct'; 
    } else { 
        i.innerText = '✘'; 
        i.className = 'big-icon icon-wrong'; 
        s.innerText = '錯誤'; 
        s.className = 'result-status status-wrong'; 
    } 
    window.forceSpeak = true;
    speakEnglishWord(w.en); 
}

window.handleNextClick = function() { 
    if (lastAnswerCorrect) completedCount++; 
    
    if (isSequentialMode && !lastAnswerCorrect) { 
        window.SilenModal.alert("評測錯誤，重頭開始。").then(() => { 
            currentCardIndex = 0; 
            completedCount = 0; 
            showNextCard(); 
        });
    } else {
        currentCardIndex++; 
        showNextCard(); 
    }
};

document.getElementById('answer-input').addEventListener('keypress', e => { 
    if (e.key === 'Enter') { 
        e.preventDefault(); 
        window.checkAnswer(); 
    } 
});

window.setupMultipleChoice = function(mode) { 
    practiceQueue = getPracticeWords(); 
    if (!practiceQueue.length) return; 
    
    if (new Set(getSelectedWordsPool().map(w => w.en)).size < 4) { 
        window.SilenModal.alert("單字簿數量不足以生成干擾項選項。"); 
        return; 
    }
    
    if (!isSequentialMode) practiceQueue.sort(() => Math.random() - 0.5); 
    
    currentMode = mode; 
    currentCardIndex = 0; 
    initialQueueLength = practiceQueue.length; 
    completedCount = 0; 
    
    document.getElementById('mcq-mode-display').innerText = mode === 'zh-to-en' ? '中選英' : '英選中'; 
    setDisplayState('mcq-seq-badge', isSequentialMode, 'inline-block'); 
    window.switchView('mcq'); 
    showMcqNextCard(); 
};

function showMcqNextCard() { 
    if (currentCardIndex >= practiceQueue.length) return endQuiz(); 
    
    const w = practiceQueue[currentCardIndex]; 
    setDisplayState('mcq-interaction-area', true, 'block'); 
    setDisplayState('mcq-feedback-area', false); 
    document.getElementById('mcq-progress-display').innerText = isSequentialMode ? `第 ${currentCardIndex+1} 關` : `${completedCount}/${initialQueueLength}`; 
    
    const q = currentMode === 'zh-to-en' ? w.zh.join(' / ') : w.en; 
    document.getElementById('mcq-question-display').innerText = q; 
    document.getElementById('mcq-feedback-question-copy').innerText = q; 
    
    let opts = [w]; 
    let seen = new Set([w.en]); 
    let dis = getSelectedWordsPool().filter(x => !seen.has(x.en)).sort(() => Math.random() - 0.5).slice(0, 3); 
    
    opts.push(...dis); 
    opts.sort(() => Math.random() - 0.5); 
    
    const a = document.getElementById('mcq-options-area'); 
    a.innerHTML = ''; 
    
    opts.forEach(o => { 
        let b = document.createElement('button'); 
        b.className = 'btn-mcq'; 
        b.innerText = currentMode === 'zh-to-en' ? o.en : o.zh.join(' / '); 
        b.onclick = () => window.checkMcqAnswer(o.en === w.en); 
        a.appendChild(b); 
    }); 
}

window.checkMcqAnswer = function(c) { 
    lastAnswerCorrect = c; 
    const w = practiceQueue[currentCardIndex]; 
    if (!c && !isSequentialMode) requeueWord(w); 
    
    setDisplayState('mcq-interaction-area', false); 
    setDisplayState('mcq-feedback-area', true, 'flex'); 
    
    const i = document.getElementById('mcq-feedback-icon'); 
    const s = document.getElementById('mcq-feedback-status'); 
    document.getElementById('mcq-feedback-answer').innerText = currentMode === 'zh-to-en' ? w.en : w.zh.join(', '); 
    
    if (c) { 
        i.innerText = '✔'; 
        i.className = 'big-icon icon-correct'; 
        s.innerText = '正確'; 
        s.className = 'result-status status-correct'; 
    } else { 
        i.innerText = '✘'; 
        i.className = 'big-icon icon-wrong'; 
        s.innerText = '錯誤'; 
        s.className = 'result-status status-wrong'; 
    } 
    window.forceSpeak = true;
    speakEnglishWord(w.en); 
};

window.handleMcqNextClick = function() { 
    if (lastAnswerCorrect) completedCount++; 
    
    if (isSequentialMode && !lastAnswerCorrect) { 
        window.SilenModal.alert("評測錯誤，重頭開始。").then(() => { 
            currentCardIndex = 0; 
            completedCount = 0; 
            showMcqNextCard(); 
        }); 
    } else { 
        currentCardIndex++; 
        showMcqNextCard(); 
    }
};

window.setupSpeakingMode = function() { 
    if (!recognition) { 
        window.SilenModal.alert("當前核心環境不支援 SpeechRecognition 語音介面。"); 
        return; 
    }
    practiceQueue = getPracticeWords(); 
    if (!practiceQueue.length) return; 
    
    if (!isSequentialMode) practiceQueue.sort(() => Math.random() - 0.5); 
    
    currentCardIndex = 0; 
    initialQueueLength = practiceQueue.length; 
    completedCount = 0; 
    
    window.switchView('speaking'); 
    showNextSpeakingCard(); 
};

function showNextSpeakingCard() { 
    if (currentCardIndex >= practiceQueue.length) return endQuiz(); 
    
    const w = practiceQueue[currentCardIndex]; 
    setDisplayState('speaking-interaction-area', true, 'block'); 
    setDisplayState('speaking-feedback-area', false); 
    
    document.getElementById('speaking-word-display').innerText = w.en; 
    document.getElementById('speaking-zh-display').innerText = w.zh.join(' / '); 
    document.getElementById('speaking-status').innerText = '準備就緒'; 
    document.getElementById('speaking-progress').innerText = `${completedCount}/${initialQueueLength}`; 
    
    window.forceSpeak = true;
    speakEnglishWord(w.en); 
}

window.startSpeechRecognition = function() { 
    const b = document.getElementById('mic-btn'); 
    const s = document.getElementById('speaking-status'); 
    
    try { 
        recognition.start(); 
        b.classList.add('listening'); 
        s.innerText = '正在語音錄製與分析...'; 
    } catch(e) {} 
    
    recognition.onresult = (e) => { 
        const h = e.results[0][0].transcript.toLowerCase().replace(/[.,?!]/g, "").trim(); 
        const c = e.results[0][0].confidence; 
        const t = practiceQueue[currentCardIndex].en.toLowerCase().trim(); 
        
        b.classList.remove('listening'); 
        setDisplayState('speaking-interaction-area', false); 
        setDisplayState('speaking-feedback-area', true, 'flex'); 
        
        const sd = document.getElementById('speaking-score'); 
        const md = document.getElementById('speaking-feedback-msg'); 
        const hd = document.getElementById('speaking-heard-text'); 
        
        if (h === t || h.includes(t) || t.includes(h)) { 
            lastAnswerCorrect = true; 
            let fs = Math.round(c * 100); 
            if (fs < 50) fs = 80; 
            
            sd.innerText = `${fs} 分`; 
            sd.style.color = 'var(--success)'; 
            md.innerText = '發音標準'; 
            hd.innerText = `捕獲音訊: "${h}"`; 
        } else { 
            lastAnswerCorrect = false; 
            sd.innerText = `0 分`; 
            sd.style.color = 'var(--error)'; 
            md.innerText = '識別不匹配'; 
            hd.innerText = `捕獲音訊: "${h}"`; 
            
            if (!isSequentialMode) requeueWord(practiceQueue[currentCardIndex]); 
        } 
    }; 
    
    recognition.onerror = () => { 
        b.classList.remove('listening'); 
        s.innerText = '音訊解碼失敗，請重新觸發。'; 
    }; 
    
    recognition.onspeechend = () => { 
        recognition.stop(); 
        b.classList.remove('listening'); 
    }; 
};

window.handleSpeakingNextClick = function() { 
    if (lastAnswerCorrect) completedCount++; 
    
    if (isSequentialMode && !lastAnswerCorrect) { 
        window.SilenModal.alert('重頭開始。').then(() => { 
            currentCardIndex = 0; 
            completedCount = 0; 
            showNextSpeakingCard(); 
        }); 
    } else { 
        currentCardIndex++; 
        showNextSpeakingCard(); 
    }
};

window.setupPuzzleMode = function() { 
    practiceQueue = getPracticeWords(); 
    if (!practiceQueue.length) return; 
    
    if (!isSequentialMode) practiceQueue.sort(() => Math.random() - 0.5); 
    
    currentCardIndex = 0; 
    setDisplayState('puzzle-seq-badge', isSequentialMode, 'inline-block'); 
    window.switchView('puzzle'); 
    loadPuzzleLevel(); 
};

function loadPuzzleLevel() { 
    if (currentCardIndex >= practiceQueue.length) return endQuiz(); 
    
    puzzleCurrentWord = practiceQueue[currentCardIndex]; 
    puzzleUserAnswer = []; 
    let ls = puzzleCurrentWord.en.toLowerCase().split(''); 
    
    for (let i = ls.length - 1; i > 0; i--) { 
        let j = Math.floor(Math.random() * (i + 1)); 
        [ls[i], ls[j]] = [ls[j], ls[i]]; 
    } 
    
    puzzleSourceLetters = ls.map((l, i) => ({ id: i, char: l, used: false })); 
    document.getElementById('puzzle-hint-display').innerText = ''; 
    document.getElementById('puzzle-question').innerText = puzzleCurrentWord.zh.join(' / '); 
    document.getElementById('puzzle-message').innerText = ''; 
    document.getElementById('puzzle-progress').innerText = isSequentialMode ? `第 ${currentCardIndex+1} 關` : `${currentCardIndex+1}/${practiceQueue.length}`; 
    
    renderPuzzleBoard(); 
}

window.showPuzzleHint = function() { 
    let w = puzzleCurrentWord.en; 
    document.getElementById('puzzle-hint-display').innerText = w.length <= 2 ? w : `${w.charAt(0)}${'_'.repeat(w.length-2)}${w.charAt(w.length-1)}`; 
};

function renderPuzzleBoard() { 
    const a = document.getElementById('puzzle-answer-area'); 
    const p = document.getElementById('puzzle-pool-area'); 
    a.innerHTML = ''; 
    p.innerHTML = ''; 
    
    puzzleUserAnswer.forEach((o, i) => { 
        let t = document.createElement('div'); 
        t.className = 'letter-tile'; 
        t.innerText = o.char; 
        t.onclick = () => { 
            puzzleUserAnswer[i].used = false; 
            puzzleUserAnswer.splice(i, 1); 
            renderPuzzleBoard(); 
        }; 
        a.appendChild(t); 
    }); 
    
    if (puzzleUserAnswer.length < puzzleCurrentWord.en.length) { 
        let ph = document.createElement('div'); 
        ph.className = 'letter-tile empty'; 
        ph.innerText = '_'; 
        a.appendChild(ph); 
    } 
    
    puzzleSourceLetters.forEach(o => { 
        if (!o.used) { 
            let t = document.createElement('div'); 
            t.className = 'letter-tile'; 
            t.innerText = o.char; 
            t.onclick = () => { 
                o.used = true; 
                puzzleUserAnswer.push(o); 
                renderPuzzleBoard(); 
                window.checkPuzzleState(false); 
            }; 
            p.appendChild(t); 
        } 
    }); 
}

window.checkPuzzleState = function(f = false) { 
    let cs = puzzleUserAnswer.map(o => o.char).join(''); 
    let ts = puzzleCurrentWord.en.toLowerCase(); 
    let m = document.getElementById('puzzle-message'); 
    
    if (cs.length === ts.length || f) { 
        if (cs === ts) { 
            m.className = 'result-msg result-correct'; 
            m.innerText = '正確'; 
            window.forceSpeak = true;
            speakEnglishWord(ts); 
            setTimeout(() => { 
                currentCardIndex++; 
                loadPuzzleLevel(); 
            }, 800); 
        } else { 
            if (isSequentialMode) { 
                m.className = 'result-msg result-wrong'; 
                m.innerText = `錯誤，答案為 ${ts}。`; 
                window.forceSpeak = true;
                speakEnglishWord(ts); 
                setTimeout(() => { 
                    currentCardIndex = 0; 
                    loadPuzzleLevel(); 
                }, 2000); 
            } else { 
                if (f) { 
                    m.className = 'result-msg result-wrong'; 
                    m.innerText = `錯誤，答案為 ${ts}`; 
                    window.forceSpeak = true;
                    speakEnglishWord(ts); 
                    requeueWord(puzzleCurrentWord); 
                    setTimeout(() => { 
                        currentCardIndex++; 
                        loadPuzzleLevel(); 
                    }, 2000); 
                } else { 
                    m.className = 'result-msg result-wrong'; 
                    m.innerText = '比對不符'; 
                } 
            } 
        } 
    } 
};

window.setupMemoryMode = function() { 
    let p = getPracticeWords(); 
    if (p.length < 2) { 
        window.SilenModal.alert("生成記憶矩陣單字數量不足。"); 
        return; 
    } 
    
    p.sort(() => Math.random() - 0.5); 
    let sw = p.slice(0, 8); 
    memoryCards = []; 
    
    sw.forEach(w => { 
        memoryCards.push({ id: w.en, content: w.en, type: 'en', matched: false }); 
        memoryCards.push({ id: w.en, content: w.zh[0], type: 'zh', matched: false }); 
    }); 
    
    memoryCards.sort(() => Math.random() - 0.5); 
    memoryFlipped = []; 
    memoryLocked = false; 
    memoryMatchedCount = 0; 
    
    window.switchView('memory'); 
    renderMemoryBoard(); 
    document.getElementById('memory-message').innerText = '請選取卡片'; 
};

function setupMemoryModeGuest() { 
    let p = [...practiceQueue]; 
    if (p.length < 2) { 
        window.SilenModal.alert("生成記憶矩陣單字數量不足。"); 
        return; 
    } 
    
    p.sort(() => Math.random() - 0.5); 
    let sw = p.slice(0, 8); 
    memoryCards = []; 
    
    sw.forEach(w => { 
        memoryCards.push({ id: w.en, content: w.en, type: 'en', matched: false }); 
        memoryCards.push({ id: w.en, content: w.zh[0], type: 'zh', matched: false }); 
    }); 
    
    memoryCards.sort(() => Math.random() - 0.5); 
    memoryFlipped = []; 
    memoryLocked = false; 
    memoryMatchedCount = 0; 
    
    window.switchView('memory'); 
    renderMemoryBoard(); 
    document.getElementById('memory-message').innerText = '請選取卡片'; 
}

function renderMemoryBoard() { 
    const b = document.getElementById('memory-board'); 
    b.innerHTML = ''; 
    
    memoryCards.forEach((c, i) => { 
        let d = document.createElement('div'); 
        d.className = `memory-card ${c.matched ? 'matched' : ''}`; 
        d.innerHTML = `<div class="memory-inner"><div class="memory-front">${c.content}</div><div class="memory-back">?</div></div>`; 
        d.onclick = () => flipCard(i); 
        b.appendChild(d); 
    }); 
}

function flipCard(i) { 
    if (memoryLocked || memoryCards[i].matched || memoryFlipped.includes(i)) return; 
    
    document.getElementById('memory-board').children[i].classList.add('flipped'); 
    memoryFlipped.push(i); 
    
    if (memoryFlipped.length === 2) checkMemoryMatch(); 
}

function checkMemoryMatch() { 
    memoryLocked = true; 
    let [i1, i2] = memoryFlipped; 
    let c1 = memoryCards[i1]; 
    let c2 = memoryCards[i2]; 
    let m = document.getElementById('memory-message'); 
    
    if (c1.id === c2.id) { 
        c1.matched = c2.matched = true; 
        memoryMatchedCount += 2; 
        
        document.getElementById('memory-board').children[i1].classList.add('matched'); 
        document.getElementById('memory-board').children[i2].classList.add('matched'); 
        
        m.innerText = '矩陣配對成功'; 
        m.className = 'result-msg result-correct'; 
        window.forceSpeak = true;
        speakEnglishWord(c1.id); 
        
        memoryFlipped = []; 
        memoryLocked = false; 
        
        if (memoryMatchedCount === memoryCards.length) setTimeout(() => endQuiz(), 500); 
    } else { 
        m.innerText = '不匹配'; 
        m.className = 'result-msg result-wrong'; 
        
        setTimeout(() => { 
            document.getElementById('memory-board').children[i1].classList.remove('flipped'); 
            document.getElementById('memory-board').children[i2].classList.remove('flipped'); 
            memoryFlipped = []; 
            memoryLocked = false; 
            m.innerText = ''; 
        }, 1000); 
    } 
}

window.setupYouglishMode = function() { 
    practiceQueue = getPracticeWords(); 
    if (!practiceQueue.length) return; 
    
    practiceQueue.sort(() => Math.random() - 0.5); 
    currentCardIndex = 0; 
    
    window.switchView('youglish'); 
    loadYouglishCard(); 
};

function loadYouglishCard() { 
    if (!practiceQueue[currentCardIndex]) return; 
    
    const w = practiceQueue[currentCardIndex]; 
    document.getElementById('yg-word').innerText = w.en; 
    document.getElementById('yg-zh').innerText = w.zh.join(' / '); 
    document.getElementById('yg-progress').innerText = `${currentCardIndex+1}/${practiceQueue.length}`; 
    document.getElementById('yg-link-word').innerText = w.en; 
    document.getElementById('yg-link').href = `https://youglish.com/pronounce/${encodeURIComponent(w.en)}/english`; 
}

window.nextYouglishCard = function() { 
    if (currentCardIndex < practiceQueue.length - 1) { 
        currentCardIndex++; 
        loadYouglishCard(); 
    } else { 
        endQuiz(); 
    } 
};

window.prevYouglishCard = function() { 
    if (currentCardIndex > 0) { 
        currentCardIndex--; 
        loadYouglishCard(); 
    } else { 
        window.SilenModal.alert("已達佇列首端。"); 
    } 
};

// ==========================================================================
// 🎯 8. 自訂下拉選單控制與學測抽卡系統 (支援 1~6 級快取)
// ==========================================================================
window.toggleDropdown = function(id, event) {
    if(event) event.stopPropagation();
    document.querySelectorAll('.dropdown-options').forEach(el => {
        if (el.id !== id) el.classList.add('hidden');
    });
    document.getElementById(id).classList.toggle('hidden');
};

document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-options').forEach(el => el.classList.add('hidden'));
});

window.setLibMode = function(mode, text) {
    document.querySelector('#lib-dropdown .dropdown-selected').innerHTML = text + ' ▾';
    document.getElementById('lib-options').classList.add('hidden');
    
    if (mode === 'normal') {
        setDisplayState('normal-book-area', true);
        setDisplayState('gsat-book-area', false);
    } else if (mode === 'gsat') {
        setDisplayState('normal-book-area', false);
        setDisplayState('gsat-book-area', true);
        
        const currentLevel = window.currentGsatLevel || 'lv1';
        if (gsatVocabCache[currentLevel].length === 0) {
            fetchGSATVocab(currentLevel);
        }
    }
};

window.currentGsatLevel = 'lv1';
window.setGsatLevel = function(level, text) {
    window.currentGsatLevel = level;
    document.querySelector('#level-dropdown .dropdown-selected').innerHTML = text + ' ▾';
    document.getElementById('level-options').classList.add('hidden');
    
    const levelNum = level.replace('lv', '');
    document.getElementById('gsat-claim-tag').value = `學測 Lv${levelNum}`;
    
    const nameInput = document.getElementById('gsat-claim-name');
    if (nameInput.value.includes('抽取') || nameInput.value.trim() === '') {
        nameInput.value = `學測 Lv${levelNum} 抽取`;
    }
    
    if (gsatVocabCache[level].length === 0) {
        fetchGSATVocab(level);
    }
};

let gsatVocabCache = {
    lv1: [], lv2: [], lv3: [], lv4: [], lv5: [], lv6: []
};

async function fetchGSATVocab(level) {
    const btn = document.getElementById('btn-claim-gsat');
    if (btn) { btn.innerText = "資料庫載入中..."; btn.disabled = true; }
    
    try {
        const fileName = `vocabulary${level}.json`;
        const response = await fetch(fileName);
        if (!response.ok) throw new Error("網路請求失敗");
        
        const rawData = await response.json();
        gsatVocabCache[level] = rawData.map(item => ({
            en: item.word.trim(),
            zh: item.chinese.split(/[;；,，/、]/).map(s => s.trim()).filter(s => s)
        }));
        
        if (btn) { btn.innerText = "開始抽取"; btn.disabled = false; }
    } catch (error) {
        console.error(`載入 ${level} 失敗:`, error);
        if (window.SilenModal) window.SilenModal.alert(`載入失敗，請確認 vocabulary${level}.json 是否存在。`);
        if (btn) { btn.innerText = "載入失敗"; btn.disabled = false; }
    }
}

window.claimGSATWords = async function() {
    const level = window.currentGsatLevel || 'lv1';
    
    if (gsatVocabCache[level].length === 0) {
        await fetchGSATVocab(level);
        if (gsatVocabCache[level].length === 0) return; 
    }

    const amount = parseInt(document.getElementById('gsat-claim-amount').value) || 30;
    const levelNum = level.replace('lv', '');
    let defaultName = `學測 Lv${levelNum} 抽取`;
    
    const nameInput = document.getElementById('gsat-claim-name').value.trim();
    const bookName = nameInput === '' ? defaultName : nameInput; 
    const bookTag = document.getElementById('gsat-claim-tag').value.trim();

    let existingWords = new Set();
    window.books.forEach(book => {
        if (book.tag.includes('學測') || book.isGSAT) {
            book.words.forEach(w => existingWords.add(w.en.toLowerCase()));
        }
    });

    let availableWords = gsatVocabCache[level].filter(w => !existingWords.has(w.en.toLowerCase()));

    if (availableWords.length === 0) {
        window.SilenModal.alert(`太厲害了！學測 Lv${levelNum} 的單字已經被你全部抽完囉！`);
        return;
    }

    let finalAmount = amount;
    if (availableWords.length < amount) {
        window.SilenModal.alert(`單字庫即將見底！只剩下最後 ${availableWords.length} 個全新單字，將為您全數抽出。`);
        finalAmount = availableWords.length;
    }

    availableWords.sort(() => Math.random() - 0.5);
    let selectedWords = availableWords.slice(0, finalAmount);

    window.books.push({
        id: Date.now(),
        name: bookName,
        tag: bookTag,
        isGSAT: true, 
        words: selectedWords
    });

    if (typeof window.saveData === 'function') window.saveData();
    
    window.SilenModal.alert(`成功抽取 ${selectedWords.length} 個學測單字！\n已為您建立單字簿：「${bookName}」`).then(() => {
        if (typeof window.renderBookList === 'function') window.renderBookList();
    });
};

// =====================================
// 9. 啟動與分享攔截初始化
// =====================================
window.addEventListener('DOMContentLoaded', () => {
    window.SilenModal.init();
    window.SilenSettings.init();
});

window.addEventListener('load', () => {
    setTimeout(() => { 
        if (!checkShareUrl()) {
            // 若無分享代碼，由 auth.js 負責接管登入或跳轉
        }
    }, 150); 
});
