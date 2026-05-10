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
    
    try {
        const response = await fetch('/api/chat', {
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
        
        // Add AI response
        const aiBubble = document.createElement('div');
        aiBubble.className = 'chat-bubble ai-bubble';
        aiBubble.innerHTML = `<strong>AI:</strong> ${data.response}`;
        chatContainer.appendChild(aiBubble);
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Error sending message', 'error');
    }
}

// ================= VIDEO FUNCTIONALITY =================
async function searchVideos() {
    const query = document.getElementById('videoSearchInput').value.trim();
    if (!query) return;
    
    try {
        const response = await fetch('/api/youtube/search', {
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
        const response = await fetch('/api/generate/quiz', {
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
        document.getElementById('recordBtn').textContent = 'Stop Recording';
        
    } catch (error) {
        console.error('Error starting recording:', error);
        showToast('Error accessing microphone', 'error');
    }
}

function stopRecording() {
    if (!isRecording) return;
    
    mediaRecorder.stop();
    isRecording = false;
    document.getElementById('recordBtn').textContent = 'Start Recording';
}

async function uploadAudio() {
    if (!currentAudioBlob) return;
    
    const formData = new FormData();
    formData.append('audio', currentAudioBlob);
    
    try {
        const response = await fetch('/api/audio/transcribe', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        document.getElementById('audioTranscript').textContent = data.transcript;
        
    } catch (error) {
        console.error('Error uploading audio:', error);
        showToast('Error uploading audio', 'error');
    }
}

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
