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
let currentAudioText = null;

// API URL - CHANGE THIS FOR PRODUCTION
const API_URL = "https://cortexa-2-2ydr.onrender.com/chat";

// ================= USER-SPECIFIC STORAGE =================
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
        updateMessage(loadingId, `⚠️ Error connecting to AI. Make sure backend is running\n\nDetails: ${error.message}`);
    }
}

// ================= SAVE CHAT =================
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

// ================= LOAD PROJECTS =================
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

// ================= CHAT MANAGEMENT =================
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
        const audioResponse = await fetch('https://cortexa-2-2ydr.onrender.com/generate-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: data.response })
        });
        const audioData = await audioResponse.json();
        
        if (audioData.audio_url) {
            const audioPlayer = document.getElementById('audioPlayer');
            audioPlayer.src = `https://cortexa-2-2ydr.onrender.com${audioData.audio_url}`;
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

// ================= VIDEO MODE (FULL FEATURED) =================
window.openVideoMode = function() {
    const modal = document.getElementById('videoModal');
    if (modal) modal.style.display = 'flex';
    switchVideoTab('youtube');
}

window.closeVideoMode = function() {
    const modal = document.getElementById('videoModal');
    if (modal) modal.style.display = 'none';
    // Clear results when closing
    const youtubeResults = document.getElementById('youtubeResults');
    const youtubeVideoInfo = document.getElementById('youtubeVideoInfo');
    const youtubeOptions = document.getElementById('youtubeOptions');
    if (youtubeResults) youtubeResults.innerHTML = '';
    if (youtubeVideoInfo) youtubeVideoInfo.style.display = 'none';
    if (youtubeOptions) youtubeOptions.style.display = 'none';
}

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
    if (!resultsDiv) return;
    
    resultsDiv.innerHTML = '<div class="loading-spinner">🔍 Searching for videos...</div>';
    
    try {
        const response = await fetch(`https://cortexa-2-2ydr.onrender.com/youtube-search?query=${encodeURIComponent(query)}&max_results=12`);
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
                <p>Click on any video to get AI summary</p>
            </div>
            <div class="youtube-grid">
                ${data.videos.map(video => `
                    <div class="video-card">
                        <div class="video-thumbnail">
                            <img src="${video.thumbnail}" alt="${escapeHtml(video.title)}">
                            <div class="video-duration">${video.duration || 'N/A'}</div>
                        </div>
                        <div class="video-details">
                            <h4 class="video-title">${escapeHtml(video.title.substring(0, 70))}</h4>
                            <p class="video-channel">${escapeHtml(video.channel)}</p>
                            <p class="video-stats">👁️ ${video.views || 'N/A'} views</p>
                            <button class="play-youtube-btn" onclick="getVideoInfoAndSummary('${video.id}', '${escapeHtml(video.title)}')">
                                🤖 Get AI Summary
                            </button>
                            <button class="watch-btn" onclick="openInYouTube('${video.id}')">
                                ▶️ Watch on YouTube
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

// Get video info and generate AI summary
window.getVideoInfoAndSummary = async function(videoId, videoTitle) {
    showToast("📹 Getting video information and generating AI summary...");
    
    const infoDiv = document.getElementById('youtubeVideoInfo');
    if (!infoDiv) return;
    
    infoDiv.style.display = 'block';
    infoDiv.innerHTML = '<div class="loading-spinner">🧠 Analyzing video content...</div>';
    
    try {
        // First get video info
        const infoResponse = await fetch(`https://cortexa-2-2ydr.onrender.com/youtube-video-info?videoid=${videoId}`);
        const videoInfo = await infoResponse.json();
        
        if (videoInfo.error) {
            infoDiv.innerHTML = `<div class="error-message">❌ ${videoInfo.error}</div>`;
            return;
        }
        
        // Generate AI summary using chat API
        const summaryPrompt = `Please provide a comprehensive summary of this YouTube video:
        
Title: ${videoTitle || videoInfo.title}
Channel: ${videoInfo.channel || 'Unknown'}
Description: ${videoInfo.description || 'No description available'}

Please provide:
1. Main topic/theme of the video
2. 5-7 key points covered
3. Important takeaways
4. Who should watch this video
5. A brief one-paragraph summary

Format the response in a clean, organized way with emojis for each section.`;

        const summaryResponse = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: summaryPrompt,
                document_content: null,
                audio: false
            })
        });
        
        const summaryData = await summaryResponse.json();
        const aiSummary = summaryData.response || "Summary generation failed. Please try again.";
        
        infoDiv.innerHTML = `
            <div class="video-detail-card">
                <div class="video-detail-header">
                    <h3>✅ ${escapeHtml(videoInfo.title || videoTitle)}</h3>
                    <button class="close-video-info" onclick="closeVideoInfo()">✖</button>
                </div>
                <div class="video-detail-content">
                    <p><strong>📺 Channel:</strong> ${escapeHtml(videoInfo.channel || 'N/A')}</p>
                    <p><strong>👁️ Views:</strong> ${parseInt(videoInfo.views || 0).toLocaleString()}</p>
                    <p><strong>👍 Likes:</strong> ${parseInt(videoInfo.likes || 0).toLocaleString()}</p>
                    <p><strong>⏱️ Duration:</strong> ${videoInfo.duration || 'N/A'}</p>
                    
                    <div class="ai-summary-section">
                        <h4>🤖 AI GENERATED SUMMARY</h4>
                        <div class="summary-text">${formatContent(aiSummary)}</div>
                    </div>
                    
                    <details>
                        <summary>📝 Video Description</summary>
                        <p class="video-description">${escapeHtml((videoInfo.description || 'No description').substring(0, 1000))}</p>
                    </details>
                    
                    <div class="video-action-buttons">
                        <button class="watch-btn" onclick="openInYouTube('${videoId}')">
                            🎬 Watch on YouTube
                        </button>
                        <button class="summary-btn" onclick="copySummaryToClipboard()">
                            📋 Copy Summary
                        </button>
                        <button class="summary-btn" onclick="downloadSummaryAsFile()">
                            💾 Download Summary
                        </button>
                        <button class="summary-btn" onclick="saveVideoToLibrary('${videoId}', '${escapeHtml(videoInfo.title || videoTitle)}')">
                            💾 Save to Library
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('youtubeOptions').style.display = 'block';
        showToast("✅ AI Summary generated successfully!");
        
    } catch (error) {
        console.error('Error:', error);
        infoDiv.innerHTML = '<div class="error-message">❌ Error generating summary. Please try again.</div>';
        showToast("Error generating summary", "error");
    }
}

window.closeVideoInfo = function() {
    const infoDiv = document.getElementById('youtubeVideoInfo');
    if (infoDiv) infoDiv.style.display = 'none';
}

// Open video in YouTube
window.openInYouTube = function(videoId) {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    window.open(youtubeUrl, '_blank');
    showToast("📺 Opening YouTube in new tab...");
}

// Copy summary to clipboard
window.copySummaryToClipboard = function() {
    const summaryText = document.querySelector('.summary-text')?.innerText;
    if (summaryText) {
        navigator.clipboard.writeText(summaryText);
        showToast("📋 Summary copied to clipboard!");
    } else {
        showToast("No summary to copy", "error");
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
    } else {
        showToast("No summary to download", "error");
    }
}

// Save video to library
window.saveVideoToLibrary = function(videoId, videoTitle) {
    const user = getCurrentUser();
    const savedVideos = JSON.parse(localStorage.getItem(`videos_${user}`) || '[]');
    
    if (!savedVideos.some(v => v.id === videoId)) {
        const newVideo = {
            id: videoId,
            title: videoTitle,
            url: `https://youtube.com/watch?v=${videoId}`,
            date: new Date().toLocaleString(),
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
        };
        savedVideos.push(newVideo);
        localStorage.setItem(`videos_${user}`, JSON.stringify(savedVideos));
        showToast("💾 Video saved to library!");
        loadVideoLibrary();
    } else {
        showToast("Video already in library!");
    }
}

// Load video library
function loadVideoLibrary() {
    const user = getCurrentUser();
    const libraryDiv = document.getElementById('videoLibraryList');
    if (!libraryDiv) return;
    
    const savedVideos = JSON.parse(localStorage.getItem(`videos_${user}`) || '[]');
    
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
                        <button class="library-play-btn" onclick="getVideoInfoAndSummary('${video.id}', '${escapeHtml(video.title)}')">
                            🤖 Get AI Summary
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

window.removeFromLibrary = function(videoId) {
    const user = getCurrentUser();
    let savedVideos = JSON.parse(localStorage.getItem(`videos_${user}`) || '[]');
    savedVideos = savedVideos.filter(v => v.id !== videoId);
    localStorage.setItem(`videos_${user}`, JSON.stringify(savedVideos));
    loadVideoLibrary();
    showToast("🗑️ Video removed from library");
}

// ================= COMPLETE FIXED MIND MAP - WORKING VERSION =================

// Global variables
let currentMindMapData = null;
let mindMapZoom = 1;
let mindMapOffsetX = 0;
let mindMapOffsetY = 0;
let isDraggingMindMap = false;
let dragStartX = 0;
let dragStartY = 0;

// ================= OPEN/CLOSE MODAL FUNCTIONS =================
window.openMindMapMode = function() {
    console.log("Opening Mind Map Modal");
    const modal = document.getElementById('mindMapModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.95)';
        modal.style.zIndex = '100000';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
    }
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
        if (createTab) createTab.style.display = 'block';
        if (libraryTab) libraryTab.style.display = 'none';
        if (btns[0]) btns[0].classList.add('active');
    } else {
        if (createTab) createTab.style.display = 'none';
        if (libraryTab) libraryTab.style.display = 'block';
        if (btns[1]) btns[1].classList.add('active');
        loadMindMapLibrary();
    }
}

// ================= GENERATE AND DRAW MIND MAP =================
window.generateAndDrawMindMap = function() {
    const topic = document.getElementById('mindmapTopicInput').value;
    if (!topic) {
        showMindMapToast("Please enter a topic", "error");
        return;
    }
    
    const progressDiv = document.getElementById('mindmapProgress');
    const progressFill = document.getElementById('mindmapProgressFill');
    const progressStatus = document.getElementById('mindmapProgressStatus');
    const displayDiv = document.getElementById('mindmapDisplay');
    
    if (progressDiv) {
        progressDiv.style.display = 'block';
        if (progressFill) progressFill.style.width = '0%';
        if (progressStatus) progressStatus.textContent = 'Generating mind map...';
    }
    
    let width = 0;
    const interval = setInterval(() => {
        width += 10;
        if (progressFill) progressFill.style.width = width + '%';
        if (width >= 100) clearInterval(interval);
    }, 150);
    
    setTimeout(() => {
        clearInterval(interval);
        if (progressFill) progressFill.style.width = '100%';
        
        setTimeout(() => {
            if (progressDiv) progressDiv.style.display = 'none';
            if (displayDiv) displayDiv.style.display = 'block';
            
            const mindMapData = generateSimpleMindMap(topic);
            
            currentMindMapData = {
                id: Date.now(),
                title: mindMapData.main,
                data: mindMapData,
                created_at: new Date().toISOString()
            };
            
            drawSimpleMindMap(mindMapData);
            showMindMapToast("✅ Mind map generated successfully!");
            
        }, 500);
    }, 2000);
}

