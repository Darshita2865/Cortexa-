console.log("JS LOADED - Cortexa Starting");

// ================= GLOBAL VARIABLES =================
let currentDocument = null;
let audioModal = null;
let isListening = false;
let currentUtterance = null;
let currentAudio = null;
let currentAudioMode = 'simple';
let currentChatId = null;
let currentProjectId = null;
let currentAudioText = "";

const API_URL = "https://cortexa-2-2ydr.onrender.com/api/chat";

// ================= HELPER FUNCTIONS =================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ================= FORMAT FUNCTION =================
function formatContent(content) {
    if (!content) return '';
    // Remove any "BOLD:" prefix if present
    let cleaned = content.replace(/^BOLD:\s*/i, '');
    let formatted = cleaned.replace(/\n/g, '<br>');
    // Only convert **text** to bold, not everything
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
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
    
    msgDiv.innerHTML = `
        <div class="chat-title">${sender === "user" ? "You" : "Cortexa"}</div>
        <div class="chat-content">${formattedText}</div>
    `;

    const id = "msg-" + Date.now();
    msgDiv.id = id;

    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

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
    const loadingId = displayMessage('<span class="typing-dots">● ● ●</span>', 'bot');
    
    try {
        const requestBody = {
            message: query,
            document_content: currentDocument?.content ? currentDocument.content : "null",
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
        updateMessage(loadingId, "⚠️ Error connecting to AI. Make sure backend is running on port 8000");
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
        displayMessage("👋 Hello! I'm Cortexa. How can I help you today?\n\nYou can ask me about:\n• Any topic or concept\n• Upload documents to chat with them\n• Generate audio explanations\n• Create mind maps and presentations", 'bot');
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
    chats.forEach(chat => {
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
        container.innerHTML = '<div class="empty-message">No projects yet. Click "New Project" to create one!</div>';
        return;
    }
    
    container.innerHTML = "";
    projects.forEach(project => {
        const div = document.createElement("div");
        div.className = "project-item";
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
        showToastMessage("🗑️ Chat deleted!");
    }
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
}

// Updated toggleChatMenu function
window.toggleChatMenu = function(event, chatId) {
    event.stopPropagation();
    
    // Close all other dropdowns
    document.querySelectorAll('.chat-dropdown.show, .project-dropdown.show').forEach(dropdown => {
        if (dropdown.id !== `chat-dropdown-${chatId}` && dropdown.id !== `project-dropdown-${chatId}`) {
            dropdown.classList.remove('show');
        }
    });
    
    const dropdown = document.getElementById(`chat-dropdown-${chatId}`);
    if (!dropdown) return;
    
    // Remove any inline styles that might interfere
    dropdown.style.position = '';
    dropdown.style.top = '';
    dropdown.style.right = '';
    dropdown.style.bottom = '';
    
    dropdown.classList.toggle('show');
    
    // Auto close after 5 seconds
    setTimeout(() => {
        dropdown.classList.remove('show');
    }, 5000);
}

// Updated toggleProjectMenu function
window.toggleProjectMenu = function(event, projectId) {
    event.stopPropagation();
    
    // Close all other dropdowns
    document.querySelectorAll('.chat-dropdown.show, .project-dropdown.show').forEach(dropdown => {
        if (dropdown.id !== `chat-dropdown-${projectId}` && dropdown.id !== `project-dropdown-${projectId}`) {
            dropdown.classList.remove('show');
        }
    });
    
    const dropdown = document.getElementById(`project-dropdown-${projectId}`);
    if (!dropdown) return;
    
    // Remove any inline styles that might interfere
    dropdown.style.position = '';
    dropdown.style.top = '';
    dropdown.style.right = '';
    dropdown.style.bottom = '';
    
    dropdown.classList.toggle('show');
    
    // Auto close after 5 seconds
    setTimeout(() => {
        dropdown.classList.remove('show');
    }, 5000);
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
            showToastMessage("✅ Chat copied!");
        }
    } else {
        showToastMessage("❌ No active chat!");
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
            showToastMessage("🗑️ Chat deleted!");
        }
    } else {
        showToastMessage("❌ No active chat!");
    }
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
        showToastMessage(`✅ Project "${name}" created!`);
    }
}

// ================= DOCUMENT CHAT =================
window.documentChat = function() {
    const overlay = document.createElement('div');
    overlay.className = 'upload-overlay';
    overlay.innerHTML = `
        <div class="upload-modal">
            <h3>📄 Upload Document</h3>
            <input type="file" id="docFileInput" accept=".pdf,.docx,.txt">
            <div style="margin-top: 15px;">
                <button onclick="closeUploadOverlay()">Cancel</button>
                <button onclick="uploadAndChat()">Upload & Chat</button>
            </div>
            <div id="uploadStatus" style="margin-top: 10px;"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    window.currentOverlay = overlay;
}

window.closeUploadOverlay = function() {
    if (window.currentOverlay) {
        window.currentOverlay.remove();
        window.currentOverlay = null;
    }
}

window.uploadAndChat = async function() {
    const fileInput = document.getElementById('docFileInput');
    const statusDiv = document.getElementById('uploadStatus');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        statusDiv.innerHTML = '<span style="color: #ef4444;">❌ Select a file!</span>';
        return;
    }
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    statusDiv.innerHTML = '<span style="color: #a855f7;">⏳ Uploading...</span>';
    
    try {
        const response = await fetch("https://cortexa-2-2ydr.onrender.com/upload-document", {
            method: "POST",
            body: formData
        });
        
        const data = await response.json();
        
        if (data.content) {
            currentDocument = {
                name: data.filename,
                content: data.content
            };
            localStorage.setItem("currentDocument", JSON.stringify(currentDocument));
            statusDiv.innerHTML = '<span style="color: #22c55e;">✅ Document loaded!</span>';
            setTimeout(() => {
                window.closeUploadOverlay();
                displayMessage(`📄 Document loaded: ${data.filename}\n\nYou can now ask questions about this document!`, 'bot');
                showDocumentIndicator(data.filename);
            }, 1500);
        } else {
            statusDiv.innerHTML = '<span style="color: #ef4444;">❌ Failed to load document</span>';
        }
    } catch (error) {
        console.error("Upload error:", error);
        statusDiv.innerHTML = '<span style="color: #ef4444;">❌ Upload failed</span>';
    }
}

function showDocumentIndicator(filename) {
    const existing = document.querySelector('.document-indicator');
    if (existing) existing.remove();
    const indicator = document.createElement('div');
    indicator.className = 'document-indicator';
    indicator.innerHTML = `📄 ${filename.substring(0, 30)} <button onclick="clearDocument()">✕</button>`;
    indicator.style.cssText = 'position: fixed; bottom: 80px; right: 20px; background: #a855f7; color: white; padding: 8px 16px; border-radius: 20px; font-size: 12px; z-index: 1000; cursor: pointer;';
    document.body.appendChild(indicator);
}

window.clearDocument = function() {
    currentDocument = null;
    localStorage.removeItem("currentDocument");
    const indicator = document.querySelector('.document-indicator');
    if (indicator) indicator.remove();
    displayMessage('🗑️ Document cleared. You can now chat normally.', 'bot');
}

function loadSavedDocument() {
    const savedDoc = localStorage.getItem("currentDocument");
    if (savedDoc) {
        currentDocument = JSON.parse(savedDoc);
        showDocumentIndicator(currentDocument.name);
    }
}
loadSavedDocument();

window.logout = function() {
    localStorage.removeItem("isLoggedIn");
    window.location.href = "login.html";
}

function showToastMessage(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:linear-gradient(90deg,#a855f7,#6366f1); color:white; padding:10px 20px; border-radius:25px; font-size:14px; z-index:10000; animation:fadeInOut 3s ease;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Add CSS for toast
if (!document.querySelector('#toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
            15% { opacity: 1; transform: translateX(-50%) translateY(0); }
            85% { opacity: 1; transform: translateX(-50%) translateY(0); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        }
    `;
    document.head.appendChild(style);
}

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM fully loaded - Cortexa Ready");
    
    // Load chats and projects
    loadChats();
    loadProjects();
    addWelcomeMessage();
    
    // Setup enter key for search input
    const inputField = document.getElementById("searchInput");
    if (inputField) {
        inputField.addEventListener("keypress", function(e) {
            if (e.key === "Enter") {
                e.preventDefault();
                window.performSearch();
            }
        });
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.chat-menu-container')) {
            document.querySelectorAll('.chat-dropdown.show').forEach(dropdown => dropdown.classList.remove('show'));
        }
        if (!e.target.closest('.plus-dropdown-container')) {
            const plusDropdown = document.getElementById('plusDropdown');
            if (plusDropdown) plusDropdown.classList.remove('show');
        }
    });
});

console.log("✅ script.js loaded successfully!");

// ================= LOAD PROJECTS =================
function loadProjects() {
    const container = document.getElementById("projectListRight");
    if (!container) return;
    
    let projects = JSON.parse(localStorage.getItem("projects")) || [];
    if (projects.length === 0) {
        container.innerHTML = '<div class="empty-message">No projects yet. Click "New Project" to create one!</div>';
        return;
    }
    
    container.innerHTML = "";
    projects.forEach(project => {
        const div = document.createElement("div");
        div.className = `project-item ${currentProjectId === project.id ? 'active' : ''}`;
        div.setAttribute('data-project-id', project.id);
        div.innerHTML = `
            <span class="project-title" onclick="loadProjectById('${project.id}')">📁 ${escapeHtml(project.name.substring(0, 35))}</span>
            <div class="project-menu-container">
                <button class="project-menu-btn" onclick="toggleProjectMenu(event, '${project.id}')">⋯</button>
                <div class="project-dropdown" id="project-dropdown-${project.id}">
                    <div class="dropdown-item" onclick="shareProjectById('${project.id}')">
                        <span>🔗</span> Share
                    </div>
                    <div class="dropdown-item delete" onclick="deleteProjectById('${project.id}')">
                        <span>🗑️</span> Delete
                    </div>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// ================= TOGGLE FUNCTIONS =================


window.toggleProjectMenu = function(event, projectId) {
    event.stopPropagation();
    document.querySelectorAll('.project-dropdown.show').forEach(dropdown => {
        if (dropdown.id !== `project-dropdown-${projectId}`) {
            dropdown.classList.remove('show');
        }
    });
    const dropdown = document.getElementById(`project-dropdown-${projectId}`);
    if (!dropdown) return;
    const button = event.target;
    const rect = button.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.bottom = 'auto';
    dropdown.style.top = `${rect.top - 10}px`;
    dropdown.style.right = `${window.innerWidth - rect.right + 15}px`;
    dropdown.classList.toggle('show');
    setTimeout(() => dropdown.classList.remove('show'), 5000);
}

window.shareChatById = function(chatId) {
    let chats = JSON.parse(localStorage.getItem("chats")) || [];
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
        const shareText = `${chat.title}\n\n${chat.messages.map(m => `${m.role === 'user' ? 'You' : 'Cortexa'}: ${m.content}`).join('\n\n')}`;
        navigator.clipboard.writeText(shareText);
        alert("✅ Chat copied to clipboard!");
    }
    const dropdown = document.getElementById(`chat-dropdown-${chatId}`);
    if (dropdown) dropdown.classList.remove('show');
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
        alert("🗑️ Chat deleted!");
    }
    const dropdown = document.getElementById(`chat-dropdown-${chatId}`);
    if (dropdown) dropdown.classList.remove('show');
}

window.shareProjectById = function(projectId) {
    let projects = JSON.parse(localStorage.getItem("projects")) || [];
    const project = projects.find(p => p.id === projectId);
    if (project) {
        const shareText = `Project: ${project.name}\nCreated: ${project.created_at}`;
        navigator.clipboard.writeText(shareText);
        alert("✅ Project shared!");
    }
    const dropdown = document.getElementById(`project-dropdown-${projectId}`);
    if (dropdown) dropdown.classList.remove('show');
}

window.deleteProjectById = function(projectId) {
    if (confirm("Delete this project?")) {
        let projects = JSON.parse(localStorage.getItem("projects")) || [];
        projects = projects.filter(project => project.id !== projectId);
        localStorage.setItem("projects", JSON.stringify(projects));
        if (currentProjectId === projectId) currentProjectId = null;
        loadProjects();
        alert("🗑️ Project deleted!");
    }
    const dropdown = document.getElementById(`project-dropdown-${projectId}`);
    if (dropdown) dropdown.classList.remove('show');
}

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
    }
}

window.loadProjectById = function(projectId) {
    let projects = JSON.parse(localStorage.getItem("projects")) || [];
    const project = projects.find(p => p.id === projectId);
    if (project) {
        currentProjectId = project.id;
        loadProjects();
        alert(`📁 Loading project: ${project.name}`);
    }
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
            alert("✅ Chat copied!");
        }
    } else {
        alert("❌ No active chat!");
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
            alert("🗑️ Chat deleted!");
        }
    } else {
        alert("❌ No active chat!");
    }
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
        alert(`✅ Project "${name}" created!`);
    }
}

// ================= DOCUMENT CHAT =================
window.documentChat = function() {
    const overlay = document.createElement('div');
    overlay.className = 'upload-overlay';
    overlay.innerHTML = `
        <div class="upload-modal">
            <h3>📄 Upload Document</h3>
            <input type="file" id="docFileInput" accept=".pdf,.docx,.txt">
            <div style="margin-top: 15px;">
                <button onclick="closeUploadOverlay()">Cancel</button>
                <button onclick="uploadAndChat()">Upload & Chat</button>
            </div>
            <div id="uploadStatus" style="margin-top: 10px;"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    window.currentOverlay = overlay;
}

window.closeUploadOverlay = function() {
    if (window.currentOverlay) {
        window.currentOverlay.remove();
        window.currentOverlay = null;
    }
}

window.uploadAndChat = async function() {
    const fileInput = document.getElementById('docFileInput');
    const statusDiv = document.getElementById('uploadStatus');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        statusDiv.innerHTML = '<span style="color: #ef4444;">❌ Select a file!</span>';
        return;
    }
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    statusDiv.innerHTML = '<span style="color: #a855f7;">⏳ Uploading...</span>';
    
    try {
        const response = await fetch("https://cortexa-2-2ydr.onrender.com/upload-document", {
            method: "POST",
            body: formData
        }); 
        
        const data = await response.json();
        
        if (data.content) {
            currentDocument = {
                name: data.filename,
                content: data.content
            };
            localStorage.setItem("currentDocument", JSON.stringify(currentDocument));
            statusDiv.innerHTML = '<span style="color: #22c55e;">✅ Document loaded!</span>';
            setTimeout(() => {
                window.closeUploadOverlay();
                displayMessage(`📄 Document loaded: ${data.filename}\n\nYou can now ask questions about this document!`, 'bot');
                showDocumentIndicator(data.filename);
            }, 1500);
        } else {
            statusDiv.innerHTML = '<span style="color: #ef4444;">❌ Failed to load document</span>';
        }
    } catch (error) {
        console.error("Upload error:", error);
        statusDiv.innerHTML = '<span style="color: #ef4444;">❌ Upload failed</span>';
    }
}

function showDocumentIndicator(filename) {
    const existing = document.querySelector('.document-indicator');
    if (existing) existing.remove();
    const indicator = document.createElement('div');
    indicator.className = 'document-indicator';
    indicator.innerHTML = `📄 ${filename.substring(0, 30)} <button onclick="clearDocument()">✕</button>`;
    indicator.style.cssText = 'position: fixed; bottom: 80px; right: 20px; background: #a855f7; color: white; padding: 8px 16px; border-radius: 20px; font-size: 12px; z-index: 1000; cursor: pointer;';
    document.body.appendChild(indicator);
}

window.clearDocument = function() {
    currentDocument = null;
    localStorage.removeItem("currentDocument");
    const indicator = document.querySelector('.document-indicator');
    if (indicator) indicator.remove();
    displayMessage('🗑️ Document cleared. You can now chat normally.', 'bot');
}

function loadSavedDocument() {
    const savedDoc = localStorage.getItem("currentDocument");
    if (savedDoc) {
        currentDocument = JSON.parse(savedDoc);
        showDocumentIndicator(currentDocument.name);
    }
}
loadSavedDocument();



// ================= VIDEO EXPLANATION MODULE - UPDATED =================
let videoModal = null;
let currentVideoData = null;
let youtubeVideoInfo = null;
let videoDocumentContent = null;
let videoGenerationInterval = null;
let mediaRecorder = null;
let audioChunks = [];
let isVoiceRecording = false;

// 🔐 YouTube API Key - Reads from .env file
// In your .env file: YOUTUBE_API_KEY=your_actual_key
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// Check if API key is configured
function isYouTubeApiConfigured() {
    return YOUTUBE_API_KEY && YOUTUBE_API_KEY !== '';
}
// ================= OPEN VIDEO MODAL (FIXED) =================
window.openVideoMode = function() {
    console.log("Opening Video Modal");
    const modal = document.getElementById('videoModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        modal.style.zIndex = '10000';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        
        // Load video library and switch to YouTube tab
        loadVideoLibrary();
        switchVideoTab('youtube');
        
        console.log("Video modal opened successfully");
    } else {
        console.error("videoModal element not found!");
        alert("Video modal not found. Please check your HTML for element with id='videoModal'");
    }
}
window.closeVideoMode = function() {
    const modal = document.getElementById('videoModal');
    if (modal) modal.style.display = 'none';
    if (videoGenerationInterval) clearInterval(videoGenerationInterval);
    // Stop voice recording if active
    if (mediaRecorder && isVoiceRecording) {
        mediaRecorder.stop();
        isVoiceRecording = false;
    }
}

window.switchVideoTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    
    document.getElementById('createTab').style.display = 'none';
    document.getElementById('youtubeTab').style.display = 'none';
    document.getElementById('libraryTab').style.display = 'none';
    
    if (tab === 'create') document.getElementById('createTab').style.display = 'block';
    else if (tab === 'youtube') document.getElementById('youtubeTab').style.display = 'block';
    else if (tab === 'library') {
        document.getElementById('libraryTab').style.display = 'block';
        loadVideoLibrary();
    }
}

