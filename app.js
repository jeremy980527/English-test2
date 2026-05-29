// =====================================
// 🌟 1. 自訂彈窗與設定引擎(Modal & Settings)
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
// 🌟 2. 全局變數與基礎邏輯 (Globals)
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

// 🌟 修正：把 'pos' 加入畫面白名單中！
const views = ['landing', 'home', 'book-select', 'edit', 'practice', 'mcq', 'speaking', 'puzzle', 'memory', 'youglish', 'mastery', 'profile', 'leaderboard', 'pos'];

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
    
    if (typeof window.finalizeMasterySession === 'function') {
        window.finalizeMasterySession();
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
// 🌟 5. 題庫管理與精通度計算 (支援詞性 POS)
// =====================================
window.updateProfileStats = function() {
    let count = 0;
    window.books.forEach(b => { b.words.forEach(w => { if (w.mastered) count++; }); });
    const el = document.getElementById('stat-total-words');
    if (el) el.innerText = count;
};

window.updateHomeSummary = function() {
    window.updateProfileStats();
    const summaryEl = document.getElementById('home-book-summary');
    if (!summaryEl) return;
    
    let selectedCount = 0, wordCount = 0;
    let isPhraseSelected = false;
    
    window.books.forEach(b => { 
        if (selectedBookIds.has(b.id)) { 
            selectedCount++; 
            wordCount += b.words.length; 
            if (b.isPhrase) isPhraseSelected = true;
        } 
    });
    
    if (selectedCount === 0) {
        summaryEl.innerHTML = '<span style="color:var(--text-sub);">尚未勾選範圍。請進入控制區選取題庫。</span>';
        setDisplayState('word-practice-area', true);
        setDisplayState('phrase-practice-area', false);
    } else {
        summaryEl.innerHTML = `已選取 <span style="color:var(--accent); font-weight:500;">${selectedCount}</span> 本${isPhraseSelected?'片語':'單字'}簿，共計 <span style="color:var(--accent); font-weight:500;">${wordCount}</span> 個項目`;
        
        if (isPhraseSelected) {
            setDisplayState('word-practice-area', false);
            setDisplayState('phrase-practice-area', true);
        } else {
            setDisplayState('word-practice-area', true);
            setDisplayState('phrase-practice-area', false);
        }
    }
};

window.renderBookList = function() {
    const normalList = document.getElementById('normal-book-list');
    const gsatList = document.getElementById('gsat-book-list');
    const phraseList = document.getElementById('phrase-book-list');
    
    if (normalList) normalList.innerHTML = '';
    if (gsatList) gsatList.innerHTML = '';
    if (phraseList) phraseList.innerHTML = '';

    const renderGroup = (booksToRender, container, emptyMsg, type) => {
        if (!container) return;
        if (booksToRender.length === 0) { container.innerHTML = `<div style="color:var(--text-sub); text-align:center; padding: 20px;">${emptyMsg}</div>`; return; }
        
        const groups = {};
        booksToRender.forEach(book => {
            const t = (book.tag && book.tag.trim() !== '') ? book.tag.trim() : '未分類';
            if (!groups[t]) groups[t] = []; groups[t].push(book);
        });

        const keys = Object.keys(groups).sort((a, b) => {
            if (a === '未分類') return 1; if (b === '未分類') return -1; return a.localeCompare(b);
        });

        keys.forEach(k => {
            const headerWrap = document.createElement('div');
            headerWrap.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-top:15px; margin-bottom:10px;';
            const header = document.createElement('div'); header.className = 'group-title'; header.innerText = k; header.style.margin = '0';
            const sortBtn = document.createElement('button'); sortBtn.className = 'btn-icon sort-toggle'; sortBtn.innerHTML = '⋮'; 

            headerWrap.appendChild(header); headerWrap.appendChild(sortBtn); container.appendChild(headerWrap);

            const listContainer = document.createElement('div');
            listContainer.className = 'sortable-group'; listContainer.dataset.tag = k;

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
                wrapper.className = 'checkbox-wrapper'; wrapper.style.cssText = 'flex:1; display:flex; align-items:center;';

                const dragHandle = document.createElement('span'); dragHandle.className = 'drag-handle hidden'; dragHandle.innerHTML = '☰';
                const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'book-checkbox'; checkbox.checked = selectedBookIds.has(book.id); checkbox.style.pointerEvents = 'none';
                const info = document.createElement('div'); info.style.cssText = 'flex:1; margin-left:15px;';
                info.innerHTML = `<strong>${book.name}</strong> <span style="font-size:0.8rem; color:var(--text-sub)">(${book.words.length} 項)</span>`;
                
                wrapper.appendChild(dragHandle); wrapper.appendChild(checkbox); wrapper.appendChild(info);
                
                const editBtn = document.createElement('button'); editBtn.className = 'btn-icon edit-btn'; editBtn.innerHTML = '編輯'; 
                editBtn.onclick = (e) => { e.stopPropagation(); window.openEditBook(book.id); };
                
                div.appendChild(wrapper); div.appendChild(editBtn);
                
                div.onclick = () => {
                    if (listContainer.classList.contains('sorting-active')) return;
                    
                    if (!selectedBookIds.has(book.id)) {
                        let currentType = book.isPhrase ? 'phrase' : 'word';
                        let hasConflict = false;
                        window.books.forEach(b => {
                            if (selectedBookIds.has(b.id)) {
                                let bType = b.isPhrase ? 'phrase' : 'word';
                                if (bType !== currentType) hasConflict = true;
                            }
                        });
                        
                        if (hasConflict) selectedBookIds.clear(); 
                        selectedBookIds.add(book.id);
                    } else {
                        selectedBookIds.delete(book.id);
                    }
                    window.renderBookList();
                };
                listContainer.appendChild(div);
            });

            container.appendChild(listContainer);
            if (typeof Sortable !== 'undefined') {
                new Sortable(listContainer, { handle: '.drag-handle', animation: 150, ghostClass: 'sortable-ghost', touchStartThreshold: 3, onEnd: () => window.handleSortEnd(k, listContainer, type) });
            }
        });
    };

    renderGroup(window.books.filter(b => !b.isGSAT && !b.isPhrase), normalList, '資料庫無單字簿，請在下方建立。', 'normal');
    renderGroup(window.books.filter(b => b.isGSAT && !b.isPhrase), gsatList, '尚無學測單字簿，請在下方抽取。', 'gsat');
    renderGroup(window.books.filter(b => b.isPhrase), phraseList, '尚無片語簿，請在下方建立。', 'phrase');
    window.updateHomeSummary();
};

window.handleSortEnd = function(tag, listContainer, type) {
    const newOrderIds = Array.from(listContainer.children).map(el => Number(el.dataset.id));
    let indices = [];
    window.books.forEach((b, index) => {
        const t = (b.tag && b.tag.trim() !== '') ? b.tag.trim() : '未分類';
        let bType = b.isPhrase ? 'phrase' : (b.isGSAT ? 'gsat' : 'normal');
        if (t === tag && bType === type) indices.push(index);
    });
    if (indices.length !== newOrderIds.length) return;
    let bookMap = {}; window.books.forEach(b => bookMap[b.id] = b);
    indices.forEach((globalIndex, i) => { window.books[globalIndex] = bookMap[newOrderIds[i]]; });
    window.saveData();
};

window.handleFileUpload = function(event, type) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) { 
        if(type === 'phrase') document.getElementById('import-content-phrase').value = e.target.result;
        else document.getElementById('import-content').value = e.target.result; 
        event.target.value = ''; 
    };
    reader.readAsText(file);
};

window.toggleImportArea = function(type) {
    if(type === 'phrase') {
        const area = document.getElementById('import-area-phrase');
        if (area.classList.contains('hidden')) { setDisplayState('import-area-phrase', true); setDisplayState('btn-create-simple-phrase', false); } 
        else { setDisplayState('import-area-phrase', false); setDisplayState('btn-create-simple-phrase', true); }
    } else {
        const area = document.getElementById('import-area');
        if (area.classList.contains('hidden')) { setDisplayState('import-area', true); setDisplayState('btn-create-simple', false); } 
        else { setDisplayState('import-area', false); setDisplayState('btn-create-simple', true); }
    }
};

window.addBookSimple = function() {
    const name = document.getElementById('new-book-name').value.trim();
    const tag = document.getElementById('new-book-tag').value.trim();
    if (!name) { window.SilenModal.alert("請輸入單字簿名稱"); return; }
    window.books.push({ id: Date.now(), name: name, tag: tag, words: [], isGSAT: false, isPhrase: false }); 
    window.saveData(); document.getElementById('new-book-name').value = ''; document.getElementById('new-book-tag').value = ''; window.renderBookList();
};

window.addPhraseBookSimple = function() {
    const name = document.getElementById('new-phrase-name').value.trim();
    const tag = document.getElementById('new-phrase-tag').value.trim();
    if (!name) { window.SilenModal.alert("請輸入片語簿名稱"); return; }
    window.books.push({ id: Date.now(), name: name, tag: tag, words: [], isGSAT: false, isPhrase: true }); 
    window.saveData(); document.getElementById('new-phrase-name').value = ''; document.getElementById('new-phrase-tag').value = ''; window.renderBookList();
};

