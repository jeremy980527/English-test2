// =====================================
// 1. 自訂彈窗與設定引擎(Modal & Settings)
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
// 2. 全局變數與基礎邏輯 (Globals) + 智能系統
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

const views = ['landing', 'home', 'book-select', 'edit', 'practice', 'mcq', 'speaking', 'puzzle', 'memory', 'youglish', 'mastery', 'profile', 'leaderboard', 'pos', 'public-profile', 'store', 'admin', 'market', 'accessories', 'arena', 'arena-waiting', 'arena-match', 'campaign'];

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

// 【全新：智能語意互斥過濾器】
window.isSemanticOverlap = function(wordA, wordB) {
    if (!wordA.zh || !wordB.zh) return false;
    // 透過正規表達式剝除括號內的補充說明，只比較核心字義
    const cleanA = wordA.zh.map(z => z.replace(/[\(（].*?[）\)]/g, '').trim());
    const cleanB = wordB.zh.map(z => z.replace(/[\(（].*?[）\)]/g, '').trim());
    
    for (let a of cleanA) {
        if (!a) continue;
        for (let b of cleanB) {
            if (!b) continue;
            // 只要有任何包含關係，就視為互斥（例如 "巨大" 包含 "巨大"）
            if (a.includes(b) || b.includes(a)) return true; 
        }
    }
    return false;
};

// 【全新：專屬黑化提示彈窗】
window.showHelp = function(type) {
    let msg = "";
    switch(type) {
        case 'add_word':
            msg = "【單字建檔指南】\n\n1. 詞性多選 (同義)：如果單字擁有多個詞性，且「意思完全相同」(例如 water 水)，你可以同時點亮 [n.] 與 [v.]。\n\n2. 強制分開 (不同義)：如果不同詞性代表「完全不同的意思」(例如 book 書本/預約)，請務必拆分成兩張獨立字卡新增！這能幫助系統在出題時給予精確的詞性提示，避免混淆。";
            break;
        case 'import_word':
            msg = "【批量匯入格式指南】\n\n基本格式為「英文 - 中文 - 詞性」，並以換行分隔每個單字。\n\n1. 相同意思、多重詞性：\n請用逗號將詞性隔開。例如：\nwater - 水 - n., v.\n\n2. 不同意思的多重詞性：\n強烈建議「分行輸入」拆成兩張獨立字卡，這對測驗系統的精準度非常重要！例如：\nbook - 書本 - n.\nbook - 預約 - v.";
            break;
        case 'import_phrase':
            msg = "【片語匯入指南】\n\n片語通常不需要標註詞性，格式請使用「英文片語 - 中文」，並以換行分隔即可。\n\n範例：\nlook forward to - 期待\ncatch up with - 趕上";
            break;
        case 'practice':
            msg = "【訓練模式說明】\n\n• 綜合精通模式：依照記憶曲線設計，單字會從「視覺辨識」慢慢晉升到「主動拼寫」，並強制進入「記憶潛伏期」再進行畢業考。通關可獲取大量牌位積分！\n\n• 針對性訓練：選擇題、拼圖等單元適合輕鬆複習，每答對一題皆可穩定獲取商城點數。";
            break;
        case 'gsat':
            msg = "【學測單字抽取】\n\n系統內建完整的學測單字庫。你可以自訂數量進行「抽卡」，系統的大腦會自動排除你已經背過的單字，保證每次抽出的都是全新生詞！";
            break;
        case 'market':
            msg = "【玩家市場 (C2C)】\n\n你可以在這裡花費點數，購買其他玩家精心整理的單字簿；\n也可以將自己編輯的心血結晶「上架」來大賺商城點數！\n(請注意：市場交易會扣除 20% 系統稅)";
            break;
    }
    window.SilenModal.alert(msg);
};


window.goHome = function() { 
    if (typeof window.updateHomeSummary === 'function') window.updateHomeSummary(); 
    if (window.SilenSettings && typeof window.SilenSettings.render === 'function') window.SilenSettings.render(); 
    window.switchView('home'); 

    if (window.pendingAnnouncement && typeof window.showAnnouncementModal === 'function') {
        setTimeout(() => {
            window.showAnnouncementModal(window.pendingAnnouncement);
        }, 300);
    }
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
// 3. 發聲核心
// =====================================
window.speakEnglishWord = function(word) {
    if (!autoPronounce && !window.forceSpeak) return; 
    
    if (window.AndroidBridge && typeof window.AndroidBridge.speak === 'function') {
        try { window.AndroidBridge.speak(word); } catch (e) {}
    } else if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = 'en-US'; 
        utterance.rate = 0.95; 
        window.speechSynthesis.speak(utterance);
    }
    window.forceSpeak = false;
};

window.replayAudio = function() { 
    window.forceSpeak = true; 
    if (practiceQueue[currentCardIndex]) {
        window.speakEnglishWord(practiceQueue[currentCardIndex].en); 
    }
};

window.requeueWord = function(word) {
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
};

window.endQuiz = function() {
    if (isGuestMode) {
        window.SilenModal.confirm("測驗結束。\n\n您要將這份分享的單字庫儲存到您的雲端帳戶中嗎？").then((agreed) => {
            if (agreed) {
                window.SilenModal.prompt("請為這份單字簿命名：", "分享引入的單字簿").then((newName) => {
                    if (newName) {
                        window.books.push({ id: Date.now(), name: newName, tag: "外部分享", words: guestWords });
                        window.saveData();
                        window.SilenModal.alert("已成功匯入單字庫中。").then(() => window.quitPractice());
                    } else { window.quitPractice(); }
                });
            } else { window.quitPractice(); }
        });
    } else {
        window.SilenModal.alert("測驗結束，做得好。").then(() => window.quitPractice());
    }
};

// =====================================
// 4. 分享與連網功能
// =====================================
window.shareCurrentQuiz = async function() {
    if (typeof window.uploadShareData !== 'function') {
        window.SilenModal.alert("系統雲端模組載入中，請稍候重試。"); return;
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
    else if (!document.getElementById('view-pos').classList.contains('hidden')) view = 'pos';

    const minifiedWords = wordsToShare.map(w => [w.en, ...w.zh, w.pos || '']);
    const shareData = [view, currentMode, isSequentialMode ? 1 : 0, minifiedWords];

    const btn = document.querySelector('.export-quiz-btn');
    let oldText = "分享測驗";
    if (btn) { oldText = btn.innerText; btn.innerText = "產生中..."; btn.disabled = true; }

    const shareId = await window.uploadShareData(shareData);
    if (btn) { btn.innerText = oldText; btn.disabled = false; }
    if (!shareId) { window.SilenModal.alert("產生失敗，請檢查網路連線。"); return; }

    const shareUrl = window.location.origin + window.location.pathname + '?q=' + shareId;

    if (navigator.share) {
        navigator.share({ title: 'SilenVocab 英文挑戰', text: '我建立了一個專屬單字測驗，快來挑戰看看吧！', url: shareUrl }).catch(() => {});
    } else if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(shareUrl).then(() => window.SilenModal.alert("短網址已成功複製到剪貼簿！\n\n" + shareUrl))
        .catch(() => window.SilenModal.prompt("請手動複製以下短網址：", shareUrl));
    } else {
        window.SilenModal.prompt("請手動複製以下短網址：", shareUrl);
    }
};

window.checkShareUrl = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const qId = urlParams.get('q');
    if (qId) {
        const tryDownload = () => {
            if (typeof window.downloadShareData === 'function') {
                window.downloadShareData(qId).then(decoded => {
                    if (decoded) {
                        const finalData = { v: decoded[0], m: decoded[1], s: decoded[2] === 1, w: decoded[3].map(arr => ({ en: arr[0], zh: arr.slice(1, arr.length - 1), pos: arr[arr.length - 1] })) };
                        window.startGuestMode(finalData);
                    } else {
                        window.SilenModal.alert("這份分享測驗已失效或不存在。").then(() => {
                            window.history.replaceState({}, document.title, window.location.pathname);
                            window.location.reload();
                        });
                    }
                });
            } else { setTimeout(tryDownload, 100); }
        };
        tryDownload(); return true; 
    }
    
    const lzCode = urlParams.get('lz');
    if (lzCode) {
        try {
            if (typeof LZString === 'undefined') { setTimeout(window.checkShareUrl, 100); return true; }
            const jsonStr = LZString.decompressFromEncodedURIComponent(lzCode);
            if (!jsonStr) throw new Error("解壓縮失敗");
            const decoded = JSON.parse(jsonStr);
            const finalData = { v: decoded[0], m: decoded[1], s: decoded[2] === 1, w: decoded[3].map(arr => ({ en: arr[0], zh: arr.slice(1, arr.length - 1), pos: arr[arr.length - 1] })) };
            window.startGuestMode(finalData); return true;
        } catch(e) { window.SilenModal.alert("無效的分享連結。"); return false; }
    }
    return false;
};

window.startGuestMode = function(data) {
    isGuestMode = true; guestWords = data.w; practiceQueue = [...data.w]; currentMode = data.m; isSequentialMode = data.s;
    initialQueueLength = practiceQueue.length; completedCount = 0; currentCardIndex = 0;
    document.querySelectorAll('.export-quiz-btn').forEach(btn => btn.style.setProperty('display', 'none', 'important'));
    document.querySelectorAll('.btn-quit').forEach(btn => btn.innerText = '離開');

    if (data.v === 'mcq') {
        document.getElementById('mcq-mode-display').innerText = (currentMode === 'zh-to-en' ? '中選英' : '英選中') + ' (分享對戰)';
        setDisplayState('mcq-seq-badge', isSequentialMode, 'inline-block'); window.switchView('mcq'); window.showMcqNextCard();
    } else if (data.v === 'speaking') { window.switchView('speaking'); window.showNextSpeakingCard();
    } else if (data.v === 'puzzle') { setDisplayState('puzzle-seq-badge', isSequentialMode, 'inline-block'); window.switchView('puzzle'); window.loadPuzzleLevel();
    } else if (data.v === 'memory') { window.setupMemoryModeGuest();
    } else if (data.v === 'youglish') { window.switchView('youglish'); window.loadYouglishCard();
    } else if (data.v === 'pos') { setDisplayState('pos-seq-badge', isSequentialMode, 'inline-block'); window.switchView('pos'); window.showPosNextCard();
    } else {
        document.getElementById('mode-display').innerText = (currentMode === 'zh-to-en' ? '中翻英' : '英翻中') + ' (分享對戰)';
        setDisplayState('sequential-badge', isSequentialMode, 'inline-block'); setDisplayState('hint-btn', currentMode === 'zh-to-en', 'inline-block');
        window.switchView('practice'); window.showNextCard();
    }
};