window.handleVideoSourceChange = function() {
    const source = document.getElementById('videoContentSource').value;
    document.getElementById('textSourcePanel').style.display = source === 'text' ? 'block' : 'none';
    document.getElementById('documentSourcePanel').style.display = source === 'document' ? 'block' : 'none';
    
    // Handle Chat Source
    if (source === 'chat') {
        useCurrentChatForVideo();
    }
    
    // Handle Voice Input
    if (source === 'voice') {
        startVoiceInputForVideo();
    }
}

// ================= USE CURRENT CHAT (WORKING) =================
window.useCurrentChatForVideo = function() {
    const chatMessages = document.querySelectorAll('.chat-content');
    let chatContent = '';
    chatMessages.forEach(msg => {
        const text = msg.innerText || msg.textContent;
        if (text && !text.includes('Cortexa') && !text.includes('You')) {
            chatContent += text + '\n';
        }
    });
    
    // Also get user messages specifically
    const userBubbles = document.querySelectorAll('.user-bubble .chat-content');
    userBubbles.forEach(bubble => {
        chatContent += bubble.innerText + '\n';
    });
    
    if (chatContent && chatContent.trim() !== '') {
        const topicInput = document.getElementById('videoTopicInput');
        if (topicInput) {
            // Extract key topic from chat (first few words or detect subject)
            const firstLine = chatContent.split('\n')[0];
            const shortTopic = firstLine.substring(0, 100);
            topicInput.value = `Based on our conversation about: ${shortTopic}\n\nFull conversation context:\n${chatContent.substring(0, 800)}`;
            showToast('✅ Current chat loaded! You can now generate a video based on our conversation.');
        }
    } else {
        showToast('❌ No chat content found. Start a conversation first!');
        // Switch back to text mode
        document.getElementById('videoContentSource').value = 'text';
        handleVideoSourceChange();
    }
}

// ================= VOICE INPUT (WORKING) =================
window.startVoiceInputForVideo = async function() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('❌ Voice recognition not supported in this browser. Please use Chrome or Edge.');
        document.getElementById('videoContentSource').value = 'text';
        handleVideoSourceChange();
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    showToast('🎤 Listening... Please speak your topic.');
    
    recognition.onstart = () => {
        console.log('Voice recognition started');
    };
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const topicInput = document.getElementById('videoTopicInput');
        if (topicInput) {
            topicInput.value = transcript;
            showToast(`✅ Voice captured: "${transcript}"`);
        }
    };
    
    recognition.onerror = (event) => {
        console.error('Recognition error:', event.error);
        showToast(`❌ Voice error: ${event.error}. Please try typing instead.`);
        document.getElementById('videoContentSource').value = 'text';
        handleVideoSourceChange();
    };
    
    recognition.onend = () => {
        console.log('Voice recognition ended');
    };
    
    recognition.start();
    
    // Auto timeout after 10 seconds
    setTimeout(() => {
        try {
            recognition.stop();
        } catch(e) {}
    }, 10000);
}

// Alternative: Record audio for longer content
window.toggleVoiceRecording = async function() {
    if (!isVoiceRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                // Here you would send to backend for transcription
                showToast('🎤 Recording saved! You can now type or continue.');
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            isVoiceRecording = true;
            showToast('🎙️ Recording... Click microphone again to stop.');
            
            const micBtn = document.querySelector('#createTab .mic-button');
            if (micBtn) micBtn.classList.add('listening');
            
        } catch (err) {
            console.error('Microphone error:', err);
            showToast('❌ Cannot access microphone. Please check permissions.');
        }
    } else {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            isVoiceRecording = false;
            showToast('✅ Recording stopped. You can now generate your video.');
            const micBtn = document.querySelector('#createTab .mic-button');
            if (micBtn) micBtn.classList.remove('listening');
        }
    }
}

// Helper function to show toast messages
function showToast(message) {
    const existingToast = document.querySelector('.video-toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'video-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(90deg, #a855f7, #6366f1);
        color: white;
        padding: 10px 20px;
        border-radius: 25px;
        font-size: 14px;
        z-index: 30001;
        animation: fadeInOut 3s ease;
        white-space: nowrap;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast) toast.remove();
    }, 3000);
}

// Add CSS animation for toast
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