// ================= GENERATE MIND MAP DATA =================
function generateSimpleMindMap(topic) {
    const lowerTopic = topic.toLowerCase();
    
    // Pre-defined mind maps with CORRECT hierarchical structure
    const mindMaps = {
        'machine learning': {
            main: 'Machine Learning',
            children: [
                { name: 'Definition', expanded: true, children: [
                    { name: 'Subset of Artificial Intelligence', children: [] },
                    { name: 'Learn from data without explicit programming', children: [] },
                    { name: 'Improves with experience', children: [] }
                ]},
                { name: 'Types of Learning', expanded: true, children: [
                    { name: 'Supervised Learning', children: [
                        { name: 'Labeled data', children: [] },
                        { name: 'Classification', children: [] },
                        { name: 'Regression', children: [] }
                    ] },
                    { name: 'Unsupervised Learning', children: [
                        { name: 'Unlabeled data', children: [] },
                        { name: 'Clustering', children: [] },
                        { name: 'Association', children: [] }
                    ] },
                    { name: 'Reinforcement Learning', children: [
                        { name: 'Reward-based', children: [] },
                        { name: 'Agent & Environment', children: [] }
                    ] }
                ]},
                { name: 'Applications', expanded: true, children: [
                    { name: 'Recommendation Systems', children: [] },
                    { name: 'Fraud Detection', children: [] },
                    { name: 'Speech Recognition', children: [] },
                    { name: 'Self-driving Cars', children: [] },
                    { name: 'Healthcare Diagnostics', children: [] }
                ]},
                { name: 'Challenges', expanded: true, children: [
                    { name: 'Data Privacy', children: [] },
                    { name: 'Bias in Algorithms', children: [] },
                    { name: 'High Computational Requirements', children: [] }
                ]}
            ]
        },
        'turing machine': {
            main: 'Turing Machine (Unit-5)',
            children: [
                { name: 'Introduction', expanded: true, children: [
                    { name: 'Alan Turing (1936)', children: [] },
                    { name: 'Theoretical model of computation', children: [] },
                    { name: 'Comparison of Automata', children: [] }
                ]},
                { name: 'TM Components', expanded: true, children: [
                    { name: 'Q: Finite set of states', children: [] },
                    { name: 'Σ: Input alphabet', children: [] },
                    { name: 'Γ: Tape alphabet', children: [] },
                    { name: 'δ: Transition function', children: [] },
                    { name: 'q₀: Start state', children: [] },
                    { name: 'B: Blank symbol', children: [] },
                    { name: 'F: Final states', children: [] }
                ]},
                { name: 'Operations', expanded: true, children: [
                    { name: 'Read symbol', children: [] },
                    { name: 'Write/Modify symbol', children: [] },
                    { name: 'Shift Head (Left/Right/Stay)', children: [] }
                ]},
                { name: 'Formal Definition', expanded: false, children: [
                    { name: '(Q, Σ, Γ, δ, q₀, B, F) - 7-tuple', children: [] }
                ]},
                { name: 'Universal Turing Machine', expanded: false, children: [
                    { name: 'Simulates any Turing Machine', children: [] }
                ]}
            ]
        }
    };
    
    for (const [key, value] of Object.entries(mindMaps)) {
        if (lowerTopic.includes(key)) {
            return JSON.parse(JSON.stringify(value));
        }
    }
    
    // Dynamic mind map for other topics
    return {
        main: topic.substring(0, 50),
        children: [
            { name: 'Introduction', expanded: true, children: [{ name: 'Basic concepts', children: [] }] },
            { name: 'Key Concepts', expanded: true, children: [{ name: 'Main ideas', children: [] }] },
            { name: 'Applications', expanded: true, children: [{ name: 'Real-world uses', children: [] }] },
            { name: 'Conclusion', expanded: false, children: [{ name: 'Summary', children: [] }] }
        ]
    };
}

function countNodes(node) {
    let count = 1;
    if (node.expanded && node.children) {
        for (const child of node.children) {
            count += countNodes(child);
        }
    }
    return count;
}

// ================= DRAW MIND MAP - VERTICAL TREE STYLE =================

function calculateNodePositions(node, nodes, x, y, level, levelWidths) {
    node.x = x;
    node.y = y;
    node.level = level;
    nodes.push(node);
    
    if (!node.expanded || !node.children || node.children.length === 0) return;
    
    const childStartY = y + 70;
    const totalChildren = node.children.length;
    const levelWidth = levelWidths[level + 1] || 600;
    const startX = x - (levelWidth / 2);
    const stepX = levelWidth / (totalChildren + 1);
    
    for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const childX = startX + stepX * (i + 1);
        const childY = childStartY;
        
        calculateNodePositions(child, nodes, childX, childY, level + 1, levelWidths);
    }
}

function drawNodeBox(ctx, node) {
    const isRoot = node.level === 0;
    const hasChildren = node.children && node.children.length > 0;
    
    ctx.font = isRoot ? 'bold 15px Arial' : '13px Arial';
    const textWidth = ctx.measureText(node.name).width;
    const boxWidth = Math.min(Math.max(170, textWidth + 60), 280);
    const boxHeight = isRoot ? 48 : 42;
    
    // Draw box
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(node.x - boxWidth/2, node.y - boxHeight/2, boxWidth, boxHeight);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.strokeRect(node.x - boxWidth/2, node.y - boxHeight/2, boxWidth, boxHeight);
    
    // Expand/collapse button
    if (hasChildren) {
        const btnX = node.x + boxWidth/2 - 18;
        const btnY = node.y;
        
        ctx.fillStyle = '#666666';
        ctx.beginPath();
        ctx.arc(btnX, btnY, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.expanded ? '−' : '+', btnX, btnY);
    }
    
    // Draw text
    ctx.fillStyle = '#000000';
    ctx.font = isRoot ? 'bold 14px Arial' : '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let displayName = node.name;
    const maxWidth = boxWidth - 50;
    if (ctx.measureText(displayName).width > maxWidth) {
        while (ctx.measureText(displayName + '...').width > maxWidth && displayName.length > 4) {
            displayName = displayName.slice(0, -1);
        }
        displayName += '...';
    }
    ctx.fillText(displayName, node.x, node.y);
}

