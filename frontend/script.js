console.log("Cortexa JS Loaded - Full Version");

// ================= API CONFIGURATION =================
const BASE_URL = "https://cortexa-64a6.onrender.com";
const API_URL = BASE_URL + "/api/chat";

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

// ================= USER-SPECIFIC STORAGE =================
function getCurrentUser() {
    return localStorage.getItem("email") || "guest";
}

function getChats() {
    const user = getCurrentUser();
    return JSON.parse(localStorage.getItem("chats_" + user)) || [];
}

function saveChats(chats) {
    const user = getCurrentUser();
    localStorage.setItem("chats_" + user, JSON.stringify(chats));
}

function getProjects() {
    const user = getCurrentUser();
    return JSON.parse(localStorage.getItem("projects_" + user)) || [];
}

function saveProjects(projects) {
    const user = getCurrentUser();
    localStorage.setItem("projects_" + user, JSON.stringify(projects));
}

// ================= HELPER FUNCTIONS =================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type) {
    type = type || 'info';
    let toast = document.getElementById('customToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'customToast';
        toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: ' + (type === 'error' ? '#ef4444' : '#10b981') + '; color: white; padding: 12px 20px; border-radius: 8px; z-index: 10000; opacity: 0; transition: opacity 0.3s; pointer-events: none; font-size: 14px;';
        document.body.appendChild(toast);
    }
    
    toast.style.backgroundColor = type === 'error' ? '#ef4444' : '#10b981';
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(function() {
        toast.style.opacity = '0';
    }, 3000);
}

// ================= FORMAT FUNCTION =================
function formatContent(content) {
    if (!content) return '';
    var formatted = content.replace(/\n/g, '<br>');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/^[\•\-\*]\s/gm, '• ');
    return formatted;
}

// ================= DISPLAY MESSAGE FUNCTION =================
function displayMessage(text, sender) {
    var chatBox = document.getElementById("searchResults");
    if (!chatBox) {
        console.error("searchResults container not found!");
        return;
    }

    var msgDiv = document.createElement("div");
    msgDiv.className = sender === "user" ? "user-bubble" : "ai-bubble";
    
    var formattedText = formatContent(text);
    var senderName = sender === "user" ? "You" : "Cortexa";
    
    msgDiv.innerHTML = '<div class="chat-title">' + senderName + '</div><div class="chat-content">' + formattedText + '</div>';

    var id = "msg-" + Date.now() + "-" + Math.random();
    msgDiv.id = id;

    chatBox.appendChild(msgDiv);
    
    chatBox.scrollTo({
        top: chatBox.scrollHeight,
        behavior: 'smooth'
    });

    return id;
}

function updateMessage(id, newText) {
    var msg = document.getElementById(id);
    if (msg) {
        var contentDiv = msg.querySelector(".chat-content");
        if (contentDiv) {
            contentDiv.innerHTML = formatContent(newText);
        }
    }
}

// ================= MAIN CHAT FUNCTION =================
window.performSearch = async function() {
    console.log("performSearch called");
    
    var queryInput = document.getElementById('searchInput');
    if (!queryInput) {
        console.error("searchInput not found!");
        return;
    }
    
    var query = queryInput.value.trim();
    if (!query) {
        console.log("Empty query");
        return;
    }
    
    displayMessage(query, 'user');
    queryInput.value = '';
    
    var loadingId = displayMessage('<span class="typing-dots">Thinking<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>', 'bot');
    
    try {
        var requestBody = {
            message: query,
            document_content: currentDocument && currentDocument.content ? currentDocument.content : null,
            audio: false
        };
        
        console.log("📤 Sending request:", requestBody);
        
        var response = await fetch(API_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log("📥 Response status:", response.status);
        
        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }
        
        var data = await response.json();
        console.log("✅ Response received:", data);
        
        if (data.response) {
            updateMessage(loadingId, data.response);
            saveCurrentChat(query, data.response);
        } else {
            updateMessage(loadingId, "⚠️ No response from AI. Please try again.");
        }
        
    } catch (error) {
        console.error("❌ Chat error:", error);
        updateMessage(loadingId, "⚠️ Error connecting to AI. Make sure backend is running\n\nDetails: " + error.message);
    }
}