window.addBookWithImport = function() {
    const name = document.getElementById('new-book-name').value.trim();
    const tag = document.getElementById('new-book-tag').value.trim();
    const rawText = document.getElementById('import-content').value.trim();
    if (!name) { window.SilenModal.alert("請輸入單字簿名稱"); return; } 
    if (!rawText) { window.SilenModal.alert("請輸入轉換內容"); return; }
    
    const lines = rawText.split('\n'); const newWords = [];
    lines.forEach(line => {
        let sep1 = line.indexOf('-'); if (sep1 === -1) sep1 = line.indexOf('–'); 
        if (sep1 > 0) {
            const en = line.substring(0, sep1).trim();
            let remainder = line.substring(sep1 + 1).trim();
            
            let sep2 = remainder.indexOf('-'); if (sep2 === -1) sep2 = remainder.indexOf('–');
            let zhStr = remainder; let pos = '';
            if (sep2 > 0) { zhStr = remainder.substring(0, sep2).trim(); pos = remainder.substring(sep2 + 1).trim(); }
            if (en && zhStr) { newWords.push({ en: en, zh: zhStr.split(/[;；,，\/]/).map(s => s.trim()).filter(s => s), pos: pos }); }
        }
    });
    if (newWords.length === 0) { window.SilenModal.alert("格式解析失敗，請採用「英文 - 中文 - 詞性(選填)」結構"); return; }
    window.books.push({ id: Date.now(), name: name, tag: tag, words: newWords, isGSAT: false, isPhrase: false }); 
    window.saveData();
    document.getElementById('new-book-name').value = ''; document.getElementById('new-book-tag').value = ''; document.getElementById('import-content').value = ''; 
    window.toggleImportArea('word'); window.renderBookList(); window.SilenModal.alert(`成功匯入 ${newWords.length} 個單字。`);
};

window.addPhraseBookWithImport = function() {
    const name = document.getElementById('new-phrase-name').value.trim();
    const tag = document.getElementById('new-phrase-tag').value.trim();
    const rawText = document.getElementById('import-content-phrase').value.trim();
    if (!name) { window.SilenModal.alert("請輸入片語簿名稱"); return; } 
    if (!rawText) { window.SilenModal.alert("請輸入轉換內容"); return; }
    
    const lines = rawText.split('\n'); const newWords = [];
    lines.forEach(line => {
        let sep1 = line.indexOf('-'); if (sep1 === -1) sep1 = line.indexOf('–'); 
        if (sep1 > 0) {
            const en = line.substring(0, sep1).trim();
            const zhStr = line.substring(sep1 + 1).trim();
            if (en && zhStr) newWords.push({ en: en, zh: zhStr.split(/[;；,，\/]/).map(s => s.trim()).filter(s => s), pos: '' });
        }
    });
    if (newWords.length === 0) { window.SilenModal.alert("格式解析失敗，請採用「英文片語 - 中文」結構"); return; }
    window.books.push({ id: Date.now(), name: name, tag: tag, words: newWords, isGSAT: false, isPhrase: true }); 
    window.saveData();
    document.getElementById('new-phrase-name').value = ''; document.getElementById('new-phrase-tag').value = ''; document.getElementById('import-content-phrase').value = ''; 
    window.toggleImportArea('phrase'); window.renderBookList(); window.SilenModal.alert(`成功匯入 ${newWords.length} 個片語。`);
};

window.toggleExportMenu = function() { document.getElementById('export-menu').classList.toggle('active'); };

