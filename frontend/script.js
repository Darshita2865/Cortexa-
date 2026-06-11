console.log("Cortexa JS Loaded - Full Version");

// ================= GLOBAL VARIABLES =================//
let currentChatId = null;
let currentProjectId = null;
let currentDocument = null;
let currentAudioMode = 'simple';
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let currentAudio = null;
let currentAudioText = null;

const API_URL = "https://cortexa-2-2ydr.onrender.com/chat";

// ================= USER-SPECIFIC STORAGE =================//
function getCurrentUser() {
    return localStorage.getItem("email") || "guest";
}

function getChats() {
    const user = getCurrentUser();
    return JSON.parse(localStorage.getItem(`chats_${user}`)) || [];
}

function saveChats(chats) {
    const user = getCurrentUser();
    localStorage.setItem(`chats_${user}`, JSON.stringify(chats));
}

function getProjects() {
    const user = getCurrentUser();
    return JSON.parse(localStorage.getItem(`projects_${user}`)) || [];
}

function saveProjects(projects) {
    const user = getCurrentUser();
    localStorage.setItem(`projects_${user}`, JSON.stringify(projects));
}

// ================= HELPER FUNCTIONS =================//
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    let toast = document.getElementById('customToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'customToast';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ef4444' : '#10b981'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
            font-size: 14px;
        `;
        document.body.appendChild(toast);
    }
    
    toast.style.backgroundColor = type === 'error' ? '#ef4444' : '#10b981';
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}

// ================= FORMAT FUNCTION =================//
function formatContent(content) {
    if (!content) return '';
    let formatted = content.replace(/\n/g, '<br>');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/^[\•\-\*]\s/gm, '• ');
    return formatted;
}

// ================= DISPLAY MESSAGE FUNCTION =================//
function displayMessage(text, sender) {
    const chatBox = document.getElementById("searchResults");
    if (!chatBox) {
        console.error("searchResults container not found!");
        return;
    }

    const msgDiv = document.createElement("div");
    msgDiv.className = sender === "user" ? "user-bubble" : "ai-bubble";
    
    const formattedText = formatContent(text);
    const senderName = sender === "user" ? "You" : "Cortexa";
    
    msgDiv.innerHTML = `
        <div class="chat-title">${senderName}</div>
        <div class="chat-content">${formattedText}</div>
    `;

    const id = "msg-" + Date.now() + "-" + Math.random();
    msgDiv.id = id;

    chatBox.appendChild(msgDiv);
    
    chatBox.scrollTo({
        top: chatBox.scrollHeight,
        behavior: 'smooth'
    });

    return id;
}

function updateMessage(id, newText) {
    const msg = document.getElementById(id);
    if (msg) {
        const contentDiv = msg.querySelector(".chat-content");
        if (contentDiv) {
            contentDiv.innerHTML = formatContent(newText);
        }
    }
}

// ================= MAIN CHAT FUNCTION =================//
window.performSearch = async function() {
    console.log("performSearch called");
    
    const queryInput = document.getElementById('searchInput');
    if (!queryInput) {
        console.error("searchInput not found!");
        return;
    }
    
    const query = queryInput.value.trim();
    if (!query) {
        console.log("Empty query");
        return;
    }
    
    displayMessage(query, 'user');
    queryInput.value = '';
    
    const loadingId = displayMessage('Thinking...', 'bot');
    
    try {
        const requestBody = {
            message: query,
            document_content: currentDocument?.content ? currentDocument.content : null,
            audio: false
        };
        
        console.log("📤 Sending request:", requestBody);
        
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log("📥 Response status:", response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log("✅ Response received:", data);
        
        if (data.response) {
            updateMessage(loadingId, data.response);
            saveCurrentChat(query, data.response);
        } else {
            updateMessage(loadingId, "⚠️ No response from AI. Please try again.");
        }
        
    } catch (error) {
        console.error("❌ Chat error:", error);
        updateMessage(loadingId, `⚠️ Error connecting to AI. Make sure backend is running\n\nDetails: ${error.message}`);
    }
}

// ================= SAVE CHAT =================//
function saveCurrentChat(userMessage, aiResponse) {
    let chats = getChats();
    
    if (!currentChatId) {
        currentChatId = 'chat_' + Date.now();
        const title = userMessage.substring(0, 30);
        const newChat = {
            id: currentChatId,
            title: title,
            created_at: new Date().toISOString(),
            messages: [
                { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
                { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() }
            ]
        };
        chats.unshift(newChat);
    } else {
        const chatIndex = chats.findIndex(c => c.id === currentChatId);
        if (chatIndex !== -1) {
            chats[chatIndex].messages.push(
                { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
                { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() }
            );
            if (chats[chatIndex].messages.length === 2) {
                chats[chatIndex].title = userMessage.substring(0, 30);
            }
        }
    }
    saveChats(chats);
    loadChats();
}

// ================= ADD WELCOME MESSAGE =================//
function addWelcomeMessage() {
    const container = document.getElementById("searchResults");
    if (!container) return;
    
    if (container.children.length === 0) {
        displayMessage("👋 Hi! I'm Cortexa. Ask me anything! 💙", 'bot');
    }
}

// ================= LOAD CHATS =================//
function loadChats() {
    const container = document.getElementById("chatList");
    if (!container) return;
    
    let chats = getChats();
    if (chats.length === 0) {
        container.innerHTML = '<div class="empty-message">No chats yet</div>';
        return;
    }
    
    container.innerHTML = "";
    chats.slice(0, 20).forEach(chat => {
        const div = document.createElement("div");
        div.className = `chat-item ${currentChatId === chat.id ? 'active' : ''}`;
        div.setAttribute('data-chat-id', chat.id);
        div.innerHTML = `
            <span class="chat-title" onclick="loadChatById('${chat.id}')">💬 ${escapeHtml(chat.title.substring(0, 35))}</span>
            <div class="chat-menu-container">
                <button class="chat-menu-btn" onclick="toggleChatMenu(event, '${chat.id}')">⋯</button>
                <div class="chat-dropdown" id="chat-dropdown-${chat.id}">
                    <div class="dropdown-item delete" onclick="deleteChatById('${chat.id}')">🗑️ Delete</div>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// ================= LOAD PROJECTS =================//
function loadProjects() {
    const container = document.getElementById("projectListRight");
    if (!container) return;
    
    let projects = getProjects();
    if (projects.length === 0) {
        container.innerHTML = '<div class="empty-message">No projects yet</div>';
        return;
    }
    
    container.innerHTML = "";
    projects.slice(0, 10).forEach(project => {
        const div = document.createElement("div");
        div.className = "project-item";
        div.setAttribute('data-project-id', project.id);
        div.innerHTML = `📁 ${escapeHtml(project.name.substring(0, 35))}`;
        container.appendChild(div);
    });
}

// ================= CHAT MANAGEMENT =================//
window.loadChatById = function(chatId) {
    let chats = getChats();
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
        currentChatId = chat.id;
        const container = document.getElementById("searchResults");
        if (container) {
            container.innerHTML = "";
            chat.messages.forEach(msg => {
                displayMessage(msg.content, msg.role === 'user' ? 'user' : 'bot');
            });
        }
        loadChats();
        showToast("Chat loaded!");
    }
}