// ================= SAVE CHAT =================
function saveCurrentChat(userMessage, aiResponse) {
    var chats = getChats();
    
    if (!currentChatId) {
        currentChatId = 'chat_' + Date.now();
        var title = userMessage.substring(0, 30);
        var newChat = {
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
        var chatIndex = chats.findIndex(function(c) { return c.id === currentChatId; });
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
    var container = document.getElementById("searchResults");
    if (!container) return;
    
    if (container.children.length === 0) {
        displayMessage("👋 Hi! I'm Cortexa. Ask me anything! 💙", 'bot');
    }
}

// ================= LOAD CHATS =================
function loadChats() {
    var container = document.getElementById("chatList");
    if (!container) return;
    
    var chats = getChats();
    if (chats.length === 0) {
        container.innerHTML = '<div class="empty-message">No chats yet</div>';
        return;
    }
    
    container.innerHTML = "";
    chats.slice(0, 20).forEach(function(chat) {
        var div = document.createElement("div");
        div.className = "chat-item" + (currentChatId === chat.id ? ' active' : '');
        div.setAttribute('data-chat-id', chat.id);
        div.innerHTML = '<span class="chat-title" onclick="loadChatById(\'' + chat.id + '\')">💬 ' + escapeHtml(chat.title.substring(0, 35)) + '</span><div class="chat-menu-container"><button class="chat-menu-btn" onclick="toggleChatMenu(event, \'' + chat.id + '\')">⋯</button><div class="chat-dropdown" id="chat-dropdown-' + chat.id + '"><div class="dropdown-item delete" onclick="deleteChatById(\'' + chat.id + '\')">🗑️ Delete</div></div></div>';
        container.appendChild(div);
    });
}

// ================= LOAD PROJECTS =================
function loadProjects() {
    var container = document.getElementById("projectListRight");
    if (!container) return;
    
    var projects = getProjects();
    if (projects.length === 0) {
        container.innerHTML = '<div class="empty-message">No projects yet</div>';
        return;
    }
    
    container.innerHTML = "";
    projects.slice(0, 10).forEach(function(project) {
        var div = document.createElement("div");
        div.className = "project-item";
        div.setAttribute('data-project-id', project.id);
        div.innerHTML = '📁 ' + escapeHtml(project.name.substring(0, 35));
        container.appendChild(div);
    });
}

// ================= CHAT MANAGEMENT =================
window.loadChatById = function(chatId) {
    var chats = getChats();
    var chat = chats.find(function(c) { return c.id === chatId; });
    if (chat) {
        currentChatId = chat.id;
        var container = document.getElementById("searchResults");
        if (container) {
            container.innerHTML = "";
            chat.messages.forEach(function(msg) {
                displayMessage(msg.content, msg.role === 'user' ? 'user' : 'bot');
            });
        }
        loadChats();
        showToast("Chat loaded!");
    }
}

window.deleteChatById = function(chatId) {
    if (confirm("Delete this chat?")) {
        var chats = getChats();
        chats = chats.filter(function(chat) { return chat.id !== chatId; });
        saveChats(chats);
        if (currentChatId === chatId) {
            currentChatId = null;
            var container = document.getElementById("searchResults");
            if (container) {
                container.innerHTML = "";
                addWelcomeMessage();
            }
        }
        loadChats();
        showToast("🗑️ Chat deleted!");
    }
    var dropdown = document.getElementById("chat-dropdown-" + chatId);
    if (dropdown) dropdown.classList.remove('show');
}

window.startNewChat = function(e) {
    if (e) e.preventDefault();
    currentChatId = null;
    var container = document.getElementById("searchResults");
    if (container) {
        container.innerHTML = "";
        addWelcomeMessage();
    }
    loadChats();
    showToast("✨ New chat started!");
}

window.toggleChatMenu = function(event, chatId) {
    event.stopPropagation();
    
    document.querySelectorAll('.chat-dropdown.show').forEach(function(dropdown) {
        if (dropdown.id !== "chat-dropdown-" + chatId) {
            dropdown.classList.remove('show');
        }
    });
    
    var dropdown = document.getElementById("chat-dropdown-" + chatId);
    if (!dropdown) return;
    
    dropdown.classList.toggle('show');
    
    setTimeout(function() {
        dropdown.classList.remove('show');
    }, 3000);
}

window.togglePlusDropdown = function() {
    var dropdown = document.getElementById('plusDropdown');
    if (dropdown) dropdown.classList.toggle('show');
}

window.shareChat = function() {
    if (currentChatId) {
        var chats = getChats();
        var chat = chats.find(function(c) { return c.id === currentChatId; });
        if (chat) {
            var shareText = chat.title + '\n\n' + chat.messages.map(function(m) { return (m.role === 'user' ? 'You' : 'Cortexa') + ': ' + m.content; }).join('\n\n');
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
            var chats = getChats();
            chats = chats.filter(function(chat) { return chat.id !== currentChatId; });
            saveChats(chats);
            currentChatId = null;
            var container = document.getElementById("searchResults");
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
    var name = prompt("Enter project name:");
    if (name && name.trim() !== "") {
        var projects = getProjects();
        var newProject = {
            id: 'project_' + Date.now(),
            name: name.trim(),
            created_at: new Date().toLocaleString()
        };
        projects.push(newProject);
        saveProjects(projects);
        loadProjects();
        showToast("✅ Project \"" + name + "\" created!");
    }
}

// ================= DOCUMENT CHAT =================
window.documentChat = function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.pdf,.docx';
    input.onchange = async function(e) {
        var file = e.target.files[0];
        if (file) {
            var formData = new FormData();
            formData.append('file', file);
            
            showToast("📄 Uploading document...");
            
            try {
                var response = await fetch(BASE_URL + "/api/upload-document", {
                    method: 'POST',
                    body: formData
                });
                var data = await response.json();
                currentDocument = data;
                showToast("✅ Document \"" + file.name + "\" loaded! You can now ask questions about it.");
                displayMessage("📄 **Document loaded:** " + file.name + "\n\nYou can now ask me questions about this document!", 'bot');
            } catch (error) {
                showToast("❌ Error uploading document", "error");
            }
        }
    };
    input.click();
}

// ================= AUDIO MODE =================
window.openAudioMode = function() {
    var modal = document.getElementById('audioModal');
    if (modal) modal.style.display = 'flex';
}

window.closeAudioMode = function() {
    var modal = document.getElementById('audioModal');
    if (modal) modal.style.display = 'none';
}

window.setAudioMode = function(mode, btn) {
    currentAudioMode = mode;
    document.querySelectorAll('.mode-btn').forEach(function(b) { return b.classList.remove('active'); });
    btn.classList.add('active');
    showToast("🎵 Audio mode: " + mode);
}

window.toggleMicrophone = async function() {
    var micBtn = document.getElementById('micButton');
    var statusDiv = document.getElementById('micStatus');
    
    if (!isRecording) {
        try {
            var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = function(event) {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = async function() {
                var audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                statusDiv.innerHTML = '🎤 Speech detected! Processing...';
                showToast("🎤 Voice input received! Please type your question for now (voice-to-text coming soon)");
                statusDiv.innerHTML = 'Click microphone to speak';
                isRecording = false;
                micBtn.style.background = '';
                stream.getTracks().forEach(function(track) { return track.stop(); });
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
    var queryInput = document.getElementById('audioQueryInput');
    var query = queryInput.value.trim();
    if (!query) {
        showToast("Please enter a question", "error");
        return;
    }
    
    var responseArea = document.getElementById('audioResponseArea');
    var responseText = document.getElementById('responseText');
    
    responseArea.style.display = 'block';
    responseText.innerHTML = '<span class="typing-dots">Generating response...</span>';
    
    try {
        var requestBody = { message: query, audio: true };
        var response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        var data = await response.json();
        
        currentAudioText = data.response;
        responseText.innerHTML = formatContent(data.response);
        
        var audioResponse = await fetch(BASE_URL + "/api/generate-audio", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: data.response })
        });
        var audioData = await audioResponse.json();
        
        if (audioData.audio_url) {
            var audioPlayer = document.getElementById('audioPlayer');
            audioPlayer.src = BASE_URL + audioData.audio_url;
            document.getElementById('audioPlayerContainer').style.display = 'block';
        }
        
    } catch (error) {
        responseText.innerHTML = '❌ Error generating response';
        showToast("Error connecting to AI", "error");
    }
}

window.playAudioResponse = function() {
    var audio = document.getElementById('audioPlayer');
    if (audio && audio.src) {
        audio.play();
    } else {
        showToast("No audio available", "error");
    }
}

window.pauseAudioResponse = function() {
    var audio = document.getElementById('audioPlayer');
    if (audio) audio.pause();
}

window.stopAudioResponse = function() {
    var audio = document.getElementById('audioPlayer');
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
}

window.downloadAudioResponse = function() {
    var audio = document.getElementById('audioPlayer');
    if (audio && audio.src) {
        var a = document.createElement('a');
        a.href = audio.src;
        a.download = 'cortexa_audio.mp3';
        a.click();
        showToast("Downloading audio...");
    } else {
        showToast("No audio available", "error");
    }
}

// ================= VIDEO MODE =================
window.openVideoMode = function() {
    var modal = document.getElementById('videoModal');
    if (modal) modal.style.display = 'flex';
    switchVideoTab('youtube');
}

window.closeVideoMode = function() {
    var modal = document.getElementById('videoModal');
    if (modal) modal.style.display = 'none';
}

window.switchVideoTab = function(tab) {
    var youtubeTab = document.getElementById('youtubeTab');
    var libraryTab = document.getElementById('libraryTab');
    var btns = document.querySelectorAll('.tab-btn');
    
    btns.forEach(function(btn) { return btn.classList.remove('active'); });
    
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

window.searchYouTube = async function() {
    var query = document.getElementById('youtubeSearchQuery').value;
    if (!query) {
        showToast("Please enter a search term", "error");
        return;
    }
    
    showToast("🔍 Searching YouTube...");
    var resultsDiv = document.getElementById('youtubeResults');
    if (!resultsDiv) return;
    
    resultsDiv.innerHTML = '<div class="loading-spinner">🔍 Searching for videos...</div>';
    
    try {
        var response = await fetch(BASE_URL + "/api/youtube-search?query=" + encodeURIComponent(query) + "&max_results=12");
        var data = await response.json();
        
        if (data.error) {
            resultsDiv.innerHTML = '<div class="error-message">❌ ' + data.error + '</div>';
            showToast(data.error, "error");
            return;
        }
        
        if (!data.videos || data.videos.length === 0) {
            resultsDiv.innerHTML = '<div class="no-results">😕 No videos found. Try a different search term.</div>';
            return;
        }
        
        resultsDiv.innerHTML = '<div class="search-header"><h3>📹 Search Results (' + data.videos.length + ' videos)</h3><p>Click on any video to get AI summary</p></div><div class="youtube-grid">' + data.videos.map(function(video) {
            return '<div class="video-card"><div class="video-thumbnail"><img src="' + video.thumbnail + '" alt="' + escapeHtml(video.title) + '"><div class="video-duration">' + (video.duration || 'N/A') + '</div></div><div class="video-details"><h4 class="video-title">' + escapeHtml(video.title.substring(0, 70)) + '</h4><p class="video-channel">' + escapeHtml(video.channel) + '</p><p class="video-stats">👁️ ' + (video.views || 'N/A') + ' views</p><button class="play-youtube-btn" onclick="getVideoInfoAndSummary(\'' + video.id + '\', \'' + escapeHtml(video.title) + '\')">🤖 Get AI Summary</button><button class="watch-btn" onclick="openInYouTube(\'' + video.id + '\')">▶️ Watch on YouTube</button></div></div>';
        }).join('') + '</div>';
        
        showToast("Found " + data.videos.length + " videos!");
        
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<div class="error-message">❌ Failed to search YouTube. Make sure backend is running.</div>';
        showToast("Error connecting to backend", "error");
    }
}

window.getVideoInfoAndSummary = async function(videoId, videoTitle) {
    showToast("📹 Getting video information and generating AI summary...");
    
    var infoDiv = document.getElementById('youtubeVideoInfo');
    if (!infoDiv) return;
    
    infoDiv.style.display = 'block';
    infoDiv.innerHTML = '<div class="loading-spinner">🧠 Analyzing video content...</div>';
    
    try {
        var infoResponse = await fetch(BASE_URL + "/api/youtube-video-info?videoid=" + videoId);
        var videoInfo = await infoResponse.json();
        
        if (videoInfo.error) {
            infoDiv.innerHTML = '<div class="error-message">❌ ' + videoInfo.error + '</div>';
            return;
        }
        
        var summaryPrompt = 'Please provide a comprehensive summary of this YouTube video:\n\nTitle: ' + (videoTitle || videoInfo.title) + '\nChannel: ' + (videoInfo.channel || 'Unknown') + '\nDescription: ' + (videoInfo.description || 'No description available') + '\n\nPlease provide:\n1. Main topic/theme of the video\n2. 5-7 key points covered\n3. Important takeaways\n4. Who should watch this video\n5. A brief one-paragraph summary\n\nFormat the response in a clean, organized way with emojis for each section.';

        var summaryResponse = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: summaryPrompt,
                document_content: null,
                audio: false
            })
        });
        
        var summaryData = await summaryResponse.json();
        var aiSummary = summaryData.response || "Summary generation failed. Please try again.";
        
        infoDiv.innerHTML = '<div class="video-detail-card"><div class="video-detail-header"><h3>✅ ' + escapeHtml(videoInfo.title || videoTitle) + '</h3><button class="close-video-info" onclick="closeVideoInfo()">✖</button></div><div class="video-detail-content"><p><strong>📺 Channel:</strong> ' + escapeHtml(videoInfo.channel || 'N/A') + '</p><p><strong>👁️ Views:</strong> ' + parseInt(videoInfo.views || 0).toLocaleString() + '</p><p><strong>👍 Likes:</strong> ' + parseInt(videoInfo.likes || 0).toLocaleString() + '</p><p><strong>⏱️ Duration:</strong> ' + (videoInfo.duration || 'N/A') + '</p><div class="ai-summary-section"><h4>🤖 AI GENERATED SUMMARY</h4><div class="summary-text">' + formatContent(aiSummary) + '</div></div><details><summary>📝 Video Description</summary><p class="video-description">' + escapeHtml((videoInfo.description || 'No description').substring(0, 1000)) + '</p></details><div class="video-action-buttons"><button class="watch-btn" onclick="openInYouTube(\'' + videoId + '\')">🎬 Watch on YouTube</button><button class="summary-btn" onclick="copySummaryToClipboard()">📋 Copy Summary</button><button class="summary-btn" onclick="downloadSummaryAsFile()">💾 Download Summary</button><button class="summary-btn" onclick="saveVideoToLibrary(\'' + videoId + '\', \'' + escapeHtml(videoInfo.title || videoTitle) + '\')">💾 Save to Library</button></div></div></div>';
        
        document.getElementById('youtubeOptions').style.display = 'block';
        showToast("✅ AI Summary generated successfully!");
        
    } catch (error) {
        console.error('Error:', error);
        infoDiv.innerHTML = '<div class="error-message">❌ Error generating summary. Please try again.</div>';
        showToast("Error generating summary", "error");
    }
}

window.closeVideoInfo = function() {
    var infoDiv = document.getElementById('youtubeVideoInfo');
    if (infoDiv) infoDiv.style.display = 'none';
}

window.openInYouTube = function(videoId) {
    var youtubeUrl = 'https://www.youtube.com/watch?v=' + videoId;
    window.open(youtubeUrl, '_blank');
    showToast("📺 Opening YouTube in new tab...");
}

window.copySummaryToClipboard = function() {
    var summaryText = document.querySelector('.summary-text')?.innerText;
    if (summaryText) {
        navigator.clipboard.writeText(summaryText);
        showToast("📋 Summary copied to clipboard!");
    } else {
        showToast("No summary to copy", "error");
    }
}

window.downloadSummaryAsFile = function() {
    var summaryText = document.querySelector('.summary-text')?.innerText;
    if (summaryText) {
        var blob = new Blob([summaryText], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'video_summary.txt';
        a.click();
        URL.revokeObjectURL(url);
        showToast("💾 Summary downloaded!");
    } else {
        showToast("No summary to download", "error");
    }
}

window.saveVideoToLibrary = function(videoId, videoTitle) {
    var user = getCurrentUser();
    var savedVideos = JSON.parse(localStorage.getItem("videos_" + user) || '[]');
    
    if (!savedVideos.some(function(v) { return v.id === videoId; })) {
        var newVideo = {
            id: videoId,
            title: videoTitle,
            url: 'https://youtube.com/watch?v=' + videoId,
            date: new Date().toLocaleString(),
            thumbnail: 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg'
        };
        savedVideos.push(newVideo);
        localStorage.setItem("videos_" + user, JSON.stringify(savedVideos));
        showToast("💾 Video saved to library!");
        loadVideoLibrary();
    } else {
        showToast("Video already in library!");
    }
}

function loadVideoLibrary() {
    var user = getCurrentUser();
    var libraryDiv = document.getElementById('videoLibraryList');
    if (!libraryDiv) return;
    
    var savedVideos = JSON.parse(localStorage.getItem("videos_" + user) || '[]');
    
    if (savedVideos.length === 0) {
        libraryDiv.innerHTML = '<div class="empty-library">📭 No saved videos. Search and save videos to see them here!</div>';
        return;
    }
    
    libraryDiv.innerHTML = '<div class="library-grid">' + savedVideos.map(function(video) {
        return '<div class="library-card"><img src="' + video.thumbnail + '" alt="' + escapeHtml(video.title) + '"><div class="library-card-info"><h4>' + escapeHtml(video.title.substring(0, 50)) + '</h4><p class="library-date">Saved: ' + video.date + '</p><button class="library-play-btn" onclick="getVideoInfoAndSummary(\'' + video.id + '\', \'' + escapeHtml(video.title) + '\')">🤖 Get AI Summary</button><button class="library-remove-btn" onclick="removeFromLibrary(\'' + video.id + '\')">🗑️ Remove</button></div></div>';
    }).join('') + '</div>';
}

window.removeFromLibrary = function(videoId) {
    var user = getCurrentUser();
    var savedVideos = JSON.parse(localStorage.getItem("videos_" + user) || '[]');
    savedVideos = savedVideos.filter(function(v) { return v.id !== videoId; });
    localStorage.setItem("videos_" + user, JSON.stringify(savedVideos));
    loadVideoLibrary();
    showToast("🗑️ Video removed from library");
}

// ================= REPORT MODE =================
window.openReportMode = function() {
    var modal = document.getElementById('reportModal');
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
    var modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
}

window.generateReport = async function() {
    var topic = document.getElementById('reportTopicInput').value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    var format = document.getElementById('reportFormat')?.value || 'PDF Document';
    var includeCharts = document.getElementById('includeCharts')?.checked || false;
    var includeTables = document.getElementById('includeTables')?.checked || false;
    var includeExecutive = document.getElementById('includeExecutive')?.checked || true;
    var includeRecommendations = document.getElementById('includeRecommendations')?.checked || true;
    var includeAppendix = document.getElementById('includeAppendix')?.checked || false;
    
    var progressDiv = document.getElementById('reportProgress');
    var progressFill = document.getElementById('reportProgressFill');
    var displayDiv = document.getElementById('reportDisplay');
    var contentDiv = document.getElementById('reportContent');
    
    if (progressDiv) {
        progressDiv.style.display = 'block';
        progressDiv.innerHTML = '<div class="progress-bar"><div id="reportProgressFill" class="progress-fill"></div></div><p class="generating-text">📊 Generating comprehensive report on "' + topic.substring(0, 50) + '"...</p>';
    }
    
    var width = 0;
    var interval = setInterval(function() {
        width += 10;
        if (progressFill) progressFill.style.width = width + '%';
    }, 200);
    
    try {
        var prompt = 'Generate a comprehensive, professional report about "' + topic + '". The report should include:';

        if (includeExecutive) prompt += '\n- Executive Summary';
        prompt += '\n- Introduction';
        prompt += '\n- Key Findings (at least 5 points with detailed explanations)';
        prompt += '\n- Detailed Analysis';
        if (includeCharts) prompt += '\n- Charts and Graphs Analysis (describe what charts would show)';
        if (includeTables) prompt += '\n- Data Tables (create relevant data tables)';
        prompt += '\n- Challenges and Opportunities';
        if (includeRecommendations) prompt += '\n- Recommendations (at least 3 actionable recommendations)';
        prompt += '\n- Conclusion';
        if (includeAppendix) prompt += '\n- Appendix with References and Sources';

        prompt += '\n\nFormat the report with proper headings (## for main sections), subheadings (### for subsections), and bullet points. Make it professional, well-structured, data-driven, and suitable for business/academic audience. Use markdown formatting.';

        var response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: prompt, document_content: null, audio: false })
        });
        
        var data = await response.json();
        var reportContent = data.response || "Failed to generate report.";
        
        reportContent = reportContent.replace(/## (.*?)$/gm, '<h2>$1</h2>');
        reportContent = reportContent.replace(/### (.*?)$/gm, '<h3>$1</h3>');
        reportContent = reportContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        reportContent = reportContent.replace(/^- (.*?)$/gm, '<li>$1</li>');
        reportContent = reportContent.replace(/\n/g, '<br>');
        
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        if (displayDiv) displayDiv.style.display = 'block';
        
        window.currentReport = {
            topic: topic,
            content: reportContent,
            rawContent: data.response,
            format: format,
            date: new Date().toLocaleString(),
            options: { includeCharts: includeCharts, includeTables: includeTables, includeExecutive: includeExecutive, includeRecommendations: includeRecommendations, includeAppendix: includeAppendix }
        };
        
        if (contentDiv) {
            contentDiv.innerHTML = '<div class="report-container" id="reportContainer"><div class="report-title-section"><h1>📊 ' + escapeHtml(topic) + '</h1><div class="report-meta"><span>📅 Generated: ' + new Date().toLocaleString() + '</span><span>📄 Format: ' + format + '</span><span>🤖 Generated by Cortexa AI</span></div></div><div class="report-content" id="reportContentText">' + reportContent + '</div><div class="report-footer"><p>© ' + new Date().getFullYear() + ' Cortexa AI Report Generator - All Rights Reserved</p></div></div>';
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
    var reportContainer = document.getElementById('reportContainer');
    if (!reportContainer) {
        showToast("No report to download! Generate a report first.", "error");
        return;
    }
    
    var printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>' + (window.currentReport?.topic || 'Report') + ' - Cortexa AI</title><style>body { font-family: "Segoe UI", Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; line-height: 1.6; } .report-title-section { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #667eea; } .report-title-section h1 { color: #667eea; margin-bottom: 10px; } .report-meta { color: #666; font-size: 12px; } .report-content h2 { color: #667eea; margin-top: 30px; border-left: 4px solid #667eea; padding-left: 15px; } .report-content h3 { color: #764ba2; margin-top: 20px; } .report-content li { margin: 8px 0; } .report-footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #999; } button { display: none; }</style></head><body>' + reportContainer.outerHTML + '</body></html>');
    printWindow.print();
    printWindow.close();
    showToast("📄 Report sent to printer (save as PDF)");
}

window.downloadReportAsDOCX = function() {
    if (!window.currentReport) {
        showToast("No report to download! Generate a report first.", "error");
        return;
    }
    
    var reportContent = document.getElementById('reportContentText')?.innerText || window.currentReport.rawContent;
    if (!reportContent) {
        showToast("No content to download", "error");
        return;
    }
    
    var docContent = window.currentReport.topic + '\n' + '='.repeat(50) + '\n\nGenerated on: ' + window.currentReport.date + '\nFormat: ' + window.currentReport.format + '\n\n' + reportContent + '\n\n' + '='.repeat(50) + '\nGenerated by Cortexa AI Report Generator';
    
    var blob = new Blob([docContent], { type: 'application/msword' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = window.currentReport.topic.replace(/[^a-z0-9]/gi, '_') + '_report.doc';
    a.click();
    URL.revokeObjectURL(url);
    showToast("📄 Report downloaded as DOCX!");
}

window.copyReportToClipboard = function() {
    if (!window.currentReport) {
        showToast("No report to copy! Generate a report first.", "error");
        return;
    }
    
    var reportText = document.getElementById('reportContentText')?.innerText || window.currentReport.rawContent;
    if (reportText) {
        navigator.clipboard.writeText(reportText).then(function() {
            showToast("📋 Report copied to clipboard!");
        }).catch(function() {
            showToast("Failed to copy", "error");
        });
    } else {
        showToast("No content to copy", "error");
    }
}

window.shareReport = function() {
    if (!window.currentReport) {
        showToast("No report to share! Generate a report first.", "error");
        return;
    }
    
    var shareText = '📊 Report: ' + window.currentReport.topic + '\n\n' + (document.getElementById('reportContentText')?.innerText || window.currentReport.rawContent).substring(0, 500) + '...\n\nGenerated on: ' + window.currentReport.date + '\n\nGenerated by Cortexa AI';
    
    navigator.clipboard.writeText(shareText).then(function() {
        showToast("📤 Report summary copied to clipboard! You can now share it anywhere.");
    }).catch(function() {
        showToast("Failed to copy for sharing", "error");
    });
}

window.saveReportToLibrary = function() {
    if (!window.currentReport) {
        showToast("No report to save! Generate a report first.", "error");
        return;
    }
    
    var user = getCurrentUser();
    var savedReports = JSON.parse(localStorage.getItem("reports_" + user) || '[]');
    
    var reportToSave = {
        id: 'report_' + Date.now(),
        title: window.currentReport.topic,
        content: window.currentReport.rawContent,
        formattedContent: window.currentReport.content,
        date: window.currentReport.date,
        format: window.currentReport.format,
        options: window.currentReport.options
    };
    
    savedReports.unshift(reportToSave);
    localStorage.setItem("reports_" + user, JSON.stringify(savedReports));
    
    showToast("✅ Report \"" + window.currentReport.topic + "\" saved to library!");
}

window.printReport = function() {
    var reportContainer = document.getElementById('reportContainer');
    if (!reportContainer) {
        showToast("No report to print! Generate a report first.", "error");
        return;
    }
    
    var printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>' + (window.currentReport?.topic || 'Report') + ' - Cortexa AI</title><style>body { font-family: "Segoe UI", Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; line-height: 1.6; } .report-title-section { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #667eea; } .report-title-section h1 { color: #667eea; } .report-meta { color: #666; font-size: 12px; } .report-footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; } button { display: none; }</style></head><body>' + reportContainer.outerHTML + '</body></html>');
    printWindow.print();
    printWindow.close();
    showToast("🖨️ Report sent to printer!");
}

window.loadReportFromLibrary = function(reportId) {
    var user = getCurrentUser();
    var savedReports = JSON.parse(localStorage.getItem("reports_" + user) || '[]');
    var report = savedReports.find(function(r) { return r.id === reportId; });
    
    if (report) {
        window.currentReport = {
            topic: report.title,
            content: report.formattedContent,
            rawContent: report.content,
            date: report.date,
            format: report.format,
            options: report.options
        };
        
        var contentDiv = document.getElementById('reportContent');
        if (contentDiv) {
            contentDiv.innerHTML = '<div class="report-container" id="reportContainer"><div class="report-title-section"><h1>📊 ' + escapeHtml(report.title) + '</h1><div class="report-meta"><span>📅 Generated: ' + report.date + '</span><span>📄 Format: ' + report.format + '</span></div></div><div class="report-content" id="reportContentText">' + report.formattedContent + '</div><div class="report-footer"><p>© ' + new Date().getFullYear() + ' Cortexa AI Report Generator</p></div></div>';
        }
        
        document.getElementById('reportDisplay').style.display = 'block';
        showToast("✅ Report \"" + report.title + "\" loaded from library!");
    } else {
        showToast("Report not found!", "error");
    }
}

window.openReportLibrary = function() {
    var user = getCurrentUser();
    var savedReports = JSON.parse(localStorage.getItem("reports_" + user) || '[]');
    
    if (savedReports.length === 0) {
        showToast("No saved reports found!", "info");
        return;
    }
    
    var libraryHTML = '<div class="report-library-modal"><h3>📚 Saved Reports</h3><div class="report-list">';
    savedReports.forEach(function(report) {
        libraryHTML += '<div class="report-list-item"><div class="report-info"><strong>' + escapeHtml(report.title) + '</strong><small>' + report.date + '</small></div><button onclick="loadReportFromLibrary(\'' + report.id + '\')">Load</button></div>';
    });
    libraryHTML += '</div><button onclick="closeReportLibrary()">Close</button></div>';
    
    var modal = document.getElementById('reportLibraryModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reportLibraryModal';
        modal.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 12px; max-width: 500px; width: 90%; z-index: 10001; box-shadow: 0 4px 20px rgba(0,0,0,0.3);';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = libraryHTML;
    modal.style.display = 'block';
}

window.closeReportLibrary = function() {
    var modal = document.getElementById('reportLibraryModal');
    if (modal) modal.style.display = 'none';
}

// ============================================
// LEARNING TOOLS - QUIZ GENERATOR
// ============================================

window.openLearningTools = function() {
    var modal = document.getElementById('learningToolsModal');
    if (modal) modal.style.display = 'flex';
    switchLearningTab('quiz');
}

window.closeLearningTools = function() {
    var modal = document.getElementById('learningToolsModal');
    if (modal) modal.style.display = 'none';
}

window.switchLearningTab = function(tab) {
    var quizTab = document.getElementById('quizTab');
    var notesTab = document.getElementById('notesTab');
    var btns = document.querySelectorAll('.learning-tab-btn');
    
    btns.forEach(function(btn) { return btn.classList.remove('active'); });
    
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
    var topic = document.getElementById('quizTopicInput').value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    var numQuestions = document.getElementById('quizCount')?.value || 5;
    var difficulty = document.getElementById('quizDifficulty')?.value || 'medium';
    var questionType = document.getElementById('quizType')?.value || 'mixed';
    
    var progressDiv = document.getElementById('quizProgress');
    var progressFill = document.getElementById('quizProgressFill');
    var displayDiv = document.getElementById('quizDisplay');
    var contentDiv = document.getElementById('quizContent');
    
    if (progressDiv) progressDiv.style.display = 'block';
    var width = 0;
    var interval = setInterval(function() {
        width += 10;
        if (progressFill) progressFill.style.width = width + '%';
    }, 100);
    
    try {
        var prompt = 'Generate a quiz about "' + topic + '" with exactly ' + numQuestions + ' questions. Difficulty: ' + difficulty + '. Type: ' + questionType + '.\n\nReturn ONLY valid JSON with this exact format:\n{\n    "title": "' + topic + ' Quiz",\n    "questions": [\n        {\n            "id": 1,\n            "text": "Question text here",\n            "type": "mcq",\n            "options": ["Option A", "Option B", "Option C", "Option D"],\n            "correctAnswer": "Option A",\n            "explanation": "Brief explanation"\n        }\n    ]\n}\n\nFor true/false, options should be ["True", "False"].\nMake questions educational and appropriate for ' + difficulty + ' difficulty.';

        var response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: prompt,
                document_content: null,
                audio: false
            })
        });
        
        var data = await response.json();
        var quizData;
        
        try {
            var jsonStr = data.response;
            var jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonStr = jsonMatch[0];
            quizData = JSON.parse(jsonStr);
        } catch (e) {
            quizData = {
                title: topic + ' Quiz',
                questions: Array(parseInt(numQuestions)).fill().map(function(_, i) {
                    return {
                        id: i + 1,
                        text: 'Sample question about ' + topic + ' ' + (i + 1),
                        type: "mcq",
                        options: ["Option A", "Option B", "Option C"],
                        correctAnswer: "Option A",
                        explanation: "This is a sample explanation."
                    };
                })
            };
        }
        
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        if (displayDiv) displayDiv.style.display = 'block';
        
        window.currentQuizData = quizData;
        window.quizAnswers = {};
        
        var quizHTML = '<div class="quiz-header"><h3>📝 ' + escapeHtml(quizData.title) + '</h3><p>Difficulty: ' + difficulty + ' | Questions: ' + quizData.questions.length + '</p></div><div id="quizQuestionsContainer">';
        
        quizData.questions.forEach(function(q, idx) {
            var qNum = idx + 1;
            quizHTML += '<div class="quiz-question-card" data-question-id="' + qNum + '" data-correct="' + escapeHtml(q.correctAnswer) + '"><p class="quiz-question-text"><strong>Question ' + qNum + ':</strong> ' + escapeHtml(q.text) + '</p><div class="quiz-options">';
            
            var options = q.options || (q.type === 'truefalse' ? ['True', 'False'] : ['Option A', 'Option B', 'Option C']);
            options.forEach(function(opt) {
                quizHTML += '<label class="quiz-option"><input type="radio" name="q' + qNum + '" value="' + escapeHtml(opt) + '" onchange="saveQuizAnswer(' + qNum + ', \'' + escapeHtml(opt) + '\')"><span>' + escapeHtml(opt) + '</span></label>';
            });
            
            quizHTML += '</div><div class="quiz-feedback" id="feedback-' + qNum + '" style="display:none;"></div></div>';
        });
        
        quizHTML += '</div><div class="quiz-actions"><button class="quiz-action-btn submit-quiz-btn" onclick="submitQuizAnswers()">✅ Submit Quiz</button><button class="quiz-action-btn" onclick="resetQuizAnswers()">🔄 Reset All</button><button class="quiz-action-btn" onclick="exportQuizAsPDF()">📄 Export PDF</button><button class="quiz-action-btn" onclick="copyQuizToClipboard()">📋 Copy</button><button class="quiz-action-btn" onclick="saveQuizToLibrary()">💾 Save to Library</button></div><div class="quiz-results-container" id="quizResultsContainer" style="display:none;"></div>';
        
        if (contentDiv) contentDiv.innerHTML = quizHTML;
        showToast("✅ Quiz generated with " + quizData.questions.length + " questions!");
        
    } catch (error) {
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        console.error('Quiz error:', error);
        showToast("Error generating quiz", "error");
    }
}

window.saveQuizAnswer = function(questionNum, answer) {
    if (!window.quizAnswers) window.quizAnswers = {};
    window.quizAnswers[questionNum] = answer;
    
    var questionCard = document.querySelector('.quiz-question-card[data-question-id="' + questionNum + '"]');
    if (questionCard) {
        questionCard.style.borderLeft = '4px solid #10b981';
    }
}

window.submitQuizAnswers = function() {
    if (!window.currentQuizData || !window.currentQuizData.questions) {
        showToast("No quiz loaded!", "error");
        return;
    }
    
    var score = 0;
    var totalQuestions = window.currentQuizData.questions.length;
    var results = [];
    
    window.currentQuizData.questions.forEach(function(q, idx) {
        var qNum = idx + 1;
        var userAnswer = window.quizAnswers ? window.quizAnswers[qNum] : null;
        var isCorrect = userAnswer === q.correctAnswer;
        
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
        
        var feedbackDiv = document.getElementById('feedback-' + qNum);
        if (feedbackDiv) {
            if (userAnswer) {
                if (isCorrect) {
                    feedbackDiv.innerHTML = '<div class="correct-feedback">✅ <strong>Correct!</strong> ' + (q.explanation || 'Great job!') + '</div>';
                    feedbackDiv.style.backgroundColor = '#d1fae5';
                } else {
                    feedbackDiv.innerHTML = '<div class="wrong-feedback">❌ <strong>Incorrect!</strong><br>Your answer: ' + escapeHtml(userAnswer) + '<br>Correct answer: <strong>' + escapeHtml(q.correctAnswer) + '</strong><br>' + (q.explanation ? '📖 ' + q.explanation : '') + '</div>';
                    feedbackDiv.style.backgroundColor = '#fee2e2';
                }
            } else {
                feedbackDiv.innerHTML = '<div class="wrong-feedback">⚠️ <strong>Not answered!</strong><br>Correct answer: <strong>' + escapeHtml(q.correctAnswer) + '</strong><br>' + (q.explanation ? '📖 ' + q.explanation : '') + '</div>';
                feedbackDiv.style.backgroundColor = '#fffbeb';
            }
            feedbackDiv.style.display = 'block';
            feedbackDiv.style.padding = '12px';
            feedbackDiv.style.borderRadius = '8px';
            feedbackDiv.style.marginTop = '10px';
        }
    });
    
    var percentage = Math.round((score / totalQuestions) * 100);
    var gradeMessage = '';
    var gradeIcon = '';
    
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
    
    var resultsContainer = document.getElementById('quizResultsContainer');
    if (resultsContainer) {
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = '<div class="results-card"><div class="results-header"><span class="results-icon">' + gradeIcon + '</span><h3>📊 Quiz Results</h3></div><div class="score-display"><div class="score-number">' + score + '/' + totalQuestions + '</div><div class="score-percentage">' + percentage + '%</div></div><div class="grade-message">' + gradeMessage + '</div><div class="results-details"><details><summary>📖 View Detailed Results</summary><div class="detailed-results">' + results.map(function(r) {
            return '<div class="result-item ' + (r.isCorrect ? 'correct-result' : 'wrong-result') + '"><p><strong>Q' + r.id + ':</strong> ' + escapeHtml(r.question) + '</p><p>Your answer: ' + escapeHtml(r.userAnswer) + '</p><p>Correct: ' + escapeHtml(r.correctAnswer) + '</p>' + (r.explanation ? '<p>Explanation: ' + escapeHtml(r.explanation) + '</p>' : '') + '</div>';
        }).join('') + '</div></details></div><div class="results-actions"><button class="results-btn" onclick="scrollToWrongAnswers()">📖 Review Wrong Answers</button><button class="results-btn" onclick="resetQuizAnswers()">🔄 Try Again</button><button class="results-btn" onclick="exportQuizResults()">📄 Export Results</button></div></div>';
    }
    
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showToast("Quiz completed! Score: " + score + "/" + totalQuestions + " (" + percentage + "%)");
}

window.resetQuizAnswers = function() {
    window.quizAnswers = {};
    
    document.querySelectorAll('#quizQuestionsContainer input[type="radio"]').forEach(function(radio) {
        radio.checked = false;
    });
    
    document.querySelectorAll('.quiz-feedback').forEach(function(feedback) {
        feedback.style.display = 'none';
        feedback.innerHTML = '';
    });
    
    document.querySelectorAll('.quiz-question-card').forEach(function(card) {
        card.style.borderLeft = '';
    });
    
    var resultsContainer = document.getElementById('quizResultsContainer');
    if (resultsContainer) resultsContainer.style.display = 'none';
    
    showToast("Quiz reset! You can try again.");
}

window.scrollToWrongAnswers = function() {
    var wrongFeedbacks = document.querySelectorAll('.wrong-feedback');
    if (wrongFeedbacks.length > 0) {
        wrongFeedbacks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast("Reviewing " + wrongFeedbacks.length + " incorrect answers...");
    } else {
        showToast("🎉 Perfect score! No wrong answers to review!");
    }
}

window.exportQuizResults = function() {
    if (!window.currentQuizData || !window.quizAnswers) {
        showToast("No quiz results to export!", "error");
        return;
    }
    
    var exportText = '📝 ' + window.currentQuizData.title + '\n';
    exportText += '📅 Date: ' + new Date().toLocaleString() + '\n';
    exportText += '📊 Total Questions: ' + window.currentQuizData.questions.length + '\n';
    exportText += '="\n\n';
    
    var score = 0;
    
    window.currentQuizData.questions.forEach(function(q, idx) {
        var qNum = idx + 1;
        var userAnswer = window.quizAnswers[qNum] || "Not answered";
        var isCorrect = userAnswer === q.correctAnswer;
        if (isCorrect) score++;
        
        exportText += qNum + '. ' + q.text + '\n';
        exportText += '   Your answer: ' + userAnswer + '\n';
        exportText += '   Correct answer: ' + q.correctAnswer + '\n';
        exportText += '   Result: ' + (isCorrect ? '✓ CORRECT' : '✗ INCORRECT') + '\n';
        if (q.explanation) {
            exportText += '   Explanation: ' + q.explanation + '\n';
        }
        exportText += '\n';
    });
    
    var percentage = Math.round((score / window.currentQuizData.questions.length) * 100);
    exportText += '="\n';
    exportText += 'FINAL SCORE: ' + score + '/' + window.currentQuizData.questions.length + ' (' + percentage + '%)\n';
    exportText += 'Grade: ' + (percentage >= 70 ? 'PASSED' : 'NEEDS IMPROVEMENT') + '\n';
    
    var blob = new Blob([exportText], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = window.currentQuizData.title.replace(/ /g, '_') + '_results.txt';
    a.click();
    URL.revokeObjectURL(url);
    
    showToast("Quiz results exported!");
}

window.exportQuizAsPDF = function() {
    var content = document.getElementById('quizContent')?.innerHTML;
    if (content) {
        var printWindow = window.open('', '_blank');
        printWindow.document.write('<html><head><title>Quiz</title><style>body { font-family: Arial; padding: 20px; } .quiz-question-card { margin-bottom: 20px; }</style></head><body>' + content + '</body></html>');
        printWindow.print();
    }
}

window.copyQuizToClipboard = function() {
    if (!window.currentQuizData) return;
    var quizText = window.currentQuizData.title + '\n\n';
    window.currentQuizData.questions.forEach(function(q, idx) {
        quizText += (idx + 1) + '. ' + q.text + '\n   Correct: ' + q.correctAnswer + '\n\n';
    });
    navigator.clipboard.writeText(quizText);
    showToast("Quiz copied!");
}

window.saveQuizToLibrary = function() {
    if (!window.currentQuizData) return;
    var user = getCurrentUser();
    var savedQuizzes = JSON.parse(localStorage.getItem("quizzes_" + user) || '[]');
    savedQuizzes.push({
        id: 'quiz_' + Date.now(),
        title: window.currentQuizData.title,
        data: window.currentQuizData,
        date: new Date().toLocaleString()
    });
    localStorage.setItem("quizzes_" + user, JSON.stringify(savedQuizzes));
    showToast("Quiz saved to library!");
}

// ============================================
// STUDY NOTES
// ============================================

window.generateStudyNotes = async function() {
    var topic = document.getElementById('notesTopicInput').value;
    if (!topic) {
        showToast("Please enter a topic", "error");
        return;
    }
    
    var progressDiv = document.getElementById('notesProgress');
    var progressFill = document.getElementById('notesProgressFill');
    var displayDiv = document.getElementById('notesDisplay');
    var contentDiv = document.getElementById('notesContent');
    
    if (progressDiv) progressDiv.style.display = 'block';
    var width = 0;
    var interval = setInterval(function() {
        width += 10;
        if (progressFill) progressFill.style.width = width + '%';
    }, 100);
    
    try {
        var prompt = 'Create comprehensive study notes about "' + topic + '".\n\nInclude:\n1. Key Concepts (at least 5)\n2. Important Definitions\n3. Summary Points\n4. Key Takeaways\n5. Study Tips\n\nFormat with clear headings, bullet points, and emojis for easy reading.\nMake it organized and educational.';

        var response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: prompt,
                document_content: null,
                audio: false
            })
        });
        
        var data = await response.json();
        var notesContent = data.response || "Failed to generate notes.";
        
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        if (displayDiv) displayDiv.style.display = 'block';
        
        if (contentDiv) {
            contentDiv.innerHTML = '<div class="notes-header"><h2>📚 Study Notes: ' + escapeHtml(topic) + '</h2><p>Generated on: ' + new Date().toLocaleString() + '</p></div><div class="notes-body">' + formatContent(notesContent) + '</div>';
        }
        
        window.currentNotes = { topic: topic, content: notesContent, date: new Date().toLocaleString() };
        showToast("✅ Study notes generated!");
        
    } catch (error) {
        clearInterval(interval);
        if (progressDiv) progressDiv.style.display = 'none';
        console.error('Notes error:', error);
        showToast("Error generating notes", "error");
    }
}

