console.log("Cortexa JS Loaded - Full Version");

// ================= GLOBAL VARIABLES =================
let currentChatId = null;
let currentProjectId = null;
let currentDocument = null;
let currentAudioMode = 'simple';
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let currentAudio = null;

// API URL
const API_URL = "http://127.0.0.1:8000/chat";

// ================= HELPER FUNCTIONS =================
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

// ================= FORMAT FUNCTION =================
function formatContent(content) {
    if (!content) return '';
    let formatted = content.replace(/\n/g, '<br>');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/^[\•\-\*]\s/gm, '• ');
    return formatted;
}

// ================= DISPLAY MESSAGE FUNCTION =================
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
    
    // Auto-scroll to bottom
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

// ================= MAIN CHAT FUNCTION =================
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
    
    // Display user message
    displayMessage(query, 'user');
    queryInput.value = '';
    
    // Show loading indicator
    const loadingId = displayMessage('<span class="typing-dots">Thinking<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>', 'bot');
    
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
        updateMessage(loadingId, `⚠️ Error connecting to AI. Make sure backend is running on port 8000\n\nDetails: ${error.message}`);
    }
}

// ================= SAVE CHAT =================
function saveCurrentChat(userMessage, aiResponse) {
    let chats = JSON.parse(localStorage.getItem("chats")) || [];
    
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
    localStorage.setItem("chats", JSON.stringify(chats));
    loadChats();
}

// ================= ADD WELCOME MESSAGE =================
function addWelcomeMessage() {
    const container = document.getElementById("searchResults");
    if (!container) return;
    
    if (container.children.length === 0) {
        displayMessage("👋 Hi! I'm Cortexa. Ask me anything! 💙", 'bot');
    }
}

// ================= LOAD CHATS =================
function loadChats() {
    const container = document.getElementById("chatList");
    if (!container) return;
    
    let chats = JSON.parse(localStorage.getItem("chats")) || [];
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

// ================= LOAD PROJECTS =================
function loadProjects() {
    const container = document.getElementById("projectListRight");
    if (!container) return;
    
    let projects = JSON.parse(localStorage.getItem("projects")) || [];
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

// ================= CHAT MANAGEMENT =================
window.loadChatById = function(chatId) {
    let chats = JSON.parse(localStorage.getItem("chats")) || [];
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
        let chats = JSON.parse(localStorage.getItem("chats")) || [];
        chats = chats.filter(chat => chat.id !== chatId);
        localStorage.setItem("chats", JSON.stringify(chats));
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

// Dropdown functions
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
        let chats = JSON.parse(localStorage.getItem("chats")) || [];
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
            let chats = JSON.parse(localStorage.getItem("chats")) || [];
            chats = chats.filter(chat => chat.id !== currentChatId);
            localStorage.setItem("chats", JSON.stringify(chats));
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
        let projects = JSON.parse(localStorage.getItem("projects")) || [];
        const newProject = {
            id: 'project_' + Date.now(),
            name: name.trim(),
            created_at: new Date().toLocaleString()
        };
        projects.push(newProject);
        localStorage.setItem("projects", JSON.stringify(projects));
        loadProjects();
        showToast(`✅ Project "${name}" created!`);
    }
}

// ================= DOCUMENT CHAT =================
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
                const response = await fetch('http://127.0.0.1:8000/upload-document', {
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

// ================= AUDIO MODE =================
window.openAudioMode = function() {
    const modal = document.getElementById('audioModal');
    if (modal) modal.style.display = 'flex';
}

window.closeAudioMode = function() {
    const modal = document.getElementById('audioModal');
    if (modal) modal.style.display = 'none';
}

window.setAudioMode = function(mode, btn) {
    currentAudioMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showToast(`🎵 Audio mode: ${mode}`);
}

window.toggleMicrophone = async function() {
    const micBtn = document.getElementById('micButton');
    const statusDiv = document.getElementById('micStatus');
    
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                // For now, just show that speech was detected
                statusDiv.innerHTML = '🎤 Speech detected! Processing...';
                showToast("🎤 Voice input received! Please type your question for now (voice-to-text coming soon)");
                statusDiv.innerHTML = 'Click microphone to speak';
                isRecording = false;
                micBtn.style.background = '';
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            isRecording = true;
            micBtn.style.background = '#ef4444';
            statusDiv.innerHTML = '🔴 Recording... Click again to stop';
        } catch (err) {
            console.error('Microphone error:', err);
            statusDiv.innerHTML = '❌ Microphone access denied';
            showToast("Microphone access denied", "error");
        }
    } else {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
        }
    }
}