window.deleteChatById = function(chatId) {
    if (confirm("Delete this chat?")) {
        let chats = getChats();
        chats = chats.filter(chat => chat.id !== chatId);
        saveChats(chats);
        if (currentChatId === chatId) {
            currentChatId = null;
            const container = document.getElementById("searchResults");
            if (container) {
                container.innerHTML = "";
                addWelcomeMessage();
            }
        }
        loadChats();
        showToast("🗑️ Chat deleted!");
    }
    const dropdown = document.getElementById(`chat-dropdown-${chatId}`);
    if (dropdown) dropdown.classList.remove('show');
}

window.startNewChat = function(e) {
    if (e) e.preventDefault();
    currentChatId = null;
    const container = document.getElementById("searchResults");
    if (container) {
        container.innerHTML = "";
        addWelcomeMessage();
    }
    loadChats();
    showToast("✨ New chat started!");
}

window.toggleChatMenu = function(event, chatId) {
    event.stopPropagation();
    
    document.querySelectorAll('.chat-dropdown.show').forEach(dropdown => {
        if (dropdown.id !== `chat-dropdown-${chatId}`) {
            dropdown.classList.remove('show');
        }
    });
    
    const dropdown = document.getElementById(`chat-dropdown-${chatId}`);
    if (!dropdown) return;
    
    dropdown.classList.toggle('show');
    
    setTimeout(() => {
        dropdown.classList.remove('show');
    }, 3000);
}