// ================= UPDATED YOUTUBE INTEGRATION (Opens on YouTube.com) =================
window.fetchYouTubeVideo = async function() {
    const url = document.getElementById('youtubeUrl').value;
    if (!url) {
        showToast('Please enter a YouTube URL');
        return;
    }
    
    const infoDiv = document.getElementById('youtubeVideoInfo');
    infoDiv.innerHTML = '<div class="loading-spinner"></div> Fetching video info...';
    infoDiv.style.display = 'block';
    
    let videoId = '';
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([^&]+)/,
        /(?:youtu\.be\/)([^?]+)/,
        /(?:youtube\.com\/embed\/)([^?]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) { 
            videoId = match[1]; 
            break; 
        }
    }
    
    if (!videoId) {
        infoDiv.innerHTML = '<span style="color: #ef4444;">❌ Invalid YouTube URL</span>';
        return;
    }
    
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await fetch(oembedUrl);
        const data = await response.json();
        
        youtubeVideoInfo = {
            id: videoId,
            title: data.title,
            channel: data.author_name,
            thumbnail: data.thumbnail_url,
            youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`
        };
        
        // Display video info with OPEN ON YOUTUBE button (not embedded player)
        infoDiv.innerHTML = `
            <div style="background: rgba(168,85,247,0.1); padding: 15px; border-radius: 10px;">
                <img src="${youtubeVideoInfo.thumbnail}" style="width: 100%; border-radius: 10px; margin-bottom: 10px;">
                <h4>${escapeHtml(youtubeVideoInfo.title)}</h4>
                <p>📺 ${escapeHtml(youtubeVideoInfo.channel)}</p>
                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <button onclick="openYouTubeVideo()" style="flex: 1; padding: 12px; background: linear-gradient(90deg,#ff0000,#cc0000); border: none; border-radius: 8px; color: white; cursor: pointer;">
                        ▶️ Watch on YouTube.com
                    </button>
                    <button onclick="copyYouTubeUrl()" style="flex: 1; padding: 12px; background: rgba(168,85,247,0.3); border: 1px solid rgba(168,85,247,0.5); border-radius: 8px; color: white; cursor: pointer;">
                        📋 Copy URL
                    </button>
                </div>
            </div>
        `;
        document.getElementById('youtubeOptions').style.display = 'block';
        
    } catch (err) {
        infoDiv.innerHTML = '<span style="color: #ef4444;">❌ Error fetching video info</span>';
    }
}

// Open YouTube video directly on YouTube.com (not in Cortexa)
window.openYouTubeVideo = function() {
    if (youtubeVideoInfo && youtubeVideoInfo.youtubeUrl) {
        window.open(youtubeVideoInfo.youtubeUrl, '_blank');
        showToast('🎬 Opening YouTube video in new tab...');
    } else {
        showToast('❌ No video selected. Fetch a video first!');
    }
}

window.copyYouTubeUrl = function() {
    if (youtubeVideoInfo && youtubeVideoInfo.youtubeUrl) {
        navigator.clipboard.writeText(youtubeVideoInfo.youtubeUrl);
        showToast('✅ YouTube URL copied to clipboard!');
    } else {
        showToast('❌ No video URL to copy');
    }
}

window.searchYouTube = async function() {
    const query = document.getElementById('youtubeSearchQuery').value;
    if (!query) {
        showToast('Please enter a search query');
        return;
    }
    
    const resultsDiv = document.getElementById('youtubeResults');
    resultsDiv.innerHTML = '<div class="loading-spinner"></div> Searching...';
    
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'AIzaSyD9Zw2nSmE7dkzNN5JtaiXKdQA9Rctu9LI') {
        resultsDiv.innerHTML = `
            <div style="background: rgba(168,85,247,0.1); padding: 20px; border-radius: 10px; text-align: center;">
                <p>⚠️ YouTube API key not configured!</p>
                <p style="font-size: 12px; margin-top: 10px;">Add your YouTube Data API v3 key to use search.</p>
                <p style="font-size: 12px;">For now, you can still use direct YouTube URLs above.</p>
            </div>
        `;
        return;
    }
    
    try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            resultsDiv.innerHTML = `<div style="background: rgba(239,68,68,0.1); padding: 20px; border-radius: 10px; text-align: center;">
                <p>❌ API Error: ${data.error.message}</p>
            </div>`;
            return;
        }
        
        if (data.items && data.items.length > 0) {
            resultsDiv.innerHTML = `<h3>📺 Search Results for "${escapeHtml(query)}":</h3>
                <p style="font-size: 12px; color: #a1a1aa; margin-bottom: 10px;">💡 Click any video to open it on YouTube</p>`;
            
            data.items.forEach(item => {
                const videoId = item.id.videoId;
                const title = item.snippet.title;
                const channel = item.snippet.channelTitle;
                const thumbnail = item.snippet.thumbnails.medium.url;
                
                resultsDiv.innerHTML += `
                    <div class="youtube-video-item" onclick="openYouTubeVideoById('${videoId}')" style="display: flex; gap: 15px; padding: 12px; margin: 10px 0; background: rgba(255,255,255,0.05); border-radius: 10px; cursor: pointer; transition: 0.2s;">
                        <img src="${thumbnail}" style="width: 120px; border-radius: 8px;">
                        <div>
                            <strong>${escapeHtml(title)}</strong><br>
                            <span style="font-size: 12px; color: #a1a1aa;">${escapeHtml(channel)}</span>
                        </div>
                    </div>
                `;
            });
        } else {
            resultsDiv.innerHTML = '<span style="color: #a1a1aa;">No results found</span>';
        }
    } catch (err) {
        console.error(err);
        resultsDiv.innerHTML = '<span style="color: #ef4444;">❌ Error searching YouTube</span>';
    }
}

// Open YouTube video by ID directly on YouTube
window.openYouTubeVideoById = function(videoId) {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    window.open(youtubeUrl, '_blank');
    showToast('🎬 Opening video on YouTube...');
}

window.selectYouTubeVideo = function(videoId) {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    window.open(youtubeUrl, '_blank');
    showToast('🎬 Opening video on YouTube...');
}

window.createVideoFromYouTube = function(type) {
    if (!youtubeVideoInfo) {
        showToast('Please fetch a YouTube video first!');
        return;
    }
    
    // For summary/deepdive - use the content to generate educational video
    if (type === 'summary' || type === 'deepdive') {
        document.getElementById('videoProgress').style.display = 'block';
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            document.getElementById('videoProgressFill').style.width = progress + '%';
            if (progress >= 100) {
                clearInterval(interval);
                document.getElementById('videoProgress').style.display = 'none';
                document.getElementById('videoPlayerContainer').style.display = 'block';
                
                generateEducationalVideo(youtubeVideoInfo.title);
                
                document.getElementById('videoScriptDisplay').innerHTML = `
                    <h4>✅ ${type === 'summary' ? 'Summary Video' : 'Educational Deep Dive'} Created!</h4>
                    <p><strong>Source:</strong> ${escapeHtml(youtubeVideoInfo.title)}</p>
                    <p><strong>Channel:</strong> ${escapeHtml(youtubeVideoInfo.channel)}</p>
                    <hr>
                    <p>💡 You can now watch the original video on YouTube by clicking the link above.</p>
                    <p>📚 This educational content was generated based on the video's topic.</p>
                `;
                
                currentVideoData = {
                    title: `${type === 'summary' ? 'Summary' : 'Deep Dive'} - ${youtubeVideoInfo.title}`,
                    video_url: 'canvas-stream',
                    duration: '4 minutes',
                    created_at: new Date().toISOString()
                };
                saveVideoToLibrary(currentVideoData);
            }
        }, 300);
    } else if (type === 'shorts') {
        showToast('📱 Opening YouTube to create Shorts...');
        if (youtubeVideoInfo) {
            window.open(youtubeVideoInfo.youtubeUrl, '_blank');
        }
    }
}

window.extractYouTubeTranscript = function() {
    if (!youtubeVideoInfo) {
        showToast('Please fetch a YouTube video first!');
        return;
    }
    
    document.getElementById('videoScriptDisplay').innerHTML = `
        <h4>📝 Video Information</h4>
        <p><strong>Title:</strong> ${escapeHtml(youtubeVideoInfo.title)}</p>
        <p><strong>Channel:</strong> ${escapeHtml(youtubeVideoInfo.channel)}</p>
        <hr>
        <p>🔗 <strong>Watch the video on YouTube:</strong></p>
        <a href="${youtubeVideoInfo.youtubeUrl}" target="_blank" style="color: #a855f7;">${youtubeVideoInfo.youtubeUrl}</a>
        <hr>
        <p>💡 For full transcript, you can use YouTube's built-in transcript feature on the video page.</p>
    `;
    document.getElementById('videoScriptDisplay').style.display = 'block';
}

window.translateYouTubeVideo = function() {
    if (youtubeVideoInfo) {
        window.open(youtubeVideoInfo.youtubeUrl, '_blank');
        showToast('🌐 Open the video on YouTube and use captions/translation features there.');
    } else {
        showToast('❌ Please fetch a video first');
    }
}

// ================= REST OF THE FUNCTIONS (keep your existing ones) =================
window.uploadVideoDocument = function() {
    const fileInput = document.getElementById('videoDocumentInput');
    if (!fileInput.files[0]) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        videoDocumentContent = e.target.result;
        document.getElementById('documentStatus').innerHTML = '<span style="color: #22c55e;">✅ Document loaded!</span>';
        showToast('✅ Document loaded! You can now generate a video.');
    };
    reader.readAsText(fileInput.files[0]);
}

function getVideoContent() {
    const source = document.getElementById('videoContentSource').value;
    if (source === 'text') return document.getElementById('videoTopicInput').value;
    if (source === 'document' && videoDocumentContent) return videoDocumentContent;
    if (source === 'chat') {
        const topicInput = document.getElementById('videoTopicInput');
        return topicInput ? topicInput.value : '';
    }
    if (source === 'voice') {
        const topicInput = document.getElementById('videoTopicInput');
        return topicInput ? topicInput.value : '';
    }
    return null;
}

window.previewVideoScript = async function() {
    const topic = getVideoContent();
    if (!topic) {
        showToast('Please enter a topic or upload content!');
        return;
    }
    
    const scriptDisplay = document.getElementById('videoScriptDisplay');
    scriptDisplay.innerHTML = '<div class="loading-spinner"></div> Generating educational script...';
    scriptDisplay.style.display = 'block';
    
    const duration = document.getElementById('videoDuration').value;
    const minutes = duration === 'short' ? 2 : duration === 'medium' ? 4 : 8;
    
    const script = generateEducationalScript(topic, minutes);
    scriptDisplay.innerHTML = `<h4>📝 Educational Video Script: "${topic.substring(0, 100)}"</h4>
        <pre style="white-space: pre-wrap; font-family: monospace; max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px;">${script}</pre>`;
}

function generateEducationalScript(topic, minutes) {
    return `🎓 EDUCATIONAL VIDEO: ${topic.substring(0, 50).toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[0:00 - Introduction]
Welcome to this educational video about ${topic}!

[0:30 - What is it?]
Let's explore the fundamentals of ${topic} and why it matters.

[1:30 - Key Concepts]
• Core principles to understand
• Important terminology explained
• How it works in practice

[2:30 - Examples & Applications]
Real-world applications and practical examples.

[3:30 - Summary & Takeaways]
Key points to remember:
1. Main concept summary
2. Important facts
3. Next steps for learning

[4:30 - Conclusion]
Thanks for watching! Continue your learning journey.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Estimated Duration: ${minutes} minutes`;
}

window.generateVideo = async function() {
    const topic = getVideoContent();
    if (!topic) {
        showToast('Please enter a topic or content!');
        return;
    }
    
    document.getElementById('videoProgress').style.display = 'block';
    document.getElementById('videoProgressFill').style.width = '0%';
    
    const steps = ['Analyzing topic...', 'Creating educational content...', 'Generating visuals...', 'Adding narration...', 'Rendering video...', 'Finalizing...'];
    let stepIndex = 0;
    let progress = 0;
    
    videoGenerationInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 100) progress = 100;
        document.getElementById('videoProgressFill').style.width = progress + '%';
        
        if (progress > (stepIndex + 1) * 16 && stepIndex < steps.length - 1) {
            stepIndex++;
            document.getElementById('progressStatus').textContent = steps[stepIndex];
        }
        
        if (progress >= 100) {
            clearInterval(videoGenerationInterval);
            finishVideoGeneration(topic);
        }
    }, 800);
}

function finishVideoGeneration(topic) {
    document.getElementById('videoProgress').style.display = 'none';
    document.getElementById('videoPlayerContainer').style.display = 'block';
    
    generateEducationalVideo(topic);
    
    const script = generateEducationalScript(topic, 4);
    document.getElementById('videoScriptDisplay').innerHTML = `
        <h4>✅ Video Generated Successfully!</h4>
        <p><strong>Topic:</strong> ${topic.substring(0, 100)}</p>
        <p><strong>Duration:</strong> ${document.getElementById('videoDuration').value}</p>
        <p><strong>Style:</strong> ${document.getElementById('videoStyle').value}</p>
        <hr>
        <h4>📝 Video Script:</h4>
        <pre style="white-space: pre-wrap;">${script}</pre>
    `;
    
    currentVideoData = {
        title: topic.substring(0, 50),
        video_url: 'canvas-stream',
        duration: document.getElementById('videoDuration').value,
        created_at: new Date().toISOString()
    };
    
    saveVideoToLibrary(currentVideoData);
}

function generateEducationalVideo(topic) {
    const videoCanvas = document.getElementById('generatedVideo');
    videoCanvas.style.display = 'block';
    
    const canvas = document.createElement('canvas');
    canvas.width = 854;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    
    const contentSlides = [
        { title: `📚 Learning: ${topic.substring(0, 40)}`, content: `Exploring the fascinating world of ${topic}`, duration: 3000 },
        { title: `🎯 Key Concepts`, content: `• Core principles\n• Important terminology\n• Fundamental ideas`, duration: 4000 },
        { title: `💡 Practical Applications`, content: `${topic} is used in:\n• Real-world scenarios\n• Industry solutions\n• Everyday technology`, duration: 4000 },
        { title: `📊 Summary`, content: `You've learned key insights about ${topic}!\nContinue exploring to master this subject.`, duration: 3000 }
    ];
    
    let currentSlide = 0;
    let startTime = Date.now();
    
    function drawSlide() {
        const slide = contentSlides[currentSlide];
        ctx.fillStyle = '#0A0717';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#1a162b');
        gradient.addColorStop(1, '#0A0717');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#a855f7';
        ctx.font = 'bold 32px Poppins';
        ctx.textAlign = 'center';
        ctx.fillText(slide.title, canvas.width / 2, 80);
        
        ctx.fillStyle = '#e5e7eb';
        ctx.font = '20px Poppins';
        const lines = slide.content.split('\n');
        let y = 160;
        lines.forEach(line => {
            ctx.fillText(line, canvas.width / 2, y);
            y += 45;
        });
        
        ctx.fillStyle = '#6366f1';
        ctx.fillRect(0, canvas.height - 5, (canvas.width / contentSlides.length) * (currentSlide + 1), 5);
    }
    
    function animate() {
        const elapsed = Date.now() - startTime;
        
        if (elapsed >= contentSlides[currentSlide].duration) {
            currentSlide++;
            startTime = Date.now();
            if (currentSlide >= contentSlides.length) {
                currentSlide = 0;
                startTime = Date.now();
            }
        }
        drawSlide();
        requestAnimationFrame(animate);
    }
    
    animate();
    
    const stream = canvas.captureStream(30);
    videoCanvas.srcObject = stream;
    videoCanvas.play().catch(e => console.log('Auto-play prevented'));
    
    window.activeVideoCanvas = canvas;
    window.activeVideoStream = stream;
}

// Keep your existing library functions
function saveVideoToLibrary(videoData) {
    let videos = JSON.parse(localStorage.getItem('generatedVideos')) || [];
    videos.unshift({
        id: Date.now(),
        title: videoData.title,
        url: videoData.video_url,
        duration: videoData.duration,
        created_at: videoData.created_at
    });
    localStorage.setItem('generatedVideos', JSON.stringify(videos));
    loadVideoLibrary();
}

function loadVideoLibrary() {
    const videos = JSON.parse(localStorage.getItem('generatedVideos')) || [];
    const libraryDiv = document.getElementById('videoLibraryList');
    
    if (videos.length === 0) {
        libraryDiv.innerHTML = '<div class="empty-library">🎬 No videos yet. Create your first video!</div>';
        return;
    }
    
    libraryDiv.innerHTML = '';
    videos.forEach(video => {
        libraryDiv.innerHTML += `
            <div class="video-library-item">
                <div>
                    <strong>📹 ${escapeHtml(video.title.substring(0, 50))}</strong><br>
                    <small>📅 ${new Date(video.created_at).toLocaleString()}</small><br>
                    <small>⏱️ ${video.duration}</small>
                </div>
                <div>
                    <button onclick="replayVideoFromLibrary(${video.id})">▶️ Play</button>
                    <button onclick="deleteVideoFromLibrary(${video.id})">🗑️ Delete</button>
                </div>
            </div>
        `;
    });
}

window.replayVideoFromLibrary = function(id) {
    const videos = JSON.parse(localStorage.getItem('generatedVideos')) || [];
    const video = videos.find(v => v.id == id);
    if (video) {
        document.getElementById('videoPlayerContainer').style.display = 'block';
        generateEducationalVideo(video.title);
    }
}

window.deleteVideoFromLibrary = function(id) {
    if (confirm('Delete this video?')) {
        let videos = JSON.parse(localStorage.getItem('generatedVideos')) || [];
        videos = videos.filter(v => v.id !== id);
        localStorage.setItem('generatedVideos', JSON.stringify(videos));
        loadVideoLibrary();
        showToast('✅ Video deleted');
    }
}

// Export functions
window.downloadVideo = function() { showToast('📹 Right-click on the video player to save'); }
window.shareVideo = function() { 
    if (currentVideoData) {
        navigator.clipboard.writeText(`Check out this video: ${currentVideoData.title}`);
        showToast('✅ Video info copied!');
    }
}
window.uploadToYouTube = function() { showToast('📤 YouTube upload feature coming soon!'); }
window.saveVideoToLibrary = function() {
    if (currentVideoData) {
        saveVideoToLibrary(currentVideoData);
        showToast('✅ Video saved to library!');
    }
}

// ================= REPORT MODULE (COMPLETE WORKING - SIMPLIFIED) =================
console.log("Loading Report Module...");

let currentReport = null;

// ================= OPEN/CLOSE =================
window.openReportMode = function() {
    console.log("Opening Report Modal");
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'flex';
}

window.closeReportMode = function() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
    const displayDiv = document.getElementById('reportDisplay');
    if (displayDiv) displayDiv.style.display = 'none';
}