function drawSimpleMindMap(data) {
    const canvas = document.getElementById('mindmapCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Calculate canvas size based on node count
    const rootNode = { expanded: true, children: data.children };
    const totalNodes = countNodes(rootNode);
    const maxDepth = getMaxDepth(rootNode);
    
    canvas.width = Math.max(1200, totalNodes * 100);
    canvas.height = Math.max(800, (maxDepth + 1) * 85);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw light grid
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }
    
    // Calculate level widths
    const levelWidths = {};
    for (let i = 0; i <= maxDepth; i++) {
        levelWidths[i] = Math.max(400, canvas.width - (i * 150));
    }
    
    const root = {
        name: data.main,
        children: data.children,
        x: canvas.width / 2,
        y: 50,
        level: 0,
        expanded: true,
        parent: null
    };
    
    const nodes = [];
    calculateNodePositions(root, nodes, root.x, root.y, 0, levelWidths);
    
    // Set parent references
    for (let i = 0; i < nodes.length; i++) {
        for (let j = 0; j < nodes.length; j++) {
            if (nodes[j].level === nodes[i].level + 1 && 
                Math.abs(nodes[j].x - nodes[i].x) < 200 && 
                nodes[j].y > nodes[i].y) {
                nodes[j].parent = nodes[i];
                break;
            }
        }
    }
    
    // Draw lines
    for (const node of nodes) {
        if (node.parent) {
            ctx.beginPath();
            ctx.moveTo(node.parent.x, node.parent.y + 24);
            ctx.lineTo(node.x, node.y - 21);
            ctx.strokeStyle = '#555555';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
    
    // Draw horizontal lines between siblings
    const siblingsByParent = {};
    for (const node of nodes) {
        if (node.parent) {
            const parentId = node.parent.name;
            if (!siblingsByParent[parentId]) siblingsByParent[parentId] = [];
            siblingsByParent[parentId].push(node);
        }
    }
    
    for (const siblings of Object.values(siblingsByParent)) {
        if (siblings.length > 1) {
            const firstX = siblings[0].x;
            const lastX = siblings[siblings.length - 1].x;
            const y = siblings[0].y;
            
            ctx.beginPath();
            ctx.moveTo(firstX, y);
            ctx.lineTo(lastX, y);
            ctx.strokeStyle = '#aaaaaa';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }
    
    // Draw nodes
    for (const node of nodes) {
        drawNodeBox(ctx, node);
    }
    
    // Footer
    ctx.fillStyle = '#cccccc';
    ctx.font = '10px Arial';
    ctx.fillText('Cortexa AI Mind Map', canvas.width - 120, canvas.height - 12);
    
    window.mindMapNodes = nodes;
}

function getMaxDepth(node, currentDepth = 1) {
    if (!node.expanded || !node.children || node.children.length === 0) {
        return currentDepth;
    }
    let maxDepth = currentDepth;
    for (const child of node.children) {
        const childDepth = getMaxDepth(child, currentDepth + 1);
        maxDepth = Math.max(maxDepth, childDepth);
    }
    return maxDepth;
}

// ================= CLICK HANDLER =================
function setupCanvasClick() {
    const canvas = document.getElementById('mindmapCanvas');
    if (!canvas) return;
    
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;
        
        if (window.mindMapNodes) {
            for (const node of window.mindMapNodes) {
                const ctx = canvas.getContext('2d');
                ctx.font = node.level === 0 ? 'bold 15px Arial' : '13px Arial';
                const textWidth = ctx.measureText(node.name).width;
                const boxWidth = Math.min(Math.max(170, textWidth + 60), 280);
                const boxHeight = node.level === 0 ? 48 : 42;
                
                const left = node.x - boxWidth/2;
                const right = node.x + boxWidth/2;
                const top = node.y - boxHeight/2;
                const bottom = node.y + boxHeight/2;
                
                if (mouseX >= left && mouseX <= right && mouseY >= top && mouseY <= bottom) {
                    if (node.children && node.children.length > 0) {
                        const btnX = node.x + boxWidth/2 - 18;
                        const btnY = node.y;
                        const isOnButton = Math.hypot(mouseX - btnX, mouseY - btnY) <= 12;
                        
                        if (isOnButton) {
                            node.expanded = !node.expanded;
                            if (currentMindMapData) {
                                drawSimpleMindMap(currentMindMapData.data);
                            }
                        }
                    }
                    break;
                }
            }
        }
    });
}

// ================= ZOOM & PAN CONTROLS =================
function applyMindMapZoom() {
    const canvas = document.getElementById('mindmapCanvas');
    if (canvas) {
        canvas.style.transform = `scale(${mindMapZoom}) translate(${mindMapOffsetX}px, ${mindMapOffsetY}px)`;
        canvas.style.transformOrigin = 'top left';
        canvas.style.transition = 'transform 0.2s ease';
    }
}

window.zoomMindMap = function(direction) {
    if (direction === 'in') {
        mindMapZoom = Math.min(mindMapZoom + 0.1, 2);
    } else {
        mindMapZoom = Math.max(mindMapZoom - 0.1, 0.5);
    }
    applyMindMapZoom();
    showMindMapToast(`Zoom ${direction === 'in' ? 'in' : 'out'} to ${Math.round(mindMapZoom * 100)}%`);
}

window.resetMindMapView = function() {
    mindMapZoom = 1;
    mindMapOffsetX = 0;
    mindMapOffsetY = 0;
    applyMindMapZoom();
    showMindMapToast('View reset to original size');
}

window.exportMindMapAsPNG = function() {
    const canvas = document.getElementById('mindmapCanvas');
    if (canvas) {
        const link = document.createElement('a');
        link.download = `mindmap_${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
        showMindMapToast('✅ Mind map exported as PNG!');
    }
}

window.exportMindMapAsJSON = function() {
    if (currentMindMapData) {
        const blob = new Blob([JSON.stringify(currentMindMapData, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `mindmap_${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
        showMindMapToast('✅ Mind map exported as JSON!');
    } else {
        showMindMapToast('No mind map to export!', 'error');
    }
}

window.saveMindMapToLibrary = function() {
    if (currentMindMapData) {
        let mindMaps = JSON.parse(localStorage.getItem('mindMaps')) || [];
        const existingIndex = mindMaps.findIndex(m => m.id === currentMindMapData.id);
        if (existingIndex !== -1) {
            mindMaps[existingIndex] = currentMindMapData;
        } else {
            mindMaps.unshift(currentMindMapData);
        }
        localStorage.setItem('mindMaps', JSON.stringify(mindMaps));
        showMindMapToast('✅ Mind map saved to library!');
        loadMindMapLibrary();
    } else {
        showMindMapToast('No mind map to save!', 'error');
    }
}

window.shareMindMap = function() {
    if (currentMindMapData) {
        navigator.clipboard.writeText(`🧠 Mind Map: ${currentMindMapData.title}\nCreated: ${currentMindMapData.created_at}\n\nGenerated by Cortexa AI`);
        showMindMapToast('✅ Mind map info copied to clipboard!');
    } else {
        showMindMapToast('No mind map to share!', 'error');
    }
}

// ================= LIBRARY FUNCTIONS =================
function loadMindMapLibrary() {
    const mindMaps = JSON.parse(localStorage.getItem('mindMaps')) || [];
    const libraryDiv = document.getElementById('mindmapLibraryList');
    if (!libraryDiv) return;
    
    if (mindMaps.length === 0) {
        libraryDiv.innerHTML = '<div class="empty-library">🧠 No mind maps yet. Create your first mind map!</div>';
        return;
    }
    
    libraryDiv.innerHTML = '';
    mindMaps.forEach(mindMap => {
        const date = new Date(mindMap.created_at).toLocaleString();
        libraryDiv.innerHTML += `
            <div class="mindmap-library-item">
                <div class="library-info">
                    <strong>🧠 ${escapeHtml(mindMap.title)}</strong>
                    <small>📅 ${date}</small>
                </div>
                <div class="library-buttons">
                    <button onclick="loadMindMapFromLibrary(${mindMap.id})">👁️ Load</button>
                    <button onclick="deleteMindMapFromLibrary(${mindMap.id})">🗑️ Delete</button>
                </div>
            </div>
        `;
    });
}

window.loadMindMapFromLibrary = function(id) {
    const mindMaps = JSON.parse(localStorage.getItem('mindMaps')) || [];
    const mindMap = mindMaps.find(m => m.id === id);
    if (mindMap) {
        currentMindMapData = mindMap;
        document.getElementById('mindmapDisplay').style.display = 'block';
        drawSimpleMindMap(mindMap.data);
        showMindMapToast(`📂 Loaded: ${mindMap.title}`);
    } else {
        showMindMapToast('Mind map not found!', 'error');
    }
}

window.deleteMindMapFromLibrary = function(id) {
    if (confirm('Delete this mind map permanently?')) {
        let mindMaps = JSON.parse(localStorage.getItem('mindMaps')) || [];
        mindMaps = mindMaps.filter(m => m.id !== id);
        localStorage.setItem('mindMaps', JSON.stringify(mindMaps));
        loadMindMapLibrary();
        showMindMapToast('✅ Mind map deleted');
    }
}

// ================= DRAG FUNCTIONALITY =================
function setupMindMapDrag() {
    const canvas = document.getElementById('mindmapCanvas');
    if (!canvas) return;
    
    canvas.addEventListener('mousedown', (e) => {
        isDraggingMindMap = true;
        dragStartX = e.clientX - mindMapOffsetX;
        dragStartY = e.clientY - mindMapOffsetY;
        canvas.style.cursor = 'grabbing';
    });
    
    window.addEventListener('mousemove', (e) => {
        if (isDraggingMindMap) {
            mindMapOffsetX = e.clientX - dragStartX;
            mindMapOffsetY = e.clientY - dragStartY;
            applyMindMapZoom();
        }
    });
    
    window.addEventListener('mouseup', () => {
        isDraggingMindMap = false;
        if (canvas) canvas.style.cursor = 'grab';
    });
}

// ================= UTILITIES =================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showMindMapToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? '#ef4444' : 'linear-gradient(90deg, #a855f7, #6366f1)'};
        color: white;
        padding: 10px 20px;
        border-radius: 25px;
        font-size: 14px;
        z-index: 35001;
        animation: fadeInOut 3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
        15% { opacity: 1; transform: translateX(-50%) translateY(0); }
        85% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    }
`;
document.head.appendChild(style);

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
    setupMindMapDrag();
    setupCanvasClick();
    loadMindMapLibrary();
    
    const canvas = document.getElementById('mindmapCanvas');
    if (canvas) canvas.style.cursor = 'grab';
});


// ================= REPORT MODE (FULL FEATURED) =================


window.openReportMode = function() {
    const modal = document.getElementById('reportModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.9)';
        modal.style.zIndex = '10000';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
    }
}

window.closeReportMode = function() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
}

window.generateReport = async function() {
    const topic = document.getElementById('reportTopicInput').value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    // Get format
    const format = document.getElementById('reportFormat')?.value || 'PDF Document';
    
    // Get selected report options
    const includeCharts = document.getElementById('includeCharts')?.checked || false;
    const includeTables = document.getElementById('includeTables')?.checked || false;
    const includeExecutive = document.getElementById('includeExecutive')?.checked || true;
    const includeRecommendations = document.getElementById('includeRecommendations')?.checked || true;
    const includeAppendix = document.getElementById('includeAppendix')?.checked || false;
    
    const progressDiv = document.getElementById('reportProgress');
    const progressFill = document.getElementById('reportProgressFill');
    const displayDiv = document.getElementById('reportDisplay');
    const contentDiv = document.getElementById('reportContent');
    
    if (progressDiv) {
        progressDiv.style.display = 'block';
        progressDiv.innerHTML = `
            <div class="progress-bar">
                <div id="reportProgressFill" class="progress-fill"></div>
            </div>
            <p class="generating-text">📊 Generating comprehensive report on "${topic.substring(0, 50)}"...</p>
        `;
    }
    
    let width = 0;
    const interval = setInterval(() => {
        width += 10;
        if (progressFill) progressFill.style.width = width + '%';
    }, 200);
    
    try {
        let prompt = `Generate a comprehensive, professional report about "${topic}".

The report should include:`;

        if (includeExecutive) prompt += `\n- Executive Summary`;
        prompt += `\n- Introduction`;
        prompt += `\n- Key Findings (at least 5 points with detailed explanations)`;
        prompt += `\n- Detailed Analysis`;
        if (includeCharts) prompt += `\n- Charts and Graphs Analysis (describe what charts would show)`;
        if (includeTables) prompt += `\n- Data Tables (create relevant data tables)`;
        prompt += `\n- Challenges and Opportunities`;
        if (includeRecommendations) prompt += `\n- Recommendations (at least 3 actionable recommendations)`;
        prompt += `\n- Conclusion`;
        if (includeAppendix) prompt += `\n- Appendix with References and Sources`;

        prompt += `\n\nFormat the report with proper headings (## for main sections), subheadings (### for subsections), and bullet points.
Make it professional, well-structured, data-driven, and suitable for business/academic audience.
Use markdown formatting.`;

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: prompt, document_content: null, audio: false })
        });
        
        const data = await response.json();
        let reportContent = data.response || "Failed to generate report.";
        
        // Format the report with proper HTML styling
        reportContent = reportContent.replace(/## (.*?)$/gm, '<h2>$1</h2>');
        reportContent = reportContent.replace(/### (.*?)$/gm, '<h3>$1</h3>');
        reportContent = reportContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        reportContent = reportContent.replace(/^- (.*?)$/gm, '<li>$1</li>');
        reportContent = reportContent.replace(/\n/g, '<br>');
        
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        if (displayDiv) displayDiv.style.display = 'block';
        
        // Store report data for later use
        window.currentReport = {
            topic: topic,
            content: reportContent,
            rawContent: data.response,
            format: format,
            date: new Date().toLocaleString(),
            options: { includeCharts, includeTables, includeExecutive, includeRecommendations, includeAppendix }
        };
        
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div class="report-container" id="reportContainer">
                    <div class="report-title-section">
                        <h1>📊 ${escapeHtml(topic)}</h1>
                        <div class="report-meta">
                            <span>📅 Generated: ${new Date().toLocaleString()}</span>
                            <span>📄 Format: ${format}</span>
                            <span>🤖 Generated by Cortexa AI</span>
                        </div>
                    </div>
                    <div class="report-content" id="reportContentText">
                        ${reportContent}
                    </div>
                    <div class="report-footer">
                        <p>© ${new Date().getFullYear()} Cortexa AI Report Generator - All Rights Reserved</p>
                    </div>
                </div>
            `;
        }
        
        showToast("✅ Report generated successfully!");
        
    } catch (error) {
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        console.error('Report error:', error);
        showToast("Error generating report", "error");
    }
}