window.exportBook = function(type) {
    const book = window.books.find(b => b.id === currentBookId);
    if (!book || book.words.length === 0) { window.SilenModal.alert("無可用數據匯出。"); window.toggleExportMenu(); return; }
    
    const content = book.words.map(w => {
        if (w.pos && w.pos.trim() !== '') return `${w.en} - ${w.zh.join(' / ')} - ${w.pos}`;
        return `${w.en} - ${w.zh.join(' / ')}`;
    }).join('\n');
    
    if (type === 'copy') {
        if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(content).then(() => window.SilenModal.alert("已複製到剪貼簿。")).catch(() => window.SilenModal.prompt("請複製以下內容：", content)); } 
        else { window.SilenModal.prompt("請複製以下內容：", content); }
    } else if (type === 'download') {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${book.name || 'Export'}.txt`; 
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }
    window.toggleExportMenu();
};

document.addEventListener('click', (event) => {
    const menu = document.getElementById('export-menu'); const exportBtn = document.querySelector('.nav-bar-right .btn-icon');
    if (menu && menu.classList.contains('active') && !menu.contains(event.target) && event.target !== exportBtn) menu.classList.remove('active');
});

window.deleteCurrentBook = function() {
    window.SilenModal.confirm('確定要永久刪除此題庫嗎？').then((agreed) => {
        if(agreed) { window.books = window.books.filter(b => b.id !== currentBookId); selectedBookIds.delete(currentBookId); window.saveData(); window.openBookSelect(); }
    });
};

window.openEditBook = function(id) { 
    currentBookId = id; const book = window.books.find(b => b.id === id);
    document.getElementById('edit-book-name-input').value = book.name; document.getElementById('edit-book-tag-input').value = book.tag || '';
    document.getElementById('export-menu').classList.remove('active'); 
    window.editingWordIndex = null;
    window.renderWordList(); window.switchView('edit'); 
};

window.saveBookInfo = function() {
    const book = window.books.find(b => b.id === currentBookId); if(!book) return;
    const newName = document.getElementById('edit-book-name-input').value.trim(); const newTag = document.getElementById('edit-book-tag-input').value.trim();
    if(!newName) { window.SilenModal.alert('名稱不能為空。'); return; }
    book.name = newName; book.tag = newTag; window.saveData(); window.SilenModal.alert('資訊已更新。');
};

// 🌟 單字列表加上詞性標籤渲染 (支援實體按鈕點擊即時編輯)
window.editingWordIndex = null;

window.renderWordList = function() {
    const book = window.books.find(b => b.id === currentBookId); 
    const list = document.getElementById('word-list'); 
    list.innerHTML = '';
    
    [...book.words].reverse().forEach((word, index) => {
        const actualIndex = book.words.length - 1 - index;
        const div = document.createElement('div'); 
        div.className = 'word-item';
        
        if (window.editingWordIndex === actualIndex) {
            // ✏️ 編輯模式
            div.style.flexDirection = 'column';
            div.style.alignItems = 'stretch';
            
            // 安全處理引號，防止 HTML 字串被截斷
            const safeEn = word.en.replace(/"/g, '&quot;');
            const safeZh = word.zh.join(', ').replace(/"/g, '&quot;');
            
            div.innerHTML = `
                <div class="flex-row" style="margin-bottom: 10px;">
                    <input type="text" id="inline-en-${actualIndex}" value="${safeEn}" style="flex: 2; padding: 8px; font-size: 1rem;">
                    <select id="inline-pos-${actualIndex}" style="flex: 1; padding: 8px; background: var(--card-bg); border: 2px solid var(--border); color: var(--text-main); border-radius: 8px; outline: none; font-size: 1rem;">
                        <option value="" ${word.pos===''?'selected':''}>無</option>
                        <option value="n." ${word.pos==='n.'?'selected':''}>n. (名詞)</option>
                        <option value="v." ${word.pos==='v.'?'selected':''}>v. (動詞)</option>
                        <option value="vt." ${word.pos==='vt.'?'selected':''}>vt. (及物)</option>
                        <option value="vi." ${word.pos==='vi.'?'selected':''}>vi. (不及物)</option>
                        <option value="adj." ${word.pos==='adj.'?'selected':''}>adj. (形容)</option>
                        <option value="adv." ${word.pos==='adv.'?'selected':''}>adv. (副詞)</option>
                        <option value="prep." ${word.pos==='prep.'?'selected':''}>prep. (介係)</option>
                        <option value="conj." ${word.pos==='conj.'?'selected':''}>conj. (連接)</option>
                    </select>
                </div>
                <input type="text" id="inline-zh-${actualIndex}" value="${safeZh}" style="margin-bottom: 10px; padding: 8px; font-size: 1rem;">
                <div class="flex-row" style="justify-content: flex-end; margin-top: 5px;">
                    <button class="btn btn-outline btn-small" onclick="window.cancelEditWord()">取消</button>
                    <button class="btn btn-small" onclick="window.saveEditWord(${actualIndex})">儲存</button>
                </div>
            `;
        } else {
            // 👁️ 預覽模式：新增獨立的實體「✏️」編輯按鈕
            let posHtml = (word.pos && word.pos.trim() !== '') ? `<span class="word-pos">[${word.pos}]</span>` : '';
            div.innerHTML = `
                <div style="flex: 1; padding-right: 15px;">
                    <div class="word-en">${word.en} ${posHtml}</div>
                    <div class="word-zh">${word.zh.join(', ')}</div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="btn-icon" style="border:none; font-size: 1.1rem; padding: 5px; margin: 0; color: var(--text-sub);" onclick="window.startEditWord(${actualIndex})" title="編輯單字">✏️</button>
                    <button class="btn-icon btn-delete" style="border:none; padding: 5px; margin: 0;" onclick="window.deleteWord(${actualIndex})" title="刪除單字">✕</button>
                </div>
            `;
        }
        list.appendChild(div);
    });
};

window.startEditWord = function(index) {
    window.editingWordIndex = index;
    window.renderWordList();
};

window.cancelEditWord = function() {
    window.editingWordIndex = null;
    window.renderWordList();
};

window.saveEditWord = function(index) {
    const en = document.getElementById(`inline-en-${index}`).value.trim();
    const pos = document.getElementById(`inline-pos-${index}`).value.trim();
    const zhStr = document.getElementById(`inline-zh-${index}`).value.trim();
    
    if(!en || !zhStr) { window.SilenModal.alert("英文與中文不可為空"); return; }
    
    const book = window.books.find(b => b.id === currentBookId);
    
    book.words[index].en = en;
    book.words[index].pos = pos;
    book.words[index].zh = zhStr.split(/[;；,，\/]/).map(s => s.trim()).filter(s => s);
    
    window.saveData();
    window.editingWordIndex = null;
    window.renderWordList();
};

window.addWord = function() {
    const en = document.getElementById('input-en').value.trim(); 
    const pos = document.getElementById('input-pos').value.trim(); 
    const zhStr = document.getElementById('input-zh').value.trim();
    if(!en || !zhStr) { window.SilenModal.alert("英文與中文欄位不可為空"); return; }
    
    window.books.find(b => b.id === currentBookId).words.push({ 
        en: en, 
        pos: pos,
        zh: zhStr.split(/[;；,，\/]/).map(s => s.trim()).filter(s => s) 
    }); 
    window.saveData(); 
    document.getElementById('input-en').value = ''; 
    document.getElementById('input-pos').value = ''; 
    document.getElementById('input-zh').value = ''; 
    document.getElementById('input-en').focus(); 
    window.renderWordList();
};

window.deleteWord = function(index) { 
    window.books.find(b => b.id === currentBookId).words.splice(index, 1); 
    window.saveData(); 
    window.renderWordList(); 
};

window.getPracticeWords = function() {
    if (selectedBookIds.size === 0) { window.SilenModal.alert("請先選取題庫範圍。"); return []; }
    let queue = []; 
    window.books.forEach(book => { 
        if (selectedBookIds.has(book.id)) {
            book.words.forEach(w => queue.push({ ...w, bookId: book.id, isGSAT: book.isGSAT, isPhrase: book.isPhrase, bookTag: book.tag || '', bookLength: book.words.length, mastered: w.mastered || false, scored: false, pos: w.pos || '' }));
        }
    });
    if (queue.length === 0) { window.SilenModal.alert("範圍內不含數據。"); return []; } 
    return queue;
};

window.getSelectedWordsPool = function() {
    if (isGuestMode) return guestWords;
    let pool = []; 
    window.books.forEach(book => { 
        if (selectedBookIds.has(book.id)) {
            book.words.forEach(w => pool.push({ ...w, bookId: book.id, isGSAT: book.isGSAT, isPhrase: book.isPhrase, bookTag: book.tag || '', bookLength: book.words.length, mastered: w.mastered || false, pos: w.pos || '' }));
        }
    }); 
    return pool;
};


// =====================================
// 🚀 6. 雙軌精通模式 (Mastery Mode) + 延遲結算計分引擎
// =====================================
let masteryPool = [];
let currentMasteryTarget = null;
let masteryModeType = 'comprehensive';
let delayWaitTurns = 4;
let pendingMasteredWords = [];

function calculateReward(word, stepKey) {
    let isGsat = word.isGSAT === true;
    let bookTag = word.bookTag || '';
    let bookLength = word.bookLength || 0;
    let isMastered = word.mastered === true;
    
    let multiplier = 1;
    if (isGsat) {
        if (bookTag.includes('Lv2')) multiplier = 1.2;
        else if (bookTag.includes('Lv3')) multiplier = 1.5;
        else if (bookTag.includes('Lv4')) multiplier = 2.0;
        else if (bookTag.includes('Lv5')) multiplier = 2.5;
        else if (bookTag.includes('Lv6')) multiplier = 3.0;
    }

    let isSeasonEligible = isGsat || bookLength >= 15;
    let points = 0;

    if (stepKey === 'Comp_Grad' || stepKey === 'Conn_Grad') {
        if (isMastered) {
            points = 0;
        } else {
            if (isGsat) {
                points = Math.round(50 * multiplier);
            } else if (isSeasonEligible) {
                points = 50;
            }
        }
    }

    return { points, isSeasonEligible, isMastered };
}

window.bufferWordAsMastered = function(targetWord) {
    if (targetWord.mastered) return;
    if (!pendingMasteredWords.some(w => w.en === targetWord.en)) {
        let tempWord = { ...targetWord }; 
        pendingMasteredWords.push(tempWord);
    }
};

window.finalizeMasterySession = function() {
    if (pendingMasteredWords.length === 0) return;

    console.log(`🎬 偵測到精通練習結束，開始大批次結算... 共有 ${pendingMasteredWords.length} 個新精通單字/片語`);
    
    let totalPoints = 0;
    let totalSeasonPoints = 0;

    pendingMasteredWords.forEach(targetWord => {
        // 寫入精通狀態
        window.books.forEach(book => {
            if (book.id === targetWord.bookId) {
                let w = book.words.find(x => x.en === targetWord.en);
                if (w && !w.mastered) w.mastered = true;
            }
        });
        
        // 計算這個單字應得的分數
        let stepKey = (masteryModeType === 'comprehensive' || masteryModeType === 'phrase') ? 'Comp_Grad' : 'Conn_Grad';
        let rw = window.calculateReward(targetWord, stepKey);
        
        totalPoints += rw.points;
        if (rw.isSeasonEligible) totalSeasonPoints += rw.points;
    });

    if (typeof window.updateProfileStats === 'function') window.updateProfileStats();
    if (typeof window.saveData === 'function') window.saveData(); 

    pendingMasteredWords.forEach(word => {
        let stepKey = (masteryModeType === 'comprehensive') ? 'Comp_Grad' : 'Conn_Grad';
        let rw = calculateReward(word, stepKey);
        
        if (window.addScore && rw.points > 0) {
            window.addScore(rw.points, rw.isSeasonEligible);
        }
    });

    pendingMasteredWords = [];
};

window.setupMasteryMode = function(type) {
    let words = getPracticeWords(); 
    if(words.length === 0) return;
    
    masteryModeType = type; 
    pendingMasteredWords = []; 
    
    masteryPool = words.map(w => ({ 
        en: w.en, zh: w.zh, level: 0, delay: 0, 
        isGSAT: w.isGSAT, bookTag: w.bookTag, bookLength: w.bookLength,
        bookId: w.bookId, mastered: w.mastered
    })); 
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
        window.finalizeMasterySession();
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
            icon.innerText = '✔'; icon.className = 'big-icon icon-correct'; 
            status.innerText = '正確'; status.className = 'result-status status-correct';
            
            if (lvl === 1) { 
                currentMasteryTarget.level = 2; 
                msg.innerText = `升級至 Level 2 結構重組。`; 
            } else if (lvl === 2) { 
                currentMasteryTarget.level = 3; 
                msg.innerText = `升級至 Level 3 主動輸出。`; 
            } else if (lvl === 3) { 
                currentMasteryTarget.level = 3.5; currentMasteryTarget.delay = delayWaitTurns; 
                msg.innerText = `進入記憶固化潛伏期，系統稍後將觸發延遲評測。`; 
            } else if (lvl === 3.9) { 
                currentMasteryTarget.level = 5; 
                let rw = calculateReward(currentMasteryTarget, 'Comp_Grad');
                
                let extraMsg = "";
                if (!rw.isMastered) {
                    window.bufferWordAsMastered(currentMasteryTarget);
                    extraMsg = rw.points > 0 ? ` (🏆 結算時將獲得 ${rw.points} 分)` : " (解鎖成就：已精通)";
                } else {
                    extraMsg = " (此單字已精通過，不再重複給予分數)";
                }
                
                msg.innerText = `通過延遲評測，該單字已完全精通！${extraMsg}`; 
            }
        } else {
            icon.innerText = '✘'; icon.className = 'big-icon icon-wrong'; 
            status.innerText = '錯誤'; status.className = 'result-status status-wrong';
            currentMasteryTarget.level = 1; msg.innerText = "降級重回 Level 1 視覺辨識。";
        }
    } else {
        if (isCorrect) {
            icon.innerText = '✔'; icon.className = 'big-icon icon-correct'; 
            status.innerText = '正確'; status.className = 'result-status status-correct';
            
            if (lvl === 1) { 
                currentMasteryTarget.level = 2; 
                msg.innerText = `升級至 Level 2 雙向連接。`; 
            } else if (lvl === 2) { 
                currentMasteryTarget.level = 2.5; currentMasteryTarget.delay = delayWaitTurns; 
                msg.innerText = "進入記憶固化潛伏期，系統稍後將觸發延遲評測。"; 
            } else if (lvl === 2.9) { 
                currentMasteryTarget.level = 4; 
                let rw = calculateReward(currentMasteryTarget, 'Conn_Grad');
                
                let extraMsg = "";
                if (!rw.isMastered) {
                    window.bufferWordAsMastered(currentMasteryTarget);
                    extraMsg = rw.points > 0 ? ` (🏆 結算時將獲得 ${rw.points} 分)` : " (解鎖成就：已精通)";
                } else {
                    extraMsg = " (此單字已精通過，不再重複給予分數)";
                }
                
                msg.innerText = `通過延遲評測，單字連接力建立完成！${extraMsg}`; 
            }
        } else {
            icon.innerText = '✘'; icon.className = 'big-icon icon-wrong'; 
            status.innerText = '錯誤'; status.className = 'result-status status-wrong';
            currentMasteryTarget.level = 1; msg.innerText = "降級重回 Level 1 視覺辨識。";
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
// 7. 原版 8 大練習模式 (Original 8 Modes) + 生涯計分
// =====================================
window.setupPractice = function(mode) { 
    practiceQueue = getPracticeWords(); 
    if (!practiceQueue || practiceQueue.length === 0) return; 
    
    if (!isSequentialMode) {
        practiceQueue.sort(() => Math.random() - 0.5); 
    }
    
    currentMode = mode; 
    currentCardIndex = 0; 
    initialQueueLength = practiceQueue.length; 
    completedCount = 0; 
    
    document.getElementById('mode-display').innerText = (mode === 'zh-to-en') ? '中翻英' : '英翻中'; 
    setDisplayState('sequential-badge', isSequentialMode, 'inline-block'); 
    setDisplayState('hint-btn', (mode === 'zh-to-en'), 'inline-block'); 
    
    window.switchView('practice'); 
    window.showNextCard(); 
};

window.showNextCard = function() { 
    if (currentCardIndex >= practiceQueue.length) return window.endQuiz(); 
    
    const w = practiceQueue[currentCardIndex]; 
    setDisplayState('interaction-area', true, 'block'); 
    setDisplayState('feedback-area', false); 
    
    const inputEl = document.getElementById('answer-input');
    if (inputEl) {
        inputEl.value = ''; 
        setTimeout(() => inputEl.focus(), 50);
    }
    
    document.getElementById('hint-display').innerText = ''; 
    document.getElementById('progress-display').innerText = isSequentialMode ? `第 ${currentCardIndex+1} 關` : `${completedCount}/${initialQueueLength}`; 
    
    const q = (currentMode === 'zh-to-en') ? w.zh.join(' / ') : w.en; 
    document.getElementById('question-display').innerText = q; 
    document.getElementById('feedback-question-copy').innerText = q; 
};

window.showHint = function() { 
    if (!practiceQueue[currentCardIndex]) return;
    let w = practiceQueue[currentCardIndex].en; 
    let hintStr = (w.length <= 2) ? w : `${w.charAt(0)}${'_'.repeat(w.length-2)}${w.charAt(w.length-1)}`;
    document.getElementById('hint-display').innerText = hintStr; 
};

window.checkAnswer = function() { 
    if (currentCardIndex >= practiceQueue.length) return;
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
    if (c && !w.scored) { 
        w.scored = true; 
        if (typeof window.addScore === 'function') window.addScore(10, false); 
    }
    
    if (!c && !isSequentialMode) window.requeueWord(w); 
    window.showFeedback(c, w); 
};

window.showFeedback = function(c, w) { 
    setDisplayState('interaction-area', false); 
    setDisplayState('feedback-area', true, 'flex'); 
    
    const i = document.getElementById('feedback-icon'); 
    const s = document.getElementById('feedback-status'); 
    document.getElementById('feedback-answer').innerText = (currentMode === 'zh-to-en') ? w.en : w.zh.join(', '); 
    
    if (c) { 
        i.innerText = '✔'; 
        i.className = 'big-icon icon-correct'; 
        s.innerText = '正確 (+10 分)'; 
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

window.handleNextClick = function() { 
    if (lastAnswerCorrect) completedCount++; 
    if (isSequentialMode && !lastAnswerCorrect) { 
        window.SilenModal.alert("評測錯誤，重頭開始。").then(() => { 
            currentCardIndex = 0; completedCount = 0; window.showNextCard(); 
        });
    } else {
        currentCardIndex++; window.showNextCard(); 
    }
};

const answerInputEl = document.getElementById('answer-input');
if (answerInputEl) {
    answerInputEl.addEventListener('keypress', (e) => { 
        if (e.key === 'Enter') { e.preventDefault(); window.checkAnswer(); } 
    });
}

window.setupMultipleChoice = function(mode) { 
    practiceQueue = getPracticeWords(); 
    if (!practiceQueue || practiceQueue.length === 0) return; 
    
    let pool = getSelectedWordsPool();
    let uniqueWords = new Set();
    pool.forEach(w => uniqueWords.add(w.en));
    
    if (uniqueWords.size < 4) { 
        window.SilenModal.alert("單字簿數量不足以生成干擾項選項。"); return; 
    }
    
    if (!isSequentialMode) {
        practiceQueue.sort(() => Math.random() - 0.5); 
    }
    
    currentMode = mode; currentCardIndex = 0; 
    initialQueueLength = practiceQueue.length; completedCount = 0; 
    
    document.getElementById('mcq-mode-display').innerText = (mode === 'zh-to-en') ? '中選英' : '英選中'; 
    setDisplayState('mcq-seq-badge', isSequentialMode, 'inline-block'); 
    window.switchView('mcq'); window.showMcqNextCard(); 
};

window.showMcqNextCard = function() { 
    if (currentCardIndex >= practiceQueue.length) return window.endQuiz(); 
    
    const w = practiceQueue[currentCardIndex]; 
    setDisplayState('mcq-interaction-area', true, 'block'); 
    setDisplayState('mcq-feedback-area', false); 
    document.getElementById('mcq-progress-display').innerText = isSequentialMode ? `第 ${currentCardIndex+1} 關` : `${completedCount}/${initialQueueLength}`; 
    
    const q = (currentMode === 'zh-to-en') ? w.zh.join(' / ') : w.en; 
    document.getElementById('mcq-question-display').innerText = q; 
    document.getElementById('mcq-feedback-question-copy').innerText = q; 
    
    let opts = [w]; 
    let pool = getSelectedWordsPool();
    let dis = pool.filter(x => x.en !== w.en).sort(() => Math.random() - 0.5);
    
    opts = opts.concat(dis.slice(0, 3)); 
    opts.sort(() => Math.random() - 0.5); 
    
    const a = document.getElementById('mcq-options-area'); 
    a.innerHTML = ''; 
    opts.forEach(o => { 
        let b = document.createElement('button'); 
        b.className = 'btn-mcq'; 
        b.innerText = (currentMode === 'zh-to-en') ? o.en : o.zh.join(' / '); 
        b.onclick = () => window.checkMcqAnswer(o.en === w.en); 
        a.appendChild(b); 
    }); 
};

window.checkMcqAnswer = function(c) { 
    if (currentCardIndex >= practiceQueue.length) return;
    lastAnswerCorrect = c; 
    const w = practiceQueue[currentCardIndex]; 
    
    if (c && !w.scored) { 
        w.scored = true; 
        if (typeof window.addScore === 'function') window.addScore(10, false); 
    }
    
    if (!c && !isSequentialMode) window.requeueWord(w); 
    setDisplayState('mcq-interaction-area', false); 
    setDisplayState('mcq-feedback-area', true, 'flex'); 
    
    const i = document.getElementById('mcq-feedback-icon'); 
    const s = document.getElementById('mcq-feedback-status'); 
    document.getElementById('mcq-feedback-answer').innerText = (currentMode === 'zh-to-en') ? w.en : w.zh.join(', '); 
    
    if (c) { 
        i.innerText = '✔'; i.className = 'big-icon icon-correct'; 
        s.innerText = '正確 (+10 分)'; s.className = 'result-status status-correct'; 
    } else { 
        i.innerText = '✘'; i.className = 'big-icon icon-wrong'; 
        s.innerText = '錯誤'; s.className = 'result-status status-wrong'; 
    } 
    window.forceSpeak = true; 
    speakEnglishWord(w.en); 
};

window.handleMcqNextClick = function() { 
    if (lastAnswerCorrect) completedCount++; 
    if (isSequentialMode && !lastAnswerCorrect) { 
        window.SilenModal.alert("評測錯誤，重頭開始。").then(() => { 
            currentCardIndex = 0; completedCount = 0; window.showMcqNextCard(); 
        }); 
    } else { 
        currentCardIndex++; window.showMcqNextCard(); 
    }
};

window.setupSpeakingMode = function() { 
    if (!recognition) { 
        window.SilenModal.alert("當前核心環境不支援語音介面。"); return; 
    }
    practiceQueue = getPracticeWords(); 
    if (!practiceQueue || practiceQueue.length === 0) return; 
    
    if (!isSequentialMode) {
        practiceQueue.sort(() => Math.random() - 0.5); 
    }
    
    currentCardIndex = 0; initialQueueLength = practiceQueue.length; completedCount = 0; 
    window.switchView('speaking'); window.showNextSpeakingCard(); 
};

window.showNextSpeakingCard = function() { 
    if (currentCardIndex >= practiceQueue.length) return window.endQuiz(); 
    const w = practiceQueue[currentCardIndex]; 
    setDisplayState('speaking-interaction-area', true, 'block'); 
    setDisplayState('speaking-feedback-area', false); 
    document.getElementById('speaking-word-display').innerText = w.en; 
    document.getElementById('speaking-zh-display').innerText = w.zh.join(' / '); 
    document.getElementById('speaking-status').innerText = '準備就緒'; 
    document.getElementById('speaking-progress').innerText = `${completedCount}/${initialQueueLength}`; 
    window.forceSpeak = true; 
    speakEnglishWord(w.en); 
};

window.startSpeechRecognition = function() { 
    if (!recognition) return;
    const b = document.getElementById('mic-btn'); 
    const s = document.getElementById('speaking-status'); 
    try { 
        recognition.start(); 
        b.classList.add('listening'); 
        s.innerText = '正在語音錄製與分析...'; 
    } catch(e) { console.error(e); } 
    
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
            
            if (!practiceQueue[currentCardIndex].scored) {
                practiceQueue[currentCardIndex].scored = true;
                if (typeof window.addScore === 'function') window.addScore(fs, false);
            }
            
            sd.innerText = `${fs} 分`; sd.style.color = 'var(--success)'; 
            md.innerText = `發音標準 (+${fs} 分)`; hd.innerText = `捕獲音訊: "${h}"`; 
        } else { 
            lastAnswerCorrect = false; 
            sd.innerText = '0 分'; sd.style.color = 'var(--error)'; 
            md.innerText = '識別不匹配'; hd.innerText = `捕獲音訊: "${h}"`; 
            if (!isSequentialMode) window.requeueWord(practiceQueue[currentCardIndex]); 
        } 
    }; 
    recognition.onerror = () => { b.classList.remove('listening'); s.innerText = '音訊解碼失敗。'; }; 
    recognition.onspeechend = () => { recognition.stop(); b.classList.remove('listening'); }; 
};

window.handleSpeakingNextClick = function() { 
    if (lastAnswerCorrect) completedCount++; 
    if (isSequentialMode && !lastAnswerCorrect) { 
        window.SilenModal.alert('重頭開始。').then(() => { 
            currentCardIndex = 0; completedCount = 0; window.showNextSpeakingCard(); 
        }); 
    } else { currentCardIndex++; window.showNextSpeakingCard(); }
};

window.setupPuzzleMode = function() { 
    practiceQueue = getPracticeWords(); 
    if (!practiceQueue || practiceQueue.length === 0) return; 
    
    if (!isSequentialMode) {
        practiceQueue.sort(() => Math.random() - 0.5); 
    }
    
    currentCardIndex = 0; 
    setDisplayState('puzzle-seq-badge', isSequentialMode, 'inline-block'); 
    window.switchView('puzzle'); window.loadPuzzleLevel(); 
};

window.loadPuzzleLevel = function() { 
    if (currentCardIndex >= practiceQueue.length) return window.endQuiz(); 
    puzzleCurrentWord = practiceQueue[currentCardIndex]; 
    puzzleUserAnswer = []; 
    let ls = puzzleCurrentWord.en.toLowerCase().split(''); 
    for (let i = ls.length - 1; i > 0; i--) { 
        let j = Math.floor(Math.random() * (i + 1)); 
        let temp = ls[i]; ls[i] = ls[j]; ls[j] = temp;
    } 
    puzzleSourceLetters = ls.map((l, i) => ({ id: i, char: l, used: false })); 
    document.getElementById('puzzle-hint-display').innerText = ''; 
    document.getElementById('puzzle-question').innerText = puzzleCurrentWord.zh.join(' / '); 
    document.getElementById('puzzle-message').innerText = ''; 
    document.getElementById('puzzle-progress').innerText = isSequentialMode ? `第 ${currentCardIndex+1} 關` : `${currentCardIndex+1}/${practiceQueue.length}`; 
    window.renderPuzzleBoard(); 
};

window.showPuzzleHint = function() { 
    if(!puzzleCurrentWord) return;
    let w = puzzleCurrentWord.en; 
    let hintStr = (w.length <= 2) ? w : `${w.charAt(0)}${'_'.repeat(w.length-2)}${w.charAt(w.length-1)}`;
    document.getElementById('puzzle-hint-display').innerText = hintStr; 
};

window.renderPuzzleBoard = function() { 
    const a = document.getElementById('puzzle-answer-area'); 
    const p = document.getElementById('puzzle-pool-area'); 
    a.innerHTML = ''; p.innerHTML = ''; 
    
    puzzleUserAnswer.forEach((o, i) => { 
        let t = document.createElement('div'); t.className = 'letter-tile'; t.innerText = o.char; 
        t.onclick = () => { 
            puzzleUserAnswer[i].used = false; 
            puzzleUserAnswer.splice(i, 1); 
            window.renderPuzzleBoard(); 
        }; 
        a.appendChild(t); 
    }); 
    if (puzzleUserAnswer.length < puzzleCurrentWord.en.length) { 
        let ph = document.createElement('div'); ph.className = 'letter-tile empty'; ph.innerText = '_'; a.appendChild(ph); 
    } 
    puzzleSourceLetters.forEach(o => { 
        if (!o.used) { 
            let t = document.createElement('div'); t.className = 'letter-tile'; t.innerText = o.char; 
            t.onclick = () => { 
                o.used = true; 
                puzzleUserAnswer.push(o); 
                window.renderPuzzleBoard(); 
                window.checkPuzzleState(false); 
            }; 
            p.appendChild(t); 
        } 
    }); 
};

window.checkPuzzleState = function(f) { 
    if(!puzzleCurrentWord) return;
    let cs = puzzleUserAnswer.map(o => o.char).join(''); 
    let ts = puzzleCurrentWord.en.toLowerCase(); 
    let m = document.getElementById('puzzle-message'); 
    
    if (cs.length === ts.length || f === true) { 
        if (cs === ts) { 
            m.className = 'result-msg result-correct'; m.innerText = '正確 (+10 分)'; 
            
            if (!puzzleCurrentWord.scored) {
                puzzleCurrentWord.scored = true;
                if (typeof window.addScore === 'function') window.addScore(10, false);
            }
            
            window.forceSpeak = true; speakEnglishWord(ts); 
            setTimeout(() => { currentCardIndex++; window.loadPuzzleLevel(); }, 800); 
        } else { 
            if (isSequentialMode) { 
                m.className = 'result-msg result-wrong'; m.innerText = `錯誤，答案為 ${ts}。`; 
                window.forceSpeak = true; speakEnglishWord(ts); 
                setTimeout(() => { currentCardIndex = 0; window.loadPuzzleLevel(); }, 2000); 
            } else { 
                if (f === true) { 
                    m.className = 'result-msg result-wrong'; m.innerText = `錯誤，答案為 ${ts}`; 
                    window.forceSpeak = true; speakEnglishWord(ts); 
                    window.requeueWord(puzzleCurrentWord); 
                    setTimeout(() => { currentCardIndex++; window.loadPuzzleLevel(); }, 2000); 
                } else { 
                    m.className = 'result-msg result-wrong'; m.innerText = '比對不符'; 
                } 
            } 
        } 
    } 
};

window.setupMemoryMode = function() { 
    let p = getPracticeWords(); 
    if (!p || p.length < 2) { window.SilenModal.alert("生成記憶矩陣單字數量不足。"); return; } 
    
    p.sort(() => Math.random() - 0.5); 
    let sw = p.slice(0, 8); 
    memoryCards = []; 
    sw.forEach(w => { 
        memoryCards.push({ id: w.en, content: w.en, type: 'en', matched: false }); 
        memoryCards.push({ id: w.en, content: w.zh[0], type: 'zh', matched: false }); 
    }); 
    memoryCards.sort(() => Math.random() - 0.5); 
    
    memoryFlipped = []; memoryLocked = false; memoryMatchedCount = 0; 
    window.switchView('memory'); window.renderMemoryBoard(); 
    document.getElementById('memory-message').innerText = '請選取卡片'; 
};

window.renderMemoryBoard = function() { 
    const b = document.getElementById('memory-board'); b.innerHTML = ''; 
    memoryCards.forEach((c, i) => { 
        let d = document.createElement('div'); 
        d.className = `memory-card ${c.matched ? 'matched' : ''}`; 
        d.innerHTML = `<div class="memory-inner"><div class="memory-front">${c.content}</div><div class="memory-back">?</div></div>`; 
        d.onclick = () => window.flipCard(i); 
        b.appendChild(d); 
    }); 
};

window.flipCard = function(i) { 
    if (memoryLocked || memoryCards[i].matched || memoryFlipped.includes(i)) return; 
    document.getElementById('memory-board').children[i].classList.add('flipped'); 
    memoryFlipped.push(i); 
    if (memoryFlipped.length === 2) window.checkMemoryMatch(); 
};

window.checkMemoryMatch = function() { 
    memoryLocked = true; 
    let i1 = memoryFlipped[0]; 
    let i2 = memoryFlipped[1]; 
    let c1 = memoryCards[i1]; 
    let c2 = memoryCards[i2]; 
    let m = document.getElementById('memory-message'); 
    
    if (c1.id === c2.id) { 
        c1.matched = c2.matched = true; memoryMatchedCount += 2; 
        
        if (typeof window.addScore === 'function') window.addScore(10, false);
        
        document.getElementById('memory-board').children[i1].classList.add('matched'); 
        document.getElementById('memory-board').children[i2].classList.add('matched'); 
        m.innerText = '矩陣配對成功 (+10 分)'; m.className = 'result-msg result-correct'; 
        window.forceSpeak = true; speakEnglishWord(c1.id); 
        memoryFlipped = []; memoryLocked = false; 
        if (memoryMatchedCount === memoryCards.length) setTimeout(() => window.endQuiz(), 500); 
    } else { 
        m.innerText = '不匹配'; m.className = 'result-msg result-wrong'; 
        setTimeout(() => { 
            document.getElementById('memory-board').children[i1].classList.remove('flipped'); 
            document.getElementById('memory-board').children[i2].classList.remove('flipped'); 
            memoryFlipped = []; memoryLocked = false; m.innerText = ''; 
        }, 1000); 
    } 
};

window.setupYouglishMode = function() { 
    practiceQueue = getPracticeWords(); 
    if (!practiceQueue || practiceQueue.length === 0) return; 
    
    practiceQueue.sort(() => Math.random() - 0.5); 
    currentCardIndex = 0; 
    window.switchView('youglish'); window.loadYouglishCard(); 
};

window.loadYouglishCard = function() { 
    if (!practiceQueue[currentCardIndex]) return; 
    const w = practiceQueue[currentCardIndex]; 
    document.getElementById('yg-word').innerText = w.en; 
    document.getElementById('yg-zh').innerText = w.zh.join(' / '); 
    document.getElementById('yg-progress').innerText = `${currentCardIndex+1}/${practiceQueue.length}`; 
    document.getElementById('yg-link-word').innerText = w.en; 
    document.getElementById('yg-link').href = `https://youglish.com/pronounce/${encodeURIComponent(w.en)}/english`; 
};