// =====================================
// 5. 題庫管理與多選詞性系統
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
    let isStoreSelected = false;
    
    window.books.forEach(b => { 
        if (b.isStore) b.isPhrase = false;

        if (selectedBookIds.has(b.id)) { 
            selectedCount++; 
            wordCount += b.words.length; 
            if (b.isPhrase && !b.isStore) isPhraseSelected = true;
            if (b.isStore) isStoreSelected = true;
        } 
    });
    
    if (selectedCount === 0) {
        summaryEl.innerHTML = '<span style="color:var(--text-sub);">尚未勾選範圍。請進入控制區選取題庫。</span>';
        setDisplayState('word-practice-area', true);
        setDisplayState('phrase-practice-area', false);
    } else {
        let typeStr = isStoreSelected ? '商城組合' : (isPhraseSelected ? '片語' : '單字');
        summaryEl.innerHTML = `已選取 <span style="color:var(--text-main); font-weight:500;">${selectedCount}</span> 本${typeStr}簿，共計 <span style="color:var(--text-main); font-weight:500;">${wordCount}</span> 個項目`;
        
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
    const storeList = document.getElementById('store-book-list');
    
    if (normalList) normalList.innerHTML = '';
    if (gsatList) gsatList.innerHTML = '';
    if (phraseList) phraseList.innerHTML = '';
    if (storeList) storeList.innerHTML = '';

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
                
                if (book.isStore) {
                    const actionContainer = document.createElement('div');
                    actionContainer.style.cssText = 'display: flex; align-items: center; gap: 10px;';
                    
                    const lockIcon = document.createElement('div');
                    lockIcon.style.cssText = 'color: var(--text-sub); font-size: 0.85rem;';
                    lockIcon.innerText = "官方組合包";
                    
                    const delBtn = document.createElement('button'); 
                    delBtn.className = 'btn-icon edit-btn'; 
                    delBtn.innerHTML = '刪除'; 
                    delBtn.style.color = '#ff4444';
                    delBtn.onclick = (e) => { 
                        e.stopPropagation(); 
                        window.SilenModal.confirm('確定要刪除此擴充包嗎？\n(刪除後可至商城重新下載最新版本)').then(agreed => {
                            if(agreed) {
                                window.books = window.books.filter(b => b.id !== book.id);
                                selectedBookIds.delete(book.id);
                                window.saveData();
                                window.renderBookList();
                            }
                        });
                    };
                    
                    actionContainer.appendChild(lockIcon);
                    actionContainer.appendChild(delBtn);
                    div.appendChild(wrapper); 
                    div.appendChild(actionContainer);
                } else {
                    const actionContainer = document.createElement('div');
                    actionContainer.style.cssText = 'display: flex; gap: 8px;';
                    
                    const editBtn = document.createElement('button');
                    editBtn.className = 'btn-icon edit-btn';
                    editBtn.innerHTML = '編輯'; 
                    editBtn.onclick = (e) => { e.stopPropagation(); window.openEditBook(book.id); };
                    actionContainer.appendChild(editBtn);

                    div.appendChild(wrapper);
                    div.appendChild(actionContainer);
                }
                
                div.onclick = () => {
                    if (listContainer.classList.contains('sorting-active')) return;
                    
                    if (!selectedBookIds.has(book.id)) {
                        let currentType = book.isStore ? 'store' : (book.isPhrase ? 'phrase' : 'word');
                        let hasConflict = false;
                        window.books.forEach(b => {
                            if (selectedBookIds.has(b.id)) {
                                let bType = b.isStore ? 'store' : (b.isPhrase ? 'phrase' : 'word');
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

    renderGroup(window.books.filter(b => !b.isGSAT && !b.isPhrase && !b.isStore), normalList, '資料庫無單字簿，請在下方建立。', 'normal');
    renderGroup(window.books.filter(b => b.isGSAT && !b.isPhrase && !b.isStore), gsatList, '尚無學測單字簿，請在下方抽取。', 'gsat');
    renderGroup(window.books.filter(b => b.isPhrase && !b.isStore), phraseList, '尚無片語簿，請在下方建立。', 'phrase');
    renderGroup(window.books.filter(b => b.isStore), storeList, '您尚未下載任何擴充組合包。', 'store');
    window.updateHomeSummary();
};

window.handleSortEnd = function(tag, listContainer, type) {
    const newOrderIds = Array.from(listContainer.children).map(el => Number(el.dataset.id));
    let indices = [];
    window.books.forEach((b, index) => {
        const t = (b.tag && b.tag.trim() !== '') ? b.tag.trim() : '未分類';
        let bType = b.isStore ? 'store' : (b.isPhrase ? 'phrase' : (b.isGSAT ? 'gsat' : 'normal'));
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
    window.books.push({ id: Date.now(), name: name, tag: tag, words: [], isGSAT: false, isPhrase: false, isStore: false }); 
    window.saveData(); document.getElementById('new-book-name').value = ''; document.getElementById('new-book-tag').value = ''; window.renderBookList();
};

window.addPhraseBookSimple = function() {
    const name = document.getElementById('new-phrase-name').value.trim();
    const tag = document.getElementById('new-phrase-tag').value.trim();
    if (!name) { window.SilenModal.alert("請輸入片語簿名稱"); return; }
    window.books.push({ id: Date.now(), name: name, tag: tag, words: [], isGSAT: false, isPhrase: true, isStore: false }); 
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
    window.books.push({ id: Date.now(), name: name, tag: tag, words: newWords, isGSAT: false, isPhrase: false, isStore: false }); 
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
    window.books.push({ id: Date.now(), name: name, tag: tag, words: newWords, isGSAT: false, isPhrase: true, isStore: false }); 
    window.saveData();
    document.getElementById('new-phrase-name').value = ''; document.getElementById('new-phrase-tag').value = ''; document.getElementById('import-content-phrase').value = ''; 
    window.toggleImportArea('phrase'); window.renderBookList(); window.SilenModal.alert(`成功匯入 ${newWords.length} 個片語。`);
};

window.toggleExportMenu = function(event) { 
    if (event) event.stopPropagation();
    const menu = document.getElementById('export-menu');
    if (menu) menu.classList.toggle('active'); 
};

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
    const menu = document.getElementById('export-menu'); 
    if (menu && menu.classList.contains('active') && !menu.contains(event.target)) {
        menu.classList.remove('active');
    }
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
            div.style.flexDirection = 'column';
            div.style.alignItems = 'stretch';
            
            const safeEn = word.en.replace(/"/g, '&quot;');
            const safeZh = word.zh.join(', ').replace(/"/g, '&quot;');
            
            const posList = ['n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'phr.'];
            const currentPosStr = word.pos || '';
            const posHtml = posList.map(p => {
                const isActive = currentPosStr.includes(p) ? 'active' : '';
                return `<button class="pos-btn ${isActive}" onclick="this.classList.toggle('active')" data-pos="${p}">${p}</button>`;
            }).join('');
            
            div.innerHTML = `
                <div class="pos-toggle-group" id="inline-pos-group-${actualIndex}" style="margin-bottom: 10px;">
                    ${posHtml}
                </div>
                <div class="flex-row" style="margin-bottom: 10px;">
                    <input type="text" id="inline-en-${actualIndex}" value="${safeEn}" style="flex: 1; padding: 8px; font-size: 1rem;">
                </div>
                <input type="text" id="inline-zh-${actualIndex}" value="${safeZh}" style="margin-bottom: 10px; padding: 8px; font-size: 1rem;">
                <div class="flex-row" style="justify-content: flex-end; margin-top: 5px;">
                    <button class="btn btn-outline btn-small" onclick="window.cancelEditWord()">取消</button>
                    <button class="btn btn-small" style="background: #fff; color: #000;" onclick="window.saveEditWord(${actualIndex})">儲存</button>
                </div>
            `;
        } else {
            let posHtml = (word.pos && word.pos.trim() !== '') ? `<span class="word-pos">[${word.pos}]</span>` : '';
            div.innerHTML = `
                <div style="flex: 1; padding-right: 15px;">
                    <div class="word-en">${word.en} ${posHtml}</div>
                    <div class="word-zh">${word.zh.join(', ')}</div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="btn btn-small" style="margin: 0; padding: 4px 12px; background: #222; color: #fff; border: 1px solid #444; font-size: 0.85rem;" onclick="window.startEditWord(${actualIndex})">修改</button>
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
    const zhStr = document.getElementById(`inline-zh-${index}`).value.trim();
    
    let activeBtns = document.querySelectorAll(`#inline-pos-group-${index} .pos-btn.active`);
    let pos = Array.from(activeBtns).map(b => b.dataset.pos).join(', ');
    
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
    const zhStr = document.getElementById('input-zh').value.trim();
    
    let activeBtns = document.querySelectorAll('#input-pos-group .pos-btn.active');
    let pos = Array.from(activeBtns).map(b => b.dataset.pos).join(', ');

    if(!en || !zhStr) { window.SilenModal.alert("英文與中文欄位不可為空"); return; }
    
    window.books.find(b => b.id === currentBookId).words.push({ 
        en: en, 
        pos: pos,
        zh: zhStr.split(/[;；,，\/]/).map(s => s.trim()).filter(s => s) 
    }); 
    window.saveData(); 
    document.getElementById('input-en').value = ''; 
    document.getElementById('input-zh').value = ''; 
    document.querySelectorAll('#input-pos-group .pos-btn').forEach(btn => btn.classList.remove('active'));
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
// 6. 雙軌精通模式 (Mastery Mode) + 延遲結算
// =====================================
let masteryPool = [];
let currentMasteryTarget = null;
let masteryModeType = 'comprehensive';
let delayWaitTurns = 4;
let pendingMasteredWords = [];

window.calculateReward = function(word, stepKey) {
    let isGsat = word.isGSAT === true;
    let bookTag = word.bookTag || '';
    let bookLength = word.bookLength || 0;
    let isMastered = word.mastered === true;
    
    let multiplier = 1;
    if (isGsat) {
        if (bookTag.includes('Lv2')) multiplier = 1.2; else if (bookTag.includes('Lv3')) multiplier = 1.5; else if (bookTag.includes('Lv4')) multiplier = 2.0; else if (bookTag.includes('Lv5')) multiplier = 2.5; else if (bookTag.includes('Lv6')) multiplier = 3.0;
    }
    let isSeasonEligible = isGsat || bookLength >= 15; let points = 0;
    if (stepKey === 'Comp_Grad' || stepKey === 'Conn_Grad') {
        if (isMastered) points = 0; else { if (isGsat) points = Math.round(50 * multiplier); else if (isSeasonEligible) points = 50; }
    }
    return { points, isSeasonEligible, isMastered };
};

window.bufferWordAsMastered = function(targetWord) {
    if (targetWord.mastered) return;
    if (!pendingMasteredWords.some(w => w.en === targetWord.en)) pendingMasteredWords.push({ ...targetWord });
};

window.finalizeMasterySession = function() {
    if (pendingMasteredWords.length === 0) return;

    let totalPoints = 0;

    pendingMasteredWords.forEach(targetWord => {
        window.books.forEach(book => {
            if (book.id === targetWord.bookId) {
                let w = book.words.find(x => x.en === targetWord.en);
                if (w && !w.mastered) w.mastered = true;
            }
        });
        
        let stepKey = (masteryModeType === 'comprehensive' || masteryModeType === 'phrase') ? 'Comp_Grad' : 'Conn_Grad';
        let rw = window.calculateReward(targetWord, stepKey);
        
        if (rw.isSeasonEligible) totalPoints += rw.points;
    });

    if (typeof window.updateProfileStats === 'function') window.updateProfileStats();
    if (typeof window.saveData === 'function') window.saveData(); 

    if (window.isCampaignMode) {
        const multiplierMap = { 1: 50, 2: 70, 3: 90, 4: 110, 5: 130, 6: 150 };
        const pointsPerWord = multiplierMap[window.currentCampaignLevel] || 50;
        const campaignRankPoints = pendingMasteredWords.length * pointsPerWord;
        if (campaignRankPoints > 0 && typeof window.addRankPoints === 'function') {
            window.addRankPoints(campaignRankPoints, true);
            setTimeout(() => window.SilenModal.alert(`🏆 關卡完成！\n獲得 ${campaignRankPoints} 牌位積分！`), 300);
        }
    } else {
        if (typeof window.addRankPoints === 'function' && totalPoints > 0) {
            window.addRankPoints(totalPoints, true);
        }
    }
    pendingMasteredWords = [];
};

window.setupMasteryMode = function(type) {
    let words;
    if (window.isCampaignMode && window.currentBook) {
        words = window.currentBook.words.map(w => ({
            ...w, bookId: 'campaign_temp', isGSAT: true,
            bookTag: `Lv${window.currentCampaignLevel}`,
            bookLength: window.currentBook.words.length,
            mastered: w.mastered || false, scored: false, pos: w.pos || ''
        }));
    } else {
        words = window.getPracticeWords();
    }
    if (!words || words.length === 0) return;
    
    masteryModeType = type; pendingMasteredWords = []; 
    masteryPool = words.map(w => ({ en: w.en, zh: w.zh, level: 0, delay: 0, isGSAT: w.isGSAT, bookTag: w.bookTag, bookLength: w.bookLength, bookId: w.bookId, mastered: w.mastered, pos: w.pos || '' })); 
    masteryPool.sort(() => Math.random() - 0.5);
    
    const headerTitle = document.getElementById('mastery-header-title'); const progressBar = document.getElementById('mastery-progress-bar');
    const l0Card = document.getElementById('mastery-l0-card'); const nextBtns = document.querySelectorAll('#view-mastery .btn:not(.btn-icon):not(.btn-outline)');

    if (masteryModeType === 'comprehensive') {
        headerTitle.innerText = "綜合精通模式"; headerTitle.style.color = "#9c27b0"; progressBar.style.background = "#9c27b0"; l0Card.style.borderColor = "#9c27b0";
        nextBtns.forEach(b => { b.className = "btn mastery-btn-comp btn-next-big"; if (['mastery-btn-l0', 'mastery-btn-puzzle', 'mastery-btn-typing', 'mastery-btn-finish'].includes(b.id)) b.classList.remove('btn-next-big'); });
    } else {
        headerTitle.innerText = "連結力訓練模式"; headerTitle.style.color = "#009688"; progressBar.style.background = "#009688"; l0Card.style.borderColor = "#009688";
        nextBtns.forEach(b => { b.className = "btn mastery-btn-conn btn-next-big"; if (['mastery-btn-l0', 'mastery-btn-puzzle', 'mastery-btn-typing', 'mastery-btn-finish'].includes(b.id)) b.classList.remove('btn-next-big'); });
    }
    window.switchView('mastery'); window.updateMasteryProgress(); window.nextMasteryTurn();
};

window.updateMasteryProgress = function() {
    let targetLevel = (masteryModeType === 'comprehensive') ? 5 : 4;
    let mastered = masteryPool.filter(w => w.level === targetLevel).length;
    document.getElementById('mastery-progress-bar').style.width = ((mastered / masteryPool.length) * 100) + '%';
    document.getElementById('mastery-status-text').innerText = `精通進度: ${mastered} / ${masteryPool.length}`;
    return mastered === masteryPool.length;
};

window.nextMasteryTurn = function() {
    if (window.updateMasteryProgress()) {
        window.hideAllMasteryAreas(); document.getElementById('mastery-success-title').style.color = (masteryModeType === 'comprehensive') ? "#9c27b0" : "#009688";
        setDisplayState('mastery-success-area', true); window.finalizeMasterySession(); return;
    }
    window.hideAllMasteryAreas();
    let l0 = masteryPool.filter(w => w.level === 0);
    if (l0.length > 0) { currentMasteryTarget = l0[0]; window.showMasteryL0(currentMasteryTarget); return; }

    let delayReady = masteryPool.filter(w => w.level === 4.9 || w.level === 2.9);
    if (delayReady.length > 0) {
        currentMasteryTarget = delayReady.sort(() => Math.random() - 0.5)[0];
        if (masteryModeType === 'comprehensive') window.showMasteryTyping(currentMasteryTarget, true); 
        else window.showMasteryMCQ(currentMasteryTarget, 'zh-to-en', true); 
        return;
    }

    let active = masteryPool.filter(w => w.level >= 1 && w.level <= 4 && Number.isInteger(w.level));
    if (active.length > 0) {
        currentMasteryTarget = active.sort(() => Math.random() - 0.5)[0];
        
        if (currentMasteryTarget.level === 1) {
            if (masteryModeType === 'comprehensive') window.showMasteryMCQ(currentMasteryTarget, 'en-to-zh', false);
            else window.showMasteryMCQ(currentMasteryTarget, 'zh-to-en', false);
        }
        else if (currentMasteryTarget.level === 2) { 
            if (masteryModeType === 'comprehensive') window.showMasteryMCQ(currentMasteryTarget, 'zh-to-en', false); 
            else window.showMasteryMatch(currentMasteryTarget); 
        }
        else if (currentMasteryTarget.level === 3) { 
            if (masteryModeType === 'comprehensive') window.showMasteryPuzzle(currentMasteryTarget); 
        }
        else if (currentMasteryTarget.level === 4) {
            if (masteryModeType === 'comprehensive') window.showMasteryTyping(currentMasteryTarget, false);
        }
        return;
    }

    let waiting = masteryPool.filter(w => w.level === 4.5 || w.level === 2.5);
    if (waiting.length > 0) {
        let forceTarget = waiting[0]; forceTarget.level = forceTarget.level === 4.5 ? 4.9 : 2.9; currentMasteryTarget = forceTarget;
        if (masteryModeType === 'comprehensive') window.showMasteryTyping(currentMasteryTarget, true); 
        else window.showMasteryMCQ(currentMasteryTarget, 'zh-to-en', true); 
        return;
    }
};

window.tickMasteryDelays = function() { masteryPool.forEach(w => { if (w.level === 4.5 || w.level === 2.5) { w.delay--; if (w.delay <= 0) { w.level = (w.level === 4.5) ? 4.9 : 2.9; } } }); };
window.hideAllMasteryAreas = function() { ['mastery-l0-area', 'mastery-mcq-area', 'mastery-match-area', 'mastery-puzzle-area', 'mastery-typing-area', 'mastery-feedback-area', 'mastery-success-area'].forEach(id => { setDisplayState(id, false); }); };

window.showMasteryL0 = function(word) {
    setDisplayState('mastery-l0-area', true); 
    let posHtml = (word.pos && word.pos.trim() !== '') ? `<span style="font-size: 0.9rem; background: #333; padding: 4px 10px; border-radius: 6px; color: #ff9800; margin-left: 10px; vertical-align: middle;">[${word.pos}]</span>` : '';
    document.getElementById('mastery-l0-en').innerHTML = word.en + posHtml; 
    document.getElementById('mastery-l0-zh').innerText = word.zh.join(' / ');
    window.forceSpeak = true; window.speakEnglishWord(word.en); 
};
window.masteryL0Next = function() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); currentMasteryTarget.level = 1; window.nextMasteryTurn(); };

window.showMasteryMCQ = function(word, mode, isDelayed) {
    setDisplayState('mastery-mcq-area', true); 
    
    let badgeText = "";
    if (isDelayed) badgeText = "Lv 3: 延遲固化 (畢業評測)"; 
    else if (mode === 'en-to-zh') badgeText = "Lv 1: 視覺辨識 (英選中)";
    else badgeText = masteryModeType === 'comprehensive' ? "Lv 2: 逆向回想 (中選英)" : "Lv 1: 視覺辨識 (中選英)";
    
    document.getElementById('mastery-mcq-badge').innerText = badgeText;
    
    let posHtml = (word.pos && word.pos.trim() !== '') ? `<span style="font-size: 0.8rem; background: #333; padding: 2px 6px; border-radius: 4px; color: #ff9800; margin-left: 6px;">[${word.pos}]</span>` : '';
    document.getElementById('mastery-mcq-q').innerHTML = (mode === 'zh-to-en') ? word.zh.join(' / ') : word.en + posHtml;
    
    let options = [word]; 
    let filteredPool = masteryPool.filter(w => w.en !== word.en && !window.isSemanticOverlap(w, word)).sort(() => Math.random() - 0.5); 
    options.push(...filteredPool.slice(0, 3));
    
    if (options.length < 4) { 
        let fallback = window.getSelectedWordsPool().filter(w => w.en !== word.en && !window.isSemanticOverlap(w, word)).sort(() => Math.random() - 0.5); 
        options.push(...fallback.slice(0, 4 - options.length)); 
    }
    options = options.slice(0, 4).sort(() => Math.random() - 0.5);
    
    const optArea = document.getElementById('mastery-mcq-options'); optArea.innerHTML = '';
    options.forEach(opt => { 
        let btn = document.createElement('button'); btn.className = 'btn-mcq'; 
        let optPosHtml = (opt.pos && opt.pos.trim() !== '' && mode === 'zh-to-en') ? ` <span style="font-size:0.75rem; color:#ff9800;">[${opt.pos}]</span>` : '';
        btn.innerHTML = (mode === 'zh-to-en') ? opt.en + optPosHtml : opt.zh[0]; 
        btn.onclick = () => window.checkMasteryAnswer(opt.en === word.en); 
        optArea.appendChild(btn); 
    });
};

let matchEnSelected = null, matchZhSelected = null, matchMistake = false, matchPairsLeft = 4;
window.showMasteryMatch = function(word) {
    setDisplayState('mastery-match-area', true); matchMistake = false;
    let pool = masteryPool.filter(w => w.en !== word.en).sort(() => Math.random() - 0.5); let selectedDistractors = pool.slice(0, 3);
    if (selectedDistractors.length < 3) { let globalPool = window.getSelectedWordsPool().filter(w => w.en !== word.en).sort(() => Math.random() - 0.5); selectedDistractors.push(...globalPool.slice(0, 3 - selectedDistractors.length)); }
    let currentMatchPairs = [word, ...selectedDistractors].slice(0, 4); matchPairsLeft = currentMatchPairs.length;
    window.renderMatchColumns(currentMatchPairs.map(w => ({ text: w.en, pos: w.pos, ref: w })).sort(() => Math.random() - 0.5), currentMatchPairs.map(w => ({ text: w.zh[0], ref: w })).sort(() => Math.random() - 0.5));
};

window.renderMatchColumns = function(enList, zhList) {
    const enCol = document.getElementById('match-col-en'); const zhCol = document.getElementById('match-col-zh'); enCol.innerHTML = ''; zhCol.innerHTML = ''; matchEnSelected = null; matchZhSelected = null;
    enList.forEach((item) => { 
        let btn = document.createElement('button'); btn.className = 'match-btn'; 
        let posHtml = (item.pos && item.pos.trim() !== '') ? ` <span style="font-size:0.7rem; color:#ff9800;">[${item.pos}]</span>` : '';
        btn.innerHTML = item.text + posHtml; 
        btn.onclick = () => window.handleMatchClick('en', item, btn); enCol.appendChild(btn); 
    });
    zhList.forEach((item) => { let btn = document.createElement('button'); btn.className = 'match-btn'; btn.innerText = item.text; btn.onclick = () => window.handleMatchClick('zh', item, btn); zhCol.appendChild(btn); });
};

window.handleMatchClick = function(type, item, btnElement) {
    if (btnElement.classList.contains('matched')) return;
    if (type === 'en') {
        if (matchEnSelected) matchEnSelected.btn.classList.remove('selected'); matchEnSelected = { item, btn: btnElement }; btnElement.classList.add('selected');
        window.forceSpeak = true; window.speakEnglishWord(item.text); 
    } else {
        if (matchZhSelected) matchZhSelected.btn.classList.remove('selected'); matchZhSelected = { item, btn: btnElement }; btnElement.classList.add('selected');
    }
    if (matchEnSelected && matchZhSelected) window.checkMatchPair();
};

window.checkMatchPair = function() {
    let en = matchEnSelected, zh = matchZhSelected;
    if (en.item.ref.en === zh.item.ref.en) { 
        en.btn.classList.remove('selected'); zh.btn.classList.remove('selected'); en.btn.classList.add('matched'); zh.btn.classList.add('matched');
        matchEnSelected = null; matchZhSelected = null; matchPairsLeft--;
        if (matchPairsLeft === 0) setTimeout(() => window.checkMasteryAnswer(!matchMistake), 400);
    } else { 
        matchMistake = true; en.btn.classList.add('wrong'); zh.btn.classList.add('wrong');
        setTimeout(() => { en.btn.classList.remove('wrong', 'selected'); zh.btn.classList.remove('wrong', 'selected'); matchEnSelected = null; matchZhSelected = null; }, 500);
    }
};

window.showMasteryPuzzle = function(word) {
    setDisplayState('mastery-puzzle-area', true); 
    document.getElementById('mastery-puzzle-badge').innerText = "Lv 3: 結構重組"; 
    document.getElementById('mastery-puzzle-q').innerText = word.zh.join(' / '); 
    document.getElementById('mastery-puzzle-hint-display').innerText = ''; 
    puzzleUserAnswer = []; let letters = word.en.toLowerCase().split('');
    for (let i = letters.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [letters[i], letters[j]] = [letters[j], letters[i]]; }
    puzzleSourceLetters = letters.map((l, i) => ({ id: i, char: l, used: false })); window.renderMasteryPuzzleBoard();
};

window.showMasteryPuzzleHint = function() {
    if(!currentMasteryTarget) return;
    const word = currentMasteryTarget.en; 
    document.getElementById('mastery-puzzle-hint-display').innerText = (word.length <= 2) ? word : `${word.charAt(0)}${'_'.repeat(word.length - 2)}${word.charAt(word.length - 1)}`;
};

window.renderMasteryPuzzleBoard = function() {
    const ansArea = document.getElementById('mastery-puzzle-ans'); const poolArea = document.getElementById('mastery-puzzle-pool'); ansArea.innerHTML = ''; poolArea.innerHTML = '';
    puzzleUserAnswer.forEach((letterObj, idx) => { 
        const tile = document.createElement('div'); tile.className = 'letter-tile'; tile.innerText = letterObj.char; 
        tile.onclick = () => { puzzleUserAnswer[idx].used = false; puzzleUserAnswer.splice(idx, 1); window.renderMasteryPuzzleBoard(); }; ansArea.appendChild(tile); 
    });
    if (puzzleUserAnswer.length < currentMasteryTarget.en.length) { const placeholder = document.createElement('div'); placeholder.className = 'letter-tile empty'; placeholder.innerText = '_'; ansArea.appendChild(placeholder); }
    puzzleSourceLetters.forEach(letterObj => { 
        if (!letterObj.used) { 
            const tile = document.createElement('div'); tile.className = 'letter-tile'; tile.innerText = letterObj.char; 
            tile.onclick = () => { letterObj.used = true; puzzleUserAnswer.push(letterObj); window.renderMasteryPuzzleBoard(); window.checkMasteryPuzzle(false); }; poolArea.appendChild(tile); 
        } 
    });
};

window.checkMasteryPuzzle = function(forced = false) {
    if(!currentMasteryTarget) return;
    const currentString = puzzleUserAnswer.map(o => o.char).join(''); const targetString = currentMasteryTarget.en.toLowerCase();
    if (puzzleUserAnswer.length === targetString.length || forced) window.checkMasteryAnswer(currentString === targetString);
};

window.showMasteryTyping = function(word, isDelayed) {
    setDisplayState('mastery-typing-area', true); 
    document.getElementById('mastery-typing-badge').innerText = isDelayed ? "Lv 5: 延遲固化 (畢業評測)" : "Lv 4: 主動輸出";
    document.getElementById('mastery-typing-q').innerText = word.zh.join(' / ');
    const input = document.getElementById('mastery-typing-input'); input.value = ''; setTimeout(() => input.focus(), 50); 
    input.onkeypress = (e) => { if(e.key === 'Enter') { e.preventDefault(); window.checkMasteryTyping(); } };
};

window.checkMasteryTyping = function() {
    if(!currentMasteryTarget) return;
    const val = document.getElementById('mastery-typing-input').value.trim().toLowerCase(); const target = currentMasteryTarget.en.toLowerCase(); window.checkMasteryAnswer(val === target);
};

window.checkMasteryAnswer = function(isCorrect) {
    window.hideAllMasteryAreas(); setDisplayState('mastery-feedback-area', true, 'flex');
    const icon = document.getElementById('mastery-fb-icon'); const status = document.getElementById('mastery-fb-status'); const msg = document.getElementById('mastery-fb-msg');
    
    document.getElementById('mastery-fb-ans').innerText = currentMasteryTarget.en + " (" + currentMasteryTarget.zh.join(' / ') + ")";
    
    window.forceSpeak = true; window.speakEnglishWord(currentMasteryTarget.en); window.tickMasteryDelays(); let lvl = currentMasteryTarget.level;

    if (masteryModeType === 'comprehensive') {
        if (isCorrect) {
            icon.innerText = '✔'; icon.className = 'big-icon icon-correct'; status.innerText = '正確'; status.className = 'result-status status-correct';
            if (lvl === 1) { currentMasteryTarget.level = 2; msg.innerText = `升級至 Level 2 逆向回想。`; } 
            else if (lvl === 2) { currentMasteryTarget.level = 3; msg.innerText = `升級至 Level 3 結構重組。`; } 
            else if (lvl === 3) { currentMasteryTarget.level = 4; msg.innerText = `升級至 Level 4 主動輸出。`; } 
            else if (lvl === 4) { currentMasteryTarget.level = 4.5; currentMasteryTarget.delay = delayWaitTurns; msg.innerText = `進入記憶固化潛伏期，系統稍後將觸發延遲評測。`; } 
            else if (lvl === 4.9) { 
                currentMasteryTarget.level = 5; let rw = window.calculateReward(currentMasteryTarget, 'Comp_Grad'); let extraMsg = "";
                if (!rw.isMastered) { window.bufferWordAsMastered(currentMasteryTarget); extraMsg = rw.points > 0 ? ` (結算時將獲得 ${rw.points} 分)` : " (解鎖成就：已精通)"; } 
                else { extraMsg = " (此單字已精通過，不再重複給予分數)"; }
                msg.innerText = `通過延遲評測，該單字已完全精通！${extraMsg}`; 
            }
        } else {
            icon.innerText = '✘'; icon.className = 'big-icon icon-wrong'; status.innerText = '錯誤'; status.className = 'result-status status-wrong';
            currentMasteryTarget.level = 1; msg.innerText = "降級重回 Level 1 視覺辨識。";
        }
    } else {
        if (isCorrect) {
            icon.innerText = '✔'; icon.className = 'big-icon icon-correct'; status.innerText = '正確'; status.className = 'result-status status-correct';
            if (lvl === 1) { currentMasteryTarget.level = 2; msg.innerText = `升級至 Level 2 雙向連接。`; } 
            else if (lvl === 2) { currentMasteryTarget.level = 2.5; currentMasteryTarget.delay = delayWaitTurns; msg.innerText = "進入記憶固化潛伏期，系統稍後將觸發延遲評測。"; } 
            else if (lvl === 2.9) { 
                currentMasteryTarget.level = 4; let rw = window.calculateReward(currentMasteryTarget, 'Conn_Grad'); let extraMsg = "";
                if (!rw.isMastered) { window.bufferWordAsMastered(currentMasteryTarget); extraMsg = rw.points > 0 ? ` (結算時將獲得 ${rw.points} 分)` : " (解鎖成就：已精通)"; } 
                else { extraMsg = " (此單字已精通過，不再重複給予分數)"; }
                msg.innerText = `通過延遲評測，單字連接力建立完成！${extraMsg}`; 
            }
        } else {
            icon.innerText = '✘'; icon.className = 'big-icon icon-wrong'; status.innerText = '錯誤'; status.className = 'result-status status-wrong';
            currentMasteryTarget.level = 1; msg.innerText = "降級重回 Level 1 視覺辨識。";
        }
    }
};

window.masteryFeedbackNext = function() { window.nextMasteryTurn(); };
window.replayMasteryAudio = function() { if (currentMasteryTarget) { window.forceSpeak = true; window.speakEnglishWord(currentMasteryTarget.en); } };

// =====================================
// 7. 原版 8 大練習模式 (給予「商城點數」)
// =====================================
window.setupPractice = function(mode) { 
    practiceQueue = window.getPracticeWords(); if (!practiceQueue || practiceQueue.length === 0) return; 
    if (!isSequentialMode) { practiceQueue.sort(() => Math.random() - 0.5); }
    currentMode = mode; currentCardIndex = 0; initialQueueLength = practiceQueue.length; completedCount = 0; 
    document.getElementById('mode-display').innerText = (mode === 'zh-to-en') ? '中翻英' : '英翻中'; 
    setDisplayState('sequential-badge', isSequentialMode, 'inline-block'); setDisplayState('hint-btn', (mode === 'zh-to-en'), 'inline-block'); 
    window.switchView('practice'); window.showNextCard(); 
};

window.showNextCard = function() { 
    if (currentCardIndex >= practiceQueue.length) return window.endQuiz(); 
    const w = practiceQueue[currentCardIndex]; 
    setDisplayState('interaction-area', true, 'block'); setDisplayState('feedback-area', false); 
    const inputEl = document.getElementById('answer-input'); if (inputEl) { inputEl.value = ''; setTimeout(() => inputEl.focus(), 50); }
    document.getElementById('hint-display').innerText = ''; document.getElementById('progress-display').innerText = isSequentialMode ? `第 ${currentCardIndex+1} 關` : `${completedCount}/${initialQueueLength}`; 
    const q = (currentMode === 'zh-to-en') ? w.zh.join(' / ') : w.en; document.getElementById('question-display').innerText = q; document.getElementById('feedback-question-copy').innerText = q; 
};

window.showHint = function() { 
    if (!practiceQueue[currentCardIndex]) return; let w = practiceQueue[currentCardIndex].en; 
    document.getElementById('hint-display').innerText = (w.length <= 2) ? w : `${w.charAt(0)}${'_'.repeat(w.length-2)}${w.charAt(w.length-1)}`; 
};

window.checkAnswer = function() { 
    if (currentCardIndex >= practiceQueue.length) return; const v = document.getElementById('answer-input').value.trim(); const w = practiceQueue[currentCardIndex]; let c = false; 
    if (v !== '') { if (currentMode === 'zh-to-en') { c = (v.toLowerCase() === w.en.toLowerCase()); } else { c = w.zh.some(m => m.trim().includes(v) && v.length > 0); } } 
    lastAnswerCorrect = c; 
    if (c && !w.scored) { w.scored = true; if (typeof window.addStorePoints === 'function') window.addStorePoints(10); }
    if (!c && !isSequentialMode) window.requeueWord(w); window.showFeedback(c, w); 
};

window.showFeedback = function(c, w) { 
    setDisplayState('interaction-area', false); setDisplayState('feedback-area', true, 'flex'); 
    const i = document.getElementById('feedback-icon'); const s = document.getElementById('feedback-status'); 
    document.getElementById('feedback-answer').innerText = (currentMode === 'zh-to-en') ? w.en : w.zh.join(', '); 
    if (c) { i.innerText = '✔'; i.className = 'big-icon icon-correct'; s.innerText = '正確 (+10 點數)'; s.className = 'result-status status-correct'; } 
    else { i.innerText = '✘'; i.className = 'big-icon icon-wrong'; s.innerText = '錯誤'; s.className = 'result-status status-wrong'; } 
    window.forceSpeak = true; window.speakEnglishWord(w.en); 
};

window.handleNextClick = function() { 
    if (lastAnswerCorrect) completedCount++; 
    if (isSequentialMode && !lastAnswerCorrect) { window.SilenModal.alert("評測錯誤，重頭開始。").then(() => { currentCardIndex = 0; completedCount = 0; window.showNextCard(); }); } 
    else { currentCardIndex++; window.showNextCard(); }
};

var answerInputEl = document.getElementById('answer-input');
if (answerInputEl) { answerInputEl.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); window.checkAnswer(); } }); }

window.setupMultipleChoice = function(mode) { 
    practiceQueue = window.getPracticeWords(); if (!practiceQueue || practiceQueue.length === 0) return; 
    let pool = window.getSelectedWordsPool(); let uniqueWords = new Set(); pool.forEach(w => uniqueWords.add(w.en));
    if (uniqueWords.size < 4) { window.SilenModal.alert("單字簿數量不足以生成干擾項選項。"); return; }
    if (!isSequentialMode) { practiceQueue.sort(() => Math.random() - 0.5); }
    currentMode = mode; currentCardIndex = 0; initialQueueLength = practiceQueue.length; completedCount = 0; 
    document.getElementById('mcq-mode-display').innerText = (mode === 'zh-to-en') ? '中選英' : '英選中'; 
    setDisplayState('mcq-seq-badge', isSequentialMode, 'inline-block'); window.switchView('mcq'); window.showMcqNextCard(); 
};

window.showMcqNextCard = function() { 
    if (currentCardIndex >= practiceQueue.length) return window.endQuiz(); 
    const w = practiceQueue[currentCardIndex]; setDisplayState('mcq-interaction-area', true, 'block'); setDisplayState('mcq-feedback-area', false); 
    document.getElementById('mcq-progress-display').innerText = isSequentialMode ? `第 ${currentCardIndex+1} 關` : `${completedCount}/${initialQueueLength}`; 
    
    let posHtml = (w.pos && w.pos.trim() !== '') ? `<span style="font-size: 0.8rem; background: #333; padding: 2px 6px; border-radius: 4px; color: #ff9800; margin-left: 6px;">[${w.pos}]</span>` : '';
    const q = (currentMode === 'zh-to-en') ? w.zh.join(' / ') : w.en + posHtml; 
    document.getElementById('mcq-question-display').innerHTML = q; 
    document.getElementById('mcq-feedback-question-copy').innerHTML = q; 
    
    let opts = [w]; 
    let pool = window.getSelectedWordsPool(); 
    let dis = pool.filter(x => x.en !== w.en && !window.isSemanticOverlap(x, w)).sort(() => Math.random() - 0.5);
    opts = opts.concat(dis.slice(0, 3)); opts.sort(() => Math.random() - 0.5); 
    
    const a = document.getElementById('mcq-options-area'); a.innerHTML = ''; 
    opts.forEach(o => { 
        let b = document.createElement('button'); b.className = 'btn-mcq'; 
        let optPosHtml = (o.pos && o.pos.trim() !== '' && currentMode === 'zh-to-en') ? ` <span style="font-size:0.75rem; color:#ff9800;">[${o.pos}]</span>` : '';
        b.innerHTML = (currentMode === 'zh-to-en') ? o.en + optPosHtml : o.zh.join(' / '); 
        b.onclick = () => window.checkMcqAnswer(o.en === w.en); a.appendChild(b); 
    }); 
};

window.checkMcqAnswer = function(c) { 
    if (currentCardIndex >= practiceQueue.length) return; lastAnswerCorrect = c; const w = practiceQueue[currentCardIndex]; 
    if (c && !w.scored) { w.scored = true; if (typeof window.addStorePoints === 'function') window.addStorePoints(10); }
    if (!c && !isSequentialMode) window.requeueWord(w); setDisplayState('mcq-interaction-area', false); setDisplayState('mcq-feedback-area', true, 'flex'); 
    const i = document.getElementById('mcq-feedback-icon'); const s = document.getElementById('mcq-feedback-status'); 
    document.getElementById('mcq-feedback-answer').innerText = (currentMode === 'zh-to-en') ? w.en : w.zh.join(', '); 
    if (c) { i.innerText = '✔'; i.className = 'big-icon icon-correct'; s.innerText = '正確 (+10 點數)'; s.className = 'result-status status-correct'; } 
    else { i.innerText = '✘'; i.className = 'big-icon icon-wrong'; s.innerText = '錯誤'; s.className = 'result-status status-wrong'; } 
    window.forceSpeak = true; window.speakEnglishWord(w.en); 
};

window.handleMcqNextClick = function() { 
    if (lastAnswerCorrect) completedCount++; 
    if (isSequentialMode && !lastAnswerCorrect) { window.SilenModal.alert("評測錯誤，重頭開始。").then(() => { currentCardIndex = 0; completedCount = 0; window.showMcqNextCard(); }); } 
    else { currentCardIndex++; window.showMcqNextCard(); }
};

window.setupSpeakingMode = function() { 
    if (!recognition) { window.SilenModal.alert("當前核心環境不支援語音介面。"); return; }
    practiceQueue = window.getPracticeWords(); if (!practiceQueue || practiceQueue.length === 0) return; 
    if (!isSequentialMode) { practiceQueue.sort(() => Math.random() - 0.5); }
    currentCardIndex = 0; initialQueueLength = practiceQueue.length; completedCount = 0; window.switchView('speaking'); window.showNextSpeakingCard(); 
};

window.showNextSpeakingCard = function() { 
    if (currentCardIndex >= practiceQueue.length) return window.endQuiz(); const w = practiceQueue[currentCardIndex]; 
    setDisplayState('speaking-interaction-area', true, 'block'); setDisplayState('speaking-feedback-area', false); 
    document.getElementById('speaking-word-display').innerText = w.en; document.getElementById('speaking-zh-display').innerText = w.zh.join(' / '); 
    document.getElementById('speaking-status').innerText = '準備就緒'; document.getElementById('speaking-progress').innerText = `${completedCount}/${initialQueueLength}`; 
    window.forceSpeak = true; window.speakEnglishWord(w.en); 
};

window.startSpeechRecognition = function() { 
    if (!recognition) return; const b = document.getElementById('mic-btn'); const s = document.getElementById('speaking-status'); 
    try { recognition.start(); b.classList.add('listening'); s.innerText = '正在語音錄製與分析...'; } catch(e) { console.error(e); } 
    recognition.onresult = (e) => { 
        const h = e.results[0][0].transcript.toLowerCase().replace(/[.,?!]/g, "").trim(); const c = e.results[0][0].confidence; const t = practiceQueue[currentCardIndex].en.toLowerCase().trim(); 
        b.classList.remove('listening'); setDisplayState('speaking-interaction-area', false); setDisplayState('speaking-feedback-area', true, 'flex'); 
        const sd = document.getElementById('speaking-score'); const md = document.getElementById('speaking-feedback-msg'); const hd = document.getElementById('speaking-heard-text'); 
        if (h === t || h.includes(t) || t.includes(h)) { 
            lastAnswerCorrect = true; let fs = Math.round(c * 100); if (fs < 50) fs = 80; 
            if (!practiceQueue[currentCardIndex].scored) { practiceQueue[currentCardIndex].scored = true; }
            // 移除了點數獎勵，純粹顯示發音準確度
            sd.innerText = `${fs}%`; sd.style.color = 'var(--success)'; md.innerText = `發音標準 (口說無點數獎勵)`; hd.innerText = `捕獲音訊: "${h}"`; 
        } else { 
            lastAnswerCorrect = false; sd.innerText = '0%'; sd.style.color = 'var(--error)'; md.innerText = '識別不匹配'; hd.innerText = `捕獲音訊: "${h}"`; 
            if (!isSequentialMode) window.requeueWord(practiceQueue[currentCardIndex]); 
        } 
    }; 
    recognition.onerror = () => { b.classList.remove('listening'); s.innerText = '音訊解碼失敗。'; }; 
    recognition.onspeechend = () => { recognition.stop(); b.classList.remove('listening'); }; 
};

window.handleSpeakingNextClick = function() { 
    if (lastAnswerCorrect) completedCount++; 
    if (isSequentialMode && !lastAnswerCorrect) { window.SilenModal.alert('重頭開始。').then(() => { currentCardIndex = 0; completedCount = 0; window.showNextSpeakingCard(); }); } 
    else { currentCardIndex++; window.showNextSpeakingCard(); }
};

window.setupPuzzleMode = function() { 
    practiceQueue = window.getPracticeWords(); if (!practiceQueue || practiceQueue.length === 0) return; 
    if (!isSequentialMode) { practiceQueue.sort(() => Math.random() - 0.5); }
    currentCardIndex = 0; setDisplayState('puzzle-seq-badge', isSequentialMode, 'inline-block'); window.switchView('puzzle'); window.loadPuzzleLevel(); 
};

window.loadPuzzleLevel = function() { 
    if (currentCardIndex >= practiceQueue.length) return window.endQuiz(); puzzleCurrentWord = practiceQueue[currentCardIndex]; puzzleUserAnswer = []; 
    let ls = puzzleCurrentWord.en.toLowerCase().split(''); for (let i = ls.length - 1; i > 0; i--) { let j = Math.floor(Math.random() * (i + 1)); let temp = ls[i]; ls[i] = ls[j]; ls[j] = temp; } 
    puzzleSourceLetters = ls.map((l, i) => ({ id: i, char: l, used: false })); document.getElementById('puzzle-hint-display').innerText = ''; 
    document.getElementById('puzzle-question').innerText = puzzleCurrentWord.zh.join(' / '); document.getElementById('puzzle-message').innerText = ''; 
    document.getElementById('puzzle-progress').innerText = isSequentialMode ? `第 ${currentCardIndex+1} 關` : `${currentCardIndex+1}/${practiceQueue.length}`; window.renderPuzzleBoard(); 
};

window.showPuzzleHint = function() { 
    if(!puzzleCurrentWord) return; let w = puzzleCurrentWord.en; let hintStr = (w.length <= 2) ? w : `${w.charAt(0)}${'_'.repeat(w.length-2)}${w.charAt(w.length-1)}`; document.getElementById('puzzle-hint-display').innerText = hintStr; 
};

window.renderPuzzleBoard = function() { 
    const a = document.getElementById('puzzle-answer-area'); const p = document.getElementById('puzzle-pool-area'); a.innerHTML = ''; p.innerHTML = ''; 
    puzzleUserAnswer.forEach((o, i) => { 
        let t = document.createElement('div'); t.className = 'letter-tile'; t.innerText = o.char; 
        t.onclick = () => { puzzleUserAnswer[i].used = false; puzzleUserAnswer.splice(i, 1); window.renderPuzzleBoard(); }; a.appendChild(t); 
    }); 
    if (puzzleUserAnswer.length < puzzleCurrentWord.en.length) { let ph = document.createElement('div'); ph.className = 'letter-tile empty'; ph.innerText = '_'; a.appendChild(ph); } 
    puzzleSourceLetters.forEach(o => { 
        if (!o.used) { 
            let t = document.createElement('div'); t.className = 'letter-tile'; t.innerText = o.char; 
            t.onclick = () => { o.used = true; puzzleUserAnswer.push(o); window.renderPuzzleBoard(); window.checkPuzzleState(false); }; p.appendChild(t); 
        } 
    }); 
};

window.checkPuzzleState = function(f) { 
    if(!puzzleCurrentWord) return; let cs = puzzleUserAnswer.map(o => o.char).join(''); let ts = puzzleCurrentWord.en.toLowerCase(); let m = document.getElementById('puzzle-message'); 
    if (cs.length === ts.length || f === true) { 
        if (cs === ts) { 
            m.className = 'result-msg result-correct'; m.innerText = '正確 (+10 點數)'; 
            if (!puzzleCurrentWord.scored) { puzzleCurrentWord.scored = true; if (typeof window.addStorePoints === 'function') window.addStorePoints(10); }
            window.forceSpeak = true; window.speakEnglishWord(ts); setTimeout(() => { currentCardIndex++; window.loadPuzzleLevel(); }, 800); 
        } else { 
            if (isSequentialMode) { 
                m.className = 'result-msg result-wrong'; m.innerText = `錯誤，答案為 ${ts}。`; window.forceSpeak = true; window.speakEnglishWord(ts); setTimeout(() => { currentCardIndex = 0; window.loadPuzzleLevel(); }, 2000); 
            } else { 
                if (f === true) { m.className = 'result-msg result-wrong'; m.innerText = `錯誤，答案為 ${ts}`; window.forceSpeak = true; window.speakEnglishWord(ts); window.requeueWord(puzzleCurrentWord); setTimeout(() => { currentCardIndex++; window.loadPuzzleLevel(); }, 2000); } 
                else { m.className = 'result-msg result-wrong'; m.innerText = '比對不符'; } 
            } 
        } 
    } 
};

window.setupMemoryMode = function() { 
    let p = window.getPracticeWords(); if (!p || p.length < 2) { window.SilenModal.alert("生成記憶矩陣單字數量不足。"); return; } 
    p.sort(() => Math.random() - 0.5); let sw = p.slice(0, 8); memoryCards = []; 
    sw.forEach(w => { memoryCards.push({ id: w.en, content: w.en, type: 'en', matched: false }); memoryCards.push({ id: w.en, content: w.zh[0], type: 'zh', matched: false }); }); 
    memoryCards.sort(() => Math.random() - 0.5); memoryFlipped = []; memoryLocked = false; memoryMatchedCount = 0; 
    window.switchView('memory'); window.renderMemoryBoard(); document.getElementById('memory-message').innerText = '請選取卡片'; 
};

window.setupMemoryModeGuest = function() { 
    let p = [...practiceQueue]; if (!p || p.length < 2) { window.SilenModal.alert("生成記憶矩陣單字數量不足。"); return; } 
    p.sort(() => Math.random() - 0.5); let sw = p.slice(0, 8); memoryCards = []; 
    sw.forEach(w => { memoryCards.push({ id: w.en, content: w.en, type: 'en', matched: false }); memoryCards.push({ id: w.en, content: w.zh[0], type: 'zh', matched: false }); }); 
    memoryCards.sort(() => Math.random() - 0.5); memoryFlipped = []; memoryLocked = false; memoryMatchedCount = 0; 
    window.switchView('memory'); window.renderMemoryBoard(); document.getElementById('memory-message').innerText = '請選取卡片'; 
};

window.renderMemoryBoard = function() { 
    const b = document.getElementById('memory-board'); b.innerHTML = ''; 
    memoryCards.forEach((c, i) => { 
        let d = document.createElement('div'); d.className = `memory-card ${c.matched ? 'matched' : ''}`; 
        d.innerHTML = `<div class="memory-inner"><div class="memory-front">${c.content}</div><div class="memory-back">?</div></div>`; 
        d.onclick = () => window.flipCard(i); b.appendChild(d); 
    }); 
};

window.flipCard = function(i) { 
    if (memoryLocked || memoryCards[i].matched || memoryFlipped.includes(i)) return; 
    document.getElementById('memory-board').children[i].classList.add('flipped'); memoryFlipped.push(i); 
    if (memoryFlipped.length === 2) window.checkMemoryMatch(); 
};

window.checkMemoryMatch = function() { 
    memoryLocked = true; let i1 = memoryFlipped[0]; let i2 = memoryFlipped[1]; let c1 = memoryCards[i1]; let c2 = memoryCards[i2]; let m = document.getElementById('memory-message'); 
    if (c1.id === c2.id) { 
        c1.matched = c2.matched = true; memoryMatchedCount += 2; 
        if (typeof window.addStorePoints === 'function') window.addStorePoints(10);
        document.getElementById('memory-board').children[i1].classList.add('matched'); document.getElementById('memory-board').children[i2].classList.add('matched'); 
        m.innerText = '矩陣配對成功 (+10 點數)'; m.className = 'result-msg result-correct'; window.forceSpeak = true; window.speakEnglishWord(c1.id); 
        memoryFlipped = []; memoryLocked = false; if (memoryMatchedCount === memoryCards.length) setTimeout(() => window.endQuiz(), 500); 
    } else { 
        m.innerText = '不匹配'; m.className = 'result-msg result-wrong'; 
        setTimeout(() => { document.getElementById('memory-board').children[i1].classList.remove('flipped'); document.getElementById('memory-board').children[i2].classList.remove('flipped'); memoryFlipped = []; memoryLocked = false; m.innerText = ''; }, 1000); 
    } 
};

window.setupYouglishMode = function() { 
    practiceQueue = window.getPracticeWords(); if (!practiceQueue || practiceQueue.length === 0) return; 
    practiceQueue.sort(() => Math.random() - 0.5); currentCardIndex = 0; window.switchView('youglish'); window.loadYouglishCard(); 
};

window.loadYouglishCard = function() { 
    if (!practiceQueue[currentCardIndex]) return; const w = practiceQueue[currentCardIndex]; 
    document.getElementById('yg-word').innerText = w.en; document.getElementById('yg-zh').innerText = w.zh.join(' / '); 
    document.getElementById('yg-progress').innerText = `${currentCardIndex+1}/${practiceQueue.length}`; document.getElementById('yg-link-word').innerText = w.en; 
    document.getElementById('yg-link').href = `https://youglish.com/pronounce/${encodeURIComponent(w.en)}/english`; 
};

window.nextYouglishCard = function() { if (currentCardIndex < practiceQueue.length - 1) { currentCardIndex++; window.loadYouglishCard(); } else { window.endQuiz(); } };
window.prevYouglishCard = function() { if (currentCardIndex > 0) { currentCardIndex--; window.loadYouglishCard(); } else { window.SilenModal.alert("已達佇列首端。"); } };

// =====================================
// 8. 自訂下拉選單控制與學測抽卡系統
// =====================================
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
        setDisplayState('normal-book-area', true); setDisplayState('gsat-book-area', false); setDisplayState('phrase-book-area', false); setDisplayState('store-book-area', false);
    } else if (mode === 'gsat') { 
        setDisplayState('normal-book-area', false); setDisplayState('gsat-book-area', true); setDisplayState('phrase-book-area', false); setDisplayState('store-book-area', false);
        const currentLevel = window.currentGsatLevel || 'lv1'; 
        if (gsatVocabCache[currentLevel].length === 0) { window.fetchGSATVocab(currentLevel); }
    } else if (mode === 'phrase') { 
        setDisplayState('normal-book-area', false); setDisplayState('gsat-book-area', false); setDisplayState('phrase-book-area', true); setDisplayState('store-book-area', false);
    } else if (mode === 'store') {
        setDisplayState('normal-book-area', false); setDisplayState('gsat-book-area', false); setDisplayState('phrase-book-area', false); setDisplayState('store-book-area', true);
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
    if (!gsatVocabCache[level] || gsatVocabCache[level].length === 0) { 
        await window.fetchGSATVocab(level); 
        if (!gsatVocabCache[level] || gsatVocabCache[level].length === 0) return; 
    }

    const amountElement = document.getElementById('gsat-claim-amount');
    const amount = amountElement ? (parseInt(amountElement.value) || 30) : 30;
    const levelNum = level.replace('lv', ''); 
    let defaultName = `學測 Lv${levelNum} 抽取`;
    
    const nameInputEl = document.getElementById('gsat-claim-name');
    const nameInput = nameInputEl ? nameInputEl.value.trim() : ''; 
    const bookName = nameInput === '' ? defaultName : nameInput; 
    
    const tagInputEl = document.getElementById('gsat-claim-tag');
    const bookTag = tagInputEl ? tagInputEl.value.trim() : `學測 Lv${levelNum}`;

    let existingWords = new Set();
    window.books.forEach(book => { 
        const safeTag = (book.tag && typeof book.tag === 'string') ? book.tag : '';
        if (safeTag.includes('學測') || book.isGSAT) { 
            if (book.words && Array.isArray(book.words)) {
                book.words.forEach(w => {
                    if (w && w.en) existingWords.add(w.en.toLowerCase());
                }); 
            }
        } 
    });
    
    let availableWords = gsatVocabCache[level].filter(w => !existingWords.has(w.en.toLowerCase()));

    if (availableWords.length === 0) { 
        window.SilenModal.alert(`太厲害了！學測 Lv${levelNum} 的單字已經被您全部抽完囉！`); 
        return; 
    }

    let finalAmount = amount;
    if (availableWords.length < amount) { 
        window.SilenModal.alert(`單字庫即將見底！只剩下最後 ${availableWords.length} 個全新單字，將為您全數抽出。`); 
        finalAmount = availableWords.length; 
    }

    availableWords.sort(() => Math.random() - 0.5); 
    let selectedWords = availableWords.slice(0, finalAmount);
    
    window.books.push({ id: Date.now(), name: bookName, tag: bookTag, isGSAT: true, isPhrase: false, isStore: false, words: selectedWords });

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
        if (typeof window.checkShareUrl === 'function' && !window.checkShareUrl()) {
        }
    }, 150); 
});

