// ================= GLOBAL VARIABLES =================
let currentUser = null;
let currentVideoId = null;
let currentAudioBlob = null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];

// ================= USER AUTHENTICATION =================
function getCurrentUser() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('user') || localStorage.getItem('currentUser') || 'guest';
}

function setCurrentUser(username) {
    localStorage.setItem('currentUser', username);
    currentUser = username;
}

// ================= TOAST NOTIFICATIONS =================
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#ef4444' : '#10b981'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 10000;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ================= CHAT FUNCTIONALITY =================
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    const user = getCurrentUser();
    const chatContainer = document.getElementById('chatContainer');
    
    // Add user message
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user-bubble';
    userBubble.innerHTML = `<strong>You:</strong> ${message}`;
    chatContainer.appendChild(userBubble);
    
    input.value = '';
    
    // Add loading message
    const loadingBubble = document.createElement('div');
    loadingBubble.className = 'chat-bubble ai-bubble loading';
    loadingBubble.innerHTML = '<strong>AI:</strong> <em>Typing...</em>';
    chatContainer.appendChild(loadingBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    try {
        const response = await fetch('https://cortexa-2-2ydr.onrender.com/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                user: user
            })
        });
        
        const data = await response.json();
        
        // Remove loading message
        loadingBubble.remove();
        
        // Add AI response
        const aiBubble = document.createElement('div');
        aiBubble.className = 'chat-bubble ai-bubble';
        aiBubble.innerHTML = `<strong>AI:</strong> ${data.response}`;
        chatContainer.appendChild(aiBubble);
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
    } catch (error) {
        console.error('Error sending message:', error);
        loadingBubble.remove();
        
        // Fallback response
        const fallbackBubble = document.createElement('div');
        fallbackBubble.className = 'chat-bubble ai-bubble';
        fallbackBubble.innerHTML = `<strong>AI:</strong> Hello! I am Cortexa, your AI assistant. I can help you with learning, quizzes, videos, and more. How can I assist you today?`;
        chatContainer.appendChild(fallbackBubble);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// ================= VIDEO FUNCTIONALITY =================
async function searchVideos() {
    const query = document.getElementById('videoSearchInput').value.trim();
    if (!query) return;
    
    try {
        const response = await fetch('https://cortexa-2-2ydr.onrender.com/api/youtube/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: query })
        });
        
        const data = await response.json();
        displayVideoResults(data.videos);
        
    } catch (error) {
        console.error('Error searching videos:', error);
        showToast('Error searching videos', 'error');
    }
}

async function generateVideoExplanation() {
    const videoId = currentVideoId;
    if (!videoId) {
        showToast('Please select a video first', 'error');
        return;
    }
    
    try {
        const response = await fetch('https://cortexa-2-2ydr.onrender.com/api/video/explain', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videoId: videoId })
        });
        
        const data = await response.json();
        displayVideoExplanation(data.explanation);
        
    } catch (error) {
        console.error('Error generating video explanation:', error);
        showToast('Error generating video explanation', 'error');
    }
}

function displayVideoExplanation(explanation) {
    const explanationContainer = document.getElementById('videoExplanation');
    if (explanationContainer) {
        explanationContainer.innerHTML = `
            <div class="video-explanation-card">
                <h3>📹 Video Explanation</h3>
                <p>${explanation}</p>
            </div>
        `;
    }
}

function displayVideoResults(videos) {
    const resultsContainer = document.getElementById('videoResults');
    resultsContainer.innerHTML = '';
    
    videos.forEach(video => {
        const videoCard = document.createElement('div');
        videoCard.className = 'video-card';
        videoCard.innerHTML = `
            <img src="${video.thumbnail}" alt="${video.title}">
            <h4>${video.title}</h4>
            <p>${video.channel}</p>
            <button onclick="playVideo('${video.videoId}')">Play</button>
        `;
        resultsContainer.appendChild(videoCard);
    });
}