window.togglePlusDropdown = function() {
    const dropdown = document.getElementById('plusDropdown');
    if (dropdown) dropdown.classList.toggle('show');
}

window.shareChat = function() {
    if (currentChatId) {
        let chats = getChats();
        const chat = chats.find(c => c.id === currentChatId);
        if (chat) {
            const shareText = `${chat.title}\n\n${chat.messages.map(m => `${m.role === 'user' ? 'You' : 'Cortexa'}: ${m.content}`).join('\n\n')}`;
            navigator.clipboard.writeText(shareText);
            showToast("✅ Chat copied to clipboard!");
        }
    } else {
        showToast("❌ No active chat to share!");
    }
}

window.deleteChat = function() {
    if (currentChatId) {
        if (confirm("Delete this chat?")) {
            let chats = getChats();
            chats = chats.filter(chat => chat.id !== currentChatId);
            saveChats(chats);
            currentChatId = null;
            const container = document.getElementById("searchResults");
            if (container) {
                container.innerHTML = "";
                addWelcomeMessage();
            }
            loadChats();
            showToast("🗑️ Current chat deleted!");
        }
    } else {
        showToast("❌ No active chat to delete!");
    }
}

window.pinChat = function() {
    showToast("📌 Pin feature coming soon!");
}

window.createProject = function() {
    const name = prompt("Enter project name:");
    if (name && name.trim() !== "") {
        let projects = getProjects();
        const newProject = {
            id: 'project_' + Date.now(),
            name: name.trim(),
            created_at: new Date().toLocaleString()
        };
        projects.push(newProject);
        saveProjects(projects);
        loadProjects();
        showToast(`✅ Project "${name}" created!`);
    }
}

// ================= DOCUMENT CHAT =================//
window.documentChat = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.pdf,.docx';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            
            showToast("📄 Uploading document...");
            
            try {
                const response = await fetch('https://cortexa-2-2ydr.onrender.com/upload-document', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                currentDocument = data;
                showToast(`✅ Document "${file.name}" loaded! You can now ask questions about it.`);
                displayMessage(`📄 **Document loaded:** ${file.name}\n\nYou can now ask me questions about this document!`, 'bot');
            } catch (error) {
                showToast("❌ Error uploading document", "error");
            }
        }
    };
    input.click();
}

// ================= MODAL FUNCTIONS - FIXED =================//

// AUDIO MODAL
window.openAudioMode = function() {
    console.log("Opening Audio Modal");
    const modal = document.getElementById('audioModal');
    if (modal) {
        modal.style.display = 'flex';
        showToast("🎤 Audio mode activated!");
    } else {
        console.error("Audio modal not found!");
        showToast("Audio modal not available", "error");
    }
}

window.closeAudioMode = function() {
    const modal = document.getElementById('audioModal');
    if (modal) modal.style.display = 'none';
}