// =====================================
// 10. 排行榜與雙軌計分系統 (Leaderboard & Store Points)
// =====================================
window.myRankPoints = 0;
window.myStorePoints = 0;
window.lastRankScoreTime = 0;
window.lastStoreScoreTime = 0;

window.showScoringRules = function() {
    window.SilenModal.alert(
        "雙軌賽季計分規則\n\n" +
        "[牌位積分] (每週賽季)\n" +
        "每個賽季將自動從 0 開始計算。只能透過綜合精通模式獲取。完全精通單字後，獲得 50 分獎勵。(學測單字享最高 3 倍加成)\n\n" +
        "[商城點數] (終身累計)\n" +
        "遊玩其他任何單元，皆可穩定獲取商城點數！"
    );
};

window.getCurrentWeekId = function() {
    const launchDate = new Date("2026-05-28T00:00:00+08:00").getTime();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const weeksPassed = Math.floor((now - launchDate) / ONE_WEEK_MS);
    return Math.max(1, weeksPassed + 1); 
};

window.addRankPoints = function(points, force = false) {
    if (isGuestMode) return; 
    const now = Date.now();
    if (!force && window.lastRankScoreTime && now - window.lastRankScoreTime < 500) return;
    window.lastRankScoreTime = now;

    window.myRankPoints += points;

    const elTotal = document.getElementById('stat-rank-score');
    const elSeason = document.getElementById('lb-my-score');
    if (elTotal) elTotal.innerText = window.myRankPoints;
    if (elSeason) elSeason.innerText = window.myRankPoints;

    if (typeof window.uploadScoreToCloud === 'function') {
        window.uploadScoreToCloud(window.myRankPoints, window.myStorePoints);
    }
};