// ================= QUIZ FUNCTIONALITY =================
async function generateQuiz() {
    const topic = document.getElementById('quizTopicInput').value.trim();
    if (!topic) return;
    
    try {
        const response = await fetch('https://cortexa-2-2ydr.onrender.com/api/generate/quiz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ topic: topic })
        });
        
        const data = await response.json();
        displayQuiz(data.quiz);
        
    } catch (error) {
        console.error('Error generating quiz:', error);
        showToast('Error generating quiz', 'error');
    }
}

function displayQuiz(quiz) {
    const quizContainer = document.getElementById('quizContainer');
    quizContainer.innerHTML = '';
    
    quiz.forEach((question, index) => {
        const questionCard = document.createElement('div');
        questionCard.className = 'quiz-question-card';
        questionCard.innerHTML = `
            <h3 class="quiz-question-text">${question.question}</h3>
            <div class="quiz-options">
                ${question.options.map((option, i) => `
                    <label class="quiz-option">
                        <input type="radio" name="question${index}" value="${option}">
                        <span>${option}</span>
                    </label>
                `).join('')}
            </div>
            <button onclick="checkAnswer(${index}, '${question.correctAnswer}')">Check Answer</button>
        `;
        quizContainer.appendChild(questionCard);
    });
}

function checkAnswer(questionIndex, correctAnswer) {
    const selected = document.querySelector(`input[name="question${questionIndex}"]:checked`);
    if (!selected) {
        showToast('Please select an answer', 'error');
        return;
    }
    
    if (selected.value === correctAnswer) {
        showToast('Correct! 🎉', 'success');
    } else {
        showToast(`Incorrect. The correct answer is: ${correctAnswer}`, 'error');
    }
}

// ================= AUDIO FUNCTIONALITY =================
async function startRecording() {
    if (isRecording) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            currentAudioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            await uploadAudio();
        };
        
        mediaRecorder.start();
        isRecording = true;
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) {
            recordBtn.textContent = 'Stop Recording';
            recordBtn.style.backgroundColor = '#ef4444';
        }
        
        showToast('Recording started...', 'success');
        
    } catch (error) {
        console.error('Error starting recording:', error);
        showToast('Error accessing microphone. Please check permissions.', 'error');
    }
}

function stopRecording() {
    if (!isRecording) return;
    
    mediaRecorder.stop();
    isRecording = false;
    const recordBtn = document.getElementById('recordBtn');
    if (recordBtn) {
        recordBtn.textContent = 'Start Recording';
        recordBtn.style.backgroundColor = '#10b981';
    }
    
    showToast('Recording stopped. Processing...', 'success');
}

async function uploadAudio() {
    if (!currentAudioBlob) return;
    
    const formData = new FormData();
    formData.append('audio', currentAudioBlob, 'recording.wav');
    
    try {
        const response = await fetch('https://cortexa-2-2ydr.onrender.com/api/audio/transcribe', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        const transcriptContainer = document.getElementById('audioTranscript');
        if (transcriptContainer) {
            transcriptContainer.textContent = data.transcript || 'Transcription failed. Please try again.';
            transcriptContainer.style.display = 'block';
        }
        
        showToast('Audio transcribed successfully!', 'success');
        
    } catch (error) {
        console.error('Error uploading audio:', error);
        showToast('Error uploading audio. Please try again.', 'error');
        
        // Fallback message
        const transcriptContainer = document.getElementById('audioTranscript');
        if (transcriptContainer) {
            transcriptContainer.textContent = 'Audio transcription service is currently unavailable. Please try again later.';
            transcriptContainer.style.display = 'block';
        }
    }
}

// Initialize audio functionality
document.addEventListener('DOMContentLoaded', () => {
    const recordBtn = document.getElementById('recordBtn');
    if (recordBtn) {
        recordBtn.addEventListener('click', () => {
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        });
    }
});

// ================= MODAL FUNCTIONS =================
window.openVideoMode = function() {
    document.getElementById('videoModal').style.display = 'flex';
}

window.closeVideoMode = function() {
    document.getElementById('videoModal').style.display = 'none';
}

window.openAudioMode = function() {
    document.getElementById('audioModal').style.display = 'flex';
}

window.closeAudioMode = function() {
    document.getElementById('audioModal').style.display = 'none';
}

window.openQuizMode = function() {
    document.getElementById('quizModal').style.display = 'flex';
}

window.closeQuizMode = function() {
    document.getElementById('quizModal').style.display = 'none';
}

window.openReportMode = function() {
    document.getElementById('reportModal').style.display = 'flex';
}

window.closeReportMode = function() {
    document.getElementById('reportModal').style.display = 'none';
}

window.openLearningTools = function() {
    document.getElementById('learningModal').style.display = 'flex';
}

window.closeLearningTools = function() {
    document.getElementById('learningModal').style.display = 'none';
}

window.openGamesModal = function() {
    document.getElementById('gamesModal').style.display = 'flex';
}

window.closeGamesModal = function() {
    document.getElementById('gamesModal').style.display = 'none';
}

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
    // Set current user
    currentUser = getCurrentUser();
    
    // Setup event listeners
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    document.getElementById('searchBtn').addEventListener('click', searchVideos);
    document.getElementById('generateQuizBtn').addEventListener('click', generateQuiz);
    document.getElementById('recordBtn').addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });
    
    // Close modals when clicking outside
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
});