// Download Report as PDF
window.downloadReportAsPDF = function() {
    const reportContainer = document.getElementById('reportContainer');
    if (!reportContainer) {
        showToast("No report to download! Generate a report first.", "error");
        return;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>${window.currentReport?.topic || 'Report'} - Cortexa AI</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Arial, sans-serif;
                        padding: 40px;
                        max-width: 900px;
                        margin: 0 auto;
                        line-height: 1.6;
                    }
                    .report-title-section {
                        text-align: center;
                        margin-bottom: 40px;
                        padding-bottom: 20px;
                        border-bottom: 2px solid #667eea;
                    }
                    .report-title-section h1 {
                        color: #667eea;
                        margin-bottom: 10px;
                    }
                    .report-meta {
                        color: #666;
                        font-size: 12px;
                    }
                    .report-content h2 {
                        color: #667eea;
                        margin-top: 30px;
                        border-left: 4px solid #667eea;
                        padding-left: 15px;
                    }
                    .report-content h3 {
                        color: #764ba2;
                        margin-top: 20px;
                    }
                    .report-content li {
                        margin: 8px 0;
                    }
                    .report-footer {
                        margin-top: 50px;
                        padding-top: 20px;
                        border-top: 1px solid #ddd;
                        text-align: center;
                        font-size: 11px;
                        color: #999;
                    }
                    button {
                        display: none;
                    }
                </style>
            </head>
            <body>
                ${reportContainer.outerHTML}
            </body>
        </html>
    `);
    printWindow.print();
    printWindow.close();
    showToast("📄 Report sent to printer (save as PDF)");
}

// Download Report as DOCX
window.downloadReportAsDOCX = function() {
    if (!window.currentReport) {
        showToast("No report to download! Generate a report first.", "error");
        return;
    }
    
    const reportContent = document.getElementById('reportContentText')?.innerText || window.currentReport.rawContent;
    if (!reportContent) {
        showToast("No content to download", "error");
        return;
    }
    
    const docContent = `
${window.currentReport.topic}
${"=".repeat(50)}

Generated on: ${window.currentReport.date}
Format: ${window.currentReport.format}

${reportContent}

${"=".repeat(50)}
Generated by Cortexa AI Report Generator
    `;
    
    const blob = new Blob([docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${window.currentReport.topic.replace(/[^a-z0-9]/gi, '_')}_report.doc`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("📄 Report downloaded as DOCX!");
}

// Copy Report to Clipboard
window.copyReportToClipboard = function() {
    if (!window.currentReport) {
        showToast("No report to copy! Generate a report first.", "error");
        return;
    }
    
    const reportText = document.getElementById('reportContentText')?.innerText || window.currentReport.rawContent;
    if (reportText) {
        navigator.clipboard.writeText(reportText).then(() => {
            showToast("📋 Report copied to clipboard!");
        }).catch(() => {
            showToast("Failed to copy", "error");
        });
    } else {
        showToast("No content to copy", "error");
    }
}

// Share Report
window.shareReport = function() {
    if (!window.currentReport) {
        showToast("No report to share! Generate a report first.", "error");
        return;
    }
    
    const shareText = `📊 Report: ${window.currentReport.topic}\n\n${(document.getElementById('reportContentText')?.innerText || window.currentReport.rawContent).substring(0, 500)}...\n\nGenerated on: ${window.currentReport.date}\n\nGenerated by Cortexa AI`;
    
    navigator.clipboard.writeText(shareText).then(() => {
        showToast("📤 Report summary copied to clipboard! You can now share it anywhere.");
    }).catch(() => {
        showToast("Failed to copy for sharing", "error");
    });
}

// Save Report to Library
window.saveReportToLibrary = function() {
    if (!window.currentReport) {
        showToast("No report to save! Generate a report first.", "error");
        return;
    }
    
    const user = getCurrentUser();
    const savedReports = JSON.parse(localStorage.getItem(`reports_${user}`) || '[]');
    
    const reportToSave = {
        id: 'report_' + Date.now(),
        title: window.currentReport.topic,
        content: window.currentReport.rawContent,
        formattedContent: window.currentReport.content,
        date: window.currentReport.date,
        format: window.currentReport.format,
        options: window.currentReport.options
    };
    
    savedReports.unshift(reportToSave);
    localStorage.setItem(`reports_${user}`, JSON.stringify(savedReports));
    
    showToast(`✅ Report "${window.currentReport.topic}" saved to library!`);
}

// Print Report
window.printReport = function() {
    const reportContainer = document.getElementById('reportContainer');
    if (!reportContainer) {
        showToast("No report to print! Generate a report first.", "error");
        return;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>${window.currentReport?.topic || 'Report'} - Cortexa AI</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Arial, sans-serif;
                        padding: 40px;
                        max-width: 900px;
                        margin: 0 auto;
                        line-height: 1.6;
                    }
                    .report-title-section {
                        text-align: center;
                        margin-bottom: 40px;
                        padding-bottom: 20px;
                        border-bottom: 2px solid #667eea;
                    }
                    .report-title-section h1 {
                        color: #667eea;
                    }
                    .report-meta {
                        color: #666;
                        font-size: 12px;
                    }
                    .report-footer {
                        margin-top: 50px;
                        padding-top: 20px;
                        border-top: 1px solid #ddd;
                        text-align: center;
                        font-size: 11px;
                    }
                    button { display: none; }
                </style>
            </head>
            <body>
                ${reportContainer.outerHTML}
            </body>
        </html>
    `);
    printWindow.print();
    printWindow.close();
    showToast("🖨️ Report sent to printer!");
}

// Load Report from Library (optional feature)
window.loadReportFromLibrary = function(reportId) {
    const user = getCurrentUser();
    const savedReports = JSON.parse(localStorage.getItem(`reports_${user}`) || '[]');
    const report = savedReports.find(r => r.id === reportId);
    
    if (report) {
        window.currentReport = {
            topic: report.title,
            content: report.formattedContent,
            rawContent: report.content,
            date: report.date,
            format: report.format,
            options: report.options
        };
        
        const contentDiv = document.getElementById('reportContent');
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div class="report-container" id="reportContainer">
                    <div class="report-title-section">
                        <h1>📊 ${escapeHtml(report.title)}</h1>
                        <div class="report-meta">
                            <span>📅 Generated: ${report.date}</span>
                            <span>📄 Format: ${report.format}</span>
                        </div>
                    </div>
                    <div class="report-content" id="reportContentText">
                        ${report.formattedContent}
                    </div>
                    <div class="report-footer">
                        <p>© ${new Date().getFullYear()} Cortexa AI Report Generator</p>
                    </div>
                </div>
            `;
        }
        
        document.getElementById('reportDisplay').style.display = 'block';
        showToast(`✅ Report "${report.title}" loaded from library!`);
    } else {
        showToast("Report not found!", "error");
    }
}

// View saved reports library
window.openReportLibrary = function() {
    const user = getCurrentUser();
    const savedReports = JSON.parse(localStorage.getItem(`reports_${user}`) || '[]');
    
    if (savedReports.length === 0) {
        showToast("No saved reports found!", "info");
        return;
    }
    
    let libraryHTML = '<div class="report-library-modal"><h3>📚 Saved Reports</h3><div class="report-list">';
    savedReports.forEach(report => {
        libraryHTML += `
            <div class="report-list-item">
                <div class="report-info">
                    <strong>${escapeHtml(report.title)}</strong>
                    <small>${report.date}</small>
                </div>
                <button onclick="loadReportFromLibrary('${report.id}')">Load</button>
            </div>
        `;
    });
    libraryHTML += '</div><button onclick="closeReportLibrary()">Close</button></div>';
    
    // Create modal for library
    let modal = document.getElementById('reportLibraryModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reportLibraryModal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 12px;
            max-width: 500px;
            width: 90%;
            z-index: 10001;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = libraryHTML;
    modal.style.display = 'block';
}

window.closeReportLibrary = function() {
    const modal = document.getElementById('reportLibraryModal');
    if (modal) modal.style.display = 'none';
}
window.closeReportMode = function() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
}

window.generateReport = async function() {
    const topic = document.getElementById('reportTopicInput').value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    // Get selected report options
    const includeCharts = document.getElementById('includeCharts')?.checked || false;
    const includeTables = document.getElementById('includeTables')?.checked || false;
    const includeExecutive = document.getElementById('includeExecutive')?.checked || true;
    const includeRecommendations = document.getElementById('includeRecommendations')?.checked || true;
    const includeAppendix = document.getElementById('includeAppendix')?.checked || false;
    
    const progressDiv = document.getElementById('reportProgress');
    const progressFill = document.getElementById('reportProgressFill');
    const displayDiv = document.getElementById('reportDisplay');
    const contentDiv = document.getElementById('reportContent');
    
    if (progressDiv) progressDiv.style.display = 'block';
    let width = 0;
    const interval = setInterval(() => {
        width += 10;
        if (progressFill) progressFill.style.width = width + '%';
    }, 200);
    
    try {
        let prompt = `Generate a comprehensive, professional report about "${topic}".

The report should include:`;

        if (includeExecutive) prompt += `\n- Executive Summary`;
        prompt += `\n- Introduction`;
        prompt += `\n- Key Findings (at least 5 points)`;
        prompt += `\n- Detailed Analysis`;
        if (includeCharts) prompt += `\n- Charts and Graphs Analysis`;
        if (includeTables) prompt += `\n- Data Tables`;
        prompt += `\n- Challenges and Opportunities`;
        if (includeRecommendations) prompt += `\n- Recommendations (at least 3)`;
        prompt += `\n- Conclusion`;
        if (includeAppendix) prompt += `\n- Appendix with References`;

        prompt += `\n\nFormat the report with proper headings, subheadings, and bullet points.
Make it professional, well-structured, and suitable for business/academic audience.`;

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: prompt, document_content: null, audio: false })
        });
        
        const data = await response.json();
        let reportContent = data.response || "Failed to generate report.";
        
        // Format the report with proper styling
        reportContent = reportContent.replace(/#{3,}/g, '##');
        reportContent = reportContent.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
        reportContent = reportContent.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
        reportContent = reportContent.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        reportContent = reportContent.replace(/^- (.*?)$/gm, '<li>$1</li>');
        reportContent = reportContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        reportContent = reportContent.replace(/\n/g, '<br>');
        
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        if (displayDiv) displayDiv.style.display = 'block';
        
        window.currentReport = {
            topic: topic,
            content: reportContent,
            date: new Date().toLocaleString()
        };
        
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div class="report-container">
                    <div class="report-title-section">
                        <h1>📊 ${escapeHtml(topic)}</h1>
                        <div class="report-meta">
                            <span>📅 Generated: ${new Date().toLocaleString()}</span>
                            <span>📄 Type: Comprehensive Report</span>
                        </div>
                    </div>
                    <div class="report-content">
                        ${reportContent}
                    </div>
                    <div class="report-footer">
                        <p>Generated by Cortexa AI Report Generator</p>
                    </div>
                </div>
            `;
        }
        
        showToast("✅ Report generated successfully!");
        
    } catch (error) {
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        console.error('Report error:', error);
        showToast("Error generating report", "error");
    }
}
window.downloadReportAsPDF = function() {
    const content = document.getElementById('reportContent')?.innerHTML;
    if (content) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Report</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 40px; }
                        .report-header { text-align: center; margin-bottom: 30px; }
                        h1 { color: #667eea; }
                    </style>
                </head>
                <body>${content}</body>
            </html>
        `);
        printWindow.print();
        showToast("Report sent to printer (save as PDF)");
    } else {
        showToast("No report to download", "error");
    }
}