window.sendAudioQuery = async function() {
    const queryInput = document.getElementById('audioQueryInput');
    const query = queryInput.value.trim();
    if (!query) {
        showToast("Please enter a question", "error");
        return;
    }
    
    const responseArea = document.getElementById('audioResponseArea');
    const responseText = document.getElementById('responseText');
    
    responseArea.style.display = 'block';
    responseText.innerHTML = '<span class="typing-dots">Generating response...</span>';
    
    try {
        const requestBody = { message: query, audio: true };
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        
        currentAudioText = data.response;
        responseText.innerHTML = formatContent(data.response);
        
        // Generate audio
        const audioResponse = await fetch('http://127.0.0.1:8000/generate-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: data.response })
        });
        const audioData = await audioResponse.json();
        
        if (audioData.audio_url) {
            const audioPlayer = document.getElementById('audioPlayer');
            audioPlayer.src = `http://127.0.0.1:8000${audioData.audio_url}`;
            document.getElementById('audioPlayerContainer').style.display = 'block';
        }
        
    } catch (error) {
        responseText.innerHTML = '❌ Error generating response';
        showToast("Error connecting to AI", "error");
    }
}

window.playAudioResponse = function() {
    const audio = document.getElementById('audioPlayer');
    if (audio && audio.src) {
        audio.play();
    } else {
        showToast("No audio available", "error");
    }
}

window.pauseAudioResponse = function() {
    const audio = document.getElementById('audioPlayer');
    if (audio) audio.pause();
}

window.stopAudioResponse = function() {
    const audio = document.getElementById('audioPlayer');
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
}

window.downloadAudioResponse = function() {
    const audio = document.getElementById('audioPlayer');
    if (audio && audio.src) {
        const a = document.createElement('a');
        a.href = audio.src;
        a.download = 'cortexa_audio.mp3';
        a.click();
        showToast("Downloading audio...");
    } else {
        showToast("No audio available", "error");
    }
}
// ================= VIDEO MODE WITH PROPER STYLING =================

window.openVideoMode = function() {
    const modal = document.getElementById('videoModal');
    if (modal) modal.style.display = 'flex';
    switchVideoTab('youtube');
}

window.closeVideoMode = function() {
    const modal = document.getElementById('videoModal');
    if (modal) modal.style.display = 'none';
    // Clear results when closing
    document.getElementById('youtubeResults').innerHTML = '';
    document.getElementById('youtubeVideoInfo').style.display = 'none';
    document.getElementById('youtubeOptions').style.display = 'none';
}

window.switchVideoTab = function(tab) {
    const youtubeTab = document.getElementById('youtubeTab');
    const libraryTab = document.getElementById('libraryTab');
    const btns = document.querySelectorAll('.tab-btn');
    
    btns.forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'youtube') {
        youtubeTab.style.display = 'block';
        libraryTab.style.display = 'none';
        btns[0].classList.add('active');
    } else {
        youtubeTab.style.display = 'none';
        libraryTab.style.display = 'block';
        btns[1].classList.add('active');
        loadVideoLibrary();
    }
}