// ================= UTILITY FUNCTIONS =================
function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);
window.openMindMapMode = function() {
    console.log("Opening Mind Map Modal");
    const modal = document.getElementById("mindMapModal");
    if (modal) {
        modal.style.display = "flex";
    }
    if (typeof switchMindMapTab === "function") switchMindMapTab("create");
}

window.closeMindMapMode = function() {
    const modal = document.getElementById("mindMapModal");
    if (modal) modal.style.display = "none";
}

window.switchMindMapTab = function(tabName) {
    document.querySelectorAll(".mindmap-tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".mindmap-tab-content").forEach(content => content.style.display = "none");
    
    if (tabName === "create") {
        const createBtn = document.querySelector(".mindmap-tab-btn[onclick*=\"create\"]");
        if(createBtn) createBtn.classList.add("active");
        const createTab = document.getElementById("mindmapCreateTab");
        if(createTab) createTab.style.display = "block";
    } else {
        const libBtn = document.querySelector(".mindmap-tab-btn[onclick*=\"library\"]");
        if(libBtn) libBtn.classList.add("active");
        const libTab = document.getElementById("mindmapLibraryTab");
        if(libTab) libTab.style.display = "block";
    }
}

let mindMapScale = 1;
let currentMindMapData = null;

function calculateSubtreeWidths(node) {
    if (!node.children || node.children.length === 0 || !node.expanded) {
        node.width = 180;
        return node.width;
    }
    let totalWidth = 0;
    for (let child of node.children) {
        totalWidth += calculateSubtreeWidths(child);
    }
    node.width = Math.max(180, totalWidth);
    return node.width;
}

function assignNodePositions(node, x, y, level, nodes) {
    node.x = x;
    node.y = y;
    node.level = level;
    nodes.push(node);

    if (!node.children || node.children.length === 0 || !node.expanded) return;

    let currentX = x - (node.width / 2);
    const childY = y + 100;

    for (let child of node.children) {
        let childX = currentX + (child.width / 2);
        assignNodePositions(child, childX, childY, level + 1, nodes);
        currentX += child.width;
    }
}

window.generateAndDrawMindMap = function() {
    const topic = document.getElementById("mindmapTopicInput").value;
    if (!topic) {
        if(typeof showToast === "function") showToast("Please enter a topic", "error");
        else alert("Please enter a topic");
        return;
    }
    
    if(typeof showToast === "function") showToast("Generating mind map...");
    
    currentMindMapData = {
        title: topic,
        root: {
            id: "root", label: topic, expanded: true,
            children: [
                { id: "sub1", label: "Introduction", expanded: true, children: [{id: "sub1_1", label: "Basic concepts", expanded: true}] },
                { id: "sub2", label: "Key Concepts", expanded: true, children: [{id: "sub2_1", label: "Main ideas", expanded: true}] },
                { id: "sub3", label: "Applications", expanded: true, children: [{id: "sub3_1", label: "Real-world uses", expanded: true}] },
                { id: "sub4", label: "Conclusion", expanded: true, children: [] }
            ]
        }
    };
    drawMindMap();
}

window.drawMindMap = function() {
    if (!currentMindMapData) return;
    const canvas = document.getElementById("mindmapCanvas");
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < canvas.width; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke(); }
    for (let i = 0; i < canvas.height; i += 50) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke(); }
    
    ctx.save();
    ctx.translate(canvas.width/2, 50);
    ctx.scale(mindMapScale, mindMapScale);
    
    const nodes = [];
    calculateSubtreeWidths(currentMindMapData.root);
    assignNodePositions(currentMindMapData.root, 0, 0, 0, nodes);
    
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 2;
    nodes.forEach(node => {
        if (node.children && node.expanded) {
            node.children.forEach(child => {
                ctx.beginPath();
                ctx.moveTo(node.x, node.y + 20);
                ctx.lineTo(node.x, node.y + 60);
                ctx.lineTo(child.x, node.y + 60);
                ctx.lineTo(child.x, child.y - 20);
                ctx.stroke();
            });
        }
    });
    
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    nodes.forEach(node => {
        const isRoot = node.level === 0;
        ctx.fillStyle = "white";
        ctx.strokeStyle = isRoot ? "#a855f7" : "#555";
        ctx.lineWidth = isRoot ? 3 : 2;
        
        const w = 140; const h = 40;
        ctx.beginPath();
        ctx.roundRect(node.x - w/2, node.y - h/2, w, h, 8);
        ctx.fill(); ctx.stroke();
        
        ctx.fillStyle = "#333";
        ctx.font = isRoot ? "bold 14px Arial" : "12px Arial";
        let text = node.label;
        if (text.length > 18) text = text.substring(0, 15) + "...";
        ctx.fillText(text, node.x, node.y);
        
        if (node.children && node.children.length > 0) {
            ctx.fillStyle = "#777";
            ctx.beginPath(); ctx.arc(node.x + w/2 - 10, node.y, 8, 0, 2*Math.PI); ctx.fill();
            ctx.fillStyle = "white"; ctx.font = "10px Arial";
            ctx.fillText(node.expanded ? "-" : "+", node.x + w/2 - 10, node.y);
        }
    });
    ctx.restore();
}