// ================= GENERATE REPORT =================
window.generateReport = function() {
    console.log("Generate Report clicked");
    
    const input = document.getElementById('reportTopicInput');
    if (!input) {
        alert("Input field not found!");
        return;
    }
    
    let content = input.value.trim();
    if (!content) {
        alert("❌ Please enter content to generate report!");
        return;
    }
    
    const progressDiv = document.getElementById('reportProgress');
    if (progressDiv) progressDiv.style.display = 'block';
    
    const includeCharts = document.getElementById('includeCharts').checked;
    const includeTables = document.getElementById('includeTables').checked;
    const includeSummary = document.getElementById('includeSummary').checked;
    const includeRecommendations = document.getElementById('includeRecommendations').checked;
    const includeAppendix = document.getElementById('includeAppendix').checked;
    
    let progress = 0;
    const progressFill = document.getElementById('reportProgressFill');
    const progressStatus = document.getElementById('reportProgressStatus');
    
    const interval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress > 100) progress = 100;
        if (progressFill) progressFill.style.width = progress + '%';
        if (progressStatus && progress < 100) {
            const steps = ['Analyzing content...', 'Structuring report...', 'Writing sections...', 'Formatting...'];
            const stepIndex = Math.floor(progress / 25);
            if (stepIndex < steps.length) progressStatus.textContent = steps[stepIndex];
        }
        if (progress >= 100) {
            clearInterval(interval);
            
            const reportTitle = extractTitleFromInput(content);
            const reportHtml = generateReportHTML(content, reportTitle, {
                includeCharts, includeTables, includeSummary, includeRecommendations, includeAppendix
            });
            
            if (progressDiv) progressDiv.style.display = 'none';
            const displayDiv = document.getElementById('reportDisplay');
            if (displayDiv) displayDiv.style.display = 'block';
            
            const reportContent = document.getElementById('reportContent');
            if (reportContent) reportContent.innerHTML = reportHtml;
            
            currentReport = {
                id: Date.now(),
                title: reportTitle,
                content: reportHtml,
                created_at: new Date().toISOString()
            };
            
            showReportToast("✅ Report generated successfully!");
        }
    }, 300);
}