window.exportNotesAsPDF = function() {
    var content = document.getElementById('notesContent')?.innerHTML;
    if (content) {
        var printWindow = window.open('', '_blank');
        printWindow.document.write('<html><head><title>Study Notes</title><style>body { font-family: Arial; padding: 20px; }</style></head><body>' + content + '</body></html>');
        printWindow.print();
    }
}

window.copyNotesToClipboard = function() {
    var content = document.getElementById('notesContent')?.innerText;
    if (content) {
        navigator.clipboard.writeText(content);
        showToast("Notes copied!");
    }
}

window.saveNotesToLibrary = function() {
    if (!window.currentNotes) return;
    var user = getCurrentUser();
    var savedNotes = JSON.parse(localStorage.getItem("notes_" + user) || '[]');
    savedNotes.push(window.currentNotes);
    localStorage.setItem("notes_" + user, JSON.stringify(savedNotes));
    showToast("Notes saved to library!");
}

window.printNotes = function() {
    var content = document.getElementById('notesContent')?.innerHTML;
    if (content) {
        var printWindow = window.open('', '_blank');
        printWindow.document.write('<html><head><title>Notes</title></head><body>' + content + '</body></html>');
        printWindow.print();
    }
}

window.useChatForLearning = async function(type) {
    if (!currentChatId) {
        showToast("No active chat found. Start a chat first!", "error");
        return;
    }
    
    var chats = getChats();
    var chat = chats.find(function(c) { return c.id === currentChatId; });
    
    if (!chat || !chat.messages || chat.messages.length === 0) {
        showToast("No chat content found!", "error");
        return;
    }
    
    var lastMessages = chat.messages.slice(-5);
    var chatContent = lastMessages.map(function(m) { return m.role + ': ' + m.content; }).join('\n\n');
    
    if (type === 'quiz') {
        document.getElementById('quizTopicInput').value = "Based on this conversation: " + chatContent.substring(0, 200);
        showToast("✅ Chat content loaded! Click Generate Quiz");
    } else if (type === 'notes') {
        document.getElementById('notesTopicInput').value = "Based on this conversation: " + chatContent.substring(0, 200);
        showToast("✅ Chat content loaded! Click Generate Notes");
    }
}