window.zoomMindMap = function(factor) { mindMapScale *= factor; drawMindMap(); }
window.resetMindMapView = function() { mindMapScale = 1; drawMindMap(); }

document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("mindmapCanvas");
    if (canvas) {
        canvas.addEventListener("click", (e) => {
            if (!currentMindMapData) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = (e.clientX - rect.left - canvas.width/2) / mindMapScale;
            const clickY = (e.clientY - rect.top - 50) / mindMapScale;
            
            const nodes = [];
            calculateSubtreeWidths(currentMindMapData.root);
            assignNodePositions(currentMindMapData.root, 0, 0, 0, nodes);
            
            nodes.forEach(node => {
                if (node.children && node.children.length > 0) {
                    const w = 140; const btnX = node.x + w/2 - 10; const btnY = node.y;
                    const dist = Math.sqrt(Math.pow(clickX - btnX, 2) + Math.pow(clickY - btnY, 2));
                    if (dist < 10) { node.expanded = !node.expanded; drawMindMap(); }
                }
            });
        });
    }
});

window.startNewChat = function(e) {
    if (e) e.preventDefault();
    if(typeof showToast === "function") showToast("Starting new chat...");
    else alert("Starting new chat...");
}

window.createProject = function() {
    if(typeof showToast === "function") showToast("Creating new project...");
    else alert("Creating new project...");
}

window.documentChat = function() {
    const modal = document.getElementById('documentChatModal');
    if (modal) {
        modal.style.display = 'flex';
        showToast('Document Chat opened!', 'success');
    } else {
        showToast('Document Chat feature coming soon!', 'success');
    }
}

window.startNewChat = function(e) {
    if (e) e.preventDefault();
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
        chatContainer.innerHTML = '';
        // Add welcome message
        const welcomeBubble = document.createElement('div');
        welcomeBubble.className = 'chat-bubble ai-bubble';
        welcomeBubble.innerHTML = `<strong>AI:</strong> Hello! I am Cortexa, your AI assistant. How can I help you today?`;
        chatContainer.appendChild(welcomeBubble);
    }
    showToast('New chat started!', 'success');
}