window.downloadReportAsDOCX = function() {
    const content = document.getElementById('reportContent')?.innerText;
    if (content) {
        const blob = new Blob([content], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'report.doc';
        a.click();
        URL.revokeObjectURL(url);
        showToast("Report downloaded as DOC!");
    } else {
        showToast("No report to download", "error");
    }
}

window.copyReportToClipboard = function() {
    const content = document.getElementById('reportContent')?.innerText;
    if (content) {
        navigator.clipboard.writeText(content);
        showToast("Report copied to clipboard!");
    } else {
        showToast("No report to copy", "error");
    }
}

window.shareReport = function() {
    if (window.currentReport) {
        const shareText = `${window.currentReport.topic}\n\n${window.currentReport.content.substring(0, 500)}...`;
        navigator.clipboard.writeText(shareText);
        showToast("Report summary copied to clipboard!");
    } else {
        showToast("No report to share", "error");
    }
}

window.saveReportToLibrary = function() {
    if (!window.currentReport) {
        showToast("No report to save", "error");
        return;
    }
    
    const user = getCurrentUser();
    const savedReports = JSON.parse(localStorage.getItem(`reports_${user}`) || '[]');
    savedReports.push(window.currentReport);
    localStorage.setItem(`reports_${user}`, JSON.stringify(savedReports));
    showToast("💾 Report saved to library!");
}

window.printReport = function() {
    const content = document.getElementById('reportContent')?.innerHTML;
    if (content) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head><title>Report</title></head>
                <body>${content}</body>
            </html>
        `);
        printWindow.print();
    }
}

// ================= LEARNING TOOLS MODE (QUIZ + NOTES) =================
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
        if (quizTab) quizTab.style.display = 'block';
        if (notesTab) notesTab.style.display = 'none';
        if (btns[0]) btns[0].classList.add('active');
    } else {
        if (quizTab) quizTab.style.display = 'none';
        if (notesTab) notesTab.style.display = 'block';
        if (btns[1]) btns[1].classList.add('active');
    }
}

// =================  QUIZ FUNCTIONS =================

window.generateQuiz = async function() {
    const topic = document.getElementById('quizTopicInput').value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    const numQuestions = document.getElementById('quizNumQuestions')?.value || 5;
    const difficulty = document.getElementById('quizDifficulty')?.value || 'Medium';
    const questionType = document.getElementById('quizQuestionType')?.value || 'Mixed';
    
    const progressDiv = document.getElementById('quizProgress');
    const progressFill = document.getElementById('quizProgressFill');
    const displayDiv = document.getElementById('quizDisplay');
    const contentDiv = document.getElementById('quizContent');
    
    if (progressDiv) progressDiv.style.display = 'block';
    let width = 0;
    const interval = setInterval(() => {
        width += 10;
        if (progressFill) progressFill.style.width = width + '%';
    }, 100);
    
    try {
        const prompt = `Generate a quiz about "${topic}" with exactly ${numQuestions} questions. 
Difficulty: ${difficulty}. Type: ${questionType}.

Return ONLY valid JSON with this exact format:
{
    "title": "${topic} Quiz",
    "questions": [
        {
            "id": 1,
            "text": "Question text here",
            "type": "mcq",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctAnswer": "Option A",
            "explanation": "Brief explanation"
        }
    ]
}

For true/false, options should be ["True", "False"].
Make questions educational and appropriate for ${difficulty} difficulty.`;

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: prompt,
                document_content: null,
                audio: false
            })
        });
        
        const data = await response.json();
        let quizData;
        
        try {
            let jsonStr = data.response;
            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonStr = jsonMatch[0];
            quizData = JSON.parse(jsonStr);
        } catch (e) {
            quizData = {
                title: `${topic} Quiz`,
                questions: Array(parseInt(numQuestions)).fill().map((_, i) => ({
                    id: i + 1,
                    text: `Sample question about ${topic} ${i + 1}`,
                    type: "mcq",
                    options: ["Option A", "Option B", "Option C"],
                    correctAnswer: "Option A",
                    explanation: "This is a sample explanation."
                }))
            };
        }
        
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        if (displayDiv) displayDiv.style.display = 'block';
        
        window.currentQuizData = quizData;
        window.quizAnswers = {}; // Store user answers
        
        let quizHTML = `
            <div class="quiz-header">
                <h3>📝 ${escapeHtml(quizData.title)}</h3>
                <p>Difficulty: ${difficulty} | Questions: ${quizData.questions.length}</p>
            </div>
            <div id="quizQuestionsContainer">
        `;
        
        quizData.questions.forEach((q, idx) => {
            const qNum = idx + 1;
            quizHTML += `
                <div class="quiz-question-card" data-question-id="${qNum}" data-correct="${escapeHtml(q.correctAnswer)}">
                    <p class="quiz-question-text"><strong>Question ${qNum}:</strong> ${escapeHtml(q.text)}</p>
                    <div class="quiz-options">
            `;
            
            const options = q.options || (q.type === 'truefalse' ? ['True', 'False'] : ['Option A', 'Option B', 'Option C']);
            options.forEach(opt => {
                quizHTML += `
                    <label class="quiz-option">
                        <input type="radio" name="q${qNum}" value="${escapeHtml(opt)}" onchange="saveQuizAnswer(${qNum}, '${escapeHtml(opt)}')">
                        <span>${escapeHtml(opt)}</span>
                    </label>
                `;
            });
            
            quizHTML += `
                    </div>
                    <div class="quiz-feedback" id="feedback-${qNum}" style="display:none;"></div>
                </div>
            `;
        });
        
        quizHTML += `
            </div>
            <div class="quiz-actions">
                <button class="quiz-action-btn submit-quiz-btn" onclick="submitQuizAnswers()">✅ Submit Quiz</button>
                <button class="quiz-action-btn" onclick="resetQuizAnswers()">🔄 Reset All</button>
                <button class="quiz-action-btn" onclick="exportQuizAsPDF()">📄 Export PDF</button>
                <button class="quiz-action-btn" onclick="copyQuizToClipboard()">📋 Copy</button>
                <button class="quiz-action-btn" onclick="saveQuizToLibrary()">💾 Save to Library</button>
            </div>
            <div class="quiz-results-container" id="quizResultsContainer" style="display:none;"></div>
        `;
        
        if (contentDiv) contentDiv.innerHTML = quizHTML;
        showToast(`✅ Quiz generated with ${quizData.questions.length} questions!`);
        
    } catch (error) {
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        console.error('Quiz error:', error);
        showToast("Error generating quiz", "error");
    }
}

// Save individual answer when selected
window.saveQuizAnswer = function(questionNum, answer) {
    if (!window.quizAnswers) window.quizAnswers = {};
    window.quizAnswers[questionNum] = answer;
    
    // Visual feedback that answer is saved
    const questionCard = document.querySelector(`.quiz-question-card[data-question-id="${questionNum}"]`);
    if (questionCard) {
        questionCard.style.borderLeft = '4px solid #10b981';
    }
}

// Submit all answers and show results
window.submitQuizAnswers = function() {
    if (!window.currentQuizData || !window.currentQuizData.questions) {
        showToast("No quiz loaded!", "error");
        return;
    }
    
    let score = 0;
    const totalQuestions = window.currentQuizData.questions.length;
    const results = [];
    
    // Calculate score and prepare results
    window.currentQuizData.questions.forEach((q, idx) => {
        const qNum = idx + 1;
        const userAnswer = window.quizAnswers ? window.quizAnswers[qNum] : null;
        const isCorrect = userAnswer === q.correctAnswer;
        
        if (isCorrect) {
            score++;
        }
        
        results.push({
            id: qNum,
            question: q.text,
            userAnswer: userAnswer || "Not answered",
            correctAnswer: q.correctAnswer,
            isCorrect: isCorrect,
            explanation: q.explanation
        });
        
        // Show feedback for this question
        const feedbackDiv = document.getElementById(`feedback-${qNum}`);
        if (feedbackDiv) {
            if (userAnswer) {
                if (isCorrect) {
                    feedbackDiv.innerHTML = `
                        <div class="correct-feedback">
                            ✅ <strong>Correct!</strong> ${q.explanation || 'Great job!'}
                        </div>
                    `;
                    feedbackDiv.style.backgroundColor = '#d1fae5';
                } else {
                    feedbackDiv.innerHTML = `
                        <div class="wrong-feedback">
                            ❌ <strong>Incorrect!</strong><br>
                            Your answer: ${escapeHtml(userAnswer)}<br>
                            Correct answer: <strong>${escapeHtml(q.correctAnswer)}</strong><br>
                            ${q.explanation ? `📖 ${q.explanation}` : ''}
                        </div>
                    `;
                    feedbackDiv.style.backgroundColor = '#fee2e2';
                }
            } else {
                feedbackDiv.innerHTML = `
                    <div class="wrong-feedback">
                        ⚠️ <strong>Not answered!</strong><br>
                        Correct answer: <strong>${escapeHtml(q.correctAnswer)}</strong><br>
                        ${q.explanation ? `📖 ${q.explanation}` : ''}
                    </div>
                `;
                feedbackDiv.style.backgroundColor = '#fffbeb';
            }
            feedbackDiv.style.display = 'block';
            feedbackDiv.style.padding = '12px';
            feedbackDiv.style.borderRadius = '8px';
            feedbackDiv.style.marginTop = '10px';
        }
    });
    
    const percentage = Math.round((score / totalQuestions) * 100);
    let gradeMessage = '';
    let gradeIcon = '';
    
    if (percentage >= 90) {
        gradeMessage = 'Excellent! You\'re a master of this topic! 🏆';
        gradeIcon = '🎉';
    } else if (percentage >= 70) {
        gradeMessage = 'Good job! You have a solid understanding! 👍';
        gradeIcon = '📚';
    } else if (percentage >= 50) {
        gradeMessage = 'Not bad! Review the material and try again! 💪';
        gradeIcon = '📖';
    } else {
        gradeMessage = 'Keep studying! You\'ll get better with practice! 🌟';
        gradeIcon = '⭐';
    }
    
    // Display overall results
    const resultsContainer = document.getElementById('quizResultsContainer');
    if (resultsContainer) {
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = `
            <div class="results-card">
                <div class="results-header">
                    <span class="results-icon">${gradeIcon}</span>
                    <h3>📊 Quiz Results</h3>
                </div>
                <div class="score-display">
                    <div class="score-number">${score}/${totalQuestions}</div>
                    <div class="score-percentage">${percentage}%</div>
                </div>
                <div class="grade-message">${gradeMessage}</div>
                <div class="results-details">
                    <details>
                        <summary>📖 View Detailed Results</summary>
                        <div class="detailed-results">
                            ${results.map(r => `
                                <div class="result-item ${r.isCorrect ? 'correct-result' : 'wrong-result'}">
                                    <p><strong>Q${r.id}:</strong> ${escapeHtml(r.question)}</p>
                                    <p>Your answer: ${escapeHtml(r.userAnswer)}</p>
                                    <p>Correct: ${escapeHtml(r.correctAnswer)}</p>
                                    ${r.explanation ? `<p>Explanation: ${escapeHtml(r.explanation)}</p>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </details>
                </div>
                <div class="results-actions">
                    <button class="results-btn" onclick="scrollToWrongAnswers()">📖 Review Wrong Answers</button>
                    <button class="results-btn" onclick="resetQuizAnswers()">🔄 Try Again</button>
                    <button class="results-btn" onclick="exportQuizResults()">📄 Export Results</button>
                </div>
            </div>
        `;
    }
    
    // Scroll to results
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showToast(`Quiz completed! Score: ${score}/${totalQuestions} (${percentage}%)`);
}

// Reset all answers
window.resetQuizAnswers = function() {
    // Clear stored answers
    window.quizAnswers = {};
    
    // Clear all radio inputs
    document.querySelectorAll('#quizQuestionsContainer input[type="radio"]').forEach(radio => {
        radio.checked = false;
    });
    
    // Clear all feedback
    document.querySelectorAll('.quiz-feedback').forEach(feedback => {
        feedback.style.display = 'none';
        feedback.innerHTML = '';
    });
    
    // Reset question card borders
    document.querySelectorAll('.quiz-question-card').forEach(card => {
        card.style.borderLeft = '';
    });
    
    // Hide results container
    const resultsContainer = document.getElementById('quizResultsContainer');
    if (resultsContainer) resultsContainer.style.display = 'none';
    
    showToast("Quiz reset! You can try again.");
}

// Scroll to wrong answers only
window.scrollToWrongAnswers = function() {
    const wrongFeedbacks = document.querySelectorAll('.wrong-feedback');
    if (wrongFeedbacks.length > 0) {
        wrongFeedbacks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast(`Reviewing ${wrongFeedbacks.length} incorrect answers...`);
    } else {
        showToast("🎉 Perfect score! No wrong answers to review!");
    }
}

// Export quiz results
window.exportQuizResults = function() {
    if (!window.currentQuizData || !window.quizAnswers) {
        showToast("No quiz results to export!", "error");
        return;
    }
    
    let exportText = `📝 ${window.currentQuizData.title}\n`;
    exportText += `📅 Date: ${new Date().toLocaleString()}\n`;
    exportText += `📊 Total Questions: ${window.currentQuizData.questions.length}\n`;
    exportText += `="\n\n`;
    
    let score = 0;
    
    window.currentQuizData.questions.forEach((q, idx) => {
        const qNum = idx + 1;
        const userAnswer = window.quizAnswers[qNum] || "Not answered";
        const isCorrect = userAnswer === q.correctAnswer;
        if (isCorrect) score++;
        
        exportText += `${qNum}. ${q.text}\n`;
        exportText += `   Your answer: ${userAnswer}\n`;
        exportText += `   Correct answer: ${q.correctAnswer}\n`;
        exportText += `   Result: ${isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}\n`;
        if (q.explanation) {
            exportText += `   Explanation: ${q.explanation}\n`;
        }
        exportText += `\n`;
    });
    
    const percentage = Math.round((score / window.currentQuizData.questions.length) * 100);
    exportText += `="\n`;
    exportText += `FINAL SCORE: ${score}/${window.currentQuizData.questions.length} (${percentage}%)\n`;
    exportText += `Grade: ${percentage >= 70 ? 'PASSED' : 'NEEDS IMPROVEMENT'}\n`;
    
    // Download as text file
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${window.currentQuizData.title.replace(/ /g, '_')}_results.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast("Quiz results exported!");
}

// Remove the old startQuiz function and replace with submitQuizAnswers
window.startQuiz = function() {
    // This function is deprecated - now using submitQuizAnswers
    showToast("Please answer the questions and click 'Submit Quiz'", "info");
}

// Study Notes Generation
window.generateStudyNotes = async function() {
    const topic = document.getElementById('notesTopicInput').value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    const progressDiv = document.getElementById('notesProgress');
    const progressFill = document.getElementById('notesProgressFill');
    const displayDiv = document.getElementById('notesDisplay');
    const contentDiv = document.getElementById('notesContent');
    
    if (progressDiv) progressDiv.style.display = 'block';
    let width = 0;
    const interval = setInterval(() => {
        width += 10;
        if (progressFill) progressFill.style.width = width + '%';
    }, 100);
    
    try {
        const prompt = `Create comprehensive study notes about "${topic}".

Include:
1. Key Concepts (at least 5)
2. Important Definitions
3. Summary Points
4. Key Takeaways
5. Study Tips

Format with clear headings, bullet points, and emojis for easy reading.
Make it organized and educational.`;

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: prompt,
                document_content: null,
                audio: false
            })
        });
        
        const data = await response.json();
        const notesContent = data.response || "Failed to generate notes.";
        
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        if (displayDiv) displayDiv.style.display = 'block';
        
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div class="notes-header">
                    <h2>📚 Study Notes: ${escapeHtml(topic)}</h2>
                    <p>Generated on: ${new Date().toLocaleString()}</p>
                </div>
                <div class="notes-body">
                    ${formatContent(notesContent)}
                </div>
            `;
        }
        
        window.currentNotes = { topic, content: notesContent, date: new Date().toLocaleString() };
        showToast("✅ Study notes generated!");
        
    } catch (error) {
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        console.error('Notes error:', error);
        showToast("Error generating notes", "error");
    }
}

// Quiz helper functions
window.startQuiz = function() {
    if (!window.currentQuizData || !window.currentQuizData.questions) {
        showToast("No quiz loaded. Generate a quiz first!", "error");
        return;
    }
    
    let score = 0;
    
    window.currentQuizData.questions.forEach((q, idx) => {
        const qNum = idx + 1;
        const selected = document.querySelector(`input[name="q${qNum}"]:checked`);
        const feedbackDiv = document.getElementById(`feedback-${qNum}`);
        
        if (selected) {
            const userAnswer = selected.value;
            if (userAnswer === q.correctAnswer) {
                score++;
                if (feedbackDiv) {
                    feedbackDiv.innerHTML = `✅ Correct! ${q.explanation || ''}`;
                    feedbackDiv.style.color = '#10b981';
                    feedbackDiv.style.display = 'block';
                }
            } else {
                if (feedbackDiv) {
                    feedbackDiv.innerHTML = `❌ Incorrect! Correct answer: ${q.correctAnswer}. ${q.explanation || ''}`;
                    feedbackDiv.style.color = '#ef4444';
                    feedbackDiv.style.display = 'block';
                }
            }
        } else {
            if (feedbackDiv) {
                feedbackDiv.innerHTML = `⚠️ No answer selected. Correct answer: ${q.correctAnswer}`;
                feedbackDiv.style.color = '#f59e0b';
                feedbackDiv.style.display = 'block';
            }
        }
    });
    
    const percentage = Math.round((score / window.currentQuizData.questions.length) * 100);
    let gradeMessage = percentage >= 90 ? '🎉 Excellent!' : percentage >= 70 ? '👍 Good job!' : percentage >= 50 ? '📚 Not bad!' : '💪 Keep practicing!';
    
    const scoreDiv = document.getElementById('quizScore');
    if (scoreDiv) {
        scoreDiv.style.display = 'block';
        scoreDiv.innerHTML = `
            <div class="score-card">
                <h4>📊 Score: ${score}/${window.currentQuizData.questions.length} (${percentage}%)</h4>
                <p>${gradeMessage}</p>
                <button onclick="resetQuiz()">🔄 Retake Quiz</button>
            </div>
        `;
    }
    
    showToast(`Quiz completed! Score: ${score}/${window.currentQuizData.questions.length}`);
}

window.resetQuiz = function() {
    document.querySelectorAll('#quizForm input[type="radio"]').forEach(radio => radio.checked = false);
    for (let i = 1; i <= (window.currentQuizData?.questions.length || 0); i++) {
        const feedbackDiv = document.getElementById(`feedback-${i}`);
        if (feedbackDiv) {
            feedbackDiv.style.display = 'none';
            feedbackDiv.innerHTML = '';
        }
    }
    const scoreDiv = document.getElementById('quizScore');
    if (scoreDiv) scoreDiv.style.display = 'none';
    showToast("Quiz reset!");
}

window.exportQuizAsPDF = function() {
    const content = document.getElementById('quizContent')?.innerHTML;
    if (content) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html><head><title>Quiz</title>
            <style>body { font-family: Arial; padding: 20px; } .quiz-question-card { margin-bottom: 20px; }</style>
            </head><body>${content}</body></html>
        `);
        printWindow.print();
    }
}