window.nextYouglishCard = function() { 
    if (currentCardIndex < practiceQueue.length - 1) { currentCardIndex++; window.loadYouglishCard(); } else { window.endQuiz(); } 
};

window.prevYouglishCard = function() { 
    if (currentCardIndex > 0) { currentCardIndex--; window.loadYouglishCard(); } else { window.SilenModal.alert("已達佇列首端。"); } 
};

// ==========================================================================
// 🌟 8. 自訂下拉選單控制與學測抽卡系統
// ==========================================================================
window.toggleDropdown = function(id, event) {
    if(event) event.stopPropagation();
    document.querySelectorAll('.dropdown-options').forEach(el => { if (el.id !== id) el.classList.add('hidden'); });
    document.getElementById(id).classList.toggle('hidden');
};

document.addEventListener('click', () => { document.querySelectorAll('.dropdown-options').forEach(el => el.classList.add('hidden')); });

window.setLibMode = function(mode, text) {
    document.querySelector('#lib-dropdown .dropdown-selected').innerHTML = text + ' ▾';
    document.getElementById('lib-options').classList.add('hidden');
    
    if (mode === 'normal') { 
        setDisplayState('normal-book-area', true); setDisplayState('gsat-book-area', false); setDisplayState('phrase-book-area', false); 
    } else if (mode === 'gsat') { 
        setDisplayState('normal-book-area', false); setDisplayState('gsat-book-area', true); setDisplayState('phrase-book-area', false);
        const currentLevel = window.currentGsatLevel || 'lv1'; 
        if (gsatVocabCache[currentLevel].length === 0) { window.fetchGSATVocab(currentLevel); }
    } else if (mode === 'phrase') { 
        setDisplayState('normal-book-area', false); setDisplayState('gsat-book-area', false); setDisplayState('phrase-book-area', true); 
    }
};