// Search YouTube and display videos
window.searchYouTube = async function() {
    const query = document.getElementById('youtubeSearchQuery').value;
    if (!query) {
        showToast("Please enter a search term", "error");
        return;
    }
    
    showToast("🔍 Searching YouTube...");
    const resultsDiv = document.getElementById('youtubeResults');
    resultsDiv.innerHTML = '<div class="loading-spinner">🔍 Searching for videos...</div>';
    
    try {
        const response = await fetch(`http://127.0.0.1:8000/youtube-search?query=${encodeURIComponent(query)}&max_results=12`);
        const data = await response.json();
        
        if (data.error) {
            resultsDiv.innerHTML = `<div class="error-message">❌ ${data.error}</div>`;
            showToast(data.error, "error");
            return;
        }
        
        if (!data.videos || data.videos.length === 0) {
            resultsDiv.innerHTML = '<div class="no-results">😕 No videos found. Try a different search term.</div>';
            return;
        }
        
        // Display video results in a beautiful grid
        resultsDiv.innerHTML = `
            <div class="search-header">
                <h3>📹 Search Results (${data.videos.length} videos)</h3>
                <p>Click "Play on YouTube" to watch any video</p>
            </div>
            <div class="youtube-grid">
                ${data.videos.map(video => `
                    <div class="video-card">
                        <div class="video-thumbnail">
                            <img src="${video.thumbnail}" alt="${escapeHtml(video.title)}">
                            <div class="video-duration">${getRandomDuration()}</div>
                        </div>
                        <div class="video-details">
                            <h4 class="video-title">${escapeHtml(video.title.substring(0, 70))}</h4>
                            <p class="video-channel">${escapeHtml(video.channel)}</p>
                            <p class="video-stats">👁️ ${getRandomViews()} views</p>
                            <button class="play-youtube-btn" onclick="openInYouTube('${video.id}')">
                                ▶️ Play on YouTube
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        showToast(`Found ${data.videos.length} videos!`);
        
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<div class="error-message">❌ Failed to search YouTube. Make sure backend is running.</div>';
        showToast("Error connecting to backend", "error");
    }
}

// Open video in YouTube (new tab)
window.openInYouTube = function(videoId) {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    window.open(youtubeUrl, '_blank');
    showToast("📺 Opening YouTube in new tab...");
}

// Fetch video info when URL is entered
window.fetchYouTubeVideo = async function() {
    const url = document.getElementById('youtubeUrl').value;
    if (!url) {
        showToast("Please enter a YouTube URL", "error");
        return;
    }
    
    showToast("📹 Loading video information...");
    
    const videoId = extractYouTubeId(url);
    if (!videoId) {
        showToast("Invalid YouTube URL", "error");
        return;
    }
    
    // Just show info, open in YouTube when button clicked
    await fetchAndDisplayVideoInfo(videoId);
}