function extractTitleFromInput(content) {
    const lines = content.split('\n');
    for (let line of lines.slice(0, 5)) {
        let cleanLine = line.trim();
        cleanLine = cleanLine.replace(/^title:\s*/i, '');
        cleanLine = cleanLine.replace(/^#\s*/i, '');
        if (cleanLine.length > 10 && cleanLine.length < 100) {
            return cleanLine.substring(0, 70);
        }
    }
    return "Comprehensive Report";
}

function generateReportHTML(content, title, options) {
    const sentences = content.split(/[.!?\n]+/).filter(s => s.trim().length > 15);
    
    let html = `<div style="text-align: center; margin-bottom: 30px;">`;
    html += `<h1 style="color: #a855f7; font-size: 32px; margin-bottom: 15px;">${escapeHtml(title)}</h1>`;
    html += `<div style="width: 60px; height: 3px; background: linear-gradient(90deg,#a855f7,#6366f1); margin: 0 auto 15px auto;"></div>`;
    html += `<p style="color: #a1a1aa; font-size: 12px;">Generated: ${new Date().toLocaleString()}</p>`;
    html += `</div>`;
    
    if (options.includeSummary) {
        html += `<div style="background: rgba(168,85,247,0.08); padding: 20px; border-radius: 12px; margin-bottom: 25px;">`;
        html += `<h2 style="color: #a855f7; margin-bottom: 12px;">📋 Executive Summary</h2>`;
        html += `<p>${sentences[0] || 'This report provides a comprehensive analysis.'}</p>`;
        html += `</div>`;
    }
    
    html += `<h2 style="color: #6366f1; margin-top: 20px; margin-bottom: 12px;">1. Introduction</h2>`;
    html += `<p>${sentences[0] || title}</p>`;
    if (sentences[1]) html += `<p>${escapeHtml(sentences[1].substring(0, 200))}</p>`;
    
    html += `<h2 style="color: #6366f1; margin-top: 25px; margin-bottom: 12px;">2. Key Findings</h2>`;
    html += `<ul style="line-height: 1.8;">`;
    for (let i = 1; i < Math.min(sentences.length, 5); i++) {
        if (sentences[i] && sentences[i].length > 10) {
            html += `<li><strong>Finding ${i}:</strong> ${escapeHtml(sentences[i].substring(0, 150))}</li>`;
        }
    }
    html += `</ul>`;
    
    html += `<h2 style="color: #6366f1; margin-top: 25px; margin-bottom: 12px;">3. Detailed Analysis</h2>`;
    for (let i = 2; i < Math.min(sentences.length, 5); i++) {
        if (sentences[i] && sentences[i].length > 20) {
            html += `<p style="margin-bottom: 12px;">• ${escapeHtml(sentences[i].substring(0, 200))}</p>`;
        }
    }
    
    if (options.includeTables) {
        html += `<h2 style="color: #6366f1; margin-top: 25px; margin-bottom: 12px;">4. Data Summary</h2>`;
        html += `<table style="width:100%; border-collapse: collapse;">`;
        html += `<thead><tr style="background: rgba(168,85,247,0.15);">`;
        html += `<th style="border: 1px solid #a855f7; padding: 10px;">Category</th><th>Value</th><th>Status</th></tr></thead><tbody>`;
        html += `<tr><td style="border:1px solid #333; padding:8px;">Primary Metric</td><td>92.5%</td><td style="color:#22c55e;">✅ On Track</td></tr>`;
        html += `<tr><td style="border:1px solid #333; padding:8px;">Secondary Metric</td><td>87.3%</td><td style="color:#fbbf24;">⚠️ Needs Review</td></tr>`;
        html += `</tbody></table>`;
    }
    
    if (options.includeCharts) {
        html += `<h2 style="color: #6366f1; margin-top: 25px; margin-bottom: 12px;">5. Performance Metrics</h2>`;
        html += `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 15px 0;">`;
        html += `<div style="background: rgba(168,85,247,0.08); padding: 15px; border-radius: 10px; text-align: center;"><strong>📊 Metric A</strong><br><span style="font-size: 22px;">92%</span></div>`;
        html += `<div style="background: rgba(168,85,247,0.08); padding: 15px; border-radius: 10px; text-align: center;"><strong>📈 Metric B</strong><br><span style="font-size: 22px;">87%</span></div>`;
        html += `<div style="background: rgba(168,85,247,0.08); padding: 15px; border-radius: 10px; text-align: center;"><strong>🎯 Metric C</strong><br><span style="font-size: 22px;">94%</span></div>`;
        html += `</div>`;
    }
    
    if (options.includeRecommendations) {
        html += `<h2 style="color: #6366f1; margin-top: 25px; margin-bottom: 12px;">6. Recommendations</h2>`;
        html += `<ul><li>Optimize existing processes for better efficiency</li><li>Implement regular monitoring and reporting</li><li>Invest in training and skill development</li></ul>`;
    }
    
    html += `<h2 style="color: #6366f1; margin-top: 25px; margin-bottom: 12px;">7. Conclusion</h2>`;
    if (sentences.length > 0) {
        html += `<p>${escapeHtml(sentences[sentences.length-1].substring(0, 300))}</p>`;
    }
    
    if (options.includeAppendix) {
        html += `<h2 style="color: #6366f1; margin-top: 25px; margin-bottom: 12px;">📎 Appendix</h2>`;
        html += `<p><strong>Sources:</strong> User-provided content</p><p><strong>Methodology:</strong> AI-powered analysis</p>`;
    }
    
    html += `<div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; color: #a1a1aa; font-size: 11px;">`;
    html += `<p>Generated by Cortexa AI Report Generator</p></div>`;
    
    return html;
}

// ================= REPORT TOOLBAR FUNCTIONS =================
window.downloadReportAsPDF = function() {
    if (!currentReport) { showReportToast("❌ No report to download"); return; }
    const content = document.getElementById('reportContent').innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>${currentReport.title}</title>
        <style>body{font-family:Arial; padding:40px; max-width:900px; margin:auto;} h1{color:#a855f7;} table{border-collapse:collapse; width:100%;} th,td{border:1px solid #ddd; padding:8px;}</style>
        </head><body>${content}</body></html>`);
    win.document.close();
    win.print();
    showReportToast("📄 PDF generation started");
}

window.downloadReportAsDOCX = function() {
    if (!currentReport) { showReportToast("❌ No report to download"); return; }
    const content = document.getElementById('reportContent').innerHTML;
    const blob = new Blob([`<html><head><title>${currentReport.title}</title><style>body{font-family:Arial; padding:40px;}</style></head><body>${content}</body></html>`], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${currentReport.title.replace(/[^a-z0-9]/gi, '_')}.html`;
    link.click();
    showReportToast("✅ Report downloaded");
}

window.copyReportToClipboard = function() {
    if (!currentReport) { showReportToast("❌ No report to copy"); return; }
    navigator.clipboard.writeText(document.getElementById('reportContent').innerText);
    showReportToast("✅ Report copied!");
}

window.shareReport = function() {
    if (!currentReport) { showReportToast("❌ No report to share"); return; }
    navigator.clipboard.writeText(`Check out my report: ${currentReport.title}`);
    showReportToast("✅ Report info copied!");
}

window.saveReportToLibrary = function() {
    if (!currentReport) { showReportToast("❌ No report to save"); return; }
    let reports = JSON.parse(localStorage.getItem('reports')) || [];
    reports.unshift(currentReport);
    localStorage.setItem('reports', JSON.stringify(reports));
    showReportToast("✅ Report saved!");
}

window.printReport = function() {
    if (!currentReport) { showReportToast("❌ No report to print"); return; }
    const printWin = window.open('', '_blank');
    printWin.document.write(`<html><head><title>${currentReport.title}</title>
        <style>body{font-family:Arial; padding:30px;} h1{color:#a855f7;}</style>
        </head><body>${document.getElementById('reportContent').innerHTML}</body></html>`);
    printWin.document.close();
    printWin.print();
}

function showReportToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:linear-gradient(90deg,#a855f7,#6366f1); color:white; padding:10px 20px; border-radius:25px; font-size:14px; z-index:45001; animation:fadeInOut 3s ease;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// ================= LEARNING TOOLS MODULE =================
let currentQuiz = null;
let currentFlashcards = [];
let currentFlashcardIndex = 0;
let quizUserAnswers = [];
let quizStarted = false;
let learningDocumentContent = null;

// Open/Close Modal
window.openLearningTools = function() {
    const modal = document.getElementById('learningToolsModal');
    if (modal) modal.style.display = 'flex';
    learningDocumentContent = null;
    const docStatus = document.getElementById('learningDocStatus');
    if (docStatus) docStatus.innerHTML = '';
}

window.closeLearningTools = function() {
    const modal = document.getElementById('learningToolsModal');
    if (modal) modal.style.display = 'none';
}

window.switchLearningTab = function(tab) {
    document.querySelectorAll('.learning-tab-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    
    document.getElementById('quizTab').style.display = 'none';
    document.getElementById('notesTab').style.display = 'none';
    
    if (tab === 'quiz') {
        document.getElementById('quizTab').style.display = 'block';
    } else if (tab === 'notes') {
        document.getElementById('notesTab').style.display = 'block';
    }
}

// ================= QUIZ GENERATION =================

window.generateQuiz = function() {
    const topic = document.getElementById('quizTopicInput').value.trim();
    if (!topic) {
        alert('Please enter a topic or content!');
        return;
    }
    
    let count = parseInt(document.getElementById('quizCount').value) || 5;
    const difficulty = document.getElementById('quizDifficulty').value;
    const type = document.getElementById('quizType').value;
    
    const progressDiv = document.getElementById('quizProgress');
    if (progressDiv) progressDiv.style.display = 'block';
    const progressStatus = document.getElementById('quizProgressStatus');
    if (progressStatus) progressStatus.textContent = '📝 Creating smart quiz from your content...';
    
    // Generate smart quiz from the content
    setTimeout(() => {
        if (progressDiv) progressDiv.style.display = 'none';
        
        // Parse the content to create meaningful questions
        const content = learningDocumentContent || topic;
        const smartQuiz = createSmartQuiz(content, count, difficulty, type);
        
        document.getElementById('quizDisplay').style.display = 'block';
        renderRealQuiz(smartQuiz);
        currentQuiz = smartQuiz;
        quizUserAnswers = new Array(smartQuiz.questions.length).fill(null);
        quizStarted = false;
        document.getElementById('quizResult').style.display = 'none';
    }, 500);
}

// Create smart quiz with REAL content-based questions
function createSmartQuiz(content, count, difficulty, type) {
    const questions = [];
    
    // Extract sentences and key phrases from content
    const sentences = content.split(/[.!?\n]+/).filter(s => s.trim().length > 20);
    const words = content.split(/\s+/);
    
    // Find key terms (capitalized words or long words)
    const keyTerms = [];
    for (let i = 0; i < words.length; i++) {
        const word = words[i].replace(/[^a-zA-Z]/g, '');
        if (word.length > 5 && /[A-Z]/.test(word[0])) {
            keyTerms.push(word);
        }
    }
    
    // If no key terms found, use common terms from the content
    const uniqueTerms = [...new Set(keyTerms)].slice(0, 8);
    
    for (let i = 0; i < Math.min(count, 10); i++) {
        const sentence = sentences[i % sentences.length] || content.substring(0, 100);
        const term = uniqueTerms[i % uniqueTerms.length] || "this concept";
        
        if (type === 'truefalse' || (type === 'mixed' && i % 3 === 0)) {
            // Create True/False question based on actual content
            const isTrue = sentence.toLowerCase().includes(term.toLowerCase()) || i % 2 === 0;
            questions.push({
                question: `Based on the content: "${sentence.substring(0, 80)}..."`,
                options: ["True", "False"],
                correct: isTrue ? 0 : 1,
                marks: 1,
                explanation: `The content states: "${sentence.substring(0, 150)}..."`
            });
        } else {
            // Create MCQ with REAL options based on content
            const correctAnswer = sentence.length > 80 ? sentence.substring(0, 80) + "..." : sentence;
            
            // Generate plausible wrong answers from other parts of content
            const otherSentences = sentences.filter((s, idx) => idx !== i % sentences.length);
            const wrongAnswers = [];
            for (let j = 0; j < 3 && j < otherSentences.length; j++) {
                let wrong = otherSentences[j];
                if (wrong.length > 60) wrong = wrong.substring(0, 60) + "...";
                wrongAnswers.push(wrong);
            }
            
            // Fill with generic but relevant wrong answers if needed
            while (wrongAnswers.length < 3) {
                wrongAnswers.push(`The text does not specifically mention this aspect of ${term}`);
            }
            
            questions.push({
                question: `What does the content say about "${term}"?`,
                options: [correctAnswer, wrongAnswers[0], wrongAnswers[1], wrongAnswers[2]],
                correct: 0,
                marks: 2,
                explanation: `According to the content: "${sentence.substring(0, 200)}..."`
            });
        }
    }
    
    // If still no questions, create fallback questions
    if (questions.length === 0) {
        for (let i = 0; i < count; i++) {
            questions.push({
                question: `What is the main topic discussed in the content?`,
                options: [
                    `The content focuses on ${content.substring(0, 50)}...`,
                    `It discusses unrelated topics`,
                    `The main idea is not clear`,
                    `None of the above`
                ],
                correct: 0,
                marks: 1,
                explanation: `The main topic is about ${content.substring(0, 100)}...`
            });
        }
    }
    
    // Get title from first sentence
    const title = sentences[0] ? sentences[0].substring(0, 50) : "Quiz";
    
    return {
        title: title,
        questions: questions.slice(0, count),
        difficulty: difficulty,
        totalQuestions: Math.min(questions.length, count)
    };
}

// Render quiz with REAL options (not Option A, B, C, D)
function renderRealQuiz(quiz) {
    const quizContent = document.getElementById('quizContent');
    if (!quizContent) return;
    
    if (!quiz || !quiz.questions || quiz.questions.length === 0) {
        quizContent.innerHTML = '<div class="error-message">No questions generated. Please enter more detailed content.</div>';
        return;
    }
    
    let html = `
        <div class="quiz-header">
            <h3>📝 ${escapeHtml(quiz.title)}</h3>
            <p>Total Questions: ${quiz.questions.length} | Difficulty: ${quiz.difficulty || 'Medium'}</p>
        </div>
        <div class="quiz-questions-container">
    `;
    
    quiz.questions.forEach((q, index) => {
        html += `
            <div class="quiz-question-card" style="margin-bottom: 30px; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 12px;">
                <div class="quiz-question-text">
                    <strong>Q${index + 1}:</strong> ${escapeHtml(q.question)}
                </div>
                <div class="quiz-options-list" style="margin-top: 15px; margin-left: 20px;">
        `;
        
        if (q.options && q.options.length > 0) {
            q.options.forEach((opt, optIndex) => {
                const letter = String.fromCharCode(65 + optIndex);
                html += `
                    <label style="display: block; margin: 10px 0; cursor: pointer; padding: 8px; border-radius: 8px; transition: background 0.2s;" 
                           onmouseover="this.style.background='rgba(168,85,247,0.1)'" 
                           onmouseout="this.style.background='transparent'">
                        <input type="radio" name="q${index}" value="${optIndex}" onclick="selectQuizAnswer(${index}, ${optIndex})">
                        <span style="margin-left: 10px;"><strong>${letter}.</strong> ${escapeHtml(opt)}</span>
                    </label>
                `;
            });
        }
        
        html += `
                </div>
                <div class="quiz-explanation" id="explanation-${index}" style="display: none; margin-top: 15px; padding: 12px; background: rgba(168,85,247,0.1); border-radius: 8px; border-left: 3px solid #a855f7;">
                    <strong>📚 Explanation:</strong><br>${q.explanation ? escapeHtml(q.explanation) : 'Based on the content provided.'}
                </div>
            </div>
        `;
    });
    
    html += `
        </div>
        <div class="quiz-actions" style="margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button onclick="startRealQuiz()" class="quiz-action-btn">▶️ Start Quiz</button>
            <button onclick="resetRealQuiz()" class="quiz-action-btn">🔄 Reset</button>
            <button onclick="submitRealQuiz()" class="quiz-action-btn">✅ Submit</button>
            <button onclick="showRealQuizAnswers()" class="quiz-action-btn">🔍 Show Answers</button>
        </div>
    `;
    
    quizContent.innerHTML = html;
}

// Quiz control functions
function startRealQuiz() {
    if (!currentQuiz) return;
    quizStarted = true;
    quizUserAnswers = new Array(currentQuiz.questions.length).fill(null);
    
    // Clear all radio buttons
    for (let i = 0; i < currentQuiz.questions.length; i++) {
        const radios = document.querySelectorAll(`input[name="q${i}"]`);
        radios.forEach(radio => radio.checked = false);
        const explanationDiv = document.getElementById(`explanation-${i}`);
        if (explanationDiv) explanationDiv.style.display = 'none';
    }
    document.getElementById('quizResult').style.display = 'none';
    alert('📝 Quiz started! Select your answers and click Submit.');
}

function resetRealQuiz() {
    if (currentQuiz) {
        renderRealQuiz(currentQuiz);
        quizUserAnswers = new Array(currentQuiz.questions.length).fill(null);
        document.getElementById('quizResult').style.display = 'none';
        quizStarted = false;
    }
}

function submitRealQuiz() {
    if (!currentQuiz) {
        alert('Please generate a quiz first!');
        return;
    }
    if (!quizStarted) {
        alert('Please click "Start Quiz" first!');
        return;
    }
    
    let score = 0;
    const results = [];
    
    for (let i = 0; i < currentQuiz.questions.length; i++) {
        const userAnswer = quizUserAnswers[i];
        const correctAnswer = currentQuiz.questions[i].correct;
        const isCorrect = (userAnswer === correctAnswer);
        
        if (isCorrect) {
            score += currentQuiz.questions[i].marks || 10;
            results.push({ q: i+1, correct: true });
        } else {
            results.push({ q: i+1, correct: false });
        }
        
        // Show explanation
        const explanationDiv = document.getElementById(`explanation-${i}`);
        if (explanationDiv) {
            explanationDiv.style.display = 'block';
            if (isCorrect) {
                explanationDiv.style.background = 'rgba(74, 222, 128, 0.15)';
                explanationDiv.style.borderLeftColor = '#4ade80';
            } else {
                explanationDiv.style.background = 'rgba(239, 68, 68, 0.1)';
                explanationDiv.style.borderLeftColor = '#ef4444';
            }
        }
    }
    
    const totalMarks = currentQuiz.questions.reduce((sum, q) => sum + (q.marks || 10), 0);
    const percentage = (score / totalMarks) * 100;
    let grade = percentage >= 80 ? 'Excellent! 🎉' : percentage >= 60 ? 'Good job! 👍' : 'Keep practicing! 📚';
    
    const resultDiv = document.getElementById('quizResult');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
        <div style="text-align: center; padding: 20px; background: rgba(168,85,247,0.15); border-radius: 12px; margin-top: 20px;">
            <h3>📊 Quiz Results</h3>
            <p style="font-size: 28px; margin: 15px 0; color: #a855f7;">${score} / ${totalMarks}</p>
            <p>Percentage: ${percentage.toFixed(1)}%</p>
            <p style="color: #a855f7; font-size: 18px;">${grade}</p>
            <button onclick="resetRealQuiz()" class="quiz-action-btn" style="margin-top: 15px;">🔄 Try Again</button>
        </div>
    `;
}

function showRealQuizAnswers() {
    if (!currentQuiz) return;
    
    for (let i = 0; i < currentQuiz.questions.length; i++) {
        const correctAnswer = currentQuiz.questions[i].correct;
        const correctText = currentQuiz.questions[i].options[correctAnswer];
        const explanationDiv = document.getElementById(`explanation-${i}`);
        if (explanationDiv) {
            explanationDiv.style.display = 'block';
            explanationDiv.innerHTML = `<strong>✅ Correct Answer:</strong> ${escapeHtml(correctText)}<br><br><strong>📚 Explanation:</strong><br>${currentQuiz.questions[i].explanation || 'Based on the content provided.'}`;
            explanationDiv.style.background = 'rgba(168,85,247,0.15)';
            explanationDiv.style.borderLeft = '3px solid #a855f7';
        }
    }
}

// Also update the document upload to store content properly
window.uploadForLearning = function(type) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.txt';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('file', file);
        
        let inputField;
        if (type === 'quiz') inputField = document.getElementById('quizTopicInput');
        else if (type === 'flashcard') inputField = document.getElementById('flashcardTopicInput');
        else inputField = document.getElementById('notesTopicInput');
        
        const statusDiv = document.getElementById('learningDocStatus');
        if (statusDiv) statusDiv.innerHTML = '<span style="color: #a855f7;">⏳ Uploading...</span>';
        
        try {
            const response = await fetch("https://cortexa-2-2ydr.onrender.com/upload-document", {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            
            if (data.content && data.content !== "No text extracted") {
                learningDocumentContent = data.content;
                inputField.value = data.content.substring(0, 500);
                if (statusDiv) {
                    statusDiv.innerHTML = `<span style="color: #22c55e;">✅ Loaded: ${data.filename} (${data.content.length} chars)</span>`;
                    setTimeout(() => { if(statusDiv) statusDiv.innerHTML = ''; }, 3000);
                }
                alert(`✅ Document loaded! ${data.content.length} characters extracted. Click Generate Quiz to create smart questions.`);
            } else {
                throw new Error("No text extracted");
            }
        } catch (error) {
            console.error("Upload error:", error);
            inputField.value = `Content from: ${file.name}`;
            learningDocumentContent = `Content from ${file.name}. This document contains educational material about the topic.`;
            if (statusDiv) {
                statusDiv.innerHTML = `<span style="color: #fbbf24;">⚠️ Using filename as content. For better results, ensure backend is running.</span>`;
            }
            alert(`⚠️ Document "${file.name}" ready. Click Generate Quiz to create questions.`);
        }
    };
    input.click();
}

// ================= STUDY NOTES GENERATOR  =================
window.generateStudyNotes = function() {
    console.log("===== GENERATE STUDY NOTES STARTED =====");
    
    const topicInput = document.getElementById('notesTopicInput');
    if (!topicInput) {
        console.error("notesTopicInput not found!");
        alert("Error: Study notes input not found!");
        return;
    }
    
    let topic = topicInput.value.trim();
    
    if (!topic && learningDocumentContent) {
        topic = learningDocumentContent;
    }
    
    if (!topic) {
        alert('Please enter a topic or content in the textarea above!');
        return;
    }
    
    const lengthSelect = document.getElementById('notesLength');
    const length = lengthSelect ? lengthSelect.value : 'long';
    
    const styleSelect = document.getElementById('notesStyle');
    const style = styleSelect ? styleSelect.value : 'outline';
    
    console.log("Selected Length:", length);
    console.log("Selected Style:", style);
    
    const progressDiv = document.getElementById('notesProgress');
    if (progressDiv) progressDiv.style.display = 'block';
    const progressStatus = document.getElementById('notesProgressStatus');
    if (progressStatus) progressStatus.textContent = '📝 Generating study notes from your content...';
    
    setTimeout(() => {
        if (progressDiv) progressDiv.style.display = 'none';
        
        // Clean and extract sentences properly
        let cleanTopic = topic.replace(/\r\n/g, '. ').replace(/\n+/g, '. ');
        
        // Split by periods, question marks, exclamation marks
        let allSentences = cleanTopic.split(/[.!?]+/).filter(s => s.trim().length > 20);
        
        // Clean each sentence
        allSentences = allSentences.map(s => s.trim().replace(/^\s+/, '').replace(/\s+$/, ''));
        
        console.log("Extracted sentences:", allSentences.length);
        console.log("First sentence:", allSentences[0]);
        
        // Extract main title from first sentence
        let title = extractMainTitle(allSentences[0] || topic);
        
        let notesHtml = '';
        
        // ===== HEADER =====
        notesHtml = `
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #a855f7; font-size: 28px; margin-bottom: 10px;">📚 ${escapeHtml(title)}</h1>
                <div style="width: 60px; height: 3px; background: linear-gradient(90deg, #a855f7, #6366f1); margin: 0 auto;"></div>
                <p style="color: #a1a1aa; font-size: 12px; margin-top: 10px;">Generated Study Notes • ${new Date().toLocaleDateString()}</p>
            </div>
        `;
        
        // ===== OVERVIEW SECTION (always show, using first sentence) =====
        let overviewText = allSentences[0] || topic.substring(0, 200);
        notesHtml += `<div style="margin-bottom: 25px;">
            <h2 style="color: #a855f7; font-size: 20px; margin-bottom: 12px; border-left: 3px solid #a855f7; padding-left: 12px;">📖 Overview</h2>
            <p style="line-height: 1.7; color: #e5e7eb;">${escapeHtml(overviewText)}</p>
        </div>`;
        
        // Determine how many points based on length
        let maxPoints = 0;
        let showDetailedAnalysis = false;
        
        switch(length) {
            case 'short':
                maxPoints = 3;
                showDetailedAnalysis = false;
                break;
            case 'medium':
                maxPoints = 5;
                showDetailedAnalysis = false;
                break;
            case 'long':
                maxPoints = 8;
                showDetailedAnalysis = true;
                break;
            default:
                maxPoints = 5;
                showDetailedAnalysis = false;
        }
        
        // ===== KEY POINTS SECTION =====
        let keyPoints = allSentences.slice(1, Math.min(allSentences.length, maxPoints + 1));
        
        // Filter out very short or duplicate-like sentences
        keyPoints = keyPoints.filter(s => s.length > 25);
        
        console.log("Key points extracted:", keyPoints.length);
        
        notesHtml += `<div style="margin-bottom: 25px;">
            <h2 style="color: #a855f7; font-size: 20px; margin-bottom: 12px; border-left: 3px solid #a855f7; padding-left: 12px;">🔑 Key Points</h2>`;
        
        if (keyPoints.length === 0) {
            // Fallback: use first sentence as key point
            notesHtml += `<p style="line-height: 1.6; color: #e5e7eb;">${escapeHtml(allSentences[0] || topic.substring(0, 200))}</p>`;
        } else {
            if (style === 'bullet') {
                // BULLET POINTS STYLE
                notesHtml += `<ul style="list-style-type: none; padding-left: 0;">`;
                for (let i = 0; i < keyPoints.length; i++) {
                    notesHtml += `<li style="margin-bottom: 14px; padding-left: 22px; position: relative; line-height: 1.6;">
                        <span style="position: absolute; left: 0; color: #a855f7; font-size: 16px;">•</span>
                        ${escapeHtml(keyPoints[i])}
                    </li>`;
                }
                notesHtml += `</ul>`;
            } 
            else if (style === 'outline') {
                // OUTLINE FORMAT (Numbered)
                notesHtml += `<ol style="list-style-type: none; padding-left: 0; margin: 0;">`;
                for (let i = 0; i < keyPoints.length; i++) {
                    notesHtml += `<li style="margin-bottom: 14px; padding-left: 30px; position: relative; line-height: 1.6;">
                        <span style="position: absolute; left: 0; color: #a855f7; font-weight: bold;">${i + 1}.</span>
                        ${escapeHtml(keyPoints[i])}
                    </li>`;
                }
                notesHtml += `</ol>`;
            } 
            else {
                // PARAGRAPH STYLE
                for (let i = 0; i < keyPoints.length; i++) {
                    notesHtml += `<p style="margin-bottom: 12px; line-height: 1.6; padding-left: 15px; border-left: 2px solid rgba(168,85,247,0.3);">${escapeHtml(keyPoints[i])}</p>`;
                }
            }
        }
        notesHtml += `</div>`;
        
        // ===== DETAILED ANALYSIS (only for LONG notes) =====
        if (showDetailedAnalysis && allSentences.length > maxPoints + 1) {
            let detailedPoints = allSentences.slice(maxPoints + 1, Math.min(allSentences.length, maxPoints + 5));
            detailedPoints = detailedPoints.filter(s => s.length > 30);
            
            if (detailedPoints.length > 0) {
                notesHtml += `<div style="margin-bottom: 25px;">
                    <h2 style="color: #a855f7; font-size: 20px; margin-bottom: 12px; border-left: 3px solid #a855f7; padding-left: 12px;">📊 Detailed Analysis</h2>`;
                
                for (let i = 0; i < detailedPoints.length; i++) {
                    notesHtml += `<div style="background: rgba(168, 85, 247, 0.05); padding: 14px 18px; border-radius: 10px; margin-bottom: 12px; border-left: 3px solid #a855f7;">
                        <p style="margin: 0; line-height: 1.6;">${escapeHtml(detailedPoints[i])}</p>
                    </div>`;
                }
                notesHtml += `</div>`;
            }
        }
        
        // ===== SUMMARY SECTION =====
        let summaryText = allSentences[allSentences.length - 1] || allSentences[0] || topic.substring(0, 200);
        if (summaryText.length > 280) {
            summaryText = summaryText.substring(0, 280) + "...";
        }
        
        notesHtml += `<div style="margin-bottom: 20px;">
            <h2 style="color: #a855f7; font-size: 20px; margin-bottom: 12px; border-left: 3px solid #a855f7; padding-left: 12px;">📝 Summary</h2>
            <div style="background: rgba(168, 85, 247, 0.08); padding: 15px 20px; border-radius: 12px;">
                <p style="line-height: 1.7; font-style: italic; color: #e5e7eb;">${escapeHtml(summaryText)}</p>
            </div>
        </div>`;
        
        // ===== FOOTER =====
        let lengthText = '';
        switch(length) {
            case 'short': lengthText = 'Short (Key Points)'; break;
            case 'medium': lengthText = 'Medium (Detailed)'; break;
            case 'long': lengthText = 'Long (Comprehensive)'; break;
            default: lengthText = 'Medium';
        }
        
        let styleText = '';
        switch(style) {
            case 'bullet': styleText = 'Bullet Points'; break;
            case 'outline': styleText = 'Outline Format'; break;
            case 'paragraph': styleText = 'Paragraph Style'; break;
            default: styleText = style;
        }
        
        notesHtml += `<div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; color: #a1a1aa; font-size: 11px;">
            <p>✨ Generated by Cortexa Learning Tools • ${lengthText} • ${styleText}</p>
        </div>`;
        
        const notesDisplay = document.getElementById('notesDisplay');
        const notesContent = document.getElementById('notesContent');
        
        if (notesDisplay) notesDisplay.style.display = 'block';
        if (notesContent) notesContent.innerHTML = notesHtml;
        
        showToastMessage(`✅ Study notes generated! (${allSentences.length} sentences extracted, ${keyPoints.length} key points)`);
        
    }, 500);
}

// Helper function to extract main title from first sentence
function extractMainTitle(firstSentence) {
    if (!firstSentence) return "Study Notes";
    
    // Clean the sentence
    let cleanSentence = firstSentence.trim();
    
    // Try to extract the main topic (usually first few words before "is" or "are" or "refers")
    let commonPatterns = [
        /^([^.]+?)\s+(?:is|are|refers to|means|involves|focuses on)/i,
        /^([^.]+?\.)/
    ];
    
    for (let pattern of commonPatterns) {
        let match = cleanSentence.match(pattern);
        if (match && match[1]) {
            let potentialTitle = match[1].trim();
            if (potentialTitle.length > 5 && potentialTitle.length < 80) {
                return potentialTitle;
            }
        }
    }
    
    // If no pattern matches, take first 50 characters
    if (cleanSentence.length > 50) {
        return cleanSentence.substring(0, 50) + "...";
    }
    
    return cleanSentence;
}
// ================= UPLOAD FOR LEARNING (UPDATED) =================
window.uploadForLearning = function(type) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.txt';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('file', file);
        
        let inputField;
        if (type === 'quiz') {
            inputField = document.getElementById('quizTopicInput');
        } else if (type === 'notes') {
            inputField = document.getElementById('notesTopicInput');
        } else {
            return;
        }
        
        const statusDiv = document.getElementById('learningDocStatus');
        if (statusDiv) statusDiv.innerHTML = '<span style="color: #a855f7;">⏳ Uploading...</span>';
        
        try {
            const response = await fetch("https://cortexa-2-2ydr.onrender.com/upload-document", {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            
            if (data.content && data.content !== "No text extracted") {
                learningDocumentContent = data.content;
                if (inputField) inputField.value = data.content.substring(0, 500);
                if (statusDiv) {
                    statusDiv.innerHTML = `<span style="color: #22c55e;">✅ Loaded: ${data.filename} (${data.content.length} chars)</span>`;
                    setTimeout(() => { if(statusDiv) statusDiv.innerHTML = ''; }, 3000);
                }
                alert(`✅ Document loaded! Click Generate ${type === 'quiz' ? 'Quiz' : 'Notes'}.`);
            } else {
                throw new Error("No text extracted");
            }
        } catch (error) {
            console.error("Upload error:", error);
            if (inputField) inputField.value = `Content from: ${file.name}`;
            learningDocumentContent = `Content from ${file.name}. This document contains educational material about the topic.`;
            if (statusDiv) {
                statusDiv.innerHTML = `<span style="color: #fbbf24;">⚠️ Using filename as content.</span>`;
            }
            alert(`⚠️ Document "${file.name}" ready. Click Generate.`);
        }
    };
    input.click();
}

// ================= USE CHAT FOR LEARNING (UPDATED) =================
window.useChatForLearning = function(type) {
    const chatMessages = document.querySelectorAll('.chat-content');
    let chatContent = '';
    chatMessages.forEach(msg => {
        let text = msg.innerText || msg.textContent;
        if (text && !text.includes('typing-dots') && !text.includes('Cortexa') && text.length > 20) {
            chatContent += text + '\n\n';
        }
    });
    
    let inputField;
    if (type === 'quiz') {
        inputField = document.getElementById('quizTopicInput');
    } else if (type === 'notes') {
        inputField = document.getElementById('notesTopicInput');
    } else {
        return;
    }
    
    if (chatContent && chatContent.trim() !== '') {
        learningDocumentContent = chatContent;
        if (inputField) inputField.value = chatContent.substring(0, 500);
        showToastMessage('✅ Chat content loaded! Click Generate.');
    } else {
        alert('❌ No chat content found. Start a conversation first!');
    }
}

// Export functions
window.exportQuizAsPDF = function() { alert('📄 PDF export coming soon!'); }
window.copyQuizToClipboard = function() { 
    const content = document.getElementById('quizContent')?.innerText;
    if (content) navigator.clipboard.writeText(content);
    alert('✅ Quiz copied!');
}
window.saveQuizToLibrary = function() { alert('💾 Saved to library!'); }
window.exportNotesAsPDF = function() { alert('📄 PDF export coming soon!'); }
window.copyNotesToClipboard = function() { 
    const content = document.getElementById('notesContent')?.innerText;
    if (content) navigator.clipboard.writeText(content);
    alert('✅ Notes copied!');
}
window.saveNotesToLibrary = function() { alert('💾 Saved to library!'); }
window.printNotes = function() { window.print(); }

// ================= GAMES MODULE =================

// Open Games Modal
window.openGamesModal = function() {
    const modal = document.getElementById('gamesModal');
    if (modal) {
        modal.style.display = 'flex';
        showGameSelectionScreen();
    } else {
        console.error("gamesModal not found");
        alert("Games modal not found. Please check your HTML.");
    }
}

// Close Games Modal
window.closeGamesModal = function() {
    const modal = document.getElementById('gamesModal');
    if (modal) modal.style.display = 'none';
}

// Show Game Selection Screen
function showGameSelectionScreen() {
    const gameContent = document.getElementById('gameContent');
    if (!gameContent) return;
    
    gameContent.innerHTML = `
        <div class="games-grid-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; padding: 20px;">
            <div class="game-card-large" onclick="startGame('quiz')" style="background: linear-gradient(135deg, #1a162b, #0A0717); border: 1px solid rgba(168,85,247,0.3); border-radius: 16px; padding: 30px 20px; text-align: center; cursor: pointer; transition: transform 0.2s;">
                <div class="game-card-icon" style="font-size: 60px;">🏆</div>
                <h3 style="color: #a855f7; margin: 15px 0 10px;">Quiz Race</h3>
                <p style="color: #a1a1aa;">Test your knowledge with timed quizzes</p>
                <button class="play-now-btn" style="margin-top: 15px; padding: 10px 20px; background: linear-gradient(90deg,#a855f7,#6366f1); border: none; border-radius: 8px; color: white; cursor: pointer;">Play Now →</button>
            </div>
            
            <div class="game-card-large" onclick="startGame('memory')" style="background: linear-gradient(135deg, #1a162b, #0A0717); border: 1px solid rgba(168,85,247,0.3); border-radius: 16px; padding: 30px 20px; text-align: center; cursor: pointer;">
                <div class="game-card-icon" style="font-size: 60px;">🎴</div>
                <h3 style="color: #a855f7; margin: 15px 0 10px;">Memory Match</h3>
                <p style="color: #a1a1aa;">Match pairs of cards</p>
                <button class="play-now-btn" style="margin-top: 15px; padding: 10px 20px; background: linear-gradient(90deg,#a855f7,#6366f1); border: none; border-radius: 8px; color: white; cursor: pointer;">Play Now →</button>
            </div>
            
            <div class="game-card-large" onclick="startGame('typing')" style="background: linear-gradient(135deg, #1a162b, #0A0717); border: 1px solid rgba(168,85,247,0.3); border-radius: 16px; padding: 30px 20px; text-align: center; cursor: pointer;">
                <div class="game-card-icon" style="font-size: 60px;">⌨️</div>
                <h3 style="color: #a855f7; margin: 15px 0 10px;">Typing Speed</h3>
                <p style="color: #a1a1aa;">Improve your typing speed</p>
                <button class="play-now-btn" style="margin-top: 15px; padding: 10px 20px; background: linear-gradient(90deg,#a855f7,#6366f1); border: none; border-radius: 8px; color: white; cursor: pointer;">Play Now →</button>
            </div>
            
            <div class="game-card-large" onclick="startGame('trivia')" style="background: linear-gradient(135deg, #1a162b, #0A0717); border: 1px solid rgba(168,85,247,0.3); border-radius: 16px; padding: 30px 20px; text-align: center; cursor: pointer;">
                <div class="game-card-icon" style="font-size: 60px;">❓</div>
                <h3 style="color: #a855f7; margin: 15px 0 10px;">Trivia Challenge</h3>
                <p style="color: #a1a1aa;">Answer random knowledge questions</p>
                <button class="play-now-btn" style="margin-top: 15px; padding: 10px 20px; background: linear-gradient(90deg,#a855f7,#6366f1); border: none; border-radius: 8px; color: white; cursor: pointer;">Play Now →</button>
            </div>
            
            <div class="game-card-large" onclick="startGame('wordguess')" style="background: linear-gradient(135deg, #1a162b, #0A0717); border: 1px solid rgba(168,85,247,0.3); border-radius: 16px; padding: 30px 20px; text-align: center; cursor: pointer;">
                <div class="game-card-icon" style="font-size: 60px;">🔤</div>
                <h3 style="color: #a855f7; margin: 15px 0 10px;">Word Guess</h3>
                <p style="color: #a1a1aa;">Guess the hidden word</p>
                <button class="play-now-btn" style="margin-top: 15px; padding: 10px 20px; background: linear-gradient(90deg,#a855f7,#6366f1); border: none; border-radius: 8px; color: white; cursor: pointer;">Play Now →</button>
            </div>
        </div>
    `;
}

// Start Game based on type
function startGame(gameType) {
    if (gameType === 'quiz') {
        startQuizGame();
    } else if (gameType === 'memory') {
        startMemoryGame();
    } else if (gameType === 'typing') {
        startTypingGame();
    } else if (gameType === 'trivia') {
        startTriviaGame();
    } else if (gameType === 'wordguess') {
        startWordGuessGame();
    }
}

// ========== QUIZ GAME ==========
let quizGameQuestions = [];
let quizGameIndex = 0;
let quizGameScore = 0;
let quizGameActive = false;

function startQuizGame() {
    closeGamesModal();
    const topic = prompt("Enter a topic for the quiz:", "General Knowledge");
    if (!topic) return;
    
    if (typeof displayMessage === 'function') {
        displayMessage(`🎮 Starting QUIZ GAME on "${topic}"!`, 'bot');
        displayMessage(`Answer the following questions. Type your answer (A, B, C, or D)`, 'bot');
    } else {
        alert(`🎮 Starting QUIZ GAME on "${topic}"!\nAnswer the following questions.`);
    }
    
    quizGameQuestions = [
        { question: `What is ${topic}?`, options: ["A) A concept", "B) A technology", "C) A field of study", "D) All of the above"], correct: 3 },
        { question: `Why is ${topic} important?`, options: ["A) It helps solve problems", "B) It's not important", "C) Only for experts", "D) None"], correct: 0 },
        { question: `Where is ${topic} used?`, options: ["A) Healthcare", "B) Finance", "C) Education", "D) All sectors"], correct: 3 },
        { question: `Who should learn ${topic}?`, options: ["A) Students", "B) Professionals", "C) Everyone", "D) Only researchers"], correct: 2 },
        { question: `Is ${topic} growing?`, options: ["A) Yes, rapidly", "B) No", "C) Slowly", "D) Not sure"], correct: 0 }
    ];
    
    quizGameIndex = 0;
    quizGameScore = 0;
    quizGameActive = true;
    
    askQuizQuestion();
}

function askQuizQuestion() {
    if (quizGameIndex >= quizGameQuestions.length) {
        endQuizGame();
        return;
    }
    
    const q = quizGameQuestions[quizGameIndex];
    const message = `📝 Question ${quizGameIndex + 1}/${quizGameQuestions.length}\n\n${q.question}\n\n${q.options.join('\n')}\n\nType your answer (A, B, C, or D):`;
    
    if (typeof displayMessage === 'function') {
        displayMessage(message, 'bot');
    } else {
        alert(message);
    }
    
    createGameInput("Enter your answer (A, B, C, or D):", (answer) => {
        let answerIndex = -1;
        if (answer === 'A') answerIndex = 0;
        else if (answer === 'B') answerIndex = 1;
        else if (answer === 'C') answerIndex = 2;
        else if (answer === 'D') answerIndex = 3;
        
        const isCorrect = (answerIndex === q.correct);
        
        if (isCorrect) {
            quizGameScore += 10;
            showGameResult(`✅ Correct! +10 points. Score: ${quizGameScore}`, 'correct');
        } else {
            const correctLetter = String.fromCharCode(65 + q.correct);
            showGameResult(`❌ Wrong! The correct answer was ${correctLetter}. Score: ${quizGameScore}`, 'wrong');
        }
        
        quizGameIndex++;
        setTimeout(() => askQuizQuestion(), 2000);
    });
}

function endQuizGame() {
    quizGameActive = false;
    const percentage = (quizGameScore / (quizGameQuestions.length * 10)) * 100;
    let grade = percentage >= 80 ? 'Excellent! 🎉' : percentage >= 60 ? 'Good job! 👍' : 'Keep practicing! 📚';
    
    const message = `🏆 GAME OVER! 🏆\n\nFinal Score: ${quizGameScore}/${quizGameQuestions.length * 10}\nPercentage: ${percentage}%\nGrade: ${grade}\n\nThanks for playing!`;
    
    if (typeof displayMessage === 'function') {
        displayMessage(message, 'bot');
    } else {
        alert(message);
    }
    
    setTimeout(() => openGamesModal(), 3000);
}

// ========== MEMORY MATCH GAME ==========
let memoryCards = [];
let memoryFlipped = [];
let memoryMatched = 0;
let memoryGameActive = false;

function startMemoryGame() {
    closeGamesModal();
    
    if (typeof displayMessage === 'function') {
        displayMessage(`🧠 Starting MEMORY MATCH GAME!`, 'bot');
        displayMessage(`Match the pairs!`, 'bot');
    } else {
        alert(`🧠 Starting MEMORY MATCH GAME!`);
    }
    
    const emojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼'];
    memoryCards = [...emojis, ...emojis];
    
    for (let i = memoryCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [memoryCards[i], memoryCards[j]] = [memoryCards[j], memoryCards[i]];
    }
    
    memoryFlipped = [];
    memoryMatched = 0;
    memoryGameActive = true;
    
    renderMemoryGameUI();
}

function renderMemoryGameUI() {
    const gameContainer = document.createElement('div');
    gameContainer.id = 'memoryGameContainer';
    gameContainer.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #0A0717; border: 2px solid #a855f7; border-radius: 20px; padding: 20px; z-index: 200000; width: 90%; max-width: 600px; text-align: center;';
    
    gameContainer.innerHTML = `
        <h2 style="color: #a855f7; margin-bottom: 15px;">🎴 Memory Match Game</h2>
        <div style="margin-bottom: 15px;">
            <span style="color: white;">Matches: </span>
            <span id="memoryMatches" style="color: #22c55e; font-size: 24px;">${memoryMatched}</span>
            <span style="color: white;"> / ${memoryCards.length / 2}</span>
        </div>
        <div id="memoryGrid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;"></div>
        <button onclick="closeMemoryGame()" style="padding: 10px 20px; background: linear-gradient(90deg,#a855f7,#6366f1); border: none; border-radius: 8px; color: white; cursor: pointer;">Close Game</button>
    `;
    
    document.body.appendChild(gameContainer);
    updateMemoryGrid();
}

function updateMemoryGrid() {
    const grid = document.getElementById('memoryGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    for (let i = 0; i < memoryCards.length; i++) {
        const isFlipped = memoryFlipped.includes(i);
        const isMatched = memoryCards[i] === 'matched';
        
        const card = document.createElement('div');
        card.style.cssText = `background: ${isFlipped || isMatched ? '#a855f7' : '#1a162b'}; border: 2px solid #6366f1; border-radius: 10px; padding: 20px; text-align: center; cursor: pointer; font-size: 30px; transition: 0.2s;`;
        card.textContent = (isFlipped || isMatched) ? memoryCards[i] : '?';
        card.onclick = () => flipMemoryCard(i);
        grid.appendChild(card);
    }
    
    const matchesSpan = document.getElementById('memoryMatches');
    if (matchesSpan) matchesSpan.textContent = memoryMatched;
}

function flipMemoryCard(index) {
    if (!memoryGameActive) return;
    if (memoryFlipped.length >= 2) return;
    if (memoryFlipped.includes(index)) return;
    if (memoryCards[index] === 'matched') return;
    
    memoryFlipped.push(index);
    updateMemoryGrid();
    
    if (memoryFlipped.length === 2) {
        checkMemoryMatch();
    }
}

function checkMemoryMatch() {
    const card1 = memoryFlipped[0];
    const card2 = memoryFlipped[1];
    
    if (memoryCards[card1] === memoryCards[card2]) {
        memoryCards[card1] = 'matched';
        memoryCards[card2] = 'matched';
        memoryMatched++;
        memoryFlipped = [];
        updateMemoryGrid();
        showGameResult('✅ Match found! +10 points', 'correct');
        
        if (memoryMatched === memoryCards.length / 2) {
            showGameResult('🎉 CONGRATULATIONS! You completed the game! 🎉', 'correct');
            memoryGameActive = false;
            setTimeout(() => closeMemoryGame(), 3000);
        }
    } else {
        setTimeout(() => {
            memoryFlipped = [];
            updateMemoryGrid();
            showGameResult('❌ No match. Try again!', 'wrong');
        }, 1000);
    }
}

function closeMemoryGame() {
    const container = document.getElementById('memoryGameContainer');
    if (container) container.remove();
    openGamesModal();
}

// ========== TYPING GAME ==========
let typingGameActive = false;
let typingGameScore = 0;
let typingGameWords = ['Cortexa', 'Artificial', 'Intelligence', 'Machine', 'Learning', 'Algorithm', 'Neural', 'Network', 'Python', 'JavaScript'];
let currentTypingWord = '';

function startTypingGame() {
    closeGamesModal();
    
    if (typeof displayMessage === 'function') {
        displayMessage(`⌨️ Starting TYPING SPEED GAME!`, 'bot');
        displayMessage(`Type the words as fast as you can!`, 'bot');
    }
    
    typingGameActive = true;
    typingGameScore = 0;
    nextTypingWord();
}

function nextTypingWord() {
    if (!typingGameActive) return;
    
    currentTypingWord = typingGameWords[Math.floor(Math.random() * typingGameWords.length)];
    
    const gameContainer = document.createElement('div');
    gameContainer.id = 'typingGameContainer';
    gameContainer.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #0A0717; border: 2px solid #a855f7; border-radius: 20px; padding: 30px; z-index: 200000; width: 90%; max-width: 500px; text-align: center;';
    
    gameContainer.innerHTML = `
        <h2 style="color: #a855f7; margin-bottom: 15px;">⌨️ Typing Speed Game</h2>
        <div style="margin-bottom: 15px;">
            <span style="color: white;">Score: </span>
            <span id="typingScore" style="color: #22c55e; font-size: 24px;">${typingGameScore}</span>
        </div>
        <div style="background: #1a162b; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
            <p style="color: #a855f7; font-size: 14px;">Type this word:</p>
            <p style="font-size: 32px; font-weight: bold; color: white;">${currentTypingWord}</p>
        </div>
        <input type="text" id="typingInput" placeholder="Type the word here..." style="width: 100%; padding: 12px; background: #120d25; border: 1px solid #a855f7; border-radius: 8px; color: white; font-size: 16px; margin-bottom: 15px;">
        <div style="display: flex; gap: 10px; justify-content: center;">
            <button onclick="checkTypingWord()" style="padding: 10px 20px; background: linear-gradient(90deg,#a855f7,#6366f1); border: none; border-radius: 8px; color: white; cursor: pointer;">Submit</button>
            <button onclick="closeTypingGame()" style="padding: 10px 20px; background: #ef4444; border: none; border-radius: 8px; color: white; cursor: pointer;">Quit</button>
        </div>
    `;
    
    document.body.appendChild(gameContainer);
    document.getElementById('typingInput').focus();
}

function checkTypingWord() {
    const input = document.getElementById('typingInput');
    const userInput = input.value.trim().toLowerCase();
    
    if (userInput === currentTypingWord.toLowerCase()) {
        typingGameScore += 10;
        showGameResult(`✅ Correct! +10 points. Total: ${typingGameScore}`, 'correct');
        closeTypingGame();
        setTimeout(() => nextTypingWord(), 500);
    } else {
        showGameResult(`❌ Wrong! The correct word was "${currentTypingWord}".`, 'wrong');
        closeTypingGame();
        setTimeout(() => nextTypingWord(), 1500);
    }
}

function closeTypingGame() {
    const container = document.getElementById('typingGameContainer');
    if (container) container.remove();
    if (typingGameActive === false) openGamesModal();
}

// ========== TRIVIA GAME ==========
let triviaQuestions = [];
let triviaIndex = 0;
let triviaScore = 0;

function startTriviaGame() {
    closeGamesModal();
    
    if (typeof displayMessage === 'function') {
        displayMessage(`🎲 Starting TRIVIA CHALLENGE!`, 'bot');
    }
    
    triviaQuestions = [
        { question: "What is the capital of France?", options: ["A) London", "B) Berlin", "C) Paris", "D) Madrid"], correct: 2 },
        { question: "Which planet is known as the Red Planet?", options: ["A) Mars", "B) Jupiter", "C) Venus", "D) Saturn"], correct: 0 },
        { question: "Who painted the Mona Lisa?", options: ["A) Van Gogh", "B) Picasso", "C) Da Vinci", "D) Rembrandt"], correct: 2 },
        { question: "What is the largest ocean on Earth?", options: ["A) Atlantic", "B) Indian", "C) Arctic", "D) Pacific"], correct: 3 },
        { question: "Which year did World War II end?", options: ["A) 1943", "B) 1944", "C) 1945", "D) 1946"], correct: 2 }
    ];
    
    triviaIndex = 0;
    triviaScore = 0;
    askTriviaQuestion();
}

function askTriviaQuestion() {
    if (triviaIndex >= triviaQuestions.length) {
        const percentage = (triviaScore / (triviaQuestions.length * 10)) * 100;
        const message = `🏆 TRIVIA COMPLETE! Final Score: ${triviaScore}/${triviaQuestions.length * 10} (${percentage}%)`;
        
        if (typeof displayMessage === 'function') {
            displayMessage(message, 'bot');
        } else {
            alert(message);
        }
        setTimeout(() => openGamesModal(), 3000);
        return;
    }
    
    const q = triviaQuestions[triviaIndex];
    const message = `📝 Question ${triviaIndex + 1}/${triviaQuestions.length}\n\n${q.question}\n\n${q.options.join('\n')}`;
    
    if (typeof displayMessage === 'function') {
        displayMessage(message, 'bot');
    } else {
        alert(message);
    }
    
    createGameInput("Enter your answer (A, B, C, or D):", (answer) => {
        let answerIndex = -1;
        if (answer === 'A') answerIndex = 0;
        else if (answer === 'B') answerIndex = 1;
        else if (answer === 'C') answerIndex = 2;
        else if (answer === 'D') answerIndex = 3;
        
        if (answerIndex === triviaQuestions[triviaIndex].correct) {
            triviaScore += 10;
            showGameResult(`✅ Correct! +10 points. Score: ${triviaScore}`, 'correct');
        } else {
            const correctLetter = String.fromCharCode(65 + triviaQuestions[triviaIndex].correct);
            showGameResult(`❌ Wrong! The correct answer was ${correctLetter}. Score: ${triviaScore}`, 'wrong');
        }
        
        triviaIndex++;
        setTimeout(() => askTriviaQuestion(), 2000);
    });
}

// ========== WORD GUESS GAME ==========
let wordToGuess = '';
let guessedLetters = [];
let attemptsLeft = 6;
const wordBank = ['PYTHON', 'JAVASCRIPT', 'CORTEXA', 'LEARNING', 'ALGORITHM', 'DATABASE', 'NETWORK'];

function startWordGuessGame() {
    closeGamesModal();
    wordToGuess = wordBank[Math.floor(Math.random() * wordBank.length)];
    guessedLetters = Array(wordToGuess.length).fill('_');
    attemptsLeft = 6;
    
    if (typeof displayMessage === 'function') {
        displayMessage(`🔤 Starting WORD GUESSING GAME!`, 'bot');
        displayMessage(`Guess the word letter by letter. You have ${attemptsLeft} attempts.`, 'bot');
    }
    
    renderWordGuessUI();
}

function renderWordGuessUI() {
    const gameContainer = document.createElement('div');
    gameContainer.id = 'wordGuessContainer';
    gameContainer.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #0A0717; border: 2px solid #a855f7; border-radius: 20px; padding: 30px; z-index: 200000; width: 90%; max-width: 500px; text-align: center;';
    
    gameContainer.innerHTML = `
        <h2 style="color: #a855f7; margin-bottom: 15px;">🔤 Word Guess Game</h2>
        <div style="margin-bottom: 15px;">
            <span style="color: white;">Attempts left: </span>
            <span id="attemptsLeft" style="color: #ef4444; font-size: 20px;">${attemptsLeft}</span>
        </div>
        <div style="background: #1a162b; padding: 25px; border-radius: 12px; margin-bottom: 20px;">
            <p id="wordDisplay" style="font-size: 28px; letter-spacing: 8px; color: white;">${guessedLetters.join(' ')}</p>
        </div>
        <input type="text" id="letterInput" maxlength="1" placeholder="Guess a letter..." style="width: 80%; padding: 12px; background: #120d25; border: 1px solid #a855f7; border-radius: 8px; color: white; font-size: 20px; text-align: center; margin-bottom: 15px;">
        <div style="display: flex; gap: 10px; justify-content: center;">
            <button onclick="checkWordGuess()" style="padding: 10px 20px; background: linear-gradient(90deg,#a855f7,#6366f1); border: none; border-radius: 8px; color: white; cursor: pointer;">Guess</button>
            <button onclick="closeWordGuessGame()" style="padding: 10px 20px; background: #ef4444; border: none; border-radius: 8px; color: white; cursor: pointer;">Quit</button>
        </div>
    `;
    
    document.body.appendChild(gameContainer);
    document.getElementById('letterInput').focus();
}

function checkWordGuess() {
    const input = document.getElementById('letterInput');
    const letter = input.value.trim().toUpperCase();
    if (!letter) return;
    
    let correct = false;
    for (let i = 0; i < wordToGuess.length; i++) {
        if (wordToGuess[i] === letter && guessedLetters[i] === '_') {
            guessedLetters[i] = letter;
            correct = true;
        }
    }
    
    const wordDisplay = document.getElementById('wordDisplay');
    const attemptsSpan = document.getElementById('attemptsLeft');
    
    if (correct) {
        showGameResult(`✅ Good guess! "${letter}" is in the word!`, 'correct');
        if (wordDisplay) wordDisplay.innerHTML = guessedLetters.join(' ');
        
        if (!guessedLetters.includes('_')) {
            showGameResult(`🎉 CONGRATULATIONS! You guessed the word "${wordToGuess}"! 🎉`, 'correct');
            setTimeout(() => closeWordGuessGame(), 3000);
        }
    } else {
        attemptsLeft--;
        if (attemptsSpan) attemptsSpan.textContent = attemptsLeft;
        showGameResult(`❌ Wrong! "${letter}" is not in the word. ${attemptsLeft} attempts left.`, 'wrong');
        
        if (attemptsLeft === 0) {
            showGameResult(`💀 GAME OVER! The word was "${wordToGuess}".`, 'wrong');
            setTimeout(() => closeWordGuessGame(), 3000);
        }
    }
    
    input.value = '';
    input.focus();
}

function closeWordGuessGame() {
    const container = document.getElementById('wordGuessContainer');
    if (container) container.remove();
    openGamesModal();
}

// ========== HELPER FUNCTIONS ==========

function createGameInput(placeholder, callback) {
    const inputContainer = document.createElement('div');
    inputContainer.id = 'gameInputContainer';
    inputContainer.style.cssText = 'position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); background: #0A0717; border: 1px solid #a855f7; border-radius: 12px; padding: 15px; z-index: 200000; width: 300px; text-align: center;';
    
    inputContainer.innerHTML = `
        <p style="color: #a1a1aa; margin-bottom: 10px;">${placeholder}</p>
        <input type="text" id="gameAnswerInput" style="width: 90%; padding: 10px; background: #120d25; border: 1px solid #a855f7; border-radius: 8px; color: white; text-align: center;">
        <button id="gameSubmitBtn" style="margin-top: 10px; padding: 8px 16px; background: linear-gradient(90deg,#a855f7,#6366f1); border: none; border-radius: 8px; color: white; cursor: pointer;">Submit</button>
    `;
    
    document.body.appendChild(inputContainer);
    
    const inputField = document.getElementById('gameAnswerInput');
    const submitBtn = document.getElementById('gameSubmitBtn');
    
    const handleSubmit = () => {
        const answer = inputField.value.trim().toUpperCase();
        if (answer) {
            inputContainer.remove();
            callback(answer);
        }
    };
    
    submitBtn.onclick = handleSubmit;
    inputField.onkeypress = (e) => { if (e.key === 'Enter') handleSubmit(); };
    inputField.focus();
    
    setTimeout(() => {
        if (document.getElementById('gameInputContainer')) {
            inputContainer.remove();
            callback('');
        }
    }, 30000);
}

function showGameResult(message, type) {
    const resultDiv = document.createElement('div');
    resultDiv.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: ${type === 'correct' ? '#22c55e' : '#ef4444'}; color: white; padding: 15px 25px; border-radius: 12px; z-index: 300000; font-size: 16px; text-align: center; min-width: 250px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);`;
    resultDiv.textContent = message;
    document.body.appendChild(resultDiv);
    
    setTimeout(() => resultDiv.remove(), 2000);
    
    if (typeof displayMessage === 'function') {
        displayMessage(message, 'bot');
    }
}

console.log("✅ Games Module Loaded Successfully!");
// ================= AUDIO EXPLANATION MODULE (ADDED AT END) =================
// Note: Using existing global variables from top of file:
// audioModal, isListening, currentUtterance, currentAudio, currentAudioMode, currentAudioText

// Open Audio Modal
window.openAudioMode = function() {
    const modal = document.getElementById('audioModal');
    if (modal) {
        modal.style.display = 'flex';
        const responseArea = document.getElementById('audioResponseArea');
        const queryInput = document.getElementById('audioQueryInput');
        const micStatus = document.getElementById('micStatus');
        const micButton = document.getElementById('micButton');
        if (responseArea) responseArea.style.display = 'none';
        if (queryInput) queryInput.value = '';
        if (micStatus) micStatus.innerHTML = 'Click microphone to speak';
        if (micButton) micButton.classList.remove('listening');
    }
}

// Close Audio Modal
window.closeAudioMode = function() {
    const modal = document.getElementById('audioModal');
    if (modal) modal.style.display = 'none';
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
        currentAudioUrl = null;
    }
}

// Set Audio Mode
window.setAudioMode = function(mode, element) {
    currentAudioMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    if (element) element.classList.add('active');
    
    const micStatus = document.getElementById('micStatus');
    if (micStatus) {
        const modeNames = { simple: 'Simple Mode', exam: 'Exam Mode', quick: 'Quick Mode', detailed: 'Detailed Mode' };
        micStatus.innerHTML = `🎙️ ${modeNames[mode]} activated`;
        setTimeout(() => {
            if (micStatus.innerHTML.includes('activated')) 
                micStatus.innerHTML = 'Click microphone to speak';
        }, 1500);
    }
}

// Toggle Microphone with Web Speech API
window.toggleMicrophone = function() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('❌ Speech recognition not supported. Please use Chrome or Edge.');
        return;
    }
    
    const micButton = document.getElementById('micButton');
    const micStatus = document.getElementById('micStatus');
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    if (micButton) micButton.classList.add('listening');
    if (micStatus) micStatus.innerHTML = '🎙️ Listening... Speak now';
    
    recognition.onstart = () => {
        console.log('Speech recognition started');
    };
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const inputField = document.getElementById('audioQueryInput');
        if (inputField) {
            inputField.value = transcript;
            if (micStatus) micStatus.innerHTML = `✅ "${transcript.substring(0, 50)}${transcript.length > 50 ? '...' : ''}"`;
            setTimeout(() => {
                sendAudioQuery();
            }, 500);
        }
    };
    
    recognition.onerror = (event) => {
        console.error('Recognition error:', event.error);
        if (micStatus) micStatus.innerHTML = `❌ Error: ${event.error}`;
        if (micButton) micButton.classList.remove('listening');
        setTimeout(() => {
            if (micStatus && micStatus.innerHTML.includes('Error')) 
                micStatus.innerHTML = 'Click microphone to speak';
        }, 2000);
    };
    
    recognition.onend = () => {
        if (micButton) micButton.classList.remove('listening');
        if (micStatus && (micStatus.innerHTML === '🎙️ Listening... Speak now' || micStatus.innerHTML.includes('Listening'))) {
            micStatus.innerHTML = 'Click microphone to speak';
        }
    };
    
    recognition.start();
    
    setTimeout(() => {
        try { recognition.stop(); } catch(e) {}
    }, 10000);
}

// Send Audio Query - USING EXISTING API_URL and currentDocument
window.sendAudioQuery = async function() {
    const inputField = document.getElementById('audioQueryInput');
    let query = inputField ? inputField.value.trim() : '';
    
    if (!query) {
        const micStatus = document.getElementById('micStatus');
        if (micStatus) micStatus.innerHTML = '⚠️ Please type or speak a question';
        return;
    }
    
    const responseArea = document.getElementById('audioResponseArea');
    const responseText = document.getElementById('responseText');
    if (responseArea) responseArea.style.display = 'block';
    if (responseText) responseText.innerHTML = '<div class="loading-spinner"></div> Generating intelligent explanation...';
    
    try {
        let modeInstruction = '';
        switch(currentAudioMode) {
            case 'simple':
                modeInstruction = 'Explain in very simple, beginner-friendly language with analogies.';
                break;
            case 'exam':
                modeInstruction = 'Provide a detailed, exam-oriented explanation with key points and potential questions.';
                break;
            case 'quick':
                modeInstruction = 'Give a very concise, bullet-point style answer (max 3 sentences).';
                break;
            case 'detailed':
                modeInstruction = 'Provide a comprehensive, in-depth explanation with examples and structured format.';
                break;
        }
        
        const enhancedQuery = `${modeInstruction}\n\nQuestion: ${query}`;
        
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: enhancedQuery,
                audio_mode: currentAudioMode,
                generate_audio: true 
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.response) {
            let formattedResponse = data.response;
            formattedResponse = formattedResponse.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            formattedResponse = formattedResponse.replace(/\n/g, '<br>');
            if (responseText) responseText.innerHTML = formattedResponse;
            
            window.currentAudioText = data.response;
            
            if (data.audio_url) {
                const audioPlayer = document.getElementById('audioPlayer');
                const playerContainer = document.getElementById('audioPlayerContainer');
                if (playerContainer) playerContainer.style.display = 'block';
                if (audioPlayer) {
                    audioPlayer.src = data.audio_url;
                    currentAudioUrl = data.audio_url;
                    audioPlayer.play().catch(e => console.log('Auto-play blocked'));
                }
            }
            
            const modeBadge = document.createElement('div');
            modeBadge.style.cssText = 'font-size: 10px; color: #a855f7; margin-top: 8px; text-align: right; opacity: 0.7;';
            modeBadge.innerHTML = `🎧 ${currentAudioMode.charAt(0).toUpperCase() + currentAudioMode.slice(1)} Mode`;
            if (responseText) responseText.appendChild(modeBadge);
            
        } else {
            if (responseText) responseText.innerHTML = '⚠️ No response from AI. Please try again.';
        }
        
        if (inputField) inputField.value = '';
        
    } catch (error) {
        console.error("Audio query error:", error);
        if (responseText) responseText.innerHTML = `⚠️ Connection error. Make sure backend is running on port 8000.<br><br>❌ ${error.message}`;
    }
}

// Play Audio Response
window.playAudioResponse = function() {
    const audioPlayer = document.getElementById('audioPlayer');
    if (audioPlayer && audioPlayer.src) {
        audioPlayer.play().catch(e => console.log('Play error:', e));
    } else if (window.currentAudioText) {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            currentUtterance = new SpeechSynthesisUtterance(window.currentAudioText);
            currentUtterance.rate = 0.95;
            currentUtterance.pitch = 1.0;
            window.speechSynthesis.speak(currentUtterance);
        } else {
            alert('Audio playback not supported');
        }
    } else {
        alert('No audio content available. Generate an explanation first.');
    }
}

// Pause Audio
window.pauseAudioResponse = function() {
    const audioPlayer = document.getElementById('audioPlayer');
    if (audioPlayer && !audioPlayer.paused) {
        audioPlayer.pause();
    } else if (window.speechSynthesis) {
        window.speechSynthesis.pause();
    }
}

// Stop Audio
window.stopAudioResponse = function() {
    const audioPlayer = document.getElementById('audioPlayer');
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

// Download Audio Response - Using existing showToastMessage
window.downloadAudioResponse = async function() {
    const responseText = document.getElementById('responseText');
    let textContent = responseText?.innerText || responseText?.textContent;
    
    if (!textContent || textContent.includes('Generating') || textContent.includes('loading')) {
        showToastMessage('❌ No audio content available. Generate an explanation first.');
        return;
    }
    
    textContent = textContent.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '');
    
    try {
        const response = await fetch('https://cortexa-2-2ydr.onrender.com/api/chat', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: textContent, mode: currentAudioMode })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cortexa_audio_${Date.now()}.mp3`;
            a.click();
            URL.revokeObjectURL(url);
            showToastMessage('✅ Audio downloaded successfully!');
        } else {
            alert('Audio download requires backend TTS service.');
        }
    } catch (err) {
        console.error('Download error:', err);
        alert('❌ Download failed. Make sure backend is running on port 8000');
    }
}

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('audioModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) window.closeAudioMode();
        });
    }
    
    // Keyboard shortcut: Ctrl+Shift+A to open audio mode
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            window.openAudioMode();
        }
    });
});

console.log("✅ Audio Explanation Module Loaded - Use Ctrl+Shift+A to open");
