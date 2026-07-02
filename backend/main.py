from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
import os
import hashlib
import uuid
import uvicorn
from typing import Optional, Dict, Any
from groq import Groq
from dotenv import load_dotenv
import requests
import re
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
from rag.chunker import DocumentChunker
from rag.search import KeywordSearch
from rag.embedder import Embedder 
from rag.vector_store import VectorStore  

# ============================================
# APP INITIALIZATION
# ============================================
app = FastAPI(title="Cortexa AI", version="2.0")

# ============================================
# SECURITY & AUTHENTICATION SETUP
# ============================================

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Settings
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-super-secret-key-change-this")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

security = HTTPBearer()

# ============================================
# LOAD ENVIRONMENT VARIABLES
# ============================================
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")

# Initialize Groq client
if not GROQ_API_KEY:
    print("❌ ERROR: GROQ_API_KEY not found!")
    client = None
else:
    client = Groq(api_key=GROQ_API_KEY)
    print("✅ Groq API key loaded successfully!")

# ============================================
# CORS
# ============================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# MODELS
# ============================================

# -------- Auth Models --------
class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., pattern=r'^\+[1-9]\d{1,14}$')
    password: str = Field(..., min_length=8)
    dob: Optional[str] = None
    captcha_solution: Optional[str] = None
    captcha_secret: Optional[str] = None

class UserVerifyEmail(BaseModel):
    email: str
    code: str