window.currentGsatLevel = 'lv1';
window.setGsatLevel = function(level, text) {
    window.currentGsatLevel = level; document.querySelector('#level-dropdown .dropdown-selected').innerHTML = text + ' ▾'; document.getElementById('level-options').classList.add('hidden');
    const levelNum = level.replace('lv', ''); document.getElementById('gsat-claim-tag').value = `學測 Lv${levelNum}`;
    const nameInput = document.getElementById('gsat-claim-name'); if (nameInput.value.includes('抽取') || nameInput.value.trim() === '') { nameInput.value = `學測 Lv${levelNum} 抽取`; }
    if (gsatVocabCache[level].length === 0) { window.fetchGSATVocab(level); }
};

let gsatVocabCache = { lv1: [], lv2: [], lv3: [], lv4: [], lv5: [], lv6: [] };

window.fetchGSATVocab = async function(level) {
    const btn = document.getElementById('btn-claim-gsat'); if (btn) { btn.innerText = "資料庫載入中..."; btn.disabled = true; }
    try {
        const fileName = `vocabulary${level}.json`; const response = await fetch(fileName); if (!response.ok) throw new Error("網路請求失敗");
        const rawData = await response.json(); gsatVocabCache[level] = rawData.map(item => ({ en: item.word.trim(), zh: item.chinese.split(/[;；,，/、]/).map(s => s.trim()).filter(s => s) }));
        if (btn) { btn.innerText = "開始抽取"; btn.disabled = false; }
    } catch (error) {
        console.error(`載入 ${level} 失敗:`, error); if (window.SilenModal) window.SilenModal.alert(`載入失敗，請確認 vocabulary${level}.json 是否存在。`);
        if (btn) { btn.innerText = "載入失敗"; btn.disabled = false; }
    }
};