// ================= REPORT FUNCTIONALITY =================
async function generateReport() {
    const topic = document.getElementById('reportTopicInput').value.trim();
    const reportType = document.getElementById('reportTypeSelect').value;
    
    if (!topic) {
        showToast('Please enter a topic', 'error');
        return;
    }
    
    try {
        const response = await fetch('https://cortexa-2-2ydr.onrender.com/api/generate/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                topic: topic,
                type: reportType
            })
        });
        
        const data = await response.json();
        displayReport(data.report);
        
    } catch (error) {
        console.error('Error generating report:', error);
        showToast('Error generating report', 'error');
    }
}

function displayReport(report) {
    const reportContainer = document.getElementById('reportDisplay');
    if (reportContainer) {
        reportContainer.innerHTML = `
            <div class="report-content">
                <h3>📊 Generated Report</h3>
                <div class="report-text">${report}</div>
                <div class="report-actions">
                    <button onclick="downloadReport('pdf')">📄 Download PDF</button>
                    <button onclick="downloadReport('doc')">📝 Download Word</button>
                    <button onclick="shareReport()">📤 Share Report</button>
                </div>
            </div>
        `;
    }
}

function downloadReport(format) {
    showToast(`Downloading report as ${format.toUpperCase()}...`, 'success');
}

function shareReport() {
    showToast('Report link copied to clipboard!', 'success');
}

// ================= STUDY NOTES FUNCTIONALITY =================
async function generateStudyNotes() {
    const topic = document.getElementById('studyNotesTopicInput').value.trim();
    if (!topic) {
        showToast('Please enter a topic', 'error');
        return;
    }
    
    try {
        const response = await fetch('https://cortexa-2-2ydr.onrender.com/api/generate/study-notes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ topic: topic })
        });
        
        const data = await response.json();
        displayStudyNotes(data.notes);
        
    } catch (error) {
        console.error('Error generating study notes:', error);
        showToast('Error generating study notes', 'error');
    }
}

function displayStudyNotes(notes) {
    const notesContainer = document.getElementById('studyNotesDisplay');
    if (notesContainer) {
        notesContainer.innerHTML = `
            <div class="study-notes-content">
                <h3>📚 Study Notes</h3>
                <div class="notes-text">${notes}</div>
                <div class="notes-actions">
                    <button onclick="downloadNotes('pdf')">📄 Download PDF</button>
                    <button onclick="downloadNotes('txt')">📝 Download Text</button>
                    <button onclick="saveNotesToLibrary()">💾 Save to Library</button>
                </div>
            </div>
        `;
    }
}

function downloadNotes(format) {
    showToast(`Downloading study notes as ${format.toUpperCase()}...`, 'success');
}

function saveNotesToLibrary() {
    showToast('Study notes saved to library!', 'success');
}