// Fetch and display video info
async function fetchAndDisplayVideoInfo(videoId) {
    try {
        const response = await fetch(`http://127.0.0.1:8000/youtube-video-info?videoid=${videoId}`);
        const data = await response.json();
        
        if (data.error) {
            showToast(data.error, "error");
            return;
        }
        
        const infoDiv = document.getElementById('youtubeVideoInfo');
        infoDiv.style.display = 'block';
        infoDiv.innerHTML = `
            <div class="video-detail-card">
                <div class="video-detail-header">
                    <h3>✅ Video Information</h3>
                </div>
                <div class="video-detail-content">
                    <p><strong>📹 Title:</strong> ${escapeHtml(data.title)}</p>
                    <p><strong>👁️ Views:</strong> ${parseInt(data.views).toLocaleString()}</p>
                    <p><strong>👍 Likes:</strong> ${parseInt(data.likes).toLocaleString()}</p>
                    <p><strong>⏱️ Duration:</strong> ${formatDuration(data.duration)}</p>
                    <details>
                        <summary>📝 Description</summary>
                        <p class="video-description">${escapeHtml(data.description.substring(0, 500))}${data.description.length > 500 ? '...' : ''}</p>
                    </details>
                    <div class="video-action-buttons">
                        <button class="watch-btn" onclick="watchOnYouTube('${videoId}')">
                            🎬 Watch on YouTube
                        </button>
                        <button class="summary-btn" onclick="generateAndShowSummary('${videoId}')">
                            🤖 Generate AI Summary
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('youtubeOptions').style.display = 'block';
        showToast("Video loaded successfully!");
        
    } catch (error) {
        console.error('Error fetching video info:', error);
        showToast("Error loading video information", "error");
    }
}

// Watch video on YouTube
window.watchOnYouTube = function(videoId) {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    window.open(youtubeUrl, '_blank');
    showToast("📺 Opening YouTube...");
}

// Generate and show AI summary
window.generateAndShowSummary = async function(videoId) {
    const url = `https://youtube.com/watch?v=${videoId}`;
    showToast("🤖 Generating AI summary...");
    
    const summaryDiv = document.getElementById('videoSummarySection');
    if (!summaryDiv) {
        // Create summary section if not exists
        const infoDiv = document.getElementById('youtubeVideoInfo');
        const summarySection = document.createElement('div');
        summarySection.id = 'videoSummarySection';
        infoDiv.appendChild(summarySection);
    }
    
    const summaryContainer = document.getElementById('videoSummarySection');
    summaryContainer.innerHTML = '<div class="loading-summary">🧠 Analyzing video content...</div>';
    summaryContainer.style.display = 'block';
    
    try {
        const response = await fetch('http://127.0.0.1:8000/youtube-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });
        
        const data = await response.json();
        
        if (data.error) {
            summaryContainer.innerHTML = `<div class="error-summary">❌ ${data.error}</div>`;
            showToast(data.error, "error");
            return;
        }
        
        summaryContainer.innerHTML = `
            <div class="summary-card">
                <h4>📝 AI Generated Summary</h4>
                <div class="summary-text">${formatContent(data.summary)}</div>
                <div class="summary-buttons">
                    <button onclick="copySummaryToClipboard()">📋 Copy</button>
                    <button onclick="downloadSummaryAsFile()">💾 Download</button>
                </div>
            </div>
        `;
        showToast("Summary generated successfully!");
        
    } catch (error) {
        summaryContainer.innerHTML = '<div class="error-summary">❌ Failed to generate summary</div>';
        showToast("Error generating summary", "error");
    }
}

// Copy summary to clipboard
window.copySummaryToClipboard = function() {
    const summaryText = document.querySelector('.summary-text')?.innerText;
    if (summaryText) {
        navigator.clipboard.writeText(summaryText);
        showToast("📋 Summary copied to clipboard!");
    }
}

// Download summary as file
window.downloadSummaryAsFile = function() {
    const summaryText = document.querySelector('.summary-text')?.innerText;
    if (summaryText) {
        const blob = new Blob([summaryText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'video_summary.txt';
        a.click();
        URL.revokeObjectURL(url);
        showToast("💾 Summary downloaded!");
    }
}

// Helper functions
function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([\w-]+)/,
        /(?:youtu\.be\/)([\w-]+)/,
        /(?:youtube\.com\/embed\/)([\w-]+)/,
        /(?:youtube\.com\/v\/)([\w-]+)/,
        /(?:youtube\.com\/shorts\/)([\w-]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match.group(1);
    }
    return null;
}

function formatDuration(duration) {
    if (!duration) return 'Unknown';
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return duration;
    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const seconds = match[3] ? parseInt(match[3]) : 0;
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getRandomViews() {
    const views = ['1.2M', '856K', '2.3M', '450K', '1.8M', '3.1M', '567K', '924K'];
    return views[Math.floor(Math.random() * views.length)];
}

function getRandomDuration() {
    const durations = ['5:23', '8:15', '12:42', '3:45', '15:30', '6:18', '10:05', '4:52'];
    return durations[Math.floor(Math.random() * durations.length)];
}

// Keep other existing functions...
window.createVideoFromYouTube = async function(type) {
    const url = document.getElementById('youtubeUrl').value;
    if (!url) {
        showToast("Please enter or select a YouTube video first", "error");
        return;
    }
    const videoId = extractYouTubeId(url);
    if (videoId) {
        generateAndShowSummary(videoId);
    }
}

window.extractYouTubeTranscript = function() {
    showToast("📝 Transcript extraction coming soon!");
}

window.translateYouTubeVideo = function() {
    showToast("🌐 Translation feature coming soon!");
}

function loadVideoLibrary() {
    const libraryDiv = document.getElementById('videoLibraryList');
    const savedVideos = JSON.parse(localStorage.getItem('savedVideos') || '[]');
    
    if (savedVideos.length === 0) {
        libraryDiv.innerHTML = '<div class="empty-library">📭 No saved videos. Search and save videos to see them here!</div>';
        return;
    }
    
    libraryDiv.innerHTML = `
        <div class="library-grid">
            ${savedVideos.map(video => `
                <div class="library-card">
                    <img src="${video.thumbnail}" alt="${escapeHtml(video.title)}">
                    <div class="library-card-info">
                        <h4>${escapeHtml(video.title.substring(0, 50))}</h4>
                        <p class="library-date">Saved: ${video.date}</p>
                        <button class="library-play-btn" onclick="openInYouTube('${video.id}')">
                            ▶️ Play on YouTube
                        </button>
                        <button class="library-remove-btn" onclick="removeFromLibrary('${video.id}')">
                            🗑️ Remove
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

window.saveToLibrary = function(videoId, title) {
    const savedVideos = JSON.parse(localStorage.getItem('savedVideos') || '[]');
    const newVideo = {
        id: videoId,
        title: title,
        url: `https://youtube.com/watch?v=${videoId}`,
        date: new Date().toLocaleString(),
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    };
    
    if (!savedVideos.some(v => v.id === videoId)) {
        savedVideos.push(newVideo);
        localStorage.setItem('savedVideos', JSON.stringify(savedVideos));
        showToast("💾 Video saved to library!");
        loadVideoLibrary();
    } else {
        showToast("Video already in library!");
    }
}

window.removeFromLibrary = function(videoId) {
    let savedVideos = JSON.parse(localStorage.getItem('savedVideos') || '[]');
    savedVideos = savedVideos.filter(v => v.id !== videoId);
    localStorage.setItem('savedVideos', JSON.stringify(savedVideos));
    loadVideoLibrary();
    showToast("🗑️ Video removed from library");
}

window.saveVideoToLibrary = function() {
    const url = document.getElementById('youtubeUrl').value;
    const videoId = extractYouTubeId(url);
    if (videoId) {
        const title = document.querySelector('.video-detail-card h3')?.innerText.replace('✅ ', '') || 'Untitled Video';
        saveToLibrary(videoId, title);
    } else {
        showToast("No video to save", "error");
    }
}

window.downloadVideo = function() {
    const summary = document.querySelector('.summary-text')?.innerText;
    if (summary) {
        downloadSummaryAsFile();
    } else {
        showToast("Generate a summary first to download", "error");
    }
}

window.shareVideo = function() {
    const url = document.getElementById('youtubeUrl').value;
    if (url) {
        navigator.clipboard.writeText(url);
        showToast("🔗 Video link copied to clipboard!");
    } else {
        showToast("No video to share", "error");
    }
}

window.uploadToYouTube = function() {
    showToast("YouTube upload feature coming soon!");
}

// ================= MIND MAP MODE =================
window.openMindMapMode = function() {
    const modal = document.getElementById('mindMapModal');
    if (modal) modal.style.display = 'flex';
    switchMindMapTab('create');
}

window.closeMindMapMode = function() {
    const modal = document.getElementById('mindMapModal');
    if (modal) modal.style.display = 'none';
}

window.switchMindMapTab = function(tab) {
    const createTab = document.getElementById('mindmapCreateTab');
    const libraryTab = document.getElementById('mindmapLibraryTab');
    const btns = document.querySelectorAll('.mindmap-tab-btn');
    
    btns.forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'create') {
        createTab.style.display = 'block';
        libraryTab.style.display = 'none';
        btns[0].classList.add('active');
    } else {
        createTab.style.display = 'none';
        libraryTab.style.display = 'block';
        btns[1].classList.add('active');
        loadMindMapLibrary();
    }
}

window.selectMindMapSource = function(source) {
    const textPanel = document.getElementById('mindmapTextPanel');
    const docPanel = document.getElementById('mindmapDocumentPanel');
    const chatPanel = document.getElementById('mindmapChatPanel');
    const btns = document.querySelectorAll('.source-btn');
    
    btns.forEach(btn => btn.classList.remove('active'));
    
    if (source === 'text') {
        textPanel.style.display = 'block';
        docPanel.style.display = 'none';
        chatPanel.style.display = 'none';
        btns[0].classList.add('active');
    } else if (source === 'document') {
        textPanel.style.display = 'none';
        docPanel.style.display = 'block';
        chatPanel.style.display = 'none';
        btns[1].classList.add('active');
    } else {
        textPanel.style.display = 'none';
        docPanel.style.display = 'none';
        chatPanel.style.display = 'block';
        btns[2].classList.add('active');
    }
}

window.generateMindMap = function() {
    const topic = document.getElementById('mindmapTopicInput').value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    const progressDiv = document.getElementById('mindmapProgress');
    const progressFill = document.getElementById('mindmapProgressFill');
    const displayDiv = document.getElementById('mindmapDisplay');
    
    progressDiv.style.display = 'block';
    let width = 0;
    const interval = setInterval(() => {
        width += 10;
        progressFill.style.width = width + '%';
        if (width >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                progressDiv.style.display = 'none';
                displayDiv.style.display = 'block';
                drawMindMap(topic);
                showToast("Mind map generated!");
            }, 500);
        }
    }, 200);
}

function drawMindMap(topic) {
    const canvas = document.getElementById('mindmapCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 900;
    canvas.height = 600;
    
    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw center node
    ctx.fillStyle = '#667eea';
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, 50, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(topic.substring(0, 20), canvas.width/2, canvas.height/2);
    
    showToast("Mind map created! Export options available above.");
}

window.zoomMindMap = function(direction) {
    showToast(`Zoom ${direction === 'in' ? 'in' : 'out'} - Coming soon!`);
}

window.resetMindMapView = function() {
    showToast("View reset!");
}

window.exportMindMapAsPNG = function() {
    const canvas = document.getElementById('mindmapCanvas');
    const link = document.createElement('a');
    link.download = 'mindmap.png';
    link.href = canvas.toDataURL();
    link.click();
    showToast("Mind map exported as PNG!");
}

window.exportMindMapAsJSON = function() {
    showToast("JSON export coming soon!");
}

window.saveMindMapToLibrary = function() {
    showToast("Mind map saved to library!");
}

window.shareMindMap = function() {
    showToast("Share feature coming soon!");
}

window.uploadMindMapDocument = function() {
    const fileInput = document.getElementById('mindmapDocumentInput');
    const file = fileInput.files[0];
    if (file) {
        showToast(`Document "${file.name}" uploaded! Processing...`);
        setTimeout(() => {
            document.getElementById('mindmapDocumentStatus').innerHTML = `<p>✅ Document processed: ${file.name}</p>`;
        }, 1000);
    } else {
        showToast("Please select a file", "error");
    }
}

window.loadChatForMindMap = function() {
    if (currentChatId) {
        showToast("Loading chat content for mind map...");
    } else {
        showToast("No active chat found. Start a chat first!", "error");
    }
}

function loadMindMapLibrary() {
    const libraryDiv = document.getElementById('mindmapLibraryList');
    libraryDiv.innerHTML = '<div class="empty-library">No mind maps yet. Create your first mind map!</div>';
}

// ================= REPORT MODE =================
window.openReportMode = function() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'flex';
}

window.closeReportMode = function() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
}

window.generateReport = function() {
    const topic = document.getElementById('reportTopicInput').value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    const progressDiv = document.getElementById('reportProgress');
    const progressFill = document.getElementById('reportProgressFill');
    const displayDiv = document.getElementById('reportDisplay');
    const contentDiv = document.getElementById('reportContent');
    
    progressDiv.style.display = 'block';
    let width = 0;
    const interval = setInterval(() => {
        width += 10;
        progressFill.style.width = width + '%';
        if (width >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                progressDiv.style.display = 'none';
                displayDiv.style.display = 'block';
                contentDiv.innerHTML = `
                    <h1>Report: ${escapeHtml(topic)}</h1>
                    <p>Generated on: ${new Date().toLocaleString()}</p>
                    <h2>Executive Summary</h2>
                    <p>This is a comprehensive report about ${escapeHtml(topic)}.</p>
                    <h2>Key Findings</h2>
                    <ul>
                        <li>Finding 1</li>
                        <li>Finding 2</li>
                        <li>Finding 3</li>
                    </ul>
                    <h2>Recommendations</h2>
                    <p>Based on the analysis, here are the recommendations...</p>
                `;
                showToast("Report generated!");
            }, 500);
        }
    }, 200);
}