window.copyQuizToClipboard = function() {
    if (!window.currentQuizData) return;
    let quizText = `${window.currentQuizData.title}\n\n`;
    window.currentQuizData.questions.forEach((q, idx) => {
        quizText += `${idx + 1}. ${q.text}\n   Correct: ${q.correctAnswer}\n\n`;
    });
    navigator.clipboard.writeText(quizText);
    showToast("Quiz copied!");
}

window.saveQuizToLibrary = function() {
    if (!window.currentQuizData) return;
    const user = getCurrentUser();
    const savedQuizzes = JSON.parse(localStorage.getItem(`quizzes_${user}`) || '[]');
    savedQuizzes.push({
        id: 'quiz_' + Date.now(),
        title: window.currentQuizData.title,
        data: window.currentQuizData,
        date: new Date().toLocaleString()
    });
    localStorage.setItem(`quizzes_${user}`, JSON.stringify(savedQuizzes));
    showToast("Quiz saved to library!");
}

// Notes helper functions
window.exportNotesAsPDF = function() {
    const content = document.getElementById('notesContent')?.innerHTML;
    if (content) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html><head><title>Study Notes</title>
            <style>body { font-family: Arial; padding: 20px; }</style>
            </head><body>${content}</body></html>
        `);
        printWindow.print();
    }
}

window.copyNotesToClipboard = function() {
    const content = document.getElementById('notesContent')?.innerText;
    if (content) {
        navigator.clipboard.writeText(content);
        showToast("Notes copied!");
    }
}

window.saveNotesToLibrary = function() {
    if (!window.currentNotes) return;
    const user = getCurrentUser();
    const savedNotes = JSON.parse(localStorage.getItem(`notes_${user}`) || '[]');
    savedNotes.push(window.currentNotes);
    localStorage.setItem(`notes_${user}`, JSON.stringify(savedNotes));
    showToast("Notes saved to library!");
}

window.printNotes = function() {
    const content = document.getElementById('notesContent')?.innerHTML;
    if (content) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<html><head><title>Notes</title></head><body>${content}</body></html>`);
        printWindow.print();
    }
}

window.useChatForLearning = async function(type) {
    if (!currentChatId) {
        showToast("No active chat found. Start a chat first!", "error");
        return;
    }
    
    let chats = getChats();
    const chat = chats.find(c => c.id === currentChatId);
    
    if (!chat || !chat.messages || chat.messages.length === 0) {
        showToast("No chat content found!", "error");
        return;
    }
    
    // Get the last few messages for context
    const lastMessages = chat.messages.slice(-5);
    const chatContent = lastMessages.map(m => `${m.role}: ${m.content}`).join('\n\n');
    
    if (type === 'quiz') {
        document.getElementById('quizTopicInput').value = "Based on this conversation: " + chatContent.substring(0, 200);
        showToast("✅ Chat content loaded! Click Generate Quiz");
    } else if (type === 'notes') {
        document.getElementById('notesTopicInput').value = "Based on this conversation: " + chatContent.substring(0, 200);
        showToast("✅ Chat content loaded! Click Generate Notes");
    } else if (type === 'mindmap') {
        document.getElementById('mindmapTopicInput').value = "Based on this conversation: " + chatContent.substring(0, 200);
        showToast("✅ Chat content loaded! Click Generate Mind Map");
    }
}