window.uploadForLearning = function(type) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.pdf,.docx';
    input.onchange = function() { showToast("Document uploaded for " + type + " generation!"); };
    input.click();
}

// ============================================
// GAMES MODULE
// ============================================

// Game state variables
var currentGameType = null;
var currentQuizQuestions = [];
var currentQuizIndex = 0;
var quizScore = 0;
var quizTimer = null;
var timeLeft = 30;

var memoryCards = [];
var memoryFlipped = [];
var memoryLocked = false;
var memoryMatches = 0;

var typingCurrentWord = "";
var typingScore = 0;
var typingRound = 0;
var typingWordsList = [];

var triviaQuestions = [];
var triviaIndex = 0;
var triviaScore = 0;

var scrambleCurrentWord = "";
var scrambleCurrentHint = "";
var scrambleScore = 0;
var scrambleRound = 0;
var scrambleWordsList = [];

var tfQuestions = [];
var tfIndex = 0;
var tfScore = 0;

window.openGamesModal = function() {
    console.log("Opening Games Modal");
    var modal = document.getElementById('gamesModal');
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
    showGameSelectionScreen();
}

window.closeGamesModal = function() {
    var modal = document.getElementById('gamesModal');
    if (modal) modal.style.display = 'none';
    if (quizTimer) clearInterval(quizTimer);
}