// VIDEO MODAL
window.openVideoMode = function() {
    console.log("Opening Video Modal");
    const modal = document.getElementById('videoModal');
    if (modal) {
        modal.style.display = 'flex';
        showToast("📹 Video mode activated!");
        // Initialize YouTube tab
        const youtubeTab = document.getElementById('youtubeTab');
        const libraryTab = document.getElementById('libraryTab');
        if (youtubeTab) youtubeTab.style.display = 'block';
        if (libraryTab) libraryTab.style.display = 'none';
    } else {
        console.error("Video modal not found!");
        showToast("Video modal not available", "error");
    }
}

window.closeVideoMode = function() {
    const modal = document.getElementById('videoModal');
    if (modal) modal.style.display = 'none';
}

// REPORT MODAL
window.openReportMode = function() {
    console.log("Opening Report Modal");
    const modal = document.getElementById('reportModal');
    if (modal) {
        modal.style.display = 'flex';
        showToast("📊 Report mode activated!");
    } else {
        console.error("Report modal not found!");
        showToast("Report modal not available", "error");
    }
}

window.closeReportMode = function() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
}

// LEARNING TOOLS MODAL
window.openLearningTools = function() {
    console.log("Opening Learning Tools Modal");
    const modal = document.getElementById('learningToolsModal');
    if (modal) {
        modal.style.display = 'flex';
        showToast("🎓 Learning Tools activated!");
        // Initialize quiz tab
        const quizTab = document.getElementById('quizTab');
        const notesTab = document.getElementById('notesTab');
        if (quizTab) quizTab.style.display = 'block';
        if (notesTab) notesTab.style.display = 'none';
    } else {
        console.error("Learning Tools modal not found!");
        showToast("Learning Tools not available", "error");
    }
}

window.closeLearningTools = function() {
    const modal = document.getElementById('learningToolsModal');
    if (modal) modal.style.display = 'none';
}

// GAMES MODAL
window.openGamesModal = function() {
    console.log("Opening Games Modal");
    const modal = document.getElementById('gamesModal');
    if (modal) {
        modal.style.display = 'flex';
        showToast("🎮 Games mode activated!");
        showGameSelectionScreen();
    } else {
        console.error("Games modal not found!");
        showToast("Games not available", "error");
    }
}

window.closeGamesModal = function() {
    const modal = document.getElementById('gamesModal');
    if (modal) modal.style.display = 'none';
}

// ================= GAMES FUNCTIONS =================//
function showGameSelectionScreen() {
    const gameContent = document.getElementById('gameContent');
    if (!gameContent) return;
    
    gameContent.innerHTML = `
        <div class="games-grid-container">
            <div class="game-card-large" onclick="selectGame('quiz-race')">
                <div class="game-card-icon">🏆</div>
                <h3>Quiz Race</h3>
                <p>Test your knowledge with timed quizzes</p>
                <button class="play-now-btn">Play Now →</button>
            </div>
            <div class="game-card-large" onclick="selectGame('memory-match')">
                <div class="game-card-icon">🎴</div>
                <h3>Memory Match</h3>
                <p>Match terms with definitions</p>
                <button class="play-now-btn">Play Now →</button>
            </div>
            <div class="game-card-large" onclick="selectGame('typing-speed')">
                <div class="game-card-icon">⌨️</div>
                <h3>Typing Speed</h3>
                <p>Improve your typing speed</p>
                <button class="play-now-btn">Play Now →</button>
            </div>
            <div class="game-card-large" onclick="selectGame('trivia-challenge')">
                <div class="game-card-icon">❓</div>
                <h3>Trivia Challenge</h3>
                <p>Answer random knowledge questions</p>
                <button class="play-now-btn">Play Now →</button>
            </div>
            <div class="game-card-large" onclick="selectGame('word-scramble')">
                <div class="game-card-icon">🔤</div>
                <h3>Word Scramble</h3>
                <p>Unscramble the letters to form words</p>
                <button class="play-now-btn">Play Now →</button>
            </div>
            <div class="game-card-large" onclick="selectGame('true-false')">
                <div class="game-card-icon">✓✗</div>
                <h3>True or False</h3>
                <p>Test your knowledge with true/false questions</p>
                <button class="play-now-btn">Play Now →</button>
            </div>
        </div>
    `;
}