window.addStorePoints = async function(points, force = false) {
    if (isGuestMode) return; 
    
    // 前端防連點保護（維持原有的防呆機制）
    const now = Date.now();
    if (!force && window.lastStoreScoreTime && now - window.lastStoreScoreTime < 500) return;
    window.lastStoreScoreTime = now;

    try {
        // 取得目前的 Firebase 使用者 Token
        const user = auth.currentUser;
        if (!user) return;
        const idToken = await user.getIdToken();

        // 呼叫你的 VPS 後端 API
        const response = await fetch(`${API_BASE}/api/addpoints`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ amount: points })
        });

        const result = await response.json();

        if (result.success) {
            // 後端更新成功，同步更新前端畫面與變數
            window.myStorePoints = result.newPoints;
            const elStore = document.getElementById('stat-store-points');
            const elStoreMyScore = document.getElementById('store-my-score');
            if (elStore) elStore.innerText = window.myStorePoints;
            if (elStoreMyScore) elStoreMyScore.innerText = window.myStorePoints;
            
            // 這裡只需上傳牌位分數 (rankPoints)，因為 storePoints 已由後端處理
            if (typeof window.uploadScoreToCloud === 'function') {
                window.uploadScoreToCloud(window.myRankPoints, window.myStorePoints);
            }
        } else {
            console.error("加分失敗:", result.error);
        }
    } catch (error) {
        console.error("呼叫加分 API 發生錯誤:", error);
    }
};