window.uploadForLearning = function(type) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.pdf,.docx';
    input.onchange = () => showToast(`Document uploaded for ${type} generation!`);
    input.click();
}

// ================= COMPLETE GAMES MODULE WITH BIG BOXES =================

// Game state variables
let currentGameType = null;
let currentQuizQuestions = [];
let currentQuizIndex = 0;
let quizScore = 0;
let quizTimer = null;
let timeLeft = 30;

let memoryCards = [];
let memoryFlipped = [];
let memoryLocked = false;
let memoryMatches = 0;

let typingCurrentWord = "";
let typingScore = 0;
let typingRound = 0;
let typingWordsList = [];

let triviaQuestions = [];
let triviaIndex = 0;
let triviaScore = 0;

let scrambleCurrentWord = "";
let scrambleCurrentHint = "";
let scrambleScore = 0;
let scrambleRound = 0;
let scrambleWordsList = [];

let tfQuestions = [];
let tfIndex = 0;
let tfScore = 0;

// Open Games Modal
window.openGamesModal = function() {
    console.log("Opening Games Modal");
    const modal = document.getElementById('gamesModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.95)';
        modal.style.zIndex = '200000';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
    }
    // Show game selection by default
    showGameSelectionScreen();
}

// Close Games Modal
window.closeGamesModal = function() {
    const modal = document.getElementById('gamesModal');
    if (modal) modal.style.display = 'none';
    if (quizTimer) clearInterval(quizTimer);
}

// Show game selection screen with big boxes
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