window.selectGame = function(gameType) {
    const gameContent = document.getElementById('gameContent');
    if (!gameContent) return;
    
    gameContent.innerHTML = `
        <div class="game-header-bar">
            <button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button>
            <h2 class="current-game-title">${getGameTitle(gameType)}</h2>
        </div>
        <div id="activeGameContainer" class="active-game-container">
            <p style="text-align: center; padding: 40px;">Loading game...</p>
        </div>
    `;
    
    showToast(`${getGameTitle(gameType)} - Coming soon! Full implementation in progress.`);
}

function getGameTitle(gameType) {
    const titles = {
        'quiz-race': '🏆 Quiz Race',
        'memory-match': '🎴 Memory Match',
        'typing-speed': '⌨️ Typing Speed',
        'trivia-challenge': '❓ Trivia Challenge',
        'word-scramble': '🔤 Word Scramble',
        'true-false': '✓✗ True or False'
    };
    return titles[gameType] || 'Game';
}

// ================= SIMPLE AUDIO FUNCTIONS =================//
window.setAudioMode = function(mode, btn) {
    currentAudioMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showToast(`🎵 Audio mode: ${mode}`);
}

window.toggleMicrophone = async function() {
    showToast("🎤 Microphone feature coming soon!");
}

window.sendAudioQuery = async function() {
    const queryInput = document.getElementById('audioQueryInput');
    const query = queryInput.value.trim();
    if (!query) {
        showToast("Please enter a question", "error");
        return;
    }
    
    showToast("Processing your audio query...");
    // Call the main chat function to get response
    const responseArea = document.getElementById('audioResponseArea');
    const responseText = document.getElementById('responseText');
    
    if (responseArea) responseArea.style.display = 'block';
    if (responseText) responseText.innerHTML = '<span>Processing...</span>';
    
    try {
        const requestBody = { message: query, audio: true };
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        
        if (responseText) responseText.innerHTML = formatContent(data.response || "Response received!");
        showToast("✅ Response generated!");
        
    } catch (error) {
        if (responseText) responseText.innerHTML = '❌ Error generating response';
        showToast("Error connecting to AI", "error");
    }
}

// ================= SIMPLE REPORT FUNCTIONS =================//
window.generateReport = async function() {
    const topic = document.getElementById('reportTopicInput')?.value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    showToast(`Generating report on "${topic}"...`);
    
    try {
        const prompt = `Generate a comprehensive report about "${topic}" with introduction, key findings, analysis, and conclusion.`;
        
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: prompt, document_content: null, audio: false })
        });
        
        const data = await response.json();
        let reportContent = data.response || "Failed to generate report.";
        
        const contentDiv = document.getElementById('reportContent');
        const displayDiv = document.getElementById('reportDisplay');
        
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div class="report-container">
                    <h1>📊 Report: ${escapeHtml(topic)}</h1>
                    <div class="report-meta">Generated on: ${new Date().toLocaleString()}</div>
                    <div class="report-content">${formatContent(reportContent)}</div>
                </div>
            `;
        }
        if (displayDiv) displayDiv.style.display = 'block';
        
        showToast("✅ Report generated successfully!");
        
    } catch (error) {
        console.error('Report error:', error);
        showToast("Error generating report", "error");
    }
}

// ================= SIMPLE LEARNING TOOLS =================//
window.switchLearningTab = function(tab) {
    const quizTab = document.getElementById('quizTab');
    const notesTab = document.getElementById('notesTab');
    const btns = document.querySelectorAll('.learning-tab-btn');
    
    btns.forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'quiz') {
        if (quizTab) quizTab.style.display = 'block';
        if (notesTab) notesTab.style.display = 'none';
        if (btns[0]) btns[0].classList.add('active');
    } else {
        if (quizTab) quizTab.style.display = 'none';
        if (notesTab) notesTab.style.display = 'block';
        if (btns[1]) btns[1].classList.add('active');
    }
}

window.generateQuiz = async function() {
    const topic = document.getElementById('quizTopicInput')?.value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    showToast(`Generating quiz on "${topic}"...`);
    
    try {
        const prompt = `Generate 5 quiz questions about "${topic}" with multiple choice answers.`;
        
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: prompt, document_content: null, audio: false })
        });
        
        const data = await response.json();
        
        const contentDiv = document.getElementById('quizContent');
        const displayDiv = document.getElementById('quizDisplay');
        
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div class="quiz-container">
                    <h3>📝 Quiz: ${escapeHtml(topic)}</h3>
                    <div class="quiz-content">${formatContent(data.response || "Quiz generated!")}</div>
                    <button class="submit-quiz-btn" onclick="showToast('Quiz submitted! Answers will be checked soon.')">Submit Answers</button>
                </div>
            `;
        }
        if (displayDiv) displayDiv.style.display = 'block';
        
        showToast("✅ Quiz generated successfully!");
        
    } catch (error) {
        console.error('Quiz error:', error);
        showToast("Error generating quiz", "error");
    }
}