window.openLeaderboard = async function() {
    window.switchView('leaderboard');
    const currentWeek = window.getCurrentWeekId();
    document.getElementById('lb-current-week').innerText = `第 ${currentWeek} 賽季`;
    
    const elSeason = document.getElementById('lb-my-score');
    if (elSeason) elSeason.innerText = window.myRankPoints;

    // 確保飾品資料已載入，這樣排行榜才能畫出邊框
    if (typeof window.loadAccessoriesCatalog === 'function') {
        await window.loadAccessoriesCatalog();
    }

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
        container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--text-sub);">本週尚無排名紀錄</div>';
        return;
    }

    listData.forEach((user, index) => {
        let rankClass = '';
        let rankText = index + 1;
        if (index === 0) { rankClass = 'lb-rank-1'; rankText = '1'; }
        else if (index === 1) { rankClass = 'lb-rank-2'; rankText = '2'; }
        else if (index === 2) { rankClass = 'lb-rank-3'; rankText = '3'; }

        // 解析並疊加外觀邊框
        let frameHtml = '';
        if (user.frame && window.accessoriesCatalog) {
            const item = window.accessoriesCatalog.find(a => a.id === user.frame);
            if (item) {
                frameHtml = `<img src="${item.imgUrl}" class="avatar-frame" style="display:block;">`;
            }
        }

        const div = document.createElement('div');
        div.className = 'lb-item';
        div.onclick = () => window.openPublicProfile(user); 
        div.innerHTML = `
            <div class="lb-rank ${rankClass}">${rankText}</div>
            <div class="avatar-wrapper" style="margin-right: 15px; width: 45px; height: 45px;">
                <img src="${user.photo || 'https://via.placeholder.com/45'}" class="lb-avatar" style="margin: 0; width: 100%; height: 100%;">
                ${frameHtml}
            </div>
            <div class="lb-info">
                <div class="lb-name">${user.name}</div>
            </div>
            <div class="lb-score">${user.score} pts</div>
        `;
        container.appendChild(div);
    });
};

window.openPublicProfile = function(user) {
    document.getElementById('public-profile-name').innerText = user.name;
    document.getElementById('public-stat-score').innerText = user.score;
    
    const avatarImg = document.getElementById('public-avatar-img');
    const avatarPlaceholder = document.getElementById('public-avatar-placeholder');
    const pubFrame = document.getElementById('public-avatar-frame');
    
    if (user.photo) {
        avatarImg.src = user.photo;
        avatarImg.style.display = 'block';
        avatarPlaceholder.style.display = 'none';
    } else {
        avatarImg.style.display = 'none';
        avatarPlaceholder.style.display = 'flex';
        avatarPlaceholder.innerText = user.name ? user.name.charAt(0).toUpperCase() : '?';
    }

    // 渲染對方的邊框
    if (pubFrame) {
        if (user.frame && window.accessoriesCatalog) {
            const item = window.accessoriesCatalog.find(a => a.id === user.frame);
            if (item) {
                pubFrame.src = item.imgUrl;
                pubFrame.style.display = 'block';
            } else {
                pubFrame.style.display = 'none';
            }
        } else {
            pubFrame.style.display = 'none';
        }
    }
    
    const badgeContainer = document.getElementById('public-badges-container');
    badgeContainer.innerHTML = '<div style="color:var(--text-sub); font-size:0.85rem; padding: 20px 0;">載入徽章中...</div>';

    if (typeof window.fetchPublicBadges === 'function') {
        window.fetchPublicBadges(user.uid);
    }

    window.switchView('public-profile');
};

window.editUserName = function() {
    const currentName = document.getElementById('profile-name').innerText;
    window.SilenModal.prompt("請輸入新的顯示名稱：", currentName).then(newName => {
        if (newName && newName.trim() !== '') {
            const finalName = newName.trim();
            document.getElementById('profile-name').innerText = finalName;
            document.getElementById('sb-user-name').innerText = finalName;
            
            if (typeof window.updateCloudUserName === 'function') {
                window.updateCloudUserName(finalName);
            } else {
                localStorage.setItem('sv_custom_name', finalName);
                window.SilenModal.alert("名稱已暫存於本機。 (提醒：若要同步至雲端排行榜，需確保 auth.js 雲端模組已串接)");
            }
        }
    });
};


// ==========================================================================
// 11. 片語專屬綜合練習模式
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
    headerTitle.style.color = "#fff"; 
    progressBar.style.background = "#fff"; 
    l0Card.style.borderColor = "#444";
    nextBtns.forEach(b => { 
        b.style.background = "#fff";
        b.style.borderColor = "#fff";
        b.style.color = "#000";
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
        document.getElementById('mastery-success-title').style.color = "#fff";
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
    
    document.getElementById('mastery-fb-ans').innerText = currentMasteryTarget.en + " (" + currentMasteryTarget.zh.join(' / ') + ")";
    
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
                extraMsg = rw.points > 0 ? ` (結算時將獲得 ${rw.points} 分)` : " (解鎖成就：已精通)";
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
// 12. 詞性挑戰模式 (POS Challenge)
// ==========================================================================
window.setupPosMode = function() { 
    let rawQueue = window.getPracticeWords(); 
    if (!rawQueue || rawQueue.length === 0) return; 
    
    practiceQueue = rawQueue.filter(w => w.pos && w.pos.trim() !== '');
    
    if (practiceQueue.length === 0) {
        window.SilenModal.alert("目前選取的題庫中，沒有包含「詞性標記」的單字！\n\n提示：請先到題庫編輯區，或重新匯入帶有詞性的單字格式。");
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
    
    const ans = selectedPos.toLowerCase().replace(/\./g, '').trim();
    const correctPosArr = w.pos.toLowerCase().split(/[\/,;，；\s]+/).map(x => x.replace(/\./g, '').trim());
    
    let c = correctPosArr.includes(ans);
    
    lastAnswerCorrect = c; 
    if (c && !w.scored) { 
        w.scored = true; 
        if (typeof window.addStorePoints === 'function') window.addStorePoints(10); 
    }
    
    if (!c && !isSequentialMode) window.requeueWord(w); 
    
    setDisplayState('pos-interaction-area', false); 
    setDisplayState('pos-feedback-area', true, 'flex'); 
    
    const i = document.getElementById('pos-feedback-icon'); 
    const s = document.getElementById('pos-feedback-status'); 
    document.getElementById('pos-feedback-answer').innerText = w.pos; 
    
    if (c) { 
        i.innerText = '✔'; i.className = 'big-icon icon-correct'; s.innerText = '正確 (+10 點數)'; s.className = 'result-status status-correct'; 
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

// ==========================================================================
// 13. 單字擴充商城系統
// ==========================================================================
let purchasedBundles = JSON.parse(localStorage.getItem('sv_purchased_bundles')) || [];

window.openStore = async function() {
    window.switchView('store');
    document.getElementById('store-my-score').innerText = window.myStorePoints || 0;
    
    const container = document.getElementById('store-catalog-area');
    container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--text-sub); letter-spacing: 1px;">正在連線至商城伺服器...</div>';
    
    try {
        const res = await fetch("store_catalog.json?t=" + Date.now());
        if (!res.ok) throw new Error("Catalog fetch failed");
        const catalogData = await res.json();
        window.renderStoreCatalog(catalogData);
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--error); letter-spacing: 1px;">載入失敗，請確認 store_catalog.json 是否已放在專案目錄中。</div>';
    }
};

window.currentCatalogData = [];

window.renderStoreCatalog = function(catalogData) {
    window.currentCatalogData = catalogData;
    const container = document.getElementById('store-catalog-area');
    container.innerHTML = '';

    catalogData.forEach(bundle => {
        const card = document.createElement('div');
        card.className = 'store-card';
        
        let totalSubBundles = bundle.subBundles ? bundle.subBundles.length : 0;
        
        card.innerHTML = `
            <div class="store-header">
                <h4 class="store-title">${bundle.name}</h4>
            </div>
            <div class="store-desc">${bundle.desc} <br><span style="color:var(--text-sub); font-size: 0.8rem; opacity: 0.8;">(包含 ${totalSubBundles} 個主題單字包)</span></div>
            <button class="btn" style="width: 100%; margin: 0; background: #222; color: #fff; border: 1px solid #444; font-weight: 500;" onclick="window.toggleSubBundles('${bundle.id}')">查看主題列表 ▾</button>
            
            <div id="sub-list-${bundle.id}" class="sub-bundle-container hidden">
            </div>
        `;
        container.appendChild(card);

        const subContainer = document.getElementById(`sub-list-${bundle.id}`);
        if (bundle.subBundles) {
            bundle.subBundles.forEach(sub => {
                const isInstalled = window.books.some(b => b.bundleId === sub.id);
                const isPurchased = purchasedBundles.includes(sub.id);
                
                const subItem = document.createElement('div');
                subItem.className = 'sub-bundle-item';
                
                let btnHtml = '';
                if (isInstalled) {
                    btnHtml = `<div style="font-size:0.8rem; color:#888;">已安裝</div>`;
                } else if (isPurchased) {
                    btnHtml = `<button class="btn btn-small" style="margin:0; background:#333; color:#fff; border:1px solid #555;" onclick="window.purchaseBundle('${sub.id}', 0, '${sub.name}')">重新下載</button>`;
                } else {
                    btnHtml = `<button class="btn btn-small" style="margin:0; background:#fff; color:#000;" onclick="window.purchaseBundle('${sub.id}', ${sub.price}, '${sub.name}')">${sub.price} pts</button>`;
                }

                subItem.innerHTML = `
                    <div class="sub-bundle-info">
                        <div class="sub-bundle-name">${sub.name}</div>
                        <div class="sub-bundle-meta">共 ${sub.wordCount} 詞</div>
                    </div>
                    <div>${btnHtml}</div>
                `;
                subContainer.appendChild(subItem);
            });
        }
    });
};

window.toggleSubBundles = function(bundleId) {
    const el = document.getElementById(`sub-list-${bundleId}`);
    if (el) el.classList.toggle('hidden');
};

window.purchaseBundle = function(subBundleId, price, subBundleName) {
    if (window.myStorePoints < price) {
        window.SilenModal.alert(`點數不足！\n\n解鎖此單字包需要 ${price} 點數，您目前只有 ${window.myStorePoints} 點數。`);
        return;
    }

    let confirmMsg = price > 0 ? `確定要花費 ${price} 點數解鎖「${subBundleName}」嗎？` : `確定要重新下載最新的「${subBundleName}」嗎？`;

    window.SilenModal.confirm(confirmMsg).then(async agreed => {
        if (agreed) {
            window.SilenModal.alert("正在從伺服器下載單字包，請稍候...");
            
            try {
                // 這裡會去抓取你的 GitHub JSON 檔案 (例如 hotel.json)
                const res = await fetch(subBundleId + ".json?t=" + Date.now());
                if (!res.ok) throw new Error("Bundle fetch failed");
                const bundleData = await res.json();
                
                if (price > 0) {
                    window.myStorePoints -= price;
                    document.getElementById('store-my-score').innerText = window.myStorePoints;
                    if (typeof window.uploadScoreToCloud === 'function') {
                        window.uploadScoreToCloud(window.myRankPoints, window.myStorePoints); 
                    }
                }

                if (!purchasedBundles.includes(subBundleId)) {
                    purchasedBundles.push(subBundleId);
                    localStorage.setItem('sv_purchased_bundles', JSON.stringify(purchasedBundles));
                }

                // 【核心修改：自動判斷並拆解 MEGA JSON】
                if (!Array.isArray(bundleData) && typeof bundleData === 'object') {
                    // 如果是你的新版分類型 JSON (例如 hotel.json)
                    // 為了防止重新下載時產生重複，先清除舊的同 ID 題庫
                    window.books = window.books.filter(b => b.bundleId !== subBundleId);
                    
                    // 遍歷所有子分類 (例如：酒店基本詞彙、房型與設施)
                    for (const [subTopicName, wordsArray] of Object.entries(bundleData)) {
                        window.books.push({
                            id: Date.now() + Math.random(), // 確保多本同時生成的 ID 不會撞號
                            name: subTopicName,             // 單字簿名稱 = 子分類名
                            tag: subBundleName.split(' ')[0], // 取主標題當 Tag (例如 "飯店英文")
                            isGSAT: false,
                            isPhrase: false, 
                            isStore: true,  
                            bundleId: subBundleId,
                            words: wordsArray
                        });
                    }
                } else {
                    // 如果是舊版的一般陣列 JSON (相容舊有設計)
                    window.books = window.books.filter(b => b.bundleId !== subBundleId);
                    window.books.push({
                        id: Date.now(),
                        name: subBundleName,
                        tag: "官方擴充",
                        isGSAT: false,
                        isPhrase: false, 
                        isStore: true,  
                        bundleId: subBundleId,
                        words: bundleData
                    });
                }

                window.saveData();
                window.renderStoreCatalog(window.currentCatalogData);
                const parentBundleId = subBundleId.split('-')[0];
                window.toggleSubBundles(parentBundleId);
                
                window.SilenModal.alert(`下載成功！\n\n已為您將單字庫自動分類並匯入完畢。`).then(() => {
                    window.setLibMode('store', '商城擴充庫');
                    window.openBookSelect();
                });

            } catch (e) {
                console.error(e);
                window.SilenModal.alert(`下載失敗！\n無法獲取檔案：${subBundleId}.json\n請確認該檔案是否已放進專案目錄中。`);
            }
        }
    });
};


// ==========================================
// 14. 玩家市場系統 (Player Market) Phase 2
// ==========================================
window.currentPublishBookId = null;

window.checkPublishLimit = async function() {
    const user = window.currentUser;
    if (!user) return { canUpload: false, remaining: 0 };
    try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            let count = data.dailyUploadCount || 0;
            let lastDate = data.lastUploadDate || '';
            if (lastDate !== today) count = 0;
            return { canUpload: count < 3, remaining: 3 - count };
        }
        return { canUpload: true, remaining: 3 };
    } catch(e) {
        console.error("讀取額度失敗", e);
        return { canUpload: false, remaining: 0 };
    }
};

window.openPublishModal = function() {
    if (!window.currentUser) { window.SilenModal.alert("請先登入帳號以使用市場功能。"); return; }
    const eligibleBooks = window.books.filter(b => !b.isStore && b.words.length >= 10);
    const container = document.getElementById('pub-book-list-container');
    container.innerHTML = '';
    if (eligibleBooks.length === 0) {
        container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:20px; line-height: 1.6;">您目前沒有符合條件的單字簿可供上架！<br>(為了維持市場品質，請確保題庫內至少包含 10 個單字)</div>';
    } else {
        eligibleBooks.forEach(b => {
            const div = document.createElement('div');
            div.className = 'card book-item';
            div.style.cursor = 'pointer';
            div.style.marginBottom = '0';
            div.innerHTML = `<strong>${b.name}</strong> <span style="font-size:0.8rem; color:var(--text-sub)">(${b.words.length} 詞)</span>`;
            div.onclick = () => window.selectBookToPublish(b.id);
            container.appendChild(div);
        });
    }
    document.getElementById('pub-step-1').classList.remove('hidden');
    document.getElementById('pub-step-2').classList.add('hidden');
    const overlay = document.getElementById('silen-publish-overlay');
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    overlay.classList.add('show');
};

window.selectBookToPublish = function(bookId) {
    const book = window.books.find(b => b.id === bookId);
    if (!book) return;
    window.currentPublishBookId = bookId;
    document.getElementById('pub-book-name').innerText = book.name;
    document.getElementById('pub-price').value = 100;
    document.getElementById('pub-desc').value = '';
    document.getElementById('btn-confirm-pub').disabled = true;
    document.getElementById('pub-limit-text').innerText = "正在檢查每日額度...";
    document.getElementById('pub-step-1').classList.add('hidden');
    document.getElementById('pub-step-2').classList.remove('hidden');
    window.checkPublishLimit().then(res => {
        const txt = document.getElementById('pub-limit-text');
        if (res.canUpload) {
            txt.innerText = `今日上架額度剩餘: ${res.remaining} / 3`;
            txt.style.color = '#4caf50';
            document.getElementById('btn-confirm-pub').disabled = false;
        } else {
            txt.innerText = `今日上架額度已達上限 (3 / 3)，請明日再來！`;
            txt.style.color = '#ff4444';
        }
    });
};

window.backToPublishList = function() {
    document.getElementById('pub-step-2').classList.add('hidden');
    document.getElementById('pub-step-1').classList.remove('hidden');
};

window.closePublishModal = function() {
    const overlay = document.getElementById('silen-publish-overlay');
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 200);
};