class UserVerifyPhone(BaseModel):
    phone: str
    code: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class ResendOTP(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None

class UserInDB(BaseModel):
    id: str
    full_name: str
    email: str
    phone: str
    email_verified: bool = False
    phone_verified: bool = False
    created_at: str
    updated_at: str
    is_active: bool = True
    last_login: Optional[str] = None

# -------- Chat Models --------
class Message(BaseModel):
    message: str
    document_content: Optional[str] = None
    audio: bool = False

# -------- Document Models --------
class DocumentUpload(BaseModel):
    filename: str
    content: str
    status: str

# ============================================
# USER DATABASE (In-memory - Replace with PostgreSQL for production)
# ============================================

class UserDatabase:
    def __init__(self):
        self.users = {}  # email -> user_data
        self.pending_verifications = {}  # email/phone -> {otp, created_at}
        self.sessions = {}  # token -> email
    
    def create_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "email": user_data["email"],
            "full_name": user_data["full_name"],
            "phone": user_data["phone"],
            "password_hash": pwd_context.hash(user_data["password"]),
            "email_verified": False,
            "phone_verified": False,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "is_active": True,
            "last_login": None
        }
        self.users[user_data["email"]] = user
        return user
    
    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        return self.users.get(email)
    
    def get_user_by_phone(self, phone: str) -> Optional[Dict[str, Any]]:
        for user in self.users.values():
            if user["phone"] == phone:
                return user
        return None
    
    def update_user(self, email: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        user = self.users.get(email)
        if not user:
            return None
        for key, value in updates.items():
            if key in user:
                user[key] = value
        user["updated_at"] = datetime.utcnow().isoformat()
        return user
    
    def store_verification_otp(self, identifier: str, otp: str) -> None:
        self.pending_verifications[identifier] = {
            "otp": otp,
            "created_at": datetime.utcnow()
        }
    
    def verify_otp(self, identifier: str, otp: str) -> bool:
        pending = self.pending_verifications.get(identifier)
        if not pending:
            return False
        if pending["otp"] != otp:
            return False
        if datetime.utcnow() - pending["created_at"] > timedelta(minutes=10):
            return False
        del self.pending_verifications[identifier]
        return True
    
    def authenticate_user(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        user = self.users.get(email)
        if not user:
            return None
        if not pwd_context.verify(password, user["password_hash"]):
            return None
        if not user["email_verified"]:
            return None
        if not user["phone_verified"]:
            return None
        user["last_login"] = datetime.utcnow().isoformat()
        return user
    
    def create_session(self, user: Dict[str, Any]) -> str:
        payload = {
            "sub": user["email"],
            "user_id": user["id"],
            "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
        }
        token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
        self.sessions[token] = user["email"]
        return token
    
    def verify_session(self, token: str) -> Optional[Dict[str, Any]]:
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            email = payload.get("sub")
            if email and email in self.sessions.values():
                return self.users.get(email)
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return None
        return None
    
    def logout(self, token: str) -> bool:
        if token in self.sessions:
            del self.sessions[token]
            return True
        return False
    
    def get_all_users(self) -> list:
        return list(self.users.values())
    
    def get_stats(self) -> Dict[str, Any]:
        verified = sum(1 for u in self.users.values() if u["email_verified"])
        phone_verified = sum(1 for u in self.users.values() if u["phone_verified"])
        return {
            "total_users": len(self.users),
            "email_verified": verified,
            "phone_verified": phone_verified,
            "pending_verifications": len(self.pending_verifications),
            "active_sessions": len(self.sessions)
        }

# Initialize database
db = UserDatabase()

# ============================================
# HELPER FUNCTIONS
# ============================================

def generate_otp() -> str:
    import random
    import string
    return ''.join(random.choices(string.digits, k=6))

def generate_verification_token(email: str) -> str:
    payload = {
        "email": email,
        "type": "email_verification",
        "exp": datetime.utcnow() + timedelta(hours=24)
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def get_current_user(token: str = Depends(security)) -> Optional[Dict[str, Any]]:
    user = db.verify_session(token.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user

# ============================================
# RAG SETUP
# ============================================

chunker = DocumentChunker(chunk_size=500, overlap=50)
search_engine = KeywordSearch()
document_store = {}  # {doc_id: {'filename': str, 'text': str, 'chunks': list}}

# ============================================
# AVAILABLE MODELS
# ============================================

MODELS = {
    "fast": "llama-3.1-8b-instant",
    "balanced": "llama-3.3-70b-versatile",
    "powerful": "mixtral-8x7b-32768",
    "coding": "deepseek-r1-distill-llama-70b"
}

PREFERRED_MODEL = MODELS["balanced"]

SYSTEM_PROMPT = """You are Cortexa, a powerful AI assistant. 

IMPORTANT RULES:
1. NEVER give generic responses like "Got it! Let me help you with that"
2. ALWAYS answer the user's question directly with SPECIFIC information
3. Be conversational, friendly, and helpful
4. Use **bold** for emphasis and bullet points for lists
5. Keep responses informative but not overly long

Never respond with generic phrases. Always provide specific, helpful answers."""

# ============================================
# AI RESPONSE FUNCTION
# ============================================

async def get_ai_response(message: str, context: Optional[str] = None) -> str:
    if not client:
        return "⚠️ API key not configured. Please check your .env file."
    
    try:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        
        if context and context != "null" and len(context) > 10:
            messages.append({
                "role": "system",
                "content": f"Reference document: {context[:1000]}"
            })
        
        messages.append({"role": "user", "content": message})
        
        completion = client.chat.completions.create(
            model=PREFERRED_MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=1024,
            top_p=1,
            stream=False
        )
        
        return completion.choices[0].message.content
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Groq API Error: {error_msg}")
        
        if "decommissioned" in error_msg or "not found" in error_msg:
            try:
                fallback_model = MODELS["fast"]
                messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": message}
                ]
                completion = client.chat.completions.create(
                    model=fallback_model,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=1024
                )
                return completion.choices[0].message.content
            except:
                pass
        
        return f"⚠️ Error: {error_msg[:200]}"

def extract_video_id(url: str) -> str:
    patterns = [
        r'(?:youtube\.com\/watch\?v=)([\w-]+)',
        r'(?:youtu\.be\/)([\w-]+)',
        r'(?:youtube\.com\/embed\/)([\w-]+)'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

# ============================================
# AUTHENTICATION ENDPOINTS
# ============================================

@app.post("/api/register")
async def register(user: UserRegister):
    """Register a new user with email and phone verification"""
    
    # Check if user exists
    if db.get_user_by_email(user.email):
        return JSONResponse(
            status_code=400,
            content={"error": "Email already registered"}
        )
    
    # Check if phone is already used
    if db.get_user_by_phone(user.phone):
        return JSONResponse(
            status_code=400,
            content={"error": "Phone number already registered"}
        )
    
    # Create user
    user_data = user.model_dump()
    db.create_user(user_data)
    
    # Generate and store email OTP
    email_otp = generate_otp()
    db.store_verification_otp(user.email, email_otp)
    print(f"📧 Email OTP for {user.email}: {email_otp}")  # In production, send via email
    
    # Generate and store phone OTP
    phone_otp = generate_otp()
    db.store_verification_otp(user.phone, phone_otp)
    print(f"📱 Phone OTP for {user.phone}: {phone_otp}")  # In production, send via SMS
    
    return {
        "message": "Registration successful! Check your email and phone for verification codes.",
        "email": user.email,
        "phone": user.phone,
        "next_step": "verify"
    }

@app.post("/api/verify-email")
async def verify_email(data: UserVerifyEmail):
    """Verify user's email with OTP"""
    if db.verify_otp(data.email, data.code):
        user = db.get_user_by_email(data.email)
        if user:
            db.update_user(data.email, {"email_verified": True})
        return {"message": "Email verified successfully!"}
    return JSONResponse(
        status_code=400,
        content={"error": "Invalid or expired verification code"}
    )

@app.post("/api/verify-phone")
async def verify_phone(data: UserVerifyPhone):
    """Verify user's phone with OTP"""
    if db.verify_otp(data.phone, data.code):
        user = db.get_user_by_phone(data.phone)
        if user:
            db.update_user(user["email"], {"phone_verified": True})
        return {"message": "Phone verified successfully!"}
    return JSONResponse(
        status_code=400,
        content={"error": "Invalid or expired verification code"}
    )

@app.post("/api/resend-otp")
async def resend_otp(data: ResendOTP):
    """Resend OTP for verification"""
    if data.email:
        user = db.get_user_by_email(data.email)
        if not user:
            return JSONResponse(
                status_code=404,
                content={"error": "User not found"}
            )
        otp = generate_otp()
        db.store_verification_otp(data.email, otp)
        print(f"📧 Resent email OTP for {data.email}: {otp}")
        return {"message": "OTP sent to your email"}
    
    elif data.phone:
        user = db.get_user_by_phone(data.phone)
        if not user:
            return JSONResponse(
                status_code=404,
                content={"error": "Phone number not found"}
            )
        otp = generate_otp()
        db.store_verification_otp(data.phone, otp)
        print(f"📱 Resent phone OTP for {data.phone}: {otp}")
        return {"message": "OTP sent to your phone"}
    
    return JSONResponse(
        status_code=400,
        content={"error": "Email or phone required"}
    )

@app.post("/api/login")
async def login(data: UserLogin):
    """Login user with email and password"""
    user = db.authenticate_user(data.email, data.password)
    if not user:
        return JSONResponse(
            status_code=401,
            content={"error": "Invalid credentials or account not verified"}
        )
    
    # Create session
    token = db.create_session(user)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "email": user["email"],
            "full_name": user["full_name"],
            "phone": user["phone"],
            "email_verified": user["email_verified"],
            "phone_verified": user["phone_verified"]
        }
    }

@app.post("/api/logout")
async def logout(token: str):
    """Logout user"""
    if db.logout(token):
        return {"message": "Logged out successfully"}
    return JSONResponse(
        status_code=400,
        content={"error": "Invalid session"}
    )

@app.get("/api/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user information"""
    return {
        "user": {
            "email": current_user["email"],
            "full_name": current_user["full_name"],
            "phone": current_user["phone"],
            "email_verified": current_user["email_verified"],
            "phone_verified": current_user["phone_verified"],
            "created_at": current_user["created_at"],
            "last_login": current_user["last_login"]
        }
    }

@app.get("/api/auth/status")
async def auth_status():
    """Get authentication system status"""
    return {
        "status": "active",
        "features": {
            "email_verification": True,
            "phone_verification": True,
            "jwt_auth": True,
            "captcha": True
        },
        "stats": db.get_stats()
    }

# ============================================
# CHAT ENDPOINT
# ============================================

@app.post("/chat")
async def chat(data: Message, current_user: Optional[dict] = Depends(get_current_user)):
    """Chat with Cortexa AI (protected endpoint)"""
    try:
        user_msg = data.message.strip()
        print(f"\n📥 Received from {current_user['email'] if current_user else 'guest'}: {user_msg}")
        
        if not user_msg:
            return {"response": "Please enter a message! 💙"}
        
        context = ""
        if document_store:
            results = search_engine.search(user_msg, top_k=3)
            if results:
                context_parts = []
                for i, result in enumerate(results, 1):
                    context_parts.append(f"[Source {i}]\n{result['text']}")
                context = "\n\n".join(context_parts)
                print(f"📚 Found {len(results)} relevant chunks")
        
        reply = await get_ai_response(user_msg, context)
        print(f"✅ Response sent\n")
        
        return {"role": "assistant", "response": reply}
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return {"response": f"Error: {str(e)}. Please try again."}

# ============================================
# DOCUMENT ENDPOINTS
# ============================================

@app.post("/upload-document")
async def upload_document(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload a document for RAG processing (protected)"""
    try:
        content = ""
        filename = file.filename
        
        if filename.lower().endswith(".txt"):
            content = (await file.read()).decode("utf-8")
        else:
            try:
                content = (await file.read()).decode("utf-8")
            except:
                content = f"File uploaded: {filename} (binary file)"
        
        doc_id = f"doc_{uuid.uuid4().hex[:8]}"
        chunks = chunker.chunk_text(content)
        
        document_store[doc_id] = {
            'filename': filename,
            'text': content,
            'chunks': chunks,
            'total_chunks': len(chunks),
            'char_count': len(content),
            'uploaded_by': current_user["email"],
            'uploaded_at': datetime.utcnow().isoformat()
        }
        
        search_engine.index_chunks(chunks)
        
        print(f"📄 Document stored: {filename} (ID: {doc_id}, Chunks: {len(chunks)})")
        
        return {
            "doc_id": doc_id,
            "filename": filename,
            "status": "success",
            "total_chunks": len(chunks),
            "char_count": len(content),
            "preview": content[:500] + ("..." if len(content) > 500 else "")
        }
        
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/search-document")
async def search_document(data: dict, current_user: dict = Depends(get_current_user)):
    """Search for relevant chunks in the document (protected)"""
    query = data.get("query", "")
    top_k = data.get("top_k", 3)
    
    if not query:
        return {"error": "No query provided"}
    
    if not document_store:
        return {"error": "No documents uploaded yet"}
    
    results = search_engine.search_with_preview(query, top_k)
    
    return {
        "query": query,
        "results": results,
        "total_results": len(results)
    }

@app.get("/documents")
async def list_documents(current_user: dict = Depends(get_current_user)):
    """List all uploaded documents (protected)"""
    docs = []
    for doc_id, doc in document_store.items():
        docs.append({
            'id': doc_id,
            'filename': doc['filename'],
            'total_chunks': doc['total_chunks'],
            'char_count': doc['char_count'],
            'uploaded_by': doc.get('uploaded_by', 'unknown'),
            'uploaded_at': doc.get('uploaded_at', '')
        })
    return {"documents": docs}

@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a document (protected)"""
    if doc_id in document_store:
        del document_store[doc_id]
        return {"status": "success", "message": f"Document {doc_id} deleted"}
    return JSONResponse(status_code=404, content={"error": "Document not found"})

# ============================================
# YOUTUBE ENDPOINTS
# ============================================

@app.get("/youtube-search")
async def youtube_search(query: str, max_results: int = 10):
    """Search YouTube videos"""
    if not YOUTUBE_API_KEY:
        return {"error": "YouTube API key not configured"}
    
    try:
        url = "https://www.googleapis.com/youtube/v3/search"
        params = {
            "part": "snippet",
            "q": query,
            "maxResults": max_results,
            "type": "video",
            "key": YOUTUBE_API_KEY
        }
        
        response = requests.get(url, params=params)
        data = response.json()
        
        if "error" in data:
            return {"error": data["error"]["message"]}
        
        videos = []
        for item in data.get("items", []):
            videos.append({
                "id": item["id"]["videoId"],
                "title": item["snippet"]["title"],
                "description": item["snippet"]["description"],
                "thumbnail": item["snippet"]["thumbnails"]["medium"]["url"],
                "channel": item["snippet"]["channelTitle"]
            })
        
        return {"videos": videos}
        
    except Exception as e:
        return {"error": str(e)}

@app.get("/youtube-video-info")
async def youtube_video_info(video_id: str):
    """Get detailed info about a YouTube video"""
    if not YOUTUBE_API_KEY:
        return {"error": "YouTube API key not configured"}
    
    try:
        url = "https://www.googleapis.com/youtube/v3/videos"
        params = {
            "part": "snippet,contentDetails,statistics",
            "id": video_id,
            "key": YOUTUBE_API_KEY
        }
        
        response = requests.get(url, params=params)
        data = response.json()
        
        if "error" in data:
            return {"error": data["error"]["message"]}
        
        if data.get("items"):
            item = data["items"][0]
            return {
                "title": item["snippet"]["title"],
                "description": item["snippet"]["description"],
                "duration": item["contentDetails"]["duration"],
                "views": item["statistics"].get("viewCount", 0),
                "likes": item["statistics"].get("likeCount", 0)
            }
        
        return {"error": "Video not found"}
        
    except Exception as e:
        return {"error": str(e)}

@app.post("/youtube-summary")
async def youtube_summary(data: dict):
    """Generate AI summary of YouTube video using Groq"""
    video_url = data.get("url", "")
    video_id = extract_video_id(video_url)
    
    if not video_id:
        return {"error": "Invalid YouTube URL"}
    
    info = await youtube_video_info(video_id)
    if "error" in info:
        return info
    
    if not client:
        return {"error": "Groq API not configured"}
    
    try:
        messages = [
            {"role": "system", "content": "You are a helpful assistant that summarizes YouTube videos based on their title and description."},
            {"role": "user", "content": f"Create a detailed summary and learning points for this video:\nTitle: {info['title']}\nDescription: {info['description'][:500]}"}
        ]
        
        completion = client.chat.completions.create(
            model=PREFERRED_MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=500
        )
        
        return {
            "summary": completion.choices[0].message.content,
            "title": info['title'],
            "video_id": video_id
        }
        
    except Exception as e:
        return {"error": str(e)}

# ============================================
# AUDIO GENERATION
# ============================================

@app.post("/generate-audio")
async def generate_audio(data: dict):
    try:
        text = data.get("text", "")
        if not text:
            return JSONResponse(status_code=400, content={"error": "No text"})
        
        os.makedirs("audio_files", exist_ok=True)
        filename = f"audio_{uuid.uuid4().hex[:8]}.mp3"
        
        try:
            from gtts import gTTS
            tts = gTTS(text=text, lang='en', slow=False)
            filepath = os.path.join("audio_files", filename)
            tts.save(filepath)
            print(f"🎵 Audio generated: {filename}")
            return {"audio_url": f"/audio/{filename}"}
        except ImportError:
            return {"audio_url": None, "message": "pip install gtts for audio"}
        except Exception as e:
            print(f"❌ TTS error: {e}")
            return {"audio_url": None, "message": f"Audio error: {str(e)}"}
        
    except Exception as e:
        print(f"❌ Audio error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/audio/{filename}")
async def get_audio(filename: str):
    filepath = os.path.join("audio_files", filename)
    if not os.path.exists(filepath):
        return JSONResponse(status_code=404, content={"error": "Not found"})
    return FileResponse(filepath, media_type="audio/mpeg")

# ============================================
# HEALTH CHECK
# ============================================

@app.get("/health")
async def health():
    groq_status = "not_configured"
    
    if client:
        try:
            test = client.chat.completions.create(
                model=MODELS["fast"],
                messages=[{"role": "user", "content": "test"}],
                max_tokens=5
            )
            groq_status = "connected"
        except Exception as e:
            groq_status = f"error: {str(e)[:50]}"
    
    return {
        "status": "running",
        "message": "✅ Cortexa Backend with Groq AI",
        "groq_api": groq_status,
        "youtube_api": "configured" if YOUTUBE_API_KEY else "not configured",
        "api_key_configured": GROQ_API_KEY is not None,
        "auth_enabled": True,
        "auth_stats": db.get_stats()
    }

@app.get("/models")
async def list_models():
    return {
        "available_models": MODELS,
        "current_model": PREFERRED_MODEL,
        "note": "Current working models on Groq"
    }

@app.get("/")
async def root():
    return {
        "message": "🚀 Cortexa Backend Running",
        "version": "2.0",
        "status": "active",
        "current_model": PREFERRED_MODEL,
        "endpoints": [
            "/chat",
            "/upload-document",
            "/search-document",
            "/documents",
            "/generate-audio",
            "/youtube-search",
            "/youtube-video-info",
            "/youtube-summary",
            "/health",
            "/models",
            "/api/register",
            "/api/login",
            "/api/verify-email",
            "/api/verify-phone",
            "/api/resend-otp",
            "/api/me",
            "/api/auth/status",
            "/api/logout"
        ],
        "auth_required": ["/chat", "/upload-document", "/search-document", "/documents", "/api/me"]
    }

# ============================================
# RUN APP
# ============================================

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
