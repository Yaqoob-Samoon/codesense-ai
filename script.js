// Initialize Mermaid.js configuration for Architecture diagrams
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

const CONFIG = {
    model: 'gemini-2.5-flash',
    systemPrompt: "You are CodeSense, an elite AI code reviewer with expertise across all programming languages. You have the knowledge of a Google L7 senior engineer. You format all text output as clean structured markdown. You are brutally honest about bad code but always constructive."
};

const PROMPTS = {
    bug: "Analyze this code and find logic errors, off-by-one errors, null pointer risks, or unhandled exceptions. Return bugs in this format: [LINE NUMBER] [SEVERITY] [Description] [Fix].",
    security: "Perform a security scan for SQL injection, XSS, hardcoded secrets, or improper auth. Format: [OWASP Category] [Line] [Risk Level] [Fix].",
    quality: "Analyze cyclomatic complexity, DRY violations, and bad naming. Start your response with 'SCORE: XX/100' (where XX is a number). Then provide the breakdown.",
    
    // TWIST 2: Visual Architecture Prompt
    architecture: "Analyze this code and generate a Mermaid.js flowchart mapping out its architecture, logic flow, classes, and dependencies. Output ONLY a valid mermaid code block starting with ```mermaid and ending with ```. Do not add any conversational text.",
    
    optimize: "Rewrite the code with best practices. Output the rewritten code enclosed in ```diff format to show a side-by-side style diff (use - for removed lines, + for added lines)."
};

let state = {
    apiKey: localStorage.getItem('codesense_gemini_key') || '',
    guidelines: localStorage.getItem('codesense_guidelines') || '', // RAG STATE
    history: JSON.parse(localStorage.getItem('codesense_gemini_history') || '[]'),
    isRequesting: false,
    currentTab: 'bug',
    results: { bug: '', security: '', quality: '', architecture: '', optimize: '' }
};

const DOM = {
    codeInput: document.getElementById('code-input'),
    codeHighlight: document.getElementById('code-highlight'),
    lineNumbers: document.getElementById('line-numbers'),
    resultsContent: document.getElementById('results-content'),
    charCount: document.getElementById('char-count'),
    lineCount: document.getElementById('line-count'),
    apiStatus: document.getElementById('api-status'),
    apiIndicator: document.getElementById('api-indicator'),
    suspicionBar: document.getElementById('suspicion-bar'),
    suspicionVal: document.getElementById('suspicion-val'),
    langSelect: document.getElementById('lang-select'),
    detectedLang: document.getElementById('detected-lang')
};

function init() {
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
            return hljs.highlightAuto(code).value;
        },
        breaks: true
    });

    if (!state.apiKey) {
        document.getElementById('modal-apikey').classList.add('active');
    } else {
        document.getElementById('settings-api-key').value = state.apiKey;
        document.getElementById('settings-guidelines').value = state.guidelines;
    }

    renderHistory();
    setupEventListeners();
    updateEditor();
}

function setupEventListeners() {
    DOM.codeInput?.addEventListener('input', updateEditor);
    DOM.codeInput?.addEventListener('scroll', syncScroll);
    DOM.codeInput?.addEventListener('keydown', handleTab);
    
    document.getElementById('btn-clear')?.addEventListener('click', () => {
        DOM.codeInput.value = '';
        state.results = { bug: '', security: '', quality: '', architecture: '', optimize: '' };
        updateEditor();
        showEmptyState();
    });

    document.getElementById('btn-paste')?.addEventListener('click', async () => {
        try { DOM.codeInput.value = await navigator.clipboard.readText(); updateEditor(); } catch (err) { }
    });

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
        document.getElementById('modal-settings').classList.add('active');
    });

    document.getElementById('btn-cancel-settings')?.addEventListener('click', () => {
        document.getElementById('modal-settings').classList.remove('active');
    });

    document.getElementById('save-key-btn')?.addEventListener('click', () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (key) {
            state.apiKey = key; localStorage.setItem('codesense_gemini_key', key);
            document.getElementById('settings-api-key').value = key;
            document.getElementById('modal-apikey').classList.remove('active');
        }
    });

    document.getElementById('save-settings-btn')?.addEventListener('click', () => {
        const key = document.getElementById('settings-api-key').value.trim();
        const guidelines = document.getElementById('settings-guidelines').value.trim();
        
        if (key) { state.apiKey = key; localStorage.setItem('codesense_gemini_key', key); }
        
        // SAVE RAG CONTEXT
        state.guidelines = guidelines;
        localStorage.setItem('codesense_guidelines', guidelines);
        
        document.getElementById('modal-settings').classList.remove('active');
        alert("Settings & Company RAG Standards Saved!");
    });

    document.getElementById('toggle-sidebar')?.addEventListener('click', () => { document.getElementById('sidebar').classList.toggle('open'); });
    document.getElementById('clear-history')?.addEventListener('click', () => { state.history = []; localStorage.setItem('codesense_gemini_history', '[]'); renderHistory(); });

    document.getElementById('btn-copy-md')?.addEventListener('click', () => {
        if (state.results[state.currentTab]) {
            navigator.clipboard.writeText(state.results[state.currentTab]);
            alert('Copied review markdown!');
        }
    });
    
    document.getElementById('btn-print')?.addEventListener('click', () => { window.print(); });
}