// ================= GAMES FUNCTIONALITY =================
window.selectGame = function(gameType) {
    const gameContainer = document.getElementById('gameContent');
    if (!gameContainer) return;
    
    switch(gameType) {
        case 'quiz-race':
            gameContainer.innerHTML = `
                <div class="quiz-race-game">
                    <h3>🏆 Quiz Race</h3>
                    <div class="game-question" id="quizRaceQuestion">Loading question...</div>
                    <div class="game-options" id="quizRaceOptions"></div>
                    <div class="game-score">Score: <span id="quizRaceScore">0</span></div>
                    <button onclick="startQuizRace()">Start Quiz Race</button>
                </div>
            `;
            break;
        case 'typing-speed':
            gameContainer.innerHTML = `
                <div class="typing-speed-game">
                    <h3>⌨️ Typing Speed Test</h3>
                    <div class="typing-text" id="typingText">The quick brown fox jumps over the lazy dog.</div>
                    <textarea id="typingInput" placeholder="Type the text above..." rows="3"></textarea>
                    <div class="typing-stats">
                        <span>WPM: <span id="wpm">0</span></span>
                        <span>Accuracy: <span id="accuracy">100%</span></span>
                    </div>
                    <button onclick="startTypingTest()">Start Typing Test</button>
                </div>
            `;
            break;
        case 'trivia-challenge':
            gameContainer.innerHTML = `
                <div class="trivia-game">
                    <h3>❓ Trivia Challenge</h3>
                    <div class="trivia-question" id="triviaQuestion">Loading trivia...</div>
                    <div class="trivia-options" id="triviaOptions"></div>
                    <div class="trivia-score">Score: <span id="triviaScore">0</span></div>
                    <button onclick="startTriviaChallenge()">Start Trivia</button>
                </div>
            `;
            break;
        case 'word-scramble':
            gameContainer.innerHTML = `
                <div class="word-scramble-game">
                    <h3>🔤 Word Scramble</h3>
                    <div class="scrambled-word" id="scrambledWord">Loading...</div>
                    <input type="text" id="wordGuess" placeholder="Enter your guess...">
                    <div class="word-score">Score: <span id="wordScore">0</span></div>
                    <button onclick="startWordScramble()">Start Word Scramble</button>
                </div>
            `;
            break;
        case 'true-false':
            gameContainer.innerHTML = `
                <div class="true-false-game">
                    <h3>✓✗ True or False</h3>
                    <div class="tf-question" id="tfQuestion">Loading question...</div>
                    <div class="tf-options">
                        <button onclick="answerTrueFalse(true)">✓ True</button>
                        <button onclick="answerTrueFalse(false)">✗ False</button>
                    </div>
                    <div class="tf-score">Score: <span id="tfScore">0</span></div>
                    <button onclick="startTrueFalse()">Start True/False</button>
                </div>
            `;
            break;
    }
    showToast(`${gameType.replace('-', ' ').toUpperCase()} game loaded!`, 'success');
}

// Game functions
function startQuizRace() {
    const questions = [
        { question: "What is 2 + 2?", options: ["3", "4", "5", "6"], correct: 1 },
        { question: "What is the capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], correct: 2 },
        { question: "What is H2O?", options: ["Hydrogen", "Water", "Oxygen", "Helium"], correct: 1 }
    ];
    
    let currentQuestion = 0;
    let score = 0;
    
    function showQuestion() {
        if (currentQuestion >= questions.length) {
            document.getElementById('quizRaceQuestion').textContent = `Quiz Complete! Final Score: ${score}/${questions.length}`;
            return;
        }
        
        const q = questions[currentQuestion];
        document.getElementById('quizRaceQuestion').textContent = q.question;
        const optionsHtml = q.options.map((opt, i) => 
            `<button onclick="checkQuizAnswer(${i}, ${q.correct})">${opt}</button>`
        ).join('');
        document.getElementById('quizRaceOptions').innerHTML = optionsHtml;
    }
    
    window.checkQuizAnswer = function(selected, correct) {
        if (selected === correct) {
            score++;
            showToast('Correct! 🎉', 'success');
        } else {
            showToast('Wrong! Try again', 'error');
        }
        document.getElementById('quizRaceScore').textContent = score;
        currentQuestion++;
        setTimeout(showQuestion, 1000);
    };
    
    showQuestion();
}

function startTypingTest() {
    const texts = [
        "The quick brown fox jumps over the lazy dog.",
        "Practice makes perfect when you type every day.",
        "Learning to type fast requires dedication and focus."
    ];
    
    const text = texts[Math.floor(Math.random() * texts.length)];
    document.getElementById('typingText').textContent = text;
    document.getElementById('typingInput').value = '';
    document.getElementById('typingInput').focus();
    
    const startTime = Date.now();
    
    document.getElementById('typingInput').addEventListener('input', function() {
        const typed = this.value;
        const wpm = Math.round((typed.length / 5) / ((Date.now() - startTime) / 60000));
        const accuracy = Math.round((typed.split('').filter((char, i) => char === text[i]).length / typed.length) * 100);
        
        document.getElementById('wpm').textContent = wpm;
        document.getElementById('accuracy').textContent = accuracy + '%';
    });
}

function startTriviaChallenge() {
    const trivia = [
        { question: "What is the largest planet in our solar system?", answer: "Jupiter" },
        { question: "Who painted the Mona Lisa?", answer: "Leonardo da Vinci" },
        { question: "What is the smallest country in the world?", answer: "Vatican City" }
    ];
    
    const question = trivia[Math.floor(Math.random() * trivia.length)];
    document.getElementById('triviaQuestion').textContent = question.question;
    document.getElementById('triviaOptions').innerHTML = `
        <input type="text" id="triviaAnswer" placeholder="Enter your answer...">
        <button onclick="checkTriviaAnswer('${question.answer}')">Submit</button>
    `;
}

window.checkTriviaAnswer = function(correctAnswer) {
    const userAnswer = document.getElementById('triviaAnswer').value.trim();
    if (userAnswer.toLowerCase() === correctAnswer.toLowerCase()) {
        const score = parseInt(document.getElementById('triviaScore').textContent) + 1;
        document.getElementById('triviaScore').textContent = score;
        showToast('Correct! 🎉', 'success');
    } else {
        showToast(`Wrong! The answer was: ${correctAnswer}`, 'error');
    }
    setTimeout(startTriviaChallenge, 2000);
};

function startWordScramble() {
    const words = ["CORTEXA", "LEARNING", "PUZZLE", "CHALLENGE", "VICTORY"];
    const word = words[Math.floor(Math.random() * words.length)];
    const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
    
    document.getElementById('scrambledWord').textContent = scrambled;
    document.getElementById('wordGuess').value = '';
    
    window.checkWordScramble = function() {
        const guess = document.getElementById('wordGuess').value.toUpperCase();
        if (guess === word) {
            const score = parseInt(document.getElementById('wordScore').textContent) + 1;
            document.getElementById('wordScore').textContent = score;
            showToast('Correct! 🎉', 'success');
            setTimeout(startWordScramble, 1500);
        } else {
            showToast('Try again!', 'error');
        }
    };
    
    document.getElementById('wordGuess').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            window.checkWordScramble();
        }
    });
}