function showGameSelectionScreen() {
    var gameContent = document.getElementById('gameContent');
    if (!gameContent) return;
    
    gameContent.innerHTML = '<div class="games-grid-container"><div class="game-card-large" onclick="selectGame(\'quiz-race\')"><div class="game-card-icon">🏆</div><h3>Quiz Race</h3><p>Test your knowledge with timed quizzes</p><button class="play-now-btn">Play Now →</button></div><div class="game-card-large" onclick="selectGame(\'memory-match\')"><div class="game-card-icon">🎴</div><h3>Memory Match</h3><p>Match terms with definitions</p><button class="play-now-btn">Play Now →</button></div><div class="game-card-large" onclick="selectGame(\'typing-speed\')"><div class="game-card-icon">⌨️</div><h3>Typing Speed</h3><p>Improve your typing speed</p><button class="play-now-btn">Play Now →</button></div><div class="game-card-large" onclick="selectGame(\'trivia-challenge\')"><div class="game-card-icon">❓</div><h3>Trivia Challenge</h3><p>Answer random knowledge questions</p><button class="play-now-btn">Play Now →</button></div><div class="game-card-large" onclick="selectGame(\'word-scramble\')"><div class="game-card-icon">🔤</div><h3>Word Scramble</h3><p>Unscramble the letters to form words</p><button class="play-now-btn">Play Now →</button></div><div class="game-card-large" onclick="selectGame(\'true-false\')"><div class="game-card-icon">✓✗</div><h3>True or False</h3><p>Test your knowledge with true/false questions</p><button class="play-now-btn">Play Now →</button></div></div>';
}