window.claimGSATWords = async function() {
    const level = window.currentGsatLevel || 'lv1';
    if (gsatVocabCache[level].length === 0) { await window.fetchGSATVocab(level); if (gsatVocabCache[level].length === 0) return; }

    const amount = parseInt(document.getElementById('gsat-claim-amount').value) || 30;
    const levelNum = level.replace('lv', ''); let defaultName = `學測 Lv${levelNum} 抽取`;
    const nameInput = document.getElementById('gsat-claim-name').value.trim(); const bookName = nameInput === '' ? defaultName : nameInput; const bookTag = document.getElementById('gsat-claim-tag').value.trim();

    let existingWords = new Set();
    window.books.forEach(book => { if (book.tag.includes('學測') || book.isGSAT) { book.words.forEach(w => existingWords.add(w.en.toLowerCase())); } });
    let availableWords = gsatVocabCache[level].filter(w => !existingWords.has(w.en.toLowerCase()));

    if (availableWords.length === 0) { window.SilenModal.alert(`太厲害了！學測 Lv${levelNum} 的單字已經被你全部抽完囉！`); return; }

    let finalAmount = amount;
    if (availableWords.length < amount) { window.SilenModal.alert(`單字庫即將見底！只剩下最後 ${availableWords.length} 個全新單字，將為您全數抽出。`); finalAmount = availableWords.length; }

    availableWords.sort(() => Math.random() - 0.5); let selectedWords = availableWords.slice(0, finalAmount);
    window.books.push({ id: Date.now(), name: bookName, tag: bookTag, isGSAT: true, isPhrase: false, words: selectedWords });

    if (typeof window.saveData === 'function') window.saveData();
    window.SilenModal.alert(`成功抽取 ${selectedWords.length} 個學測單字！\n已為您建立單字簿：「${bookName}」`).then(() => { if (typeof window.renderBookList === 'function') window.renderBookList(); });
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

// =====================================
// 🌟 10. 排行榜與計分系統 (Leaderboard & Scoring)
// =====================================
window.myTotalScore = 0;
window.lastScoreTime = 0;

window.showScoringRules = function() {
    window.SilenModal.alert(
        "🏆 賽季計分規則\n\n" +
        "為了確保排位賽的公平性，系統設有以下防洗分機制：\n\n" +
        "1. 只有在「精通模式」中將單字完全精通 (通過延遲評測畢業)，才能一口氣獲得 50 分的大獎勵，中間升級階段不給分。\n\n" +
        "2. 自建的普通單字簿需包含「至少 15 個單字」才具備計分資格。\n\n" +
        "3. 學測單字庫依據難度 (Lv1~Lv6) 享有額外的通關分數加成 (最高可達 3 倍)！"
    );
};

window.getCurrentWeekId = function() {
    const launchDate = new Date("2026-05-28T00:00:00+08:00").getTime();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    
    const weeksPassed = Math.floor((now - launchDate) / ONE_WEEK_MS);
    return Math.max(1, weeksPassed + 1); 
};

window.addScore = function(points, isSeasonEligible = false, force = false) {
    if (isGuestMode) return; 

    const now = Date.now();
    // 🌟 修正：加上 force 參數，讓大批次結算可以繞過 500ms 的防刷分限制
    if (!force && window.lastScoreTime && now - window.lastScoreTime < 500) return;
    window.lastScoreTime = now;

    window.myTotalScore += points;
    const elTotal = document.getElementById('stat-total-score');
    if (elTotal) elTotal.innerText = window.myTotalScore;

    let seasonPoints = 0;
    if (typeof isSeasonEligible === 'number') {
        seasonPoints = isSeasonEligible; // 支援批次傳入整包排位分
    } else {
        seasonPoints = isSeasonEligible ? points : 0; // 兼容原版布林值
    }

    if (typeof window.uploadScoreToCloud === 'function') {
        window.uploadScoreToCloud(window.myTotalScore, seasonPoints);
    }
};

window.openLeaderboard = function() {
    window.switchView('leaderboard');
    const currentWeek = window.getCurrentWeekId();
    
    document.getElementById('lb-current-week').innerText = `第 ${currentWeek} 賽季`;
    
    if (typeof window.fetchLeaderboard === 'function') {
        window.fetchLeaderboard(currentWeek);
    } else {
        document.getElementById('leaderboard-list').innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--text-sub);">連線錯誤：找不到雲端模組</div>';
    }
};