window.generateStudyNotes = async function() {
    const topic = document.getElementById('notesTopicInput')?.value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    showToast(`Generating study notes on "${topic}"...`);
    
    try {
        const prompt = `Create comprehensive study notes about "${topic}" with key concepts, definitions, and summary points.`;
        
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: prompt, document_content: null, audio: false })
        });
        
        const data = await response.json();
        
        const contentDiv = document.getElementById('notesContent');
        const displayDiv = document.getElementById('notesDisplay');
        
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div class="notes-container">
                    <h2>📚 Study Notes: ${escapeHtml(topic)}</h2>
                    <div class="notes-content">${formatContent(data.response || "Notes generated!")}</div>
                </div>
            `;
        }
        if (displayDiv) displayDiv.style.display = 'block';
        
        showToast("✅ Study notes generated successfully!");
        
    } catch (error) {
        console.error('Notes error:', error);
        showToast("Error generating notes", "error");
    }
}

// ================= SIMPLE VIDEO FUNCTIONS =================//
window.switchVideoTab = function(tab) {
    const youtubeTab = document.getElementById('youtubeTab');
    const libraryTab = document.getElementById('libraryTab');
    const btns = document.querySelectorAll('.tab-btn');
    
    btns.forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'youtube') {
        if (youtubeTab) youtubeTab.style.display = 'block';
        if (libraryTab) libraryTab.style.display = 'none';
        if (btns[0]) btns[0].classList.add('active');
    } else {
        if (youtubeTab) youtubeTab.style.display = 'none';
        if (libraryTab) libraryTab.style.display = 'block';
        if (btns[1]) btns[1].classList.add('active');
    }
}

window.searchYouTube = async function() {
    const query = document.getElementById('youtubeSearchQuery')?.value;
    if (!query) {
        showToast("Please enter a search term", "error");
        return;
    }
    
    showToast(`Searching YouTube for "${query}"...`);
    // Placeholder for YouTube search
    const resultsDiv = document.getElementById('youtubeResults');
    if (resultsDiv) {
        resultsDiv.innerHTML = '<p>YouTube search feature coming soon! Please check back later.</p>';
    }
}

// ================= LOGOUT FUNCTION (SINGLE VERSION) =================
window.logout = function() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("email");
        localStorage.removeItem("username");
        localStorage.removeItem("isLoggedIn");
        currentChatId = null;
        currentProjectId = null;
        currentDocument = null;
        window.location.href = "index.html";
    }
}

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded, initializing dashboard...");
    
    // Initialize chat
    addWelcomeMessage();
    loadChats();
    loadProjects();
    
    // Check login status for navbar
    const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
    if (isLoggedIn) {
        document.body.classList.add('logged-in');
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', function() {
        document.querySelectorAll('.chat-dropdown.show, .project-dropdown.show, .plus-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    });
    
    console.log("Dashboard initialized successfully!");
});