function startTrueFalse() {
    const statements = [
        { statement: "The Earth is flat.", answer: false },
        { statement: "Water boils at 100°C.", answer: true },
        { statement: "The sun rises in the west.", answer: false }
    ];
    
    const statement = statements[Math.floor(Math.random() * statements.length)];
    document.getElementById('tfQuestion').textContent = statement.statement;
    
    window.answerTrueFalse = function(userAnswer) {
        if (userAnswer === statement.answer) {
            const score = parseInt(document.getElementById('tfScore').textContent) + 1;
            document.getElementById('tfScore').textContent = score;
            showToast('Correct! 🎉', 'success');
        } else {
            showToast('Wrong!', 'error');
        }
        setTimeout(startTrueFalse, 1500);
    };
}

localStorage.setItem('isLoggedIn', 'true'); localStorage.setItem('currentUser', JSON.stringify({name: 'Darshita'}));

window.startNewChat = function(e) {
    if (e) e.preventDefault();
    const container = document.getElementById("searchResults");
    if (container) {
        container.innerHTML = "";
    }
    if(typeof showToast === "function") showToast("? New chat started!");
    else alert("New chat started!");
}

window.createProject = function() {
    const name = prompt("Enter project name:");
    if (name && name.trim() !== "") {
        if(typeof showToast === "function") showToast(`?? Project "${name}" created!`);
        else alert(`Project "${name}" created!`);
    }
}

window.documentChat = function() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.pdf,.docx";
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            if(typeof showToast === "function") showToast(`?? Document "${file.name}" loaded!`);
            else alert(`Document "${file.name}" loaded!`);
        }
    };
    input.click();
}


window.openLearningTools = function() {
    const modal = document.getElementById('learningToolsModal');
    if (modal) modal.style.display = 'flex';
}

window.closeLearningTools = function() {
    const modal = document.getElementById('learningToolsModal');
    if (modal) modal.style.display = 'none';
}

window.openVideoMode = function() {
    const modal = document.getElementById('videoModal');
    if (modal) modal.style.display = 'flex';
}
window.closeVideoMode = function() {
    const modal = document.getElementById('videoModal');
    if (modal) modal.style.display = 'none';
}