window.renderLeaderboard = function(listData, mySeasonScore) {
    document.getElementById('lb-my-score').innerText = mySeasonScore || 0;
    const container = document.getElementById('leaderboard-list');
    container.innerHTML = '';

    if (!listData || listData.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--text-sub);">本週尚無排名紀錄，快去搶頭香！</div>';
        return;
    }

    listData.forEach((user, index) => {
        let rankClass = '';
        let rankText = index + 1;
        if (index === 0) { rankClass = 'lb-rank-1'; rankText = '🥇'; }
        else if (index === 1) { rankClass = 'lb-rank-2'; rankText = '🥈'; }
        else if (index === 2) { rankClass = 'lb-rank-3'; rankText = '🥉'; }

        const div = document.createElement('div');
        div.className = 'lb-item';
        div.innerHTML = `
            <div class="lb-rank ${rankClass}">${rankText}</div>
            <img src="${user.photo || 'https://via.placeholder.com/45'}" class="lb-avatar">
            <div class="lb-info">
                <div class="lb-name">${user.name}</div>
            </div>
            <div class="lb-score">${user.score} pts</div>
        `;
        container.appendChild(div);
    });
};


// ==========================================================================
// 🌟 11. 片語專屬綜合練習模式
// ==========================================================================
let phrasePuzzleSource = [];
let phrasePuzzleTemplate = [];

window.setupPhraseMasteryMode = function() {
    let words = window.getPracticeWords(); 
    if(!words || words.length === 0) return;
    
    masteryModeType = 'phrase'; 
    pendingMasteredWords = []; 
    
    masteryPool = words.map(w => ({ 
        en: w.en, zh: w.zh, level: 0, delay: 0, 
        isGSAT: w.isGSAT, bookTag: w.bookTag, bookLength: w.bookLength,
        bookId: w.bookId, mastered: w.mastered
    })); 
    masteryPool.sort(() => Math.random() - 0.5);
    
    const headerTitle = document.getElementById('mastery-header-title'); 
    const progressBar = document.getElementById('mastery-progress-bar');
    const l0Card = document.getElementById('mastery-l0-card'); 
    const nextBtns = document.querySelectorAll('#view-mastery .btn:not(.btn-icon):not(.btn-outline)');

    headerTitle.innerText = "片語綜合練習"; 
    headerTitle.style.color = "#1e3c72"; 
    progressBar.style.background = "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)"; 
    l0Card.style.borderColor = "#1e3c72";
    nextBtns.forEach(b => { 
        b.style.background = "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)";
        b.style.borderColor = "#1e3c72";
        b.style.color = "#fff";
        b.classList.add('btn-next-big');
    });

    const l0Btn = document.getElementById('mastery-btn-l0');
    l0Btn.onclick = () => {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel(); 
        currentMasteryTarget.level = 1; 
        window.nextPhraseMasteryTurn();
    };

    const submitBtn = document.getElementById('mastery-btn-puzzle');
    submitBtn.onclick = () => window.checkPhrasePuzzle(true);

    window.switchView('mastery'); 
    window.updateMasteryProgress(); 
    window.nextPhraseMasteryTurn();
};

window.nextPhraseMasteryTurn = function() {
    let targetLevel = 5; 
    let mastered = masteryPool.filter(w => w.level === targetLevel).length;
    document.getElementById('mastery-progress-bar').style.width = ((mastered / masteryPool.length) * 100) + '%';
    document.getElementById('mastery-status-text').innerText = `精通進度: ${mastered} / ${masteryPool.length}`;

    if (mastered === masteryPool.length) {
        window.hideAllMasteryAreas(); 
        document.getElementById('mastery-success-title').style.color = "#1e3c72";
        setDisplayState('mastery-success-area', true); 
        window.finalizeMasterySession();
        return;
    }

    window.hideAllMasteryAreas();
    
    let l0 = masteryPool.filter(w => w.level === 0);
    if (l0.length > 0) { 
        currentMasteryTarget = l0[0]; 
        window.showMasteryL0(currentMasteryTarget); 
        return; 
    }

    let delayReady = masteryPool.filter(w => w.level === 4.9 || w.level === 3.9);
    if (delayReady.length > 0) {
        currentMasteryTarget = delayReady.sort(() => Math.random() - 0.5)[0];
        window.showPhraseTyping(currentMasteryTarget, currentMasteryTarget.level === 4.9);
        return;
    }

    let active = masteryPool.filter(w => w.level >= 1 && w.level <= 4 && Number.isInteger(w.level));
    if (active.length > 0) {
        currentMasteryTarget = active.sort(() => Math.random() - 0.5)[0];
        if (currentMasteryTarget.level === 1) {
            window.showPhraseMCQ(currentMasteryTarget, 'zh-to-en');
        } else if (currentMasteryTarget.level === 2) {
            window.showPhraseMCQ(currentMasteryTarget, 'en-to-zh');
        } else if (currentMasteryTarget.level === 3) {
            window.showPhrasePuzzle(currentMasteryTarget);
        } else if (currentMasteryTarget.level === 4) {
            window.showPhraseTyping(currentMasteryTarget, false);
        }
        return;
    }

    let waiting = masteryPool.filter(w => w.level === 4.5 || w.level === 3.5);
    if (waiting.length > 0) {
        let forceTarget = waiting[0]; 
        forceTarget.level = forceTarget.level === 4.5 ? 4.9 : 3.9; 
        currentMasteryTarget = forceTarget;
        window.showPhraseTyping(currentMasteryTarget, true);
        return;
    }
};

window.showPhraseMCQ = function(word, mode) {
    setDisplayState('mastery-mcq-area', true);
    document.getElementById('mastery-mcq-badge').innerText = mode === 'zh-to-en' ? "Lv 1: 視覺辨識 (中選英)" : "Lv 2: 雙向語意 (英選中)";
    document.getElementById('mastery-mcq-q').innerText = mode === 'zh-to-en' ? word.zh.join(' / ') : word.en;
    
    let options = [word]; 
    let distractors = masteryPool.filter(w => w.en !== word.en).sort(() => Math.random() - 0.5); 
    options.push(...distractors.slice(0, 3));
    
    if (options.length < 4) { 
        let fallback = window.getSelectedWordsPool().filter(w => w.en !== word.en).sort(() => Math.random() - 0.5); 
        options.push(...fallback.slice(0, 4 - options.length)); 
    }
    options = options.slice(0, 4).sort(() => Math.random() - 0.5);
    
    const optArea = document.getElementById('mastery-mcq-options'); 
    optArea.innerHTML = '';
    
    options.forEach(opt => { 
        let btn = document.createElement('button'); 
        btn.className = 'btn-mcq'; 
        btn.innerText = mode === 'zh-to-en' ? opt.en : opt.zh.join(' / '); 
        btn.onclick = () => window.checkPhraseAnswer(opt.en === word.en); 
        optArea.appendChild(btn); 
    });
};

window.showPhrasePuzzle = function(word) {
    setDisplayState('mastery-puzzle-area', true); 
    document.getElementById('mastery-puzzle-badge').innerText = "Lv 3: 斷點拼圖";
    document.getElementById('mastery-puzzle-q').innerText = word.zh.join(' / '); 
    document.getElementById('mastery-puzzle-hint-display').innerText = ''; 
    
    puzzleUserAnswer = []; 
    let enStr = word.en.toLowerCase();
    let sourceTokens = [];
    let ansTemplate = [];
    
    let i = 0;
    let tokenIndex = 0;
    while(i < enStr.length) {
        if (enStr.slice(i, i+3) === '...') {
            sourceTokens.push({ id: tokenIndex, char: '...', used: false });
            ansTemplate.push({ isSpace: false, addSpaceAfter: false, char: '...' });
            tokenIndex++; i += 3;
        } else if (enStr[i] === ' ') {
            if (ansTemplate.length > 0) ansTemplate[ansTemplate.length - 1].addSpaceAfter = true;
            i++;
        } else {
            sourceTokens.push({ id: tokenIndex, char: enStr[i], used: false });
            ansTemplate.push({ isSpace: false, addSpaceAfter: false, char: enStr[i] });
            tokenIndex++; i++;
        }
    }
    
    phrasePuzzleTemplate = ansTemplate;
    for (let j = sourceTokens.length - 1; j > 0; j--) { 
        const k = Math.floor(Math.random() * (j + 1)); 
        [sourceTokens[j], sourceTokens[k]] = [sourceTokens[k], sourceTokens[j]]; 
    }
    phrasePuzzleSource = sourceTokens;
    window.renderPhrasePuzzleBoard();
};