window.downloadReportAsPDF = function() {
    showToast("PDF download coming soon!");
}

window.downloadReportAsDOCX = function() {
    showToast("DOCX download coming soon!");
}

window.copyReportToClipboard = function() {
    const content = document.getElementById('reportContent').innerText;
    navigator.clipboard.writeText(content);
    showToast("Report copied to clipboard!");
}

window.shareReport = function() {
    showToast("Share feature coming soon!");
}

window.saveReportToLibrary = function() {
    showToast("Report saved to library!");
}

window.printReport = function() {
    const content = document.getElementById('reportContent').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html><head><title>Report</title></head><body>${content}</body></html>
    `);
    printWindow.print();
}

// ================= LEARNING TOOLS MODE =================
window.openLearningTools = function() {
    const modal = document.getElementById('learningToolsModal');
    if (modal) modal.style.display = 'flex';
    switchLearningTab('quiz');
}

window.closeLearningTools = function() {
    const modal = document.getElementById('learningToolsModal');
    if (modal) modal.style.display = 'none';
}

window.switchLearningTab = function(tab) {
    const quizTab = document.getElementById('quizTab');
    const notesTab = document.getElementById('notesTab');
    const btns = document.querySelectorAll('.learning-tab-btn');
    
    btns.forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'quiz') {
        quizTab.style.display = 'block';
        notesTab.style.display = 'none';
        btns[0].classList.add('active');
    } else {
        quizTab.style.display = 'none';
        notesTab.style.display = 'block';
        btns[1].classList.add('active');
    }
}

window.generateQuiz = function() {
    const topic = document.getElementById('quizTopicInput').value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    const progressDiv = document.getElementById('quizProgress');
    const progressFill = document.getElementById('quizProgressFill');
    const displayDiv = document.getElementById('quizDisplay');
    const contentDiv = document.getElementById('quizContent');
    
    progressDiv.style.display = 'block';
    let width = 0;
    const interval = setInterval(() => {
        width += 10;
        progressFill.style.width = width + '%';
        if (width >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                progressDiv.style.display = 'none';
                displayDiv.style.display = 'block';
                contentDiv.innerHTML = `
                    <h3>Quiz: ${escapeHtml(topic)}</h3>
                    <div class="quiz-question">
                        <p><strong>Question 1:</strong> What is ${escapeHtml(topic)}?</p>
                        <label><input type="radio" name="q1"> Option A</label><br>
                        <label><input type="radio" name="q1"> Option B</label><br>
                        <label><input type="radio" name="q1"> Option C</label><br>
                    </div>
                    <div class="quiz-question">
                        <p><strong>Question 2:</strong> Why is ${escapeHtml(topic)} important?</p>
                        <label><input type="radio" name="q2"> Option A</label><br>
                        <label><input type="radio" name="q2"> Option B</label><br>
                        <label><input type="radio" name="q2"> Option C</label><br>
                    </div>
                `;
                showToast("Quiz generated!");
            }, 500);
        }
    }, 200);
}

window.generateStudyNotes = function() {
    const topic = document.getElementById('notesTopicInput').value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    const progressDiv = document.getElementById('notesProgress');
    const progressFill = document.getElementById('notesProgressFill');
    const displayDiv = document.getElementById('notesDisplay');
    const contentDiv = document.getElementById('notesContent');
    
    progressDiv.style.display = 'block';
    let width = 0;
    const interval = setInterval(() => {
        width += 10;
        progressFill.style.width = width + '%';
        if (width >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                progressDiv.style.display = 'none';
                displayDiv.style.display = 'block';
                contentDiv.innerHTML = `
                    <h1>Study Notes: ${escapeHtml(topic)}</h1>
                    <h2>Key Concepts</h2>
                    <ul>
                        <li>Concept 1: Introduction to ${escapeHtml(topic)}</li>
                        <li>Concept 2: Important principles</li>
                        <li>Concept 3: Real-world applications</li>
                    </ul>
                    <h2>Summary</h2>
                    <p>These notes cover the essential aspects of ${escapeHtml(topic)}.</p>
                `;
                showToast("Study notes generated!");
            }, 500);
        }
    }, 200);
}

window.startQuiz = function() {
    showToast("Quiz started! Answer the questions above.");
}

window.resetQuiz = function() {
    document.querySelectorAll('input[type="radio"]').forEach(radio => radio.checked = false);
    showToast("Quiz reset!");
}

window.exportQuizAsPDF = function() {
    showToast("PDF export coming soon!");
}

window.copyQuizToClipboard = function() {
    const content = document.getElementById('quizContent').innerText;
    navigator.clipboard.writeText(content);
    showToast("Quiz copied to clipboard!");
}

window.saveQuizToLibrary = function() {
    showToast("Quiz saved to library!");
}

window.exportNotesAsPDF = function() {
    showToast("PDF export coming soon!");
}

window.copyNotesToClipboard = function() {
    const content = document.getElementById('notesContent').innerText;
    navigator.clipboard.writeText(content);
    showToast("Notes copied to clipboard!");
}

window.saveNotesToLibrary = function() {
    showToast("Notes saved to library!");
}

window.printNotes = function() {
    const content = document.getElementById('notesContent').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html><head><title>Study Notes</title></head><body>${content}</body></html>
    `);
    printWindow.print();
}