window.selectGame = function(gameType) {
    currentGameType = gameType;
    var gameContent = document.getElementById('gameContent');
    if (!gameContent) return;
    
    gameContent.innerHTML = '<div class="game-header-bar"><button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button><h2 class="current-game-title">' + getGameTitle(gameType) + '</h2></div><div id="activeGameContainer" class="active-game-container"></div>';
    
    var activeContainer = document.getElementById('activeGameContainer');
    
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
    var titles = {
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
    
    var q = currentQuizQuestions[currentQuizIndex];
    timeLeft = 30;
    
    if (quizTimer) clearInterval(quizTimer);
    
    quizTimer = setInterval(function() {
        timeLeft--;
        var timerEl = document.getElementById('quizTimer');
        if (timerEl) {
            timerEl.textContent = timeLeft;
            if (timeLeft <= 5) timerEl.style.color = '#ef4444';
            if (timeLeft <= 0) {
                clearInterval(quizTimer);
                moveToNextQuizQuestion(container);
            }
        }
    }, 1000);
    
    container.innerHTML = '<div class="game-header-info"><div class="game-progress">Question ' + (currentQuizIndex + 1) + '/' + currentQuizQuestions.length + '</div><div class="game-score">⭐ Score: ' + quizScore + '</div><div class="game-timer">⏱️ Time: <span id="quizTimer">30</span>s</div></div><div class="game-question-large">' + escapeHtml(q.question) + '</div><div class="game-options-grid">' + q.options.map(function(opt) { return '<button class="game-option-btn" onclick="checkQuizAnswer(\'' + escapeHtml(opt) + '\', this)">' + escapeHtml(opt) + '</button>'; }).join('') + '</div><div class="game-feedback" id="gameFeedback"></div>';
}

window.checkQuizAnswer = function(selected, btnElement) {
    if (quizTimer) clearInterval(quizTimer);
    
    var q = currentQuizQuestions[currentQuizIndex];
    var feedback = document.getElementById('gameFeedback');
    
    document.querySelectorAll('.game-option-btn').forEach(function(btn) { btn.disabled = true; });
    
    if (selected === q.correct) {
        quizScore += 10;
        feedback.innerHTML = '<div class="correct-answer">✅ Correct! +10 points</div>';
        showToast("✅ Correct!");
    } else {
        feedback.innerHTML = '<div class="wrong-answer">❌ Wrong! Correct answer: ' + q.correct + '</div>';
        showToast("❌ Wrong answer!");
    }
    
    setTimeout(function() { moveToNextQuizQuestion(document.getElementById('activeGameContainer')); }, 2000);
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
    var percentage = Math.round((quizScore / (currentQuizQuestions.length * 10)) * 100);
    container.innerHTML = '<div class="game-results-large"><div class="results-emoji">' + (percentage >= 70 ? '🏆' : '📚') + '</div><h2>Quiz Complete!</h2><div class="final-score-large">Final Score: ' + quizScore + '/' + (currentQuizQuestions.length * 10) + '</div><div class="score-percentage-large">' + percentage + '%</div><div class="results-buttons"><button class="play-again-btn" onclick="selectGame(\'quiz-race\')">🔄 Play Again</button><button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button></div></div>';
}

// ================= MEMORY MATCH GAME =================
function loadMemoryMatchGame(container) {
    var pairs = [
        { pair1: "HTML", pair2: "Web Page" },
        { pair1: "CSS", pair2: "Styling" },
        { pair1: "JS", pair2: "JavaScript" },
        { pair1: "API", pair2: "Interface" },
        { pair1: "JSON", pair2: "Data Format" },
        { pair1: "DOM", pair2: "Document Object" }
    ];
    
    memoryCards = [];
    pairs.forEach(function(pair, idx) {
        memoryCards.push({ id: idx * 2, value: pair.pair1, matched: false, pairId: idx });
        memoryCards.push({ id: idx * 2 + 1, value: pair.pair2, matched: false, pairId: idx });
    });
    
    for (var i = memoryCards.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = memoryCards[i];
        memoryCards[i] = memoryCards[j];
        memoryCards[j] = temp;
    }
    
    memoryFlipped = [];
    memoryLocked = false;
    memoryMatches = 0;
    
    renderMemoryGame(container);
}

function renderMemoryGame(container) {
    container.innerHTML = '<div class="game-header-info"><div class="game-progress">🎴 Memory Match</div><div class="game-score">Matches: ' + memoryMatches + '/' + (memoryCards.length / 2) + '</div></div><div class="memory-grid-large">' + memoryCards.map(function(card, idx) {
        return '<div class="memory-card-large' + (card.matched ? ' matched' : '') + (memoryFlipped.includes(idx) ? ' flipped' : '') + '" onclick="flipMemoryCard(' + idx + ')"><div class="card-front">❓</div><div class="card-back">' + (card.matched ? '✓' : escapeHtml(card.value)) + '</div></div>';
    }).join('') + '</div><div class="game-buttons"><button class="play-again-btn" onclick="selectGame(\'memory-match\')">🔄 New Game</button><button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button></div>';
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
    var card1 = memoryCards[memoryFlipped[0]];
    var card2 = memoryCards[memoryFlipped[1]];
    
    if (card1.pairId === card2.pairId) {
        card1.matched = true;
        card2.matched = true;
        memoryMatches++;
        memoryFlipped = [];
        renderMemoryGame(document.getElementById('activeGameContainer'));
        showToast("🎉 Match found!");
        
        if (memoryMatches === memoryCards.length / 2) {
            setTimeout(function() { showToast("🏆 Congratulations! You completed the game!"); }, 500);
        }
    } else {
        memoryLocked = true;
        setTimeout(function() {
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
    
    container.innerHTML = '<div class="game-header-info"><div class="game-progress">Word ' + (typingRound + 1) + '/' + typingWordsList.length + '</div><div class="game-score">⭐ Score: ' + typingScore + '</div></div><div class="typing-word-large">' + typingCurrentWord + '</div><input type="text" id="typingInput" class="game-input-large" placeholder="Type the word above..." autofocus><div class="game-buttons"><button class="game-submit-btn-large" onclick="checkTypingWord()">Submit</button><button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back</button></div><div class="game-feedback" id="typingFeedback"></div>';
    
    document.getElementById('typingInput')?.focus();
}

window.checkTypingWord = function() {
    var input = document.getElementById('typingInput');
    var userInput = input?.value.trim().toLowerCase();
    var feedback = document.getElementById('typingFeedback');
    var container = document.getElementById('activeGameContainer');
    
    if (userInput === typingCurrentWord) {
        typingScore += 10;
        feedback.innerHTML = '<div class="correct-answer">✅ Correct! +10 points</div>';
        showToast("🎉 Correct!");
    } else {
        feedback.innerHTML = '<div class="wrong-answer">❌ Wrong! The word was: ' + typingCurrentWord + '</div>';
        showToast("❌ Wrong!");
    }
    
    setTimeout(function() {
        typingRound++;
        loadNextTypingWord(container);
    }, 1500);
}

function showTypingResults(container) {
    var percentage = Math.round((typingScore / (typingWordsList.length * 10)) * 100);
    container.innerHTML = '<div class="game-results-large"><div class="results-emoji">⌨️</div><h2>Typing Speed Complete!</h2><div class="final-score-large">Score: ' + typingScore + '/' + (typingWordsList.length * 10) + '</div><div class="score-percentage-large">' + percentage + '%</div><div class="results-buttons"><button class="play-again-btn" onclick="selectGame(\'typing-speed\')">🔄 Try Again</button><button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button></div></div>';
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
    
    var q = triviaQuestions[triviaIndex];
    
    container.innerHTML = '<div class="game-header-info"><div class="game-progress">Question ' + (triviaIndex + 1) + '/' + triviaQuestions.length + '</div><div class="game-score">⭐ Score: ' + triviaScore + '</div></div><div class="game-question-large">' + escapeHtml(q.question) + '</div><div class="game-options-grid">' + q.options.map(function(opt) { return '<button class="game-option-btn" onclick="checkTriviaAnswer(\'' + escapeHtml(opt) + '\', this)">' + escapeHtml(opt) + '</button>'; }).join('') + '</div><div class="game-feedback" id="triviaFeedback"></div>';
}

window.checkTriviaAnswer = function(selected, btnElement) {
    var q = triviaQuestions[triviaIndex];
    var feedback = document.getElementById('triviaFeedback');
    
    document.querySelectorAll('.game-option-btn').forEach(function(btn) { btn.disabled = true; });
    
    if (selected === q.correct) {
        triviaScore += 10;
        feedback.innerHTML = '<div class="correct-answer">✅ Correct! ' + (q.funFact || 'Great job!') + '</div>';
        showToast("✅ Correct!");
    } else {
        feedback.innerHTML = '<div class="wrong-answer">❌ Wrong! Correct: ' + q.correct + '. ' + (q.funFact || '') + '</div>';
        showToast("❌ Wrong!");
    }
    
    setTimeout(function() {
        triviaIndex++;
        displayTriviaQuestion(document.getElementById('activeGameContainer'));
    }, 2000);
}

function showTriviaResults(container) {
    var percentage = Math.round((triviaScore / (triviaQuestions.length * 10)) * 100);
    container.innerHTML = '<div class="game-results-large"><div class="results-emoji">' + (percentage >= 70 ? '🏆' : '📚') + '</div><h2>Trivia Complete!</h2><div class="final-score-large">Score: ' + triviaScore + '/' + (triviaQuestions.length * 10) + '</div><div class="score-percentage-large">' + percentage + '%</div><div class="results-buttons"><button class="play-again-btn" onclick="selectGame(\'trivia-challenge\')">🔄 Play Again</button><button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button></div></div>';
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
    
    var wordObj = scrambleWordsList[scrambleRound];
    scrambleCurrentWord = wordObj.word;
    scrambleCurrentHint = wordObj.hint;
    
    var scrambled = scrambleCurrentWord.split('');
    for (var i = scrambled.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = scrambled[i];
        scrambled[i] = scrambled[j];
        scrambled[j] = temp;
    }
    
    container.innerHTML = '<div class="game-header-info"><div class="game-progress">Word ' + (scrambleRound + 1) + '/' + scrambleWordsList.length + '</div><div class="game-score">⭐ Score: ' + scrambleScore + '</div></div><div class="scrambled-word-large">' + scrambled.join(' ').toUpperCase() + '</div><div class="game-hint-large">💡 Hint: ' + escapeHtml(scrambleCurrentHint) + '</div><input type="text" id="scrambleGuess" class="game-input-large" placeholder="Type your guess..." autofocus><div class="game-buttons"><button class="game-submit-btn-large" onclick="checkScrambleGuess()">Submit Guess</button><button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back</button></div><div class="game-feedback" id="scrambleFeedback"></div>';
    
    document.getElementById('scrambleGuess')?.focus();
}

window.checkScrambleGuess = function() {
    var input = document.getElementById('scrambleGuess');
    var guess = input?.value.trim().toLowerCase();
    var feedback = document.getElementById('scrambleFeedback');
    var container = document.getElementById('activeGameContainer');
    
    if (guess === scrambleCurrentWord.toLowerCase()) {
        scrambleScore += 10;
        feedback.innerHTML = '<div class="correct-answer">✅ Correct! +10 points</div>';
        showToast("🎉 Correct!");
    } else {
        feedback.innerHTML = '<div class="wrong-answer">❌ Wrong! The word was: ' + scrambleCurrentWord + '</div>';
        showToast("❌ Wrong!");
    }
    
    setTimeout(function() {
        scrambleRound++;
        loadNextScrambleWord(container);
    }, 1500);
}

function showScrambleResults(container) {
    var percentage = Math.round((scrambleScore / (scrambleWordsList.length * 10)) * 100);
    container.innerHTML = '<div class="game-results-large"><div class="results-emoji">🔤</div><h2>Word Scramble Complete!</h2><div class="final-score-large">Score: ' + scrambleScore + '/' + (scrambleWordsList.length * 10) + '</div><div class="score-percentage-large">' + percentage + '%</div><div class="results-buttons"><button class="play-again-btn" onclick="selectGame(\'word-scramble\')">🔄 Play Again</button><button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button></div></div>';
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
    
    var q = tfQuestions[tfIndex];
    
    container.innerHTML = '<div class="game-header-info"><div class="game-progress">Question ' + (tfIndex + 1) + '/' + tfQuestions.length + '</div><div class="game-score">⭐ Score: ' + tfScore + '</div></div><div class="game-question-large">' + escapeHtml(q.statement) + '</div><div class="truefalse-buttons-large"><button class="true-btn-large" onclick="checkTrueFalseAnswer(true)">✓ True</button><button class="false-btn-large" onclick="checkTrueFalseAnswer(false)">✗ False</button></div><div class="game-feedback" id="tfFeedback"></div>';
}

window.checkTrueFalseAnswer = function(selected) {
    var q = tfQuestions[tfIndex];
    var feedback = document.getElementById('tfFeedback');
    var isCorrect = (selected === q.answer);
    
    document.querySelectorAll('.true-btn-large, .false-btn-large').forEach(function(btn) { btn.disabled = true; });
    
    if (isCorrect) {
        tfScore += 10;
        feedback.innerHTML = '<div class="correct-answer">✅ Correct! ' + q.explanation + '</div>';
        showToast("✅ Correct!");
    } else {
        feedback.innerHTML = '<div class="wrong-answer">❌ Wrong! ' + q.explanation + '</div>';
        showToast("❌ Wrong!");
    }
    
    setTimeout(function() {
        tfIndex++;
        displayTrueFalseQuestion(document.getElementById('activeGameContainer'));
    }, 2000);
}

function showTrueFalseResults(container) {
    var percentage = Math.round((tfScore / (tfQuestions.length * 10)) * 100);
    container.innerHTML = '<div class="game-results-large"><div class="results-emoji">' + (percentage >= 70 ? '🏆' : '📚') + '</div><h2>True or False Complete!</h2><div class="final-score-large">Score: ' + tfScore + '/' + (tfQuestions.length * 10) + '</div><div class="score-percentage-large">' + percentage + '%</div><div class="results-buttons"><button class="play-again-btn" onclick="selectGame(\'true-false\')">🔄 Play Again</button><button class="back-to-games-btn" onclick="showGameSelectionScreen()">← Back to Games</button></div></div>';
}