function updateEditor() {
    if (!DOM.codeInput) return;
    const code = DOM.codeInput.value;
    if (DOM.charCount) DOM.charCount.textContent = code.length;
    const lines = code.split('\n');
    if (DOM.lineCount) DOM.lineCount.textContent = lines.length;
    if (DOM.lineNumbers) DOM.lineNumbers.innerHTML = Array(lines.length).fill(0).map((_, i) => i + 1).join('<br>');
    
    if (DOM.codeHighlight && DOM.langSelect) {
        const langClass = DOM.langSelect.value !== 'auto' ? `language-${DOM.langSelect.value}` : '';
        DOM.codeHighlight.className = langClass;
        DOM.codeHighlight.textContent = code;
        
        delete DOM.codeHighlight.dataset.highlighted; 
        hljs.highlightElement(DOM.codeHighlight);
    }
    
    if (DOM.detectedLang && DOM.langSelect) DOM.detectedLang.textContent = `Lang: ${DOM.langSelect.value === 'auto' ? 'Auto' : DOM.langSelect.value}`;
    analyzePlagiarism(code);
}

function syncScroll() {
    if (DOM.codeHighlight) {
        DOM.codeHighlight.scrollTop = DOM.codeInput.scrollTop;
        DOM.codeHighlight.scrollLeft = DOM.codeInput.scrollLeft;
    }
    if (DOM.lineNumbers) DOM.lineNumbers.scrollTop = DOM.codeInput.scrollTop;
}

function handleTab(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        this.value = this.value.substring(0, start) + "    " + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 4;
        updateEditor();
    }
}

function analyzePlagiarism(code) {
    if (!DOM.suspicionVal || !DOM.suspicionBar) return;
    if (!code.trim()) { DOM.suspicionVal.textContent = '0%'; DOM.suspicionBar.style.width = '0%'; return; }
    const genericMatches = code.match(/\b(data|res|result|item|val|foo|bar|temp|Scanner|args|main)\b/g);
    let score = genericMatches ? Math.min(genericMatches.length * 4, 90) : 10;
    DOM.suspicionVal.textContent = `${score}%`; DOM.suspicionBar.style.width = `${score}%`;
    if (score < 30) DOM.suspicionBar.style.background = 'var(--success)';
    else if (score < 70) DOM.suspicionBar.style.background = 'var(--warn)';
    else DOM.suspicionBar.style.background = 'var(--danger)';
}

async function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabId}"]`)?.classList.add('active');
    state.currentTab = tabId;

    const code = DOM.codeInput?.value.trim();
    if (!code) { showEmptyState(); return; }

    if (state.results[tabId]) {
        renderContent(state.results[tabId], tabId);
    } else {
        await runReview(tabId, code);
    }
}