window.renderPhrasePuzzleBoard = function() {
    const ansArea = document.getElementById('mastery-puzzle-ans'); 
    const poolArea = document.getElementById('mastery-puzzle-pool');
    ansArea.innerHTML = ''; poolArea.innerHTML = '';
    
    puzzleUserAnswer.forEach((letterObj, idx) => { 
        const tile = document.createElement('div'); 
        tile.className = 'letter-tile'; 
        if (phrasePuzzleTemplate[idx] && phrasePuzzleTemplate[idx].addSpaceAfter) tile.classList.add('phrase-space');
        tile.innerText = letterObj.char; 
        tile.onclick = () => { 
            puzzleUserAnswer[idx].used = false; 
            puzzleUserAnswer.splice(idx, 1); 
            window.renderPhrasePuzzleBoard(); 
        }; 
        ansArea.appendChild(tile); 
    });
    
    if (puzzleUserAnswer.length < phrasePuzzleTemplate.length) { 
        const placeholder = document.createElement('div'); 
        placeholder.className = 'letter-tile empty'; 
        if (phrasePuzzleTemplate[puzzleUserAnswer.length] && phrasePuzzleTemplate[puzzleUserAnswer.length].addSpaceAfter) {
            placeholder.classList.add('phrase-space');
        }
        placeholder.innerText = '_'; 
        ansArea.appendChild(placeholder); 
    }
    
    phrasePuzzleSource.forEach(letterObj => { 
        if (!letterObj.used) { 
            const tile = document.createElement('div'); 
            tile.className = 'letter-tile'; 
            tile.innerText = letterObj.char; 
            tile.onclick = () => { 
                letterObj.used = true; 
                puzzleUserAnswer.push(letterObj); 
                window.renderPhrasePuzzleBoard(); 
                window.checkPhrasePuzzle(false);
            }; 
            poolArea.appendChild(tile); 
        } 
    });
};

window.checkPhrasePuzzle = function(forced = false) {
    if(!currentMasteryTarget) return;
    const currentString = puzzleUserAnswer.map(o => o.char).join('');
    const targetString = phrasePuzzleTemplate.map(o => o.char).join('');
    if (puzzleUserAnswer.length === phrasePuzzleTemplate.length || forced) {
        window.checkPhraseAnswer(currentString === targetString);
    }
};

window.showPhraseTyping = function(word, isDelayed) {
    setDisplayState('mastery-typing-area', true); 
    document.getElementById('mastery-typing-badge').innerText = isDelayed ? "Lv 5: 延遲固化 (畢業評測)" : "Lv 4: 高容錯輸出";
    document.getElementById('mastery-typing-q').innerText = word.zh.join(' / ');
    
    const input = document.getElementById('mastery-typing-input'); 
    input.value = ''; 
    setTimeout(() => input.focus(), 50); 
    
    input.onkeypress = (e) => { 
        if(e.key === 'Enter') { 
            e.preventDefault(); 
            const val = input.value.trim().toLowerCase(); 
            const target = word.en.toLowerCase(); 
            
            const normVal = val.replace(/\.{1,}/g, '...').replace(/\s+/g, ' ').trim();
            const normTarget = target.replace(/\.{1,}/g, '...').replace(/\s+/g, ' ').trim();
            
            window.checkPhraseAnswer(normVal === normTarget);
        } 
    };
};

window.checkPhraseAnswer = function(isCorrect) {
    window.hideAllMasteryAreas(); 
    setDisplayState('mastery-feedback-area', true, 'flex');
    
    const icon = document.getElementById('mastery-fb-icon'); 
    const status = document.getElementById('mastery-fb-status'); 
    const msg = document.getElementById('mastery-fb-msg');
    document.getElementById('mastery-fb-ans').innerText = currentMasteryTarget.en;
    
    window.forceSpeak = true; window.speakEnglishWord(currentMasteryTarget.en); 
    window.tickMasteryDelays(); 
    
    let lvl = currentMasteryTarget.level;

    if (isCorrect) {
        icon.innerText = '✔'; icon.className = 'big-icon icon-correct'; status.innerText = '正確'; status.className = 'result-status status-correct';
        if (lvl === 0) { currentMasteryTarget.level = 1; msg.innerText = `升級至 Level 1 中選英。`; }
        else if (lvl === 1) { currentMasteryTarget.level = 2; msg.innerText = `升級至 Level 2 英選中。`; } 
        else if (lvl === 2) { currentMasteryTarget.level = 3; msg.innerText = `升級至 Level 3 斷點拼圖。`; } 
        else if (lvl === 3) { currentMasteryTarget.level = 4; msg.innerText = `升級至 Level 4 高容錯輸出。`; } 
        else if (lvl === 4) { currentMasteryTarget.level = 4.5; currentMasteryTarget.delay = delayWaitTurns; msg.innerText = `進入記憶固化潛伏期，系統稍後將觸發延遲評測。`; } 
        else if (lvl === 4.9) { 
            currentMasteryTarget.level = 5; 
            let rw = window.calculateReward(currentMasteryTarget, 'Comp_Grad');
            let extraMsg = "";
            if (!rw.isMastered) {
                window.bufferWordAsMastered(currentMasteryTarget);
                extraMsg = rw.points > 0 ? ` (🏆 結算時將獲得 ${rw.points} 分)` : " (解鎖成就：已精通)";
            } else { extraMsg = " (此片語已精通過，不再重複給予分數)"; }
            msg.innerText = `通過延遲評測，該片語已完全精通！${extraMsg}`; 
        }
    } else {
        icon.innerText = '✘'; icon.className = 'big-icon icon-wrong'; status.innerText = '錯誤'; status.className = 'result-status status-wrong';
        currentMasteryTarget.level = 1; msg.innerText = "降級重回 Level 1 中選英。";
    }
    
    const nextBtn = document.getElementById('mastery-btn-next');
    nextBtn.onclick = () => window.nextPhraseMasteryTurn();
};



// ==========================================================================
// 🌟 12. 詞性挑戰模式 (POS Challenge)
// ==========================================================================
window.setupPosMode = function() { 
    let rawQueue = window.getPracticeWords(); 
    if (!rawQueue || rawQueue.length === 0) return; 
    
    // 自動過濾掉沒有填寫詞性的單字
    practiceQueue = rawQueue.filter(w => w.pos && w.pos.trim() !== '');
    
    if (practiceQueue.length === 0) {
        window.SilenModal.alert("目前選取的題庫中，沒有包含「詞性標記」的單字！\n\n💡 提示：請先到題庫編輯區，或重新匯入帶有詞性的單字格式。");
        return;
    }
    
    if (!isSequentialMode) { practiceQueue.sort(() => Math.random() - 0.5); }
    
    currentMode = 'pos'; 
    currentCardIndex = 0; 
    initialQueueLength = practiceQueue.length; 
    completedCount = 0; 
    
    setDisplayState('pos-seq-badge', isSequentialMode, 'inline-block'); 
    window.switchView('pos'); 
    window.showPosNextCard(); 
};

window.showPosNextCard = function() { 
    if (currentCardIndex >= practiceQueue.length) return window.endQuiz(); 
    
    const w = practiceQueue[currentCardIndex]; 
    setDisplayState('pos-interaction-area', true, 'block'); 
    setDisplayState('pos-feedback-area', false); 
    
    document.getElementById('pos-progress-display').innerText = isSequentialMode ? `第 ${currentCardIndex+1} 關` : `${completedCount}/${initialQueueLength}`; 
    
    document.getElementById('pos-word-display').innerText = w.en; 
    document.getElementById('pos-zh-display').innerText = w.zh.join(' / '); 
    document.getElementById('pos-feedback-question-copy').innerText = w.en; 
};

window.checkPosAnswer = function(selectedPos) {
    if (currentCardIndex >= practiceQueue.length) return;
    const w = practiceQueue[currentCardIndex]; 
    
    // 嚴謹的比對邏輯 (去除點號與空白，並支援一個單字有多個詞性的寫法，例如 "n., v.")
    const ans = selectedPos.toLowerCase().replace(/\./g, '').trim();
    const correctPosArr = w.pos.toLowerCase().split(/[\/,;，；\s]+/).map(x => x.replace(/\./g, '').trim());
    
    let c = correctPosArr.includes(ans);
    
    lastAnswerCorrect = c; 
    if (c && !w.scored) { 
        w.scored = true; 
        if (typeof window.addScore === 'function') window.addScore(10, false); 
    }
    
    if (!c && !isSequentialMode) window.requeueWord(w); 
    
    setDisplayState('pos-interaction-area', false); 
    setDisplayState('pos-feedback-area', true, 'flex'); 
    
    const i = document.getElementById('pos-feedback-icon'); 
    const s = document.getElementById('pos-feedback-status'); 
    document.getElementById('pos-feedback-answer').innerText = w.pos; 
    
    if (c) { 
        i.innerText = '✔'; i.className = 'big-icon icon-correct'; s.innerText = '正確 (+10 分)'; s.className = 'result-status status-correct'; 
    } else { 
        i.innerText = '✘'; i.className = 'big-icon icon-wrong'; s.innerText = '錯誤'; s.className = 'result-status status-wrong'; 
    } 
    window.forceSpeak = true; window.speakEnglishWord(w.en); 
};

window.handlePosNextClick = function() { 
    if (lastAnswerCorrect) completedCount++; 
    if (isSequentialMode && !lastAnswerCorrect) { 
        window.SilenModal.alert("評測錯誤，重頭開始。").then(() => { currentCardIndex = 0; completedCount = 0; window.showPosNextCard(); }); 
    } else { 
        currentCardIndex++; window.showPosNextCard(); 
    }
};