window.confirmPublish = function() {
    const bookId = window.currentPublishBookId;
    const price = parseInt(document.getElementById('pub-price').value);
    const desc = document.getElementById('pub-desc').value.trim();
    if (isNaN(price) || price < 50) { window.SilenModal.alert("定價最低需為 50 點數。"); return; }
    if (!desc) { window.SilenModal.alert("請輸入簡單的商品介紹。"); return; }
    const book = window.books.find(b => b.id === bookId);
    if (!book) { window.SilenModal.alert("找不到指定的單字簿。"); return; }
    window.closePublishModal();
    if (typeof window.executePublishToMarket === 'function') {
        window.executePublishToMarket(book, price, desc);
    }
};

window.executePublishToMarket = async function(book, price, desc) {
    const user = window.currentUser;
    if (!user) return;
    window.SilenModal.alert("上架處理中，請稍候...");
    try {
        const userRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(userRef);
        let data = docSnap.exists() ? docSnap.data() : {};
        const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
        let count = data.dailyUploadCount || 0;
        let lastDate = data.lastUploadDate || '';
        if (lastDate !== today) count = 0;
        if (count >= 3) { window.SilenModal.alert("您今日的上架額度已用盡，請明日再來！"); return; }
        
        const cleanWords = book.words.map(w => ({ en: w.en, zh: w.zh, pos: w.pos || '' }));
        const marketRef = collection(db, "market_books");
        await addDoc(marketRef, {
            authorUid: user.uid,
            authorName: user.displayName || '匿名玩家',
            bookName: book.name,
            description: desc,
            price: price,
            wordCount: cleanWords.length,
            words: cleanWords,
            salesCount: 0,
            timestamp: Date.now()
        });
        
        await updateDoc(userRef, { dailyUploadCount: count + 1, lastUploadDate: today });
        window.SilenModal.alert("上架成功！\n您的單字簿已發布至玩家交易市場。").then(() => window.openMarket());
    } catch(e) {
        console.error("上架失敗", e);
        window.SilenModal.alert("上架失敗，請檢查網路連線。");
    }
};

window.openMarket = async function() {
    window.switchView('market');
    const el = document.getElementById('market-my-score');
    if(el) el.innerText = window.myStorePoints || 0;
    const container = document.getElementById('market-catalog-area');
    container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--text-sub); letter-spacing: 1px;">正在從伺服器載入市場資料...</div>';
    try {
        const marketRef = collection(db, "market_books");
        const q = fsQuery(marketRef, fsOrderBy("timestamp", "desc"), fsLimit(50));
        const querySnapshot = await getDocs(q);
        let books = [];
        querySnapshot.forEach((docSnap) => { books.push({ id: docSnap.id, ...docSnap.data() }); });
        window.renderMarketCatalog(books);
    } catch (e) {
        console.error("載入市場失敗", e);
        container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: #ff4444; letter-spacing: 1px;">載入失敗，請檢查網路連線或資料庫權限。</div>';
    }
};

window.renderMarketCatalog = function(marketBooks) {
    const container = document.getElementById('market-catalog-area');
    container.innerHTML = '';
    if (marketBooks.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--text-sub); letter-spacing: 1px;">目前市場上還沒有任何商品，快去上架第一本吧！</div>';
        return;
    }
    marketBooks.forEach(book => {
        const card = document.createElement('div');
        card.className = 'store-card';
        const isOwned = window.books.some(b => b.marketId === book.id);
        const myUid = window.currentUser ? window.currentUser.uid : '';
        let btnHtml = '';
        if (isOwned) {
            btnHtml = `<button class="btn btn-small" style="margin:0; background:#333; color:#aaa; border:1px solid #444;" disabled>已擁有</button>`;
        } else if (book.authorUid === myUid) {
            btnHtml = `<button class="btn btn-small" style="margin:0; background:#333; color:#aaa; border:1px solid #444;" disabled>您的商品</button>`;
        } else {
            btnHtml = `<button class="btn btn-small" style="margin:0; background:#fff; color:#000;" onclick="window.purchaseMarketBook('${book.id}', ${book.price}, '${book.bookName.replace(/'/g, "\\'")}', '${book.authorUid}')">${book.price} pts</button>`;
        }
        const safeBookName = book.bookName.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeAuthorName = book.authorName.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeDesc = book.description.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        card.innerHTML = `
            <div class="store-header">
                <h4 class="store-title">${safeBookName}</h4>
                <div style="font-size: 0.8rem; color: #ff9800; border: 1px solid #ff9800; padding: 2px 6px; border-radius: 4px;">銷量: ${book.salesCount || 0}</div>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-sub); margin-bottom: 10px; display:flex; align-items:center; gap:5px;">
                <span style="background:#222; padding:2px 8px; border-radius:10px;">創作者: ${safeAuthorName}</span>
            </div>
            <div class="store-desc">${safeDesc} <br><span style="color:var(--text-sub); font-size: 0.8rem; opacity: 0.8;">(共 ${book.wordCount} 個單字)</span></div>
            <div style="display: flex; justify-content: flex-end; align-items: center;">${btnHtml}</div>
        `;
        container.appendChild(card);
    });
};

window.purchaseMarketBook = async function(marketBookId, price, bookName, authorUid) {
    const user = window.currentUser;
    if (!user) { window.SilenModal.alert("請先登入！"); return; }
    if (window.myStorePoints < price) { window.SilenModal.alert(`點數不足！\n\n購買此單字包需要 ${price} 點數，您目前只有 ${window.myStorePoints} 點數。`); return; }
    window.SilenModal.confirm(`確定要花費 ${price} 點數購買「${bookName}」嗎？`).then(async agreed => {
        if (agreed) {
            window.SilenModal.alert("交易處理中，請稍候...");
            try {
                const docRef = doc(db, "market_books", marketBookId);
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) { window.SilenModal.alert("此商品已不存在。"); return; }
                const bookData = docSnap.data();

                window.myStorePoints -= price;
                const el1 = document.getElementById('market-my-score');
                const el2 = document.getElementById('store-my-score');
                if(el1) el1.innerText = window.myStorePoints;
                if(el2) el2.innerText = window.myStorePoints;
                
                await set(ref(rtdb, `users/${user.uid}/storePoints`), window.myStorePoints);

                const sellerRevenue = Math.floor(price * 0.8);
                const sellerRef = ref(rtdb, `users/${authorUid}/storePoints`);
                const sellerSnap = await get(sellerRef);
                const currentSellerPoints = sellerSnap.exists() ? sellerSnap.val() : 0;
                await set(sellerRef, currentSellerPoints + sellerRevenue);

                await updateDoc(docRef, { salesCount: (bookData.salesCount || 0) + 1 });

                window.books.push({
                    id: Date.now(),
                    name: bookData.bookName,
                    tag: "玩家市集",
                    isGSAT: false,
                    isPhrase: false, 
                    isStore: false, 
                    marketId: marketBookId,
                    words: bookData.words
                });

                window.saveData(); 
                window.SilenModal.alert(`交易成功！\n\n「${bookName}」已加入您的題庫中。\n(賣家將獲得扣除 20% 稅金後的 ${sellerRevenue} 點數)`).then(() => window.openMarket());
            } catch (e) {
                console.error("交易失敗", e);
                window.SilenModal.alert("交易失敗，請檢查網路連線。");
            }
        }
    });
};

// ==========================================
// 15. 外觀飾品系統 (Accessories System)
// ==========================================
window.purchasedAccessories = JSON.parse(localStorage.getItem('sv_purchased_acc')) || [];
window.equippedFrame = localStorage.getItem('sv_equipped_frame') || null;
window.accessoriesCatalog = [];

window.loadAccessoriesCatalog = async function() {
    if (window.accessoriesCatalog.length > 0) return window.accessoriesCatalog;
    try {
        const res = await fetch("accessories.json?t=" + Date.now());
        if (res.ok) {
            window.accessoriesCatalog = await res.json();
            window.applyAvatarFrame(window.equippedFrame);
            return window.accessoriesCatalog;
        }
    } catch(e) { console.error("飾品庫讀取失敗", e); }
    return [];
};

window.addEventListener('DOMContentLoaded', () => { window.loadAccessoriesCatalog(); });

window.applyAvatarFrame = function(frameId) {
    window.equippedFrame = frameId;
    localStorage.setItem('sv_equipped_frame', frameId || '');
    let frameUrl = '';
    if (frameId && window.accessoriesCatalog) {
        const item = window.accessoriesCatalog.find(a => a.id === frameId);
        if (item) frameUrl = item.imgUrl;
    }
    const targetEls = ['sb-avatar-frame', 'profile-avatar-frame'];
    targetEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (frameUrl) { el.src = frameUrl; el.style.display = 'block'; } 
            else { el.style.display = 'none'; el.src = ''; }
        }
    });
};

window.openAccessoriesStore = async function() {
    window.switchView('accessories');
    const elScore = document.getElementById('acc-my-score');
    if (elScore) elScore.innerText = window.myStorePoints || 0;
    const container = document.getElementById('accessories-catalog-area');
    container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px 0; color: var(--text-sub);">載入飾品資料中...</div>';
    const catalog = await window.loadAccessoriesCatalog();
    window.renderAccessoriesCatalog(catalog);
};

window.renderAccessoriesCatalog = function(catalog) {
    const container = document.getElementById('accessories-catalog-area');
    container.innerHTML = '';
    const activeItems = catalog.filter(item => item.active);
    if (activeItems.length === 0) {
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px 0; color: var(--text-sub);">目前沒有販售任何飾品。</div>';
        return;
    }
    activeItems.forEach(item => {
        const isPurchased = window.purchasedAccessories.includes(item.id);
        const isEquipped = window.equippedFrame === item.id;
        const card = document.createElement('div');
        card.className = 'acc-card';
        let btnHtml = '';
        if (isEquipped) {
            btnHtml = `<button class="btn btn-small" style="margin:0; background:#f1c40f; color:#000; font-weight:bold;" onclick="window.equipAccessory('${item.id}')">卸下</button>`;
        } else if (isPurchased) {
            btnHtml = `<button class="btn btn-small btn-outline" style="margin:0; border-color:#f1c40f; color:#f1c40f;" onclick="window.equipAccessory('${item.id}')">裝備</button>`;
        } else {
            btnHtml = `<button class="btn btn-small" style="margin:0; background:#fff; color:#000;" onclick="window.purchaseAccessory('${item.id}', ${item.price}, '${item.name}')">${item.price} pts</button>`;
        }
        card.innerHTML = `
            <div class="acc-img-wrapper">
                <div class="acc-avatar-dummy"></div>
                <img src="${item.imgUrl}" class="acc-img" alt="${item.name}">
            </div>
            <div class="acc-title">${item.name}</div>
            <div class="acc-desc">${item.desc}</div>
            <div style="margin-top: 10px;">${btnHtml}</div>
        `;
        container.appendChild(card);
    });
};

window.purchaseAccessory = function(id, price, name) {
    if (!window.currentUser && typeof auth !== 'undefined' && typeof window.syncAccessoriesToCloud === 'function') {
        window.SilenModal.alert("請先登入帳號才能購買飾品！"); return;
    }
    if (window.myStorePoints < price) {
        window.SilenModal.alert(`點數不足！\n\n購買需要 ${price} 點數，您目前只有 ${window.myStorePoints} 點數。`); return;
    }
    window.SilenModal.confirm(`確定要花費 ${price} 點數購買「${name}」嗎？`).then(agreed => {
        if (agreed) {
            window.myStorePoints -= price;
            if (typeof window.addStorePoints === 'function') window.addStorePoints(0, true);
            window.purchasedAccessories.push(id);
            localStorage.setItem('sv_purchased_acc', JSON.stringify(window.purchasedAccessories));
            if (typeof window.syncAccessoriesToCloud === 'function') window.syncAccessoriesToCloud();
            window.SilenModal.alert(`購買成功！\n\n您已解鎖「${name}」，現在可以裝備它了！`).then(() => window.openAccessoriesStore());
        }
    });
};

window.equipAccessory = function(id) {
    if (window.equippedFrame === id) window.applyAvatarFrame(null);
    else window.applyAvatarFrame(id);
    if (typeof window.syncAccessoriesToCloud === 'function') window.syncAccessoriesToCloud();
    window.openAccessoriesStore();
};