// Select and start a game
window.selectGame = function(gameType) {
    currentGameType = gameType;
    const gameContent = document.getElementById('gameContent');
    if (!gameContent) return;
    
    // Add back button
    gameContent.innerHTML = `
        <div class="game-header-bar">
            <button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button>
            <h2 class="current-game-title">${getGameTitle(gameType)}</h2>
        </div>
        <div id="activeGameContainer" class="active-game-container"></div>
    `;
    
    const activeContainer = document.getElementById('activeGameContainer');
    
    // Load the selected game
    switch(gameType) {
        case 'quiz-race':
            loadQuizRaceGame(activeContainer);
            break;
        case 'memory-match':
            loadMemoryMatchGame(activeContainer);
            break;
        case 'typing-speed':
            loadTypingSpeedGame(activeContainer);
            break;
        case 'trivia-challenge':
            loadTriviaChallengeGame(activeContainer);
            break;
        case 'word-scramble':
            loadWordScrambleGame(activeContainer);
            break;
        case 'true-false':
            loadTrueFalseGame(activeContainer);
            break;
        default:
            showGameSelectionScreen();
    }
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

// ================= QUIZ RACE GAME =================
function loadQuizRaceGame(container) {
    currentQuizIndex = 0;
    quizScore = 0;
    
    currentQuizQuestions = [
        { question: "What is the capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], correct: "Paris" },
        { question: "Which planet is known as the Red Planet?", options: ["Mars", "Jupiter", "Venus", "Saturn"], correct: "Mars" },
        { question: "Who painted the Mona Lisa?", options: ["Van Gogh", "Picasso", "Da Vinci", "Rembrandt"], correct: "Da Vinci" },
        { question: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: "Pacific" },
        { question: "What is the fastest land animal?", options: ["Lion", "Cheetah", "Leopard", "Tiger"], correct: "Cheetah" }
    ];
    
    displayQuizQuestion(container);
}

function displayQuizQuestion(container) {
    if (currentQuizIndex >= currentQuizQuestions.length) {
        showQuizResults(container);
        return;
    }
    
    const q = currentQuizQuestions[currentQuizIndex];
    timeLeft = 30;
    
    if (quizTimer) clearInterval(quizTimer);
    
    quizTimer = setInterval(() => {
        timeLeft--;
        const timerEl = document.getElementById('quizTimer');
        if (timerEl) {
            timerEl.textContent = timeLeft;
            if (timeLeft <= 5) timerEl.style.color = '#ef4444';
            if (timeLeft <= 0) {
                clearInterval(quizTimer);
                moveToNextQuizQuestion(container);
            }
        }
    }, 1000);
    
    container.innerHTML = `
        <div class="game-header-info">
            <div class="game-progress">Question ${currentQuizIndex + 1}/${currentQuizQuestions.length}</div>
            <div class="game-score">⭐ Score: ${quizScore}</div>
            <div class="game-timer">⏱️ Time: <span id="quizTimer">30</span>s</div>
        </div>
        <div class="game-question-large">${escapeHtml(q.question)}</div>
        <div class="game-options-grid">
            ${q.options.map(opt => `<button class="game-option-btn" onclick="checkQuizAnswer('${escapeHtml(opt)}', this)">${escapeHtml(opt)}</button>`).join('')}
        </div>
        <div class="game-feedback" id="gameFeedback"></div>
    `;
}

window.checkQuizAnswer = function(selected, btnElement) {
    if (quizTimer) clearInterval(quizTimer);
    
    const q = currentQuizQuestions[currentQuizIndex];
    const feedback = document.getElementById('gameFeedback');
    
    // Disable all option buttons
    document.querySelectorAll('.game-option-btn').forEach(btn => btn.disabled = true);
    
    if (selected === q.correct) {
        quizScore += 10;
        feedback.innerHTML = `<div class="correct-answer">✅ Correct! +10 points</div>`;
        showToast("✅ Correct!");
    } else {
        feedback.innerHTML = `<div class="wrong-answer">❌ Wrong! Correct answer: ${q.correct}</div>`;
        showToast("❌ Wrong answer!");
    }
    
    setTimeout(() => moveToNextQuizQuestion(document.getElementById('activeGameContainer')), 2000);
}

function moveToNextQuizQuestion(container) {
    currentQuizIndex++;
    if (currentQuizIndex < currentQuizQuestions.length) {
        displayQuizQuestion(container);
    } else {
        showQuizResults(container);
    }
}

function showQuizResults(container) {
    const percentage = Math.round((quizScore / (currentQuizQuestions.length * 10)) * 100);
    container.innerHTML = `
        <div class="game-results-large">
            <div class="results-emoji">${percentage >= 70 ? '🏆' : '📚'}</div>
            <h2>Quiz Complete!</h2>
            <div class="final-score-large">Final Score: ${quizScore}/${currentQuizQuestions.length * 10}</div>
            <div class="score-percentage-large">${percentage}%</div>
            <div class="results-buttons">
                <button class="play-again-btn" onclick="selectGame('quiz-race')">🔄 Play Again</button>
                <button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button>
            </div>
        </div>
    `;
}

// ================= MEMORY MATCH GAME =================
function loadMemoryMatchGame(container) {
    const pairs = [
        { pair1: "HTML", pair2: "Web Page" },
        { pair1: "CSS", pair2: "Styling" },
        { pair1: "JS", pair2: "JavaScript" },
        { pair1: "API", pair2: "Interface" },
        { pair1: "JSON", pair2: "Data Format" },
        { pair1: "DOM", pair2: "Document Object" }
    ];
    
    memoryCards = [];
    pairs.forEach((pair, idx) => {
        memoryCards.push({ id: idx * 2, value: pair.pair1, matched: false, pairId: idx });
        memoryCards.push({ id: idx * 2 + 1, value: pair.pair2, matched: false, pairId: idx });
    });
    
    // Shuffle
    for (let i = memoryCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [memoryCards[i], memoryCards[j]] = [memoryCards[j], memoryCards[i]];
    }
    
    memoryFlipped = [];
    memoryLocked = false;
    memoryMatches = 0;
    
    renderMemoryGame(container);
}

function renderMemoryGame(container) {
    container.innerHTML = `
        <div class="game-header-info">
            <div class="game-progress">🎴 Memory Match</div>
            <div class="game-score">Matches: ${memoryMatches}/${memoryCards.length / 2}</div>
        </div>
        <div class="memory-grid-large">
            ${memoryCards.map((card, idx) => `
                <div class="memory-card-large ${card.matched ? 'matched' : ''} ${memoryFlipped.includes(idx) ? 'flipped' : ''}" 
                     onclick="flipMemoryCard(${idx})">
                    <div class="card-front">❓</div>
                    <div class="card-back">${card.matched ? '✓' : escapeHtml(card.value)}</div>
                </div>
            `).join('')}
        </div>
        <div class="game-buttons">
            <button class="play-again-btn" onclick="selectGame('memory-match')">🔄 New Game</button>
            <button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button>
        </div>
    `;
}

window.flipMemoryCard = function(index) {
    if (memoryLocked) return;
    if (memoryCards[index].matched) return;
    if (memoryFlipped.includes(index)) return;
    if (memoryFlipped.length === 2) return;
    
    memoryFlipped.push(index);
    renderMemoryGame(document.getElementById('activeGameContainer'));
    
    if (memoryFlipped.length === 2) {
        checkMemoryMatch();
    }
}

function checkMemoryMatch() {
    const card1 = memoryCards[memoryFlipped[0]];
    const card2 = memoryCards[memoryFlipped[1]];
    
    if (card1.pairId === card2.pairId) {
        card1.matched = true;
        card2.matched = true;
        memoryMatches++;
        memoryFlipped = [];
        renderMemoryGame(document.getElementById('activeGameContainer'));
        showToast("🎉 Match found!");
        
        if (memoryMatches === memoryCards.length / 2) {
            setTimeout(() => showToast("🏆 Congratulations! You completed the game!"), 500);
        }
    } else {
        memoryLocked = true;
        setTimeout(() => {
            memoryFlipped = [];
            memoryLocked = false;
            renderMemoryGame(document.getElementById('activeGameContainer'));
        }, 1000);
    }
}

// ================= TYPING SPEED GAME =================
function loadTypingSpeedGame(container) {
    typingWordsList = ["javascript", "programming", "developer", "computer", "keyboard", "website", "application", "database"];
    typingRound = 0;
    typingScore = 0;
    loadNextTypingWord(container);
}

function loadNextTypingWord(container) {
    if (typingRound >= typingWordsList.length) {
        showTypingResults(container);
        return;
    }
    
    typingCurrentWord = typingWordsList[typingRound];
    
    container.innerHTML = `
        <div class="game-header-info">
            <div class="game-progress">Word ${typingRound + 1}/${typingWordsList.length}</div>
            <div class="game-score">⭐ Score: ${typingScore}</div>
        </div>
        <div class="typing-word-large">${typingCurrentWord}</div>
        <input type="text" id="typingInput" class="game-input-large" placeholder="Type the word above..." autofocus>
        <div class="game-buttons">
            <button class="game-submit-btn-large" onclick="checkTypingWord()">Submit</button>
            <button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back</button>
        </div>
        <div class="game-feedback" id="typingFeedback"></div>
    `;
    
    document.getElementById('typingInput')?.focus();
}

window.checkTypingWord = function() {
    const input = document.getElementById('typingInput');
    const userInput = input?.value.trim().toLowerCase();
    const feedback = document.getElementById('typingFeedback');
    const container = document.getElementById('activeGameContainer');
    
    if (userInput === typingCurrentWord) {
        typingScore += 10;
        feedback.innerHTML = '<div class="correct-answer">✅ Correct! +10 points</div>';
        showToast("🎉 Correct!");
    } else {
        feedback.innerHTML = `<div class="wrong-answer">❌ Wrong! The word was: ${typingCurrentWord}</div>`;
        showToast("❌ Wrong!");
    }
    
    setTimeout(() => {
        typingRound++;
        loadNextTypingWord(container);
    }, 1500);
}

function showTypingResults(container) {
    const percentage = Math.round((typingScore / (typingWordsList.length * 10)) * 100);
    container.innerHTML = `
        <div class="game-results-large">
            <div class="results-emoji">⌨️</div>
            <h2>Typing Speed Complete!</h2>
            <div class="final-score-large">Score: ${typingScore}/${typingWordsList.length * 10}</div>
            <div class="score-percentage-large">${percentage}%</div>
            <div class="results-buttons">
                <button class="play-again-btn" onclick="selectGame('typing-speed')">🔄 Try Again</button>
                <button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button>
            </div>
        </div>
    `;
}

// ================= TRIVIA CHALLENGE =================
function loadTriviaChallengeGame(container) {
    triviaIndex = 0;
    triviaScore = 0;
    
    triviaQuestions = [
        { question: "What is the capital of Japan?", options: ["Seoul", "Beijing", "Tokyo", "Bangkok"], correct: "Tokyo", funFact: "Tokyo is the most populous metropolitan area in the world" },
        { question: "Who wrote 'Romeo and Juliet'?", options: ["Charles Dickens", "Jane Austen", "William Shakespeare", "Mark Twain"], correct: "William Shakespeare", funFact: "Written around 1595" },
        { question: "What is the chemical symbol for Gold?", options: ["Go", "Gd", "Au", "Ag"], correct: "Au", funFact: "Au comes from Latin 'aurum'" },
        { question: "Which country gifted the Statue of Liberty to the USA?", options: ["England", "Spain", "France", "Germany"], correct: "France", funFact: "Gifted in 1886" },
        { question: "What is the world's longest river?", options: ["Amazon", "Nile", "Yangtze", "Mississippi"], correct: "Nile", funFact: "The Nile is about 6,650 km long" }
    ];
    
    displayTriviaQuestion(container);
}

function displayTriviaQuestion(container) {
    if (triviaIndex >= triviaQuestions.length) {
        showTriviaResults(container);
        return;
    }
    
    const q = triviaQuestions[triviaIndex];
    
    container.innerHTML = `
        <div class="game-header-info">
            <div class="game-progress">Question ${triviaIndex + 1}/${triviaQuestions.length}</div>
            <div class="game-score">⭐ Score: ${triviaScore}</div>
        </div>
        <div class="game-question-large">${escapeHtml(q.question)}</div>
        <div class="game-options-grid">
            ${q.options.map(opt => `<button class="game-option-btn" onclick="checkTriviaAnswer('${escapeHtml(opt)}', this)">${escapeHtml(opt)}</button>`).join('')}
        </div>
        <div class="game-feedback" id="triviaFeedback"></div>
    `;
}

window.checkTriviaAnswer = function(selected, btnElement) {
    const q = triviaQuestions[triviaIndex];
    const feedback = document.getElementById('triviaFeedback');
    
    document.querySelectorAll('.game-option-btn').forEach(btn => btn.disabled = true);
    
    if (selected === q.correct) {
        triviaScore += 10;
        feedback.innerHTML = `<div class="correct-answer">✅ Correct! ${q.funFact || 'Great job!'}</div>`;
        showToast("✅ Correct!");
    } else {
        feedback.innerHTML = `<div class="wrong-answer">❌ Wrong! Correct: ${q.correct}. ${q.funFact || ''}</div>`;
        showToast("❌ Wrong!");
    }
    
    setTimeout(() => {
        triviaIndex++;
        displayTriviaQuestion(document.getElementById('activeGameContainer'));
    }, 2000);
}

function showTriviaResults(container) {
    const percentage = Math.round((triviaScore / (triviaQuestions.length * 10)) * 100);
    container.innerHTML = `
        <div class="game-results-large">
            <div class="results-emoji">${percentage >= 70 ? '🏆' : '📚'}</div>
            <h2>Trivia Complete!</h2>
            <div class="final-score-large">Score: ${triviaScore}/${triviaQuestions.length * 10}</div>
            <div class="score-percentage-large">${percentage}%</div>
            <div class="results-buttons">
                <button class="play-again-btn" onclick="selectGame('trivia-challenge')">🔄 Play Again</button>
                <button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button>
            </div>
        </div>
    `;
}

// ================= WORD SCRAMBLE =================
function loadWordScrambleGame(container) {
    scrambleWordsList = [
        { word: "javascript", hint: "A programming language for web" },
        { word: "computer", hint: "An electronic device" },
        { word: "keyboard", hint: "Used for typing" },
        { word: "monitor", hint: "Displays output" },
        { word: "internet", hint: "Global network" }
    ];
    
    scrambleRound = 0;
    scrambleScore = 0;
    loadNextScrambleWord(container);
}

function loadNextScrambleWord(container) {
    if (scrambleRound >= scrambleWordsList.length) {
        showScrambleResults(container);
        return;
    }
    
    const wordObj = scrambleWordsList[scrambleRound];
    scrambleCurrentWord = wordObj.word;
    scrambleCurrentHint = wordObj.hint;
    
    let scrambled = scrambleCurrentWord.split('');
    for (let i = scrambled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
    }
    
    container.innerHTML = `
        <div class="game-header-info">
            <div class="game-progress">Word ${scrambleRound + 1}/${scrambleWordsList.length}</div>
            <div class="game-score">⭐ Score: ${scrambleScore}</div>
        </div>
        <div class="scrambled-word-large">${scrambled.join(' ').toUpperCase()}</div>
        <div class="game-hint-large">💡 Hint: ${escapeHtml(scrambleCurrentHint)}</div>
        <input type="text" id="scrambleGuess" class="game-input-large" placeholder="Type your guess..." autofocus>
        <div class="game-buttons">
            <button class="game-submit-btn-large" onclick="checkScrambleGuess()">Submit Guess</button>
            <button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back</button>
        </div>
        <div class="game-feedback" id="scrambleFeedback"></div>
    `;
    
    document.getElementById('scrambleGuess')?.focus();
}

window.checkScrambleGuess = function() {
    const input = document.getElementById('scrambleGuess');
    const guess = input?.value.trim().toLowerCase();
    const feedback = document.getElementById('scrambleFeedback');
    const container = document.getElementById('activeGameContainer');
    
    if (guess === scrambleCurrentWord.toLowerCase()) {
        scrambleScore += 10;
        feedback.innerHTML = '<div class="correct-answer">✅ Correct! +10 points</div>';
        showToast("🎉 Correct!");
    } else {
        feedback.innerHTML = `<div class="wrong-answer">❌ Wrong! The word was: ${scrambleCurrentWord}</div>`;
        showToast("❌ Wrong!");
    }
    
    setTimeout(() => {
        scrambleRound++;
        loadNextScrambleWord(container);
    }, 1500);
}

function showScrambleResults(container) {
    const percentage = Math.round((scrambleScore / (scrambleWordsList.length * 10)) * 100);
    container.innerHTML = `
        <div class="game-results-large">
            <div class="results-emoji">🔤</div>
            <h2>Word Scramble Complete!</h2>
            <div class="final-score-large">Score: ${scrambleScore}/${scrambleWordsList.length * 10}</div>
            <div class="score-percentage-large">${percentage}%</div>
            <div class="results-buttons">
                <button class="play-again-btn" onclick="selectGame('word-scramble')">🔄 Play Again</button>
                <button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button>
            </div>
        </div>
    `;
}

// ================= TRUE OR FALSE GAME =================
function loadTrueFalseGame(container) {
    tfIndex = 0;
    tfScore = 0;
    
    tfQuestions = [
        { statement: "The sun rises in the east.", answer: true, explanation: "The sun rises in the east and sets in the west" },
        { statement: "Humans have 5 hearts.", answer: false, explanation: "Humans have 1 heart" },
        { statement: "Water is H2O.", answer: true, explanation: "Water molecules consist of 2 hydrogen and 1 oxygen atom" },
        { statement: "Mount Everest is the tallest mountain.", answer: true, explanation: "Mount Everest is 8,848 meters tall" },
        { statement: "The Earth is flat.", answer: false, explanation: "The Earth is actually round (an oblate spheroid)" }
    ];
    
    displayTrueFalseQuestion(container);
}

function displayTrueFalseQuestion(container) {
    if (tfIndex >= tfQuestions.length) {
        showTrueFalseResults(container);
        return;
    }
    
    const q = tfQuestions[tfIndex];
    
    container.innerHTML = `
        <div class="game-header-info">
            <div class="game-progress">Question ${tfIndex + 1}/${tfQuestions.length}</div>
            <div class="game-score">⭐ Score: ${tfScore}</div>
        </div>
        <div class="game-question-large">${escapeHtml(q.statement)}</div>
        <div class="truefalse-buttons-large">
            <button class="true-btn-large" onclick="checkTrueFalseAnswer(true)">✓ True</button>
            <button class="false-btn-large" onclick="checkTrueFalseAnswer(false)">✗ False</button>
        </div>
        <div class="game-feedback" id="tfFeedback"></div>
    `;
}

window.checkTrueFalseAnswer = function(selected) {
    const q = tfQuestions[tfIndex];
    const feedback = document.getElementById('tfFeedback');
    const isCorrect = (selected === q.answer);
    
    document.querySelectorAll('.true-btn-large, .false-btn-large').forEach(btn => btn.disabled = true);
    
    if (isCorrect) {
        tfScore += 10;
        feedback.innerHTML = `<div class="correct-answer">✅ Correct! ${q.explanation}</div>`;
        showToast("✅ Correct!");
    } else {
        feedback.innerHTML = `<div class="wrong-answer">❌ Wrong! ${q.explanation}</div>`;
        showToast("❌ Wrong!");
    }
    
    setTimeout(() => {
        tfIndex++;
        displayTrueFalseQuestion(document.getElementById('activeGameContainer'));
    }, 2000);
}

function showTrueFalseResults(container) {
    const percentage = Math.round((tfScore / (tfQuestions.length * 10)) * 100);
    container.innerHTML = `
        <div class="game-results-large">
            <div class="results-emoji">${percentage >= 70 ? '🏆' : '📚'}</div>
            <h2>True or False Complete!</h2>
            <div class="final-score-large">Score: ${tfScore}/${tfQuestions.length * 10}</div>
            <div class="score-percentage-large">${percentage}%</div>
            <div class="results-buttons">
                <button class="play-again-btn" onclick="selectGame('true-false')">🔄 Play Again</button>
                <button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button>
            </div>
        </div>
    `;
}

// Helper functions
window.startGame = function(gameType) {
    window.openGamesModal();
    setTimeout(() => window.selectGame(gameType), 100);
}