function showEmptyState() {
    if (DOM.resultsContent) {
        DOM.resultsContent.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <h3>Ready for Review</h3>
                <p style='font-size:13px;'>Paste code and hit a tab to scan.</p>
            </div>`;
    }
}

async function runReview(mode, code) {
    if (!state.apiKey) { document.getElementById('modal-apikey')?.classList.add('active'); return; }
    if (state.isRequesting) return;

    state.isRequesting = true;
    if (DOM.apiStatus) DOM.apiStatus.textContent = 'Engine working...';
    if (DOM.apiIndicator) DOM.apiIndicator.classList.add('active');
    if (DOM.resultsContent) DOM.resultsContent.innerHTML = '<div class="typing-cursor" style="font-family: var(--font-code); color: var(--muted); margin-top:20px;">Analyzing codebase, please wait...</div>';

    // TWIST 1: RAG ENGINE CONTEXT INJECTION
    let finalSystemPrompt = CONFIG.systemPrompt;
    if (state.guidelines && mode !== 'architecture') {
        finalSystemPrompt += `\n\nCRITICAL COMPANY GUIDELINES (You must strictly enforce these rules in your review):\n${state.guidelines}`;
    }

    const endpoint = `[https://generativelanguage.googleapis.com/v1beta/models/$](https://generativelanguage.googleapis.com/v1beta/models/$){CONFIG.model}:generateContent?key=${state.apiKey}`;
    const payload = {
        systemInstruction: { parts: [{ text: finalSystemPrompt }] },
        contents: [{ parts: [{ text: `Task: ${PROMPTS[mode]}\n\nCode:\n${code}` }] }]
    };

    try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

        if (!response.ok) {
            const errText = await response.text(); let errMsg = 'Unknown Error';
            try { errMsg = JSON.parse(errText).error.message; } catch(e) {}
            throw new Error(errMsg);
        }

        const data = await response.json();
        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
        
        state.results[mode] = resultText;
        renderContent(resultText, mode);
        saveHistory(code, mode);

    } catch (error) {
        if (DOM.resultsContent) DOM.resultsContent.innerHTML = `<div style="color: var(--danger); padding: 20px;"><strong>Failed:</strong> ${error.message}</div>`;
    } finally {
        state.isRequesting = false; 
        if (DOM.apiStatus) DOM.apiStatus.textContent = 'Idle'; 
        if (DOM.apiIndicator) DOM.apiIndicator.classList.remove('active');
    }
}

// TWIST 2: ARCHITECTURE RENDERING & QUALITY SCORE ROUTING
async function renderContent(text, mode) {
    if (!DOM.resultsContent) return;
    
    if (mode === 'architecture') {
        // Safe extraction of Mermaid syntax using hex codes to avoid VS Code copy-paste bugs
        const regex = /\x60\x60\x60(?:mermaid)?\n([\s\S]*?)\n\x60\x60\x60/;
        const match = text.match(regex);
        const mermaidCode = match ? match[1] : text.replace(/\x60\x60\x60mermaid/g, '').replace(/\x60\x60\x60/g, '');
        
        DOM.resultsContent.innerHTML = `<h3 style="margin-bottom:20px;">System Architecture</h3><div class="mermaid-container"><div class="mermaid" id="mermaid-graph">${mermaidCode}</div></div>`;
        try {
            await mermaid.run({ nodes: document.querySelectorAll('.mermaid') });
        } catch (e) {
            DOM.resultsContent.innerHTML += `<p style="color: var(--danger); font-size: 12px; margin-top: 10px;">Warning: Diagram syntax too complex to render.</p>`;
        }
    } else {
        let html = DOMPurify.sanitize(marked.parse(text));
        if (mode === 'quality') {
            const scoreMatch = text.match(/SCORE:\s*(\d+)\/100/i);
            if (scoreMatch) {
                const score = parseInt(scoreMatch[1]);
                html = `<div class="score-container"><div class="score-header"><span>Quality Index</span><span>${score}/100</span></div><div class="score-bar-bg"><div class="score-bar-fill" style="width: ${score}%;"></div></div></div>` + html;
            }
        }
        DOM.resultsContent.innerHTML = html;
    }
}

function saveHistory(code, mode) {
    const entry = { id: Date.now(), time: new Date().toLocaleTimeString(), lang: DOM.langSelect?.value || 'Auto', preview: code.split('\n')[0].substring(0, 40), code: code, results: { ...state.results } };
    state.history.unshift(entry); if (state.history.length > 10) state.history.pop();
    localStorage.setItem('codesense_gemini_history', JSON.stringify(state.history));
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = state.history.length ? '' : '<div style="padding:10px;text-align:center;font-size:12px;color:var(--muted)">No snapshots.</div>';
    state.history.forEach((item, i) => {
        const el = document.createElement('div'); el.className = 'history-item';
        el.innerHTML = `<div class="history-meta"><span>${item.time}</span><span>${item.lang}</span></div><div class="history-code">${item.preview}</div>`;
        el.onclick = () => { 
            if (DOM.codeInput) DOM.codeInput.value = item.code; 
            state.results = { ...item.results }; 
            updateEditor(); 
            if (state.results[state.currentTab]) renderContent(state.results[state.currentTab], state.currentTab); 
        };
        list.appendChild(el);
    });
}

// Boot up
init();