// ==========================================
// 16. 1v1 即時對戰大廳 UI 與戰場核心 (Arena)
// ==========================================
window.showArenaWaiting = function(code, isHost, hostData, guestData) {
    window.switchView('arena-waiting');
    document.getElementById('aw-code').innerText = code;
    
    document.getElementById('aw-host-name').innerText = hostData.name;
    document.getElementById('aw-host-img').src = hostData.photo || 'https://via.placeholder.com/65';
    if (hostData.frame && window.accessoriesCatalog) {
        const item = window.accessoriesCatalog.find(a => a.id === hostData.frame);
        if (item) { document.getElementById('aw-host-frame').src = item.imgUrl; document.getElementById('aw-host-frame').style.display = 'block'; }
    } else { document.getElementById('aw-host-frame').style.display = 'none'; }
    
    const guestArea = document.getElementById('aw-guest-area');
    const emptyArea = document.getElementById('aw-guest-empty');
    const startBtn = document.getElementById('aw-start-btn');
    
    if (guestData) {
        guestArea.classList.remove('hidden');
        emptyArea.classList.add('hidden');
        document.getElementById('aw-guest-name').innerText = guestData.name;
        document.getElementById('aw-guest-img').src = guestData.photo || 'https://via.placeholder.com/65';
        if (guestData.frame && window.accessoriesCatalog) {
            const item = window.accessoriesCatalog.find(a => a.id === guestData.frame);
            if (item) { document.getElementById('aw-guest-frame').src = item.imgUrl; document.getElementById('aw-guest-frame').style.display = 'block'; }
        } else { document.getElementById('aw-guest-frame').style.display = 'none'; }
        
        if (isHost) {
            startBtn.disabled = false;
            startBtn.innerText = "開始對戰！";
            startBtn.style.background = "#ff9800";
            startBtn.style.color = "#000";
        } else {
            startBtn.disabled = true;
            startBtn.innerText = "等待房長開始...";
            startBtn.style.background = "#333";
            startBtn.style.color = "#aaa";
        }
    } else {
        guestArea.classList.add('hidden');
        emptyArea.classList.remove('hidden');
        
        if (isHost) {
            startBtn.disabled = true;
            startBtn.innerText = "等待對手加入...";
            startBtn.style.background = "#333";
            startBtn.style.color = "#aaa";
        } else {
            startBtn.disabled = true;
            startBtn.innerText = "等待房長開始...";
        }
    }
};

window.updateArenaWaiting = function(roomData) {
    if (!roomData) return;
    window.showArenaWaiting(window.currentArenaRoom, window.isArenaHost, roomData.host, roomData.guest);
};

window.arenaQuizQueue = [];
window.arenaCurrentIndex = 0;
window.myArenaScore = 0;
window.arenaMaxScore = 10; 
window.selectedArenaBookId = null;
window.selectedArenaMode = 'comp';

window.setArenaMode = function(val, text) {
    window.selectedArenaMode = val;
    document.getElementById('arena-mode-selected').innerText = text + ' ▾';
    document.getElementById('arena-mode-options').classList.add('hidden');
};

window.startArenaMatchLogic = function() {
    const listContainer = document.getElementById('arena-setup-book-list');
    listContainer.innerHTML = '';
    window.selectedArenaBookId = null;
    
    let validBooks = window.books.filter(b => b.words.length >= 10);
    if(validBooks.length === 0) {
        window.SilenModal.alert("您目前的資料庫中，沒有單字量超過 10 的單字簿可供對戰！"); return;
    }
    
    validBooks.sort((a, b) => {
        let tA = a.tag || '未分類';
        let tB = b.tag || '未分類';
        if (tA !== tB) return tA.localeCompare(tB);
        return a.name.localeCompare(b.name);
    });
    
    validBooks.forEach(b => {
        let item = document.createElement('div');
        item.className = 'arena-book-item';
        item.style.cssText = 'padding: 12px; border: 1px solid #444; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: 0.2s; background: #151515;';
        
        item.innerHTML = `
            <div style="display:flex; align-items:center; overflow:hidden;">
                <span style="font-size:0.75rem; color:#ff9800; background:#333; padding:3px 8px; border-radius:4px; margin-right:10px; white-space:nowrap;">${b.tag || '未分類'}</span>
                <span style="color:#fff; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${b.name}</span>
            </div>
            <span style="color:#888; font-size:0.8rem; margin-left: 10px; white-space:nowrap;">${b.words.length} 詞</span>
        `;
        
        item.onclick = () => {
            document.querySelectorAll('.arena-book-item').forEach(el => { el.style.borderColor = '#444'; el.style.background = '#151515'; });
            item.style.borderColor = '#ff9800';
            item.style.background = 'rgba(255, 152, 0, 0.05)';
            window.selectedArenaBookId = b.id;
        };
        listContainer.appendChild(item);
    });
    
    listContainer.firstChild.click();

    const overlay = document.getElementById('arena-setup-overlay');
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    overlay.classList.add('show');
};

window.closeArenaSetup = function() {
    const overlay = document.getElementById('arena-setup-overlay');
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 200);
};

window.confirmArenaSetup = function() {
    if (!window.selectedArenaBookId) { window.SilenModal.alert("請選擇一本單字簿！"); return; }
    
    window.closeArenaSetup();
    const bookId = window.selectedArenaBookId;
    const mode = window.selectedArenaMode;
    
    let selectedBook = window.books.find(b => b.id == bookId);
    let pool = selectedBook ? selectedBook.words : [];
    
    if (pool.length < 10) return;
    
    pool.sort(() => Math.random() - 0.5);
    let selectedWords = pool.slice(0, 30); 
    
    let quizPayload = selectedWords.map(w => {
        let qType = 'mcq';
        let qMode = 'zh-to-en';

        if (mode === 'comp') {
            const rand = Math.random();
            if (rand < 0.25) { qType = 'mcq'; qMode = Math.random() < 0.5 ? 'zh-to-en' : 'en-to-zh'; }
            else if (rand < 0.5) { qType = 'typing'; qMode = Math.random() < 0.5 ? 'zh-to-en' : 'en-to-zh'; }
            else { qType = 'puzzle'; qMode = 'zh-to-en'; } 
        } else if (mode === 'conn') {
            qType = 'mcq';
            qMode = Math.random() < 0.5 ? 'zh-to-en' : 'en-to-zh';
        } else if (mode === 'mcq_zh_en') { qType = 'mcq'; qMode = 'zh-to-en'; }
        else if (mode === 'mcq_en_zh') { qType = 'mcq'; qMode = 'en-to-zh'; }
        else if (mode === 'typing_zh_en') { qType = 'typing'; qMode = 'zh-to-en'; }
        else if (mode === 'typing_en_zh') { qType = 'typing'; qMode = 'en-to-zh'; }

        let questionText, ansText, options;
        
        if (qType === 'puzzle') {
            questionText = w.zh.join(' / ');
            ansText = w.en;
        } else if (qMode === 'zh-to-en') {
            questionText = w.zh.join(' / ');
            ansText = w.en;
            if (qType === 'mcq') {
                let distractors = pool.filter(x => x.en !== w.en && !window.isSemanticOverlap(x, w)).sort(() => Math.random() - 0.5).slice(0, 3);
                options = [w.en, ...distractors.map(d => d.en)].sort(() => Math.random() - 0.5);
            }
        } else {
            questionText = w.en;
            ansText = w.zh.join(' / ');
            if (qType === 'mcq') {
                let distractors = pool.filter(x => x.en !== w.en && !window.isSemanticOverlap(x, w)).sort(() => Math.random() - 0.5).slice(0, 3);
                options = [w.zh.join(' / '), ...distractors.map(d => d.zh.join(' / '))].sort(() => Math.random() - 0.5);
            }
        }

        return { type: qType, mode: qMode, q: questionText, ans: ansText, opts: options || [] };
    });

    if (typeof window.triggerArenaStart === 'function') {
        window.triggerArenaStart(quizPayload);
    }
};

window.renderArenaMatch = function(quizPayload, hostData, guestData) {
    window.arenaQuizQueue = quizPayload;
    window.arenaCurrentIndex = 0;
    window.myArenaScore = 0;
    
    document.getElementById('am-host-img').src = hostData.photo || 'https://via.placeholder.com/30';
    document.getElementById('am-guest-img').src = guestData.photo || 'https://via.placeholder.com/30';
    document.getElementById('am-host-score').innerText = '0';
    document.getElementById('am-guest-score').innerText = '0';
    document.getElementById('am-host-bar').style.width = '0%';
    document.getElementById('am-guest-bar').style.width = '0%';
    
    window.switchView('arena-match');
    window.showArenaNextQuestion();
};

window.showArenaNextQuestion = function() {
    if (window.arenaCurrentIndex >= window.arenaQuizQueue.length) window.arenaCurrentIndex = 0; 
    
    setDisplayState('am-interaction-area', true, 'block');
    setDisplayState('am-feedback-area', false);
    
    let currentQ = window.arenaQuizQueue[window.arenaCurrentIndex];
    document.getElementById('am-question-display').innerText = currentQ.q;
    
    const mcqArea = document.getElementById('am-mcq-area');
    const typingArea = document.getElementById('am-typing-area');
    const puzzleArea = document.getElementById('am-puzzle-area');
    
    mcqArea.classList.add('hidden');
    typingArea.classList.add('hidden');
    puzzleArea.classList.add('hidden');
    
    if (currentQ.type === 'typing') {
        typingArea.classList.remove('hidden');
        const inputEl = document.getElementById('am-typing-input');
        inputEl.value = '';
        setTimeout(() => inputEl.focus(), 50);
        inputEl.onkeypress = (e) => { if(e.key === 'Enter') { e.preventDefault(); window.checkArenaTypingAnswer(); } };
    } else if (currentQ.type === 'puzzle') {
        puzzleArea.classList.remove('hidden');
        window.arenaPuzzleAns = [];
        window.arenaPuzzlePool = currentQ.ans.toLowerCase().split('').map((c, i) => ({ id: i, char: c, used: false })).sort(() => Math.random() - 0.5);
        window.renderArenaPuzzle();
    } else {
        mcqArea.classList.remove('hidden');
        mcqArea.innerHTML = '';
        currentQ.opts.forEach(opt => {
            let btn = document.createElement('button');
            btn.className = 'btn-mcq';
            btn.innerText = opt;
            btn.onclick = () => window.checkArenaAnswer(opt === currentQ.ans);
            mcqArea.appendChild(btn);
        });
    }
};

window.renderArenaPuzzle = function() {
    const ansArea = document.getElementById('am-puzzle-ans');
    const poolArea = document.getElementById('am-puzzle-pool');
    ansArea.innerHTML = ''; poolArea.innerHTML = '';
    
    const currentQ = window.arenaQuizQueue[window.arenaCurrentIndex];
    
    window.arenaPuzzleAns.forEach((obj, i) => {
        let tile = document.createElement('div');
        tile.className = 'letter-tile';
        tile.innerText = obj.char;
        tile.onclick = () => {
            window.arenaPuzzleAns.splice(i, 1);
            obj.used = false;
            window.renderArenaPuzzle();
        };
        ansArea.appendChild(tile);
    });
    
    if (window.arenaPuzzleAns.length < currentQ.ans.length) {
        let empty = document.createElement('div');
        empty.className = 'letter-tile empty';
        empty.innerText = '_';
        ansArea.appendChild(empty);
    }
    
    window.arenaPuzzlePool.forEach((obj) => {
        if (!obj.used) {
            let tile = document.createElement('div');
            tile.className = 'letter-tile';
            tile.innerText = obj.char;
            tile.onclick = () => {
                obj.used = true;
                window.arenaPuzzleAns.push(obj);
                window.renderArenaPuzzle();
                if (window.arenaPuzzleAns.length === currentQ.ans.length) {
                    let typed = window.arenaPuzzleAns.map(o => o.char).join('');
                    window.checkArenaAnswer(typed.toLowerCase() === currentQ.ans.toLowerCase());
                }
            };
            poolArea.appendChild(tile);
        }
    });
};

window.checkArenaTypingAnswer = function() {
    const inputEl = document.getElementById('am-typing-input');
    const val = inputEl.value.trim().toLowerCase();
    const currentQ = window.arenaQuizQueue[window.arenaCurrentIndex];
    
    let isCorrect = false;
    if (currentQ.mode === 'en-to-zh') {
        const targetZhs = currentQ.ans.split(' / ').map(s => s.trim());
        isCorrect = targetZhs.some(z => z.includes(val) && val.length > 0);
    } else {
        isCorrect = (val === currentQ.ans.toLowerCase());
    }
    
    window.checkArenaAnswer(isCorrect);
};

window.checkArenaAnswer = function(isCorrect) {
    setDisplayState('am-interaction-area', false);
    setDisplayState('am-feedback-area', true, 'block');
    
    const icon = document.getElementById('am-feedback-icon');
    const status = document.getElementById('am-feedback-status');
    
    if (isCorrect) {
        icon.innerText = '✔'; icon.className = 'big-icon icon-correct';
        status.innerText = '正確！血條推進'; status.className = 'result-status status-correct';
        window.myArenaScore++;
        if (typeof window.updateArenaScore === 'function') window.updateArenaScore(window.myArenaScore);
    } else {
        icon.innerText = '✘'; icon.className = 'big-icon icon-wrong';
        status.innerText = '錯誤！錯失良機'; status.className = 'result-status status-wrong';
    }
    
    setTimeout(() => {
        window.arenaCurrentIndex++;
        window.showArenaNextQuestion();
    }, 1000);
};

window.surrenderArena = function() {
    window.SilenModal.confirm("確定要投降離開嗎？\n(提前離開將視為戰敗，不會扣分但很丟臉)").then(agreed => {
        if(agreed && typeof window.leaveArenaRoom === 'function') window.leaveArenaRoom();
    });
};



// ==========================================
// 18. 學測闖關地圖系統 (多 Level 獨立進度版)
// ==========================================

window.campaignData = JSON.parse(localStorage.getItem('sv_campaign_data')) || {};
// 舊版單一進度資料轉移 (防呆機制，將舊資料自動移入 lv1)
if (window.campaignData.months) {
    let oldData = JSON.parse(JSON.stringify(window.campaignData));
    window.campaignData = { lv1: oldData };
    localStorage.setItem('sv_campaign_data', JSON.stringify(window.campaignData));
}

window.isCampaignMode = false;
window.campaignCurrentType = 'normal';
window.currentCampaignLevel = 1; 

// --- 1. 攔截畫面切換 ---
const originalSwitchView = window.switchView;
window.switchView = function(viewId) {
    originalSwitchView(viewId);
    if (viewId === 'campaign') {
        window.switchCampaignLevel(window.currentCampaignLevel);
    }
};

// --- 2. 切換 Level 與問卷邏輯 ---
window.switchCampaignLevel = function(level) {
    window.currentCampaignLevel = level;
    document.getElementById('campaign-level-title-text').innerText = `學測 Lv.${level} 征服計畫`;
    
    // 隱藏下拉選單
    const optionsEl = document.getElementById('campaign-level-options');
    if (optionsEl) optionsEl.classList.add('hidden');

    if (!window.campaignData['lv' + level]) {
        // 尚未建立計畫，顯示問卷
        document.getElementById('campaign-survey-title').innerText = `建立 Lv.${level} 專屬路線`;
        document.getElementById('campaign-survey-desc').innerHTML = `學測 Lv.${level} 包含大量核心單字。<br>你希望花多少時間征服它？`;
        
        const overlay = document.getElementById('campaign-survey-overlay');
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('show'), 10);
        
        document.getElementById('campaign-target-months').dispatchEvent(new Event('input'));
    } else {
        // 已有資料，直接渲染地圖
        window.renderCampaignMap();
    }
};

const VOCAB_BASE_URL = 'https://raw.githubusercontent.com/jeremy980527/English-test2/main/';

async function fetchVocabLevel(level) {
    let res = await fetch(`https://github.com/jeremy980527/English-test2/blob/main/vocabularylv${window.currentCampaignLevel}.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`找不到 vocabularylv${level}.json`);
    return await res.json();
}

const GSAT_RAW_URL = 'https://raw.githubusercontent.com/jeremy980527/English-test2/main/';

window.campaignVocabCache = {};

window.fetchCampaignVocab = async function(level) {
    if (window.campaignVocabCache[level]) return window.campaignVocabCache[level];
    const res = await fetch(`${GSAT_RAW_URL}vocabularylv${level}.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`找不到 vocabularylv${level}.json`);
    const data = await res.json();
    window.campaignVocabCache[level] = data;
    return data;
};