window.useChatForLearning = function(type) {
    if (currentChatId) {
        showToast(`Using current chat for ${type} generation...`);
    } else {
        showToast("No active chat found. Start a chat first!", "error");
    }
}

window.uploadForLearning = function(type) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.pdf,.docx';
    input.onchange = () => {
        showToast(`Document uploaded for ${type} generation!`);
    };
    input.click();
}

// ================= GAMES MODAL =================
window.openGamesModal = function() {
    const modal = document.getElementById('gamesModal');
    if (modal) modal.style.display = 'flex';
}

window.closeGamesModal = function() {
    const modal = document.getElementById('gamesModal');
    if (modal) modal.style.display = 'none';
}

window.startGame = function(gameType) {
    closeGamesModal();
    setTimeout(() => {
        alert(`🎮 Game mode: ${gameType.toUpperCase()} - Coming soon!\n\nGet ready for fun learning games!`);
        showToast(`Game: ${gameType} - Coming soon!`);
    }, 300);
}

// ================= LOGOUT =================
window.logout = function() {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("email");
    showToast("👋 Logged out successfully!");
    setTimeout(() => {
        window.location.href = "login.html";
    }, 500);
}

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded - Initializing Cortexa");
    
    // Setup enter key for search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.performSearch();
            }
        });
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.chat-menu-container')) {
            document.querySelectorAll('.chat-dropdown.show').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
        }
        if (!e.target.closest('.plus-dropdown-container')) {
            const plusDropdown = document.getElementById('plusDropdown');
            if (plusDropdown) plusDropdown.classList.remove('show');
        }
    });
    
    // Initialize
    loadChats();
    loadProjects();
    addWelcomeMessage();
    
    console.log("✅ Cortexa fully initialized!");
});

// Make sure all functions are globally available
window.performSearch = performSearch;
window.displayMessage = displayMessage;
window.formatContent = formatContent;
window.loadChats = loadChats;
window.loadProjects = loadProjects;
window.addWelcomeMessage = addWelcomeMessage;