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
from .rag.chunker import DocumentChunker
from .rag.search import KeywordSearch
from .rag.embedder import Embedder 
from .rag.vector_store import VectorStore

app = FastAPI()

# SECURITY SETUP
# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Settings
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-super-secret-key-change-this")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

security = HTTPBearer()

# LOAD ENVIRONMENT VARIABLES
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

if not GROQ_API_KEY:
    print("❌ ERROR: GROQ_API_KEY not found!")
    client = None
else:
    client = Groq(api_key=GROQ_API_KEY)
    print("✅ Groq API key loaded successfully!")

# USER DATABASE 
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

    def authenticate_user(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        user = self.users.get(email)
        if not user:
            return None
        if not pwd_context.verify(password, user["password_hash"]):
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
        except:
            return None
        return None

    def logout(self, token: str) -> bool:
        if token in self.sessions:
            del self.sessions[token]
            return True
        return False

# Create database instance
db = UserDatabase()

# AUTH MODELS
class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., pattern=r'^\+[1-9]\d{1,14}$')
    password: str = Field(..., min_length=8)
    dob: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# RAG SETUP
chunker = DocumentChunker(chunk_size=500, overlap=50)
search_engine = KeywordSearch()
document_store = {}

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# CHAT MODELS
class Message(BaseModel):
    message: str
    document_content: Optional[str] = None
    audio: bool = False

# AVAILABLE MODELS
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

# HELPER FUNCTIONS
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

def get_current_user(token: str = Depends(security)) -> Optional[Dict[str, Any]]:
    user = db.verify_session(token.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user

# AUTHENTICATION ENDPOINTS
@app.post("/api/register")
async def register(user: UserRegister):
    try:
        print(f"📝 Registration attempt: {user.email}")
        
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
        db.create_user(user.model_dump())
        
        return {
            "message": "Registration successful! Please login.",
            "email": user.email,
            "phone": user.phone
        }
        
    except Exception as e:
        print(f"❌ Registration error: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/login")
async def login(data: UserLogin):
    try:
        print(f"📝 Login attempt: {data.email}")
        
        user = db.authenticate_user(data.email, data.password)
        if not user:
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid credentials"}
            )
        
        # Create session
        token = db.create_session(user)
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "email": user["email"],
                "full_name": user["full_name"],
                "phone": user["phone"]
            }
        }
        
    except Exception as e:
        print(f"❌ Login error: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/logout")
async def logout(token: str):
    if db.logout(token):
        return {"message": "Logged out successfully"}
    return JSONResponse(
        status_code=400,
        content={"error": "Invalid session"}
    )

@app.get("/api/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    return {
        "user": {
            "email": current_user["email"],
            "full_name": current_user["full_name"],
            "phone": current_user["phone"]
        }
    }

# CHAT ENDPOINT
@app.post("/chat")
async def chat(data: Message):
    try:
        user_msg = data.message.strip()
        print(f"\n📥 Received: {user_msg}")
        
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
        return {"role": "assistant", "response": reply}
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return {"response": f"Error: {str(e)}. Please try again."}

# DOCUMENT ENDPOINTS
@app.post("/upload-document")
async def upload_document(file: UploadFile = File(...)):
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
            'char_count': len(content)
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
async def search_document(data: dict):
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
async def list_documents():
    docs = []
    for doc_id, doc in document_store.items():
        docs.append({
            'id': doc_id,
            'filename': doc['filename'],
            'total_chunks': doc['total_chunks'],
            'char_count': doc['char_count']
        })
    return {"documents": docs}

@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    if doc_id in document_store:
        del document_store[doc_id]
        return {"status": "success", "message": f"Document {doc_id} deleted"}
    return JSONResponse(status_code=404, content={"error": "Document not found"})

# YOUTUBE ENDPOINTS
@app.get("/youtube-search")
async def youtube_search(query: str, max_results: int = 10):
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

# AUDIO GENERATION
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

# HEALTH CHECK
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
        "auth_enabled": True
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
            "/generate-audio",
            "/youtube-search",
            "/health",
            "/models",
            "/api/register",
            "/api/login",
            "/api/logout",
            "/api/me"
        ]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