document.getElementById('campaign-target-months')?.addEventListener('input', async function(e) {
    let months = parseInt(e.target.value);
    if (isNaN(months) || months < 1) months = 1;
    if (months > 12) months = 12;

    const resultEl = document.getElementById('campaign-survey-result');
    resultEl.innerHTML = `<span style="color:var(--text-sub)">正在讀取題庫...</span>`;

    try {
        const words = await window.fetchCampaignVocab(window.currentCampaignLevel);
        const totalWords = words.length;
        const totalDays = months * 30;
        const parts = 6;
        const nodesPerPart = Math.ceil(totalDays / parts);
        const wordsPerNode = Math.ceil(totalWords / (nodesPerPart * parts));

        resultEl.innerHTML = `
            <div style="width: 100%; background: rgba(0,188,212,0.08); border: 1px solid rgba(0,188,212,0.2); border-radius: 12px; padding: 16px 20px; text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <span style="font-size: 0.8rem; color: var(--text-sub); letter-spacing: 0.5px;">題庫總量</span>
                    <span style="font-size: 1rem; color: #00bcd4; font-weight: 600;">${totalWords} 個單字</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <span style="font-size: 0.8rem; color: var(--text-sub); letter-spacing: 0.5px;">學習期限</span>
                    <span style="font-size: 1rem; color: var(--text-main); font-weight: 600;">${months} 個月</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.8rem; color: var(--text-sub); letter-spacing: 0.5px;">每關單字數</span>
                    <span style="font-size: 1.2rem; color: #fff; font-weight: 700;">${wordsPerNode} 個</span>
                </div>
            </div>
        `;

        window.tempCampaignPlan = {
            months, totalDays, totalWords,
            wordsPerNode, nodesPerPart,
            levelsPerPart: nodesPerPart,
            currentLevel: 1
        };
    } catch(err) {
        resultEl.innerHTML = `<span style="color:#ff4444">題庫讀取失敗，請確認網路連線。</span>`;
        console.error(err);
    }
});

window.closeCampaignSurvey = function() {
    const overlay = document.getElementById('campaign-survey-overlay');
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 200);
    window.goHome(); 
};

window.confirmCampaignPlan = function() {
    if (!window.tempCampaignPlan) return;
    window.campaignData['lv' + window.currentCampaignLevel] = window.tempCampaignPlan;
    localStorage.setItem('sv_campaign_data', JSON.stringify(window.campaignData));
    
    document.getElementById('btn-edit-campaign')?.classList.remove('hidden');
    
    const overlay = document.getElementById('campaign-survey-overlay');
    overlay.classList.remove('show');
    setTimeout(() => {
        overlay.classList.add('hidden');
        window.renderCampaignMap();
        if (window.currentUser && typeof window.saveData === 'function') window.saveData();
    }, 200);
};

window.editCampaignPlan = function() {
    const lv = window.currentCampaignLevel;
    window.SilenModal.prompt('請輸入新的學習月數（1 ~ 12）', 
        (window.tempCampaignPlan?.months || 2).toString()
    ).then(val => {
        if (!val) return;
        let months = parseInt(val);
        if (isNaN(months) || months < 1) months = 1;
        if (months > 12) months = 12;
        const el = document.getElementById('campaign-target-months');
        if (el) {
            el.value = months;
            el.dispatchEvent(new Event('input'));
        }
    });
};
// --- 3. 渲染極簡闖關地圖 ---
window.renderCampaignMap = function() {
    const container = document.getElementById('campaign-map-container');
    container.innerHTML = '';
    let data = window.campaignData['lv' + window.currentCampaignLevel];
    if(!data) return;
    let globalNodeIndex = 1;

    for (let p = 1; p <= 6; p++) {
        let divider = document.createElement('div');
        divider.className = 'campaign-part-divider';
        divider.innerHTML = `<span>PART 0${p}</span>`;
        container.appendChild(divider);

        for (let l = 1; l <= data.levelsPerPart; l++) {
            let isMidterm = (l === Math.floor(data.levelsPerPart / 2));
            let isFinal = (l === data.levelsPerPart);

            container.appendChild(createNodeHTML(globalNodeIndex, 'normal', p, l, data));
            globalNodeIndex++;

            if (isMidterm) {
                container.appendChild(createNodeHTML(globalNodeIndex, 'midterm', p, l, data));
                globalNodeIndex++;
            }

            if (isFinal) {
                container.appendChild(createNodeHTML(globalNodeIndex, 'final', p, l, data));
                globalNodeIndex++;
            }
        }
    }

    document.getElementById('campaign-progress-text').innerText = `目前進度：第 ${data.currentLevel} 關 / 總計 ${globalNodeIndex - 1} 關`;

    setTimeout(() => {
        let currentEl = document.querySelector('.campaign-node.current');
        if (currentEl) {
            currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 300);
};

function createNodeHTML(nodeIdx, type, part, level, data) {
    let statusClass = nodeIdx < data.currentLevel ? 'completed' : (nodeIdx === data.currentLevel ? 'current' : 'locked');
    let isBoss = type !== 'normal';
    
    let node = document.createElement('div');
    node.className = `campaign-node ${isBoss ? 'boss' : ''} ${statusClass}`;
    
    let content = isBoss ? (type === 'midterm' ? '期中' : '期末') : nodeIdx;
    node.innerHTML = `<span class="node-content">${content}</span>`;
    
    if (statusClass !== 'locked') {
        node.onclick = () => window.startCampaignNode(nodeIdx, type, part, level);
    } else {
        node.onclick = () => window.SilenModal.alert("🔒 該關卡尚未解鎖！請先完成前置關卡。");
    }
    return node;
}

// --- 4. 啟動關卡與題海切割 ---
window.startCampaignNode = async function(nodeIndex, type, part, levelIndex) {
    let data = window.campaignData['lv' + window.currentCampaignLevel];
    if (nodeIndex < data.currentLevel) {
        let replay = await window.SilenModal.confirm("✅ 該關卡已完美通關！\n是否要重新複習一次？(複習無額外獎勵)");
        if (!replay) return;
    }

    window.SilenModal.alert("正在為您部署專屬題庫，請稍候...");

    try {
        const allWords = (await window.fetchCampaignVocab(window.currentCampaignLevel))
            .map(w => ({ en: w.word, zh: [w.chinese], pos: w.pos || '' }));
        const wordsPerNode = data.wordsPerNode || 10;
        let targetWords = [];

        if (type === 'normal') {
            // 每關從對應位置切割，不重複
            const startIdx = (nodeIndex - 1) * wordsPerNode;
            targetWords = allWords.slice(startIdx, startIdx + wordsPerNode);
        } else if (type === 'midterm') {
            // 期中考：該 part 前半段的單字
            const partStart = (part - 1) * data.nodesPerPart * wordsPerNode;
            const midCount = Math.floor(data.nodesPerPart / 2) * wordsPerNode;
            targetWords = allWords.slice(partStart, partStart + midCount);
            // 隨機抽取最多 20 題
            targetWords = targetWords.sort(() => 0.5 - Math.random()).slice(0, 20);
        } else if (type === 'final') {
            // 期末考：整個 part 的單字
            const partStart = (part - 1) * data.nodesPerPart * wordsPerNode;
            const fullCount = data.nodesPerPart * wordsPerNode;
            targetWords = allWords.slice(partStart, partStart + fullCount);
            // 隨機抽取最多 30 題
            targetWords = targetWords.sort(() => 0.5 - Math.random()).slice(0, 30);
        }

        if (targetWords.length === 0) targetWords = allWords.slice(0, wordsPerNode);

        window.isCampaignMode = true;
        window.campaignCurrentType = type;
        window.campaignCurrentNode = nodeIndex;

        const tempBook = {
            id: 'campaign_temp',
            name: type === 'normal'
                ? `闖關 第${nodeIndex}關`
                : (type === 'midterm' ? `PART 0${part} 期中測驗` : `PART 0${part} 期末測驗`),
            words: targetWords
        };
        window.currentBook = tempBook;

        const existingIndex = window.books.findIndex(b => b.id === 'campaign_temp');
        if (existingIndex !== -1) window.books[existingIndex] = tempBook;
        else window.books.push(tempBook);

        selectedBookIds.clear();
        selectedBookIds.add('campaign_temp');

        document.getElementById('silen-modal-overlay').classList.add('hidden');

        if (type === 'midterm' || type === 'final') {
            document.getElementById('mastery-progress-bar').style.background = '#ff9800';
        } else {
            document.getElementById('mastery-progress-bar').style.background = '#00bcd4';
        }

        window.setupMasteryMode('comprehensive');

    } catch(e) {
        console.error("載入題庫失敗:", e);
        window.SilenModal.alert(`無法載入學測題庫！\n請確認網路連線正常。`);
    }
};

// --- 5. 攔截退出事件 (結算獎勵) ---
const originalQuitPractice = window.quitPractice;
window.quitPractice = function() {
    if (window.isCampaignMode) {
        const successArea = document.getElementById('mastery-success-area');
        const isVictory = !successArea.classList.contains('hidden');
        let data = window.campaignData['lv' + window.currentCampaignLevel];
        
        if (isVictory && window.campaignCurrentNode === data.currentLevel) {
            data.currentLevel++;
            localStorage.setItem('sv_campaign_data', JSON.stringify(window.campaignData));
            if (window.currentUser && typeof window.saveData === 'function') window.saveData();
            
            let type = window.campaignCurrentType;
            let pts = type === 'normal' ? 400 : (type === 'midterm' ? 1500 : 3000);
            
            if (typeof window.addStorePoints === 'function') {
                window.addStorePoints(pts, 'campaign', 1, true); 
            }
            
            window.SilenModal.alert(`🎉 闖關成功！\n\n您已征服此關卡，並獲得了 ${pts} 點商城點數獎勵！`);
        }
        
        // 離開時把暫存的書清掉，保持玩家背包乾淨
        window.books = window.books.filter(b => b.id !== 'campaign_temp');
        
        window.isCampaignMode = false;
        originalQuitPractice();
        window.switchView('campaign');
    } else {
        originalQuitPractice(); 
    }
};


// ==========================================
// 19. 終極修復補丁 (對戰掛載 JSON & 地圖切換強化)
// ==========================================

// --- 修復 1: 強化地圖切換邏輯 (防呆與確保彈窗) ---
window.switchCampaignLevel = function(level) {
    window.currentCampaignLevel = level;
    document.getElementById('campaign-level-title-text').innerText = `學測 Lv.${level} 征服計畫`;
    
    // 強制隱藏下拉選單
    const optionsEl = document.getElementById('campaign-level-options');
    if (optionsEl) optionsEl.classList.add('hidden');

    // 防呆：確保 campaignData 絕對是個正常的物件
    if (!window.campaignData || typeof window.campaignData !== 'object') {
        window.campaignData = {};
    }

    // 判斷該等級是否已經填過問卷
    if (!window.campaignData['lv' + level]) {
        // 尚未建立計畫，顯示該 Level 的專屬問卷
        document.getElementById('campaign-survey-title').innerText = `建立 Lv.${level} 專屬路線`;
        document.getElementById('campaign-survey-desc').innerHTML = `學測 Lv.${level} 包含大量核心單字。<br>你希望花多少時間征服它？`;
        
        // 確保地圖先清空，避免殘留畫面
        document.getElementById('campaign-map-container').innerHTML = '';
        document.getElementById('campaign-progress-text').innerText = '準備建立計畫...';

        const overlay = document.getElementById('campaign-survey-overlay');
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('show'), 10);
        
        // 觸發運算
        let inputEl = document.getElementById('campaign-target-months');
        if(inputEl) inputEl.dispatchEvent(new Event('input'));
    } else {
        // 已有資料，正常渲染地圖
        window.renderCampaignMap();
    }
};

// --- 修復 2: 1v1 對戰大廳強制植入官方 JSON 題庫 ---
window.startArenaMatchLogic = function() {
    if (!window.isArenaHost) return;
    
    const listEl = document.getElementById('arena-setup-book-list');
    listEl.innerHTML = '';
    
    // 【核心新增】: 強制植入 6 個官方學測題庫選項
    for(let i=1; i<=6; i++) {
        let div = document.createElement('div');
        div.className = 'book-item';
        // 加上酷炫的 UI 樣式
        div.style.padding = '12px'; div.style.cursor = 'pointer'; 
        div.style.marginBottom = '8px'; div.style.borderRadius = '8px';
        div.style.border = '2px solid var(--border)'; div.style.background = 'rgba(0, 188, 212, 0.05)';
        
        div.innerHTML = `<div style="font-weight:bold; color:#00bcd4; font-size: 1.05rem;">[官方] 學測 Lv.${i}</div><div style="font-size:0.8rem; color:var(--text-sub);">從官方庫隨機抽取 20 題對決</div>`;
        
        div.onclick = function() {
            document.querySelectorAll('#arena-setup-book-list .book-item').forEach(el => el.style.borderColor = 'var(--border)');
            div.style.borderColor = '#00bcd4'; // 選中時顯示科技藍邊框
            window.arenaSelectedBookId = `gsat_lv${i}`; // 標記為官方 JSON
        };
        listEl.appendChild(div);
    }

    // 接著載入玩家自建的單字簿 (保留原本功能)
    window.books.forEach(b => {
        if(b.words.length < 5) return; // 題目太少不給選
        let div = document.createElement('div');
        div.className = 'book-item';
        div.style.padding = '12px'; div.style.cursor = 'pointer';
        div.style.marginBottom = '8px'; div.style.borderRadius = '8px';
        div.style.border = '2px solid var(--border)';
        
        div.innerHTML = `<div style="font-weight:bold; color:var(--text-main);">${b.name}</div><div style="font-size:0.8rem; color:var(--text-sub);">玩家自建 (${b.words.length} 詞)</div>`;
        div.onclick = function() {
            document.querySelectorAll('#arena-setup-book-list .book-item').forEach(el => el.style.borderColor = 'var(--border)');
            div.style.borderColor = '#ff9800'; // 自建題庫選中顯示橘色邊框
            window.arenaSelectedBookId = b.id;
        };
        listEl.appendChild(div);
    });

    window.arenaSelectedBookId = null;
    document.getElementById('arena-setup-overlay').classList.remove('hidden');
    setTimeout(()=> document.getElementById('arena-setup-overlay').classList.add('show'), 10);
};

// --- 修復 3: 攔截房長出題，讓系統去抓取 JSON ---
window.confirmArenaSetup = async function() {
    if (!window.arenaSelectedBookId) return window.SilenModal.alert("請先選擇要對戰的單字簿！");
    
    let selectedWords = [];
    
    // 如果選中了剛剛植入的官方學測 JSON
    if (typeof window.arenaSelectedBookId === 'string' && window.arenaSelectedBookId.startsWith('gsat_lv')) {
        let level = window.arenaSelectedBookId.replace('gsat_lv', '');
        window.SilenModal.alert(`正在連線下載學測 Lv.${level} 題庫...`);
        try {
            // 請將這裡的 '/English-test2/' 改成你 GitHub 專案的資料夾名稱
            let res = await fetch(`https://github.com/jeremy980527/English-test2/blob/main/vocabularylv${window.currentCampaignLevel}.json?t=${Date.now()}`);
            //https://github.com/jeremy980527/English-test2/blob/main/vocabularylv1.json
            if(!res.ok) throw new Error("fetch failed");
            let allWords = await res.json();
            // 對戰機制：將龐大題庫隨機打亂，抽取 20 題來拼勝負
            selectedWords = allWords.sort(() => 0.5 - Math.random()).slice(0, 20);
            document.getElementById('silen-modal-overlay').classList.add('hidden'); // 關閉下載提示
        } catch(e) {
            return window.SilenModal.alert(`題庫載入失敗！\n請確認 vocabularylv${level}.json 是否存在。`);
        }
    } else {
        // 如果選了本地自建單字簿
        let book = window.books.find(b => b.id === window.arenaSelectedBookId);
        if(!book) return;
        selectedWords = book.words.sort(() => 0.5 - Math.random()).slice(0, 20);
    }

    let mode = window.arenaSelectedMode || 'comp';
    
    // 關閉對戰設定彈窗
    document.getElementById('arena-setup-overlay').classList.remove('show');
    setTimeout(()=> document.getElementById('arena-setup-overlay').classList.add('hidden'), 200);
    
    // 啟動對決
    let payload = { words: selectedWords, mode: mode };
    window.triggerArenaStart(payload);
};
