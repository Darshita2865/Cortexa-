from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException,
    Depends
)

from fastapi.responses import (
    JSONResponse,
    FileResponse
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import (
    HTTPBearer,
    HTTPAuthorizationCredentials
)

from pydantic import (
    BaseModel,
    EmailStr,
    Field,
    field_validator
)

import os
import uuid
import uvicorn
import requests
import re
import sqlite3
import threading

from typing import Optional, Dict, Any
from datetime import datetime, timedelta

from openai import OpenAI
import httpx
from dotenv import load_dotenv

import jwt
from passlib.context import CryptContext

from rag.chunker import DocumentChunker
from rag.search import KeywordSearch
from rag.embedder import Embedder
from rag.vector_store import VectorStore


# ============================================================
# LOAD ENVIRONMENT VARIABLES
# ============================================================

load_dotenv()

# Primary provider: Cerebras
CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY")

# Optional secondary provider: Groq (skipped if key is missing)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# YouTube
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

# Auth
JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "your-super-secret-key-change-this"
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 7

DB_PATH = os.getenv("DB_PATH", "./cortexa.db")


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="Cortexa AI API",
    description="Cortexa AI Knowledge Intelligence Platform",
    version="2.4"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# SECURITY
# ============================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

security = HTTPBearer()


# ============================================================
# CEREBRAS INITIALIZATION (PRIMARY)
# ============================================================

CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1"
CEREBRAS_MODEL = os.getenv("CEREBRAS_MODEL", "llama3.1-8b")

cerebras_client = None

if CEREBRAS_API_KEY:
    try:
        cerebras_client = OpenAI(
            api_key=CEREBRAS_API_KEY,
            base_url=CEREBRAS_BASE_URL,
        )
        print("✅ Cerebras client initialized (primary)")
    except Exception as e:
        print(f"❌ Cerebras init failed: {e}")
        cerebras_client = None
else:
    print("⚠️ CEREBRAS_API_KEY not found — Cerebras disabled")


# ============================================================
# GROQ INITIALIZATION (OPTIONAL SECONDARY)
# ============================================================

groq_client = None

if GROQ_API_KEY:
    try:
        from groq import Groq
        groq_client = Groq(api_key=GROQ_API_KEY)
        print("✅ Groq client initialized (secondary)")
    except Exception as e:
        print(f"⚠️ Groq init failed: {e}")
        groq_client = None
else:
    print("ℹ️ GROQ_API_KEY not set — Groq fallback disabled")


# ============================================================
# OLLAMA INITIALIZATION (LAST-RESORT FALLBACK)
# ============================================================

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

print(f"🦙 Ollama fallback: {OLLAMA_BASE_URL} (model: {OLLAMA_MODEL})")


# ============================================================
# USER DATABASE (SQLite-backed)
# ============================================================

class UserDatabase:

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(
            self.db_path,
            check_same_thread=False
        )
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self):
        with self._lock:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    full_name TEXT NOT NULL,
                    phone TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    email_verified INTEGER DEFAULT 0,
                    phone_verified INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    last_login TEXT
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            self._conn.commit()

    def _row_to_user(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "email": row["email"],
            "full_name": row["full_name"],
            "phone": row["phone"],
            "password_hash": row["password_hash"],
            "email_verified": bool(row["email_verified"]),
            "phone_verified": bool(row["phone_verified"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "is_active": bool(row["is_active"]),
            "last_login": row["last_login"],
        }

    def create_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        user_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        password_hash = pwd_context.hash(user_data["password"])

        with self._lock:
            self._conn.execute(
                """
                INSERT INTO users (
                    id, email, full_name, phone, password_hash,
                    email_verified, phone_verified,
                    created_at, updated_at, is_active, last_login
                ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 1, NULL)
                """,
                (
                    user_id,
                    user_data["email"],
                    user_data["full_name"],
                    user_data["phone"],
                    password_hash,
                    now,
                    now,
                )
            )
            self._conn.commit()

        return self.get_user_by_email(user_data["email"])

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM users WHERE email = ?",
                (email,)
            ).fetchone()
        return self._row_to_user(row) if row else None

    def get_user_by_phone(self, phone: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM users WHERE phone = ?",
                (phone,)
            ).fetchone()
        return self._row_to_user(row) if row else None

    def authenticate_user(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        user = self.get_user_by_email(email)
        if not user:
            return None
        try:
            valid = pwd_context.verify(password, user["password_hash"])
            if not valid:
                return None
        except Exception as e:
            print(f"❌ Password verification error: {e}")
            return None

        now = datetime.utcnow().isoformat()
        with self._lock:
            self._conn.execute(
                "UPDATE users SET last_login = ?, updated_at = ? WHERE email = ?",
                (now, now, email)
            )
            self._conn.commit()

        user["last_login"] = now
        return user

    def create_session(self, user: Dict[str, Any]) -> str:
        payload = {
            "sub": user["email"],
            "user_id": user["id"],
            "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
        }
        token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

        now = datetime.utcnow().isoformat()
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO sessions (token, email, created_at) VALUES (?, ?, ?)",
                (token, user["email"], now)
            )
            self._conn.commit()

        return token

    def verify_session(self, token: str) -> Optional[Dict[str, Any]]:
        try:
            payload = jwt.decode(
                token,
                JWT_SECRET_KEY,
                algorithms=[JWT_ALGORITHM]
            )
            email = payload.get("sub")
            if not email:
                return None

            with self._lock:
                row = self._conn.execute(
                    "SELECT 1 FROM sessions WHERE token = ? AND email = ?",
                    (token, email)
                ).fetchone()

            if row:
                return self.get_user_by_email(email)
        except Exception as e:
            print(f"❌ JWT verification error: {e}")
        return None

    def logout(self, token: str) -> bool:
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM sessions WHERE token = ?",
                (token,)
            )
            self._conn.commit()
            deleted = cur.rowcount > 0
        return deleted


db = UserDatabase()


# ============================================================
# CONFIGURATION
# ============================================================

@app.get("/api/config")
async def get_config():
    return {
        "status": "success",
        "config": {
            "api_url": "/api/chat",
            "version": "2.4",
            "provider_chain": [
                "cerebras" if cerebras_client else None,
                "groq" if groq_client else None,
                "ollama"
            ],
            "features": {
                "audio": True,
                "video": True,
                "reports": True,
                "learning": True,
                "games": True
            }
        }
    }


# ============================================================
# STATIC FILES
# ============================================================

@app.get("/static/{filename}")
async def get_static_file(filename: str):
    filepath = os.path.join("static", filename)
    if not os.path.exists(filepath):
        return JSONResponse(
            status_code=404,
            content={"error": "File not found"}
        )
    return FileResponse(filepath)


# ============================================================
# AUTH MODELS
# ============================================================

class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., pattern=r"^\+[1-9]\d{1,14}$")
    password: str = Field(..., min_length=8)
    dob: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, password):
        password_bytes = len(password.encode("utf-8"))
        if password_bytes > 72:
            raise ValueError("Password must not exceed 72 bytes")
        return password


class UserLogin(BaseModel):
    email: EmailStr
    password: str


# ============================================================
# RAG SETUP
# ============================================================

print("🔧 Initializing RAG components...")

chunker = DocumentChunker(chunk_size=500, overlap=50)
search_engine = KeywordSearch()
embedder = Embedder(model_name="all-MiniLM-L6-v2")
vector_store = VectorStore(persist_directory="./vector_store")

document_store = {}

try:
    embedder.initialize()
    print("✅ Embedder initialized!")
except Exception as e:
    print(f"⚠️ Embedder initialization failed: {e}")

try:
    vector_store.initialize()
    print("✅ Vector store initialized!")
except Exception as e:
    print(f"⚠️ Vector store initialization failed: {e}")

print("✅ RAG initialization completed!")


# ============================================================
# CHAT MODEL
# ============================================================

class Message(BaseModel):
    message: str
    document_content: Optional[str] = None
    audio: bool = False


# ============================================================
# AVAILABLE GROQ MODELS (only used if Groq is configured)
# ============================================================

GROQ_MODELS = {
    "fast": "openai/gpt-oss-20b",
    "balanced": "openai/gpt-oss-120b",
}
GROQ_PREFERRED = GROQ_MODELS["balanced"]


# ============================================================
# SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """
You are Cortexa, a powerful AI assistant.

IMPORTANT RULES:

1. NEVER give generic responses like:
   "Got it! Let me help you with that."

2. ALWAYS answer the user's question directly.

3. Be conversational, friendly, and helpful.

4. Use **bold** for important information.

5. Use bullet points for lists.

6. Keep responses informative but not unnecessarily long.

7. Never respond with generic phrases.

8. Always provide specific and useful information.

9. If reference document information is provided,
   use it when relevant.

10. Give clear explanations suitable for students
    and general users.

11. For coding questions, provide correct,
    practical code and explain the important parts.
"""


# ============================================================
# YOUTUBE VIDEO ID
# ============================================================

def extract_video_id(url: str) -> Optional[str]:
    patterns = [
        r"(?:youtube\.com\/watch\?v=)([\w-]+)",
        r"(?:youtu\.be\/)([\w-]+)",
        r"(?:youtube\.com\/embed\/)([\w-]+)"
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


# ============================================================
# AI RESPONSE — HYBRID FALLBACK CHAIN
#   1. Cerebras (primary)
#   2. Groq     (secondary, optional)
#   3. Ollama   (last resort, local)
# ============================================================

async def get_ai_response(message: str, context: Optional[str] = None) -> str:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if context and context != "null" and len(context) > 10:
        messages.append({
            "role": "system",
            "content": "Reference document:\n" + context[:3000]
        })

    messages.append({"role": "user", "content": message})

    # 1️⃣ Cerebras
    if cerebras_client:
        try:
            completion = cerebras_client.chat.completions.create(
                model=CEREBRAS_MODEL,
                messages=messages,
                temperature=0.7,
                max_tokens=1024,
            )
            text = completion.choices[0].message.content
            if text:
                print("✅ Response from Cerebras")
                return text
        except Exception as e:
            print(f"⚠️ Cerebras failed: {str(e)[:200]}")

    # 2️⃣ Groq (only if configured)
    if groq_client:
        try:
            completion = groq_client.chat.completions.create(
                model=GROQ_PREFERRED,
                messages=messages,
                temperature=0.7,
                max_tokens=1024,
                stream=False,
            )
            text = completion.choices[0].message.content
            if text:
                print("✅ Response from Groq")
                return text
        except Exception as e:
            print(f"⚠️ Groq failed: {str(e)[:200]}")

    # 3️⃣ Ollama
    try:
        async with httpx.AsyncClient(timeout=120.0) as hc:
            r = await hc.post(
                f"{OLLAMA_BASE_URL}/chat/completions",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": messages,
                    "temperature": 0.7,
                },
            )
            r.raise_for_status()
            data = r.json()
            text = data["choices"][0]["message"]["content"]
            if text:
                print("✅ Response from Ollama")
                return text
    except Exception as e:
        print(f"⚠️ Ollama failed: {str(e)[:200]}")

    return (
        "⚠️ All AI providers are currently unavailable. "
        "Check your CEREBRAS_API_KEY and Ollama server."
    )


# ============================================================
# AUTH DEPENDENCY
# ============================================================

def get_current_user(
    token: HTTPAuthorizationCredentials = Depends(security)
):
    user = db.verify_session(token.credentials)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )
    return user


# ============================================================
# REGISTER
# ============================================================

@app.post("/api/register")
async def register(user: UserRegister):
    try:
        print(f"📝 Registration attempt: {user.email}")

        if db.get_user_by_email(user.email):
            return JSONResponse(
                status_code=400,
                content={"error": "Email already registered"}
            )

        if db.get_user_by_phone(user.phone):
            return JSONResponse(
                status_code=400,
                content={"error": "Phone number already registered"}
            )

        db.create_user(user.model_dump())
        print(f"✅ User registered: {user.email}")

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


# ============================================================
# LOGIN
# ============================================================

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

        token = db.create_session(user)
        print(f"✅ Login successful: {data.email}")

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


# ============================================================
# LOGOUT
# ============================================================

@app.post("/api/logout")
async def logout(
    token: HTTPAuthorizationCredentials = Depends(security)
):
    if db.logout(token.credentials):
        return {"message": "Logged out successfully"}
    return JSONResponse(
        status_code=400,
        content={"error": "Invalid session"}
    )


# ============================================================
# CURRENT USER
# ============================================================

@app.get("/api/me")
async def get_current_user_info(
    current_user: dict = Depends(get_current_user)
):
    return {
        "user": {
            "email": current_user["email"],
            "full_name": current_user["full_name"],
            "phone": current_user["phone"]
        }
    }


# ============================================================
# CHAT HANDLER
# ============================================================

async def chat_handler(data: Message):
    try:
        user_msg = data.message.strip()
        print(f"📥 Chat request: {user_msg}")

        if not user_msg:
            return {
                "role": "assistant",
                "response": "Please enter a message! 💙"
            }

        context = ""

        if document_store:
            try:
                query_embedding = embedder.embed_text(user_msg)
                vector_results = vector_store.search(query_embedding, top_k=3)

                if vector_results:
                    context_parts = []
                    for i, result in enumerate(vector_results, 1):
                        context_parts.append(f"[Source {i}]\n{result['text']}")
                    context = "\n\n".join(context_parts)
                    print(f"📚 Found {len(vector_results)} relevant chunks")
            except Exception as e:
                print(f"⚠️ Semantic search failed: {e}")
                try:
                    results = search_engine.search(user_msg, top_k=3)
                    if results:
                        context_parts = []
                        for i, result in enumerate(results, 1):
                            context_parts.append(f"[Source {i}]\n{result['text']}")
                        context = "\n\n".join(context_parts)
                except Exception as keyword_error:
                    print(f"⚠️ Keyword search failed: {keyword_error}")

        reply = await get_ai_response(user_msg, context)
        return {"role": "assistant", "response": reply}

    except Exception as e:
        print(f"❌ Chat error: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.post("/api/chat")
async def api_chat(data: Message):
    return await chat_handler(data)


@app.post("/chat")
async def legacy_chat(data: Message):
    return await chat_handler(data)


# ============================================================
# DOCUMENT UPLOAD
# ============================================================

async def upload_document_handler(file: UploadFile):
    try:
        filename = file.filename or "unknown"
        print(f"📄 Upload request: {filename}")

        file_bytes = await file.read()

        if filename.lower().endswith(".txt"):
            content = file_bytes.decode("utf-8")
        else:
            try:
                content = file_bytes.decode("utf-8")
            except Exception:
                content = f"File uploaded: {filename} (binary file)"

        doc_id = f"doc_{uuid.uuid4().hex[:8]}"
        chunks = chunker.chunk_text(content)

        document_store[doc_id] = {
            "filename": filename,
            "text": content,
            "chunks": chunks,
            "total_chunks": len(chunks),
            "char_count": len(content)
        }

        try:
            search_engine.index_chunks(chunks)
        except Exception as e:
            print(f"⚠️ Keyword indexing failed: {e}")

        try:
            print(f"📊 Creating embeddings for {len(chunks)} chunks...")
            chunk_texts = [chunk["text"] for chunk in chunks]
            embeddings = embedder.embed_batch(chunk_texts)
            vector_store.add_document(doc_id, chunks, embeddings)
            print(f"✅ Document indexed: {doc_id}")
        except Exception as e:
            print(f"⚠️ Semantic indexing failed: {e}")

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
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.post("/api/upload-document")
async def api_upload_document(file: UploadFile = File(...)):
    return await upload_document_handler(file)


@app.post("/upload-document")
async def legacy_upload_document(file: UploadFile = File(...)):
    return await upload_document_handler(file)


# ============================================================
# DOCUMENT SEARCH
# ============================================================

async def search_document_handler(data: dict):
    query = data.get("query", "")
    top_k = data.get("top_k", 3)

    if not query:
        return {"error": "No query provided"}
    if not document_store:
        return {"error": "No documents uploaded yet"}

    try:
        query_embedding = embedder.embed_text(query)
        results = vector_store.search(query_embedding, top_k=top_k)
        if results:
            return {
                "query": query,
                "results": results,
                "total_results": len(results),
                "search_type": "semantic"
            }
    except Exception as e:
        print(f"⚠️ Semantic search failed: {e}")

    results = search_engine.search_with_preview(query, top_k)
    return {
        "query": query,
        "results": results,
        "total_results": len(results),
        "search_type": "keyword"
    }


@app.post("/api/search-document")
async def api_search_document(data: dict):
    return await search_document_handler(data)


@app.post("/search-document")
async def legacy_search_document(data: dict):
    return await search_document_handler(data)


# ============================================================
# DOCUMENT LIST / DELETE
# ============================================================

async def list_documents_handler():
    docs = []
    for doc_id, doc in document_store.items():
        docs.append({
            "id": doc_id,
            "filename": doc["filename"],
            "total_chunks": doc["total_chunks"],
            "char_count": doc["char_count"]
        })
    return {"documents": docs}


@app.get("/api/documents")
async def api_list_documents():
    return await list_documents_handler()


@app.get("/documents")
async def legacy_list_documents():
    return await list_documents_handler()


async def delete_document_handler(doc_id: str):
    if doc_id not in document_store:
        return JSONResponse(
            status_code=404,
            content={"error": "Document not found"}
        )
    try:
        vector_store.delete_document(doc_id)
    except Exception as e:
        print(f"⚠️ Vector deletion warning: {e}")
    del document_store[doc_id]
    return {"status": "success", "message": f"Document {doc_id} deleted"}


@app.delete("/api/documents/{doc_id}")
async def api_delete_document(doc_id: str):
    return await delete_document_handler(doc_id)


@app.delete("/documents/{doc_id}")
async def legacy_delete_document(doc_id: str):
    return await delete_document_handler(doc_id)


# ============================================================
# YOUTUBE SEARCH
# ============================================================

async def youtube_search_handler(query: str, max_results: int = 10):
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
        response = requests.get(url, params=params, timeout=15)
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


@app.get("/api/youtube-search")
async def api_youtube_search(query: str, max_results: int = 10):
    return await youtube_search_handler(query, max_results)


@app.get("/youtube-search")
async def legacy_youtube_search(query: str, max_results: int = 10):
    return await youtube_search_handler(query, max_results)


# ============================================================
# YOUTUBE VIDEO INFO
# ============================================================

async def youtube_video_info_handler(video_id: str):
    if not YOUTUBE_API_KEY:
        return {"error": "YouTube API key not configured"}
    try:
        url = "https://www.googleapis.com/youtube/v3/videos"
        params = {
            "part": "snippet,contentDetails,statistics",
            "id": video_id,
            "key": YOUTUBE_API_KEY
        }
        response = requests.get(url, params=params, timeout=15)
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


@app.get("/api/youtube-video-info")
async def api_youtube_video_info(video_id: str):
    return await youtube_video_info_handler(video_id)


@app.get("/youtube-video-info")
async def legacy_youtube_video_info(video_id: str):
    return await youtube_video_info_handler(video_id)


# ============================================================
# YOUTUBE SUMMARY
# ============================================================

async def youtube_summary_handler(data: dict):
    video_url = data.get("url", "")
    video_id = extract_video_id(video_url)
    if not video_id:
        return {"error": "Invalid YouTube URL"}

    info = await youtube_video_info_handler(video_id)
    if "error" in info:
        return info

    try:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a helpful assistant that summarizes YouTube "
                    "videos based on their title and description."
                )
            },
            {
                "role": "user",
                "content": f"""
Create a detailed summary and learning points
for this YouTube video.

Title:
{info['title']}

Description:
{info['description'][:5000]}
"""
            }
        ]

        # Cerebras first
        if cerebras_client:
            try:
                completion = cerebras_client.chat.completions.create(
                    model=CEREBRAS_MODEL,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=500,
                )
                return {
                    "summary": completion.choices[0].message.content,
                    "title": info["title"],
                    "video_id": video_id
                }
            except Exception as e:
                print(f"⚠️ Cerebras summary failed: {e}")

        # Groq second (optional)
        if groq_client:
            completion = groq_client.chat.completions.create(
                model=GROQ_PREFERRED,
                messages=messages,
                temperature=0.7,
                max_tokens=500,
                stream=False
            )
            return {
                "summary": completion.choices[0].message.content,
                "title": info["title"],
                "video_id": video_id
            }

        return {"error": "No AI provider available for summary"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/youtube-summary")
async def api_youtube_summary(data: dict):
    return await youtube_summary_handler(data)


@app.post("/youtube-summary")
async def legacy_youtube_summary(data: dict):
    return await youtube_summary_handler(data)


# ============================================================
# AUDIO GENERATION
# ============================================================

async def generate_audio_handler(data: dict):
    try:
        text = data.get("text", "")
        if not text:
            return JSONResponse(
                status_code=400,
                content={"error": "No text provided"}
            )

        os.makedirs("audio_files", exist_ok=True)
        filename = f"audio_{uuid.uuid4().hex[:8]}.mp3"

        try:
            from gtts import gTTS
            tts = gTTS(text=text, lang="en", slow=False)
            filepath = os.path.join("audio_files", filename)
            tts.save(filepath)
            print(f"🎵 Audio generated: {filename}")
            return {"audio_url": f"/audio/{filename}"}
        except ImportError:
            return {"audio_url": None, "message": "gTTS is not installed"}
        except Exception as e:
            print(f"❌ TTS error: {e}")
            return {"audio_url": None, "message": f"Audio error: {str(e)}"}
    except Exception as e:
        print(f"❌ Audio error: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.post("/api/generate-audio")
async def api_generate_audio(data: dict):
    return await generate_audio_handler(data)


@app.post("/generate-audio")
async def legacy_generate_audio(data: dict):
    return await generate_audio_handler(data)


@app.get("/audio/{filename}")
async def get_audio(filename: str):
    filepath = os.path.join("audio_files", filename)
    if not os.path.exists(filepath):
        return JSONResponse(
            status_code=404,
            content={"error": "Audio file not found"}
        )
    return FileResponse(filepath, media_type="audio/mpeg")


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
async def health():
    cerebras_status = "not_configured"
    groq_status = "not_configured"
    ollama_status = "unknown"

    if cerebras_client:
        try:
            cerebras_client.chat.completions.create(
                model=CEREBRAS_MODEL,
                messages=[{"role": "user", "content": "Say OK"}],
                max_tokens=5,
            )
            cerebras_status = "connected"
        except Exception as e:
            cerebras_status = f"error: {str(e)[:100]}"

    if groq_client:
        try:
            groq_client.chat.completions.create(
                model=GROQ_MODELS["fast"],
                messages=[{"role": "user", "content": "Say OK"}],
                max_tokens=5,
            )
            groq_status = "connected"
        except Exception as e:
            groq_status = f"error: {str(e)[:100]}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as hc:
            r = await hc.get(f"{OLLAMA_BASE_URL}/models")
            ollama_status = "connected" if r.status_code == 200 else f"http {r.status_code}"
    except Exception as e:
        ollama_status = f"unreachable: {str(e)[:80]}"

    try:
        vector_count = (
            vector_store.get_count()
            if getattr(vector_store, "_initialized", False)
            else 0
        )
    except Exception:
        vector_count = 0

    return {
        "status": "running",
        "message": "✅ Cortexa Backend Running",
        "provider_chain": [
            {"name": "cerebras", "status": cerebras_status, "primary": True},
            {"name": "groq", "status": groq_status, "primary": False},
            {"name": "ollama", "status": ollama_status, "primary": False},
        ],
        "youtube_api": "configured" if YOUTUBE_API_KEY else "not configured",
        "auth_enabled": True,
        "rag_enabled": True,
        "vector_store_count": vector_count,
        "db_path": DB_PATH,
    }


# ============================================================
# MODELS
# ============================================================

@app.get("/models")
async def list_models():
    return {
        "cerebras": {
            "model": CEREBRAS_MODEL,
            "enabled": cerebras_client is not None,
            "primary": True,
        },
        "groq": {
            "models": GROQ_MODELS,
            "preferred": GROQ_PREFERRED,
            "enabled": groq_client is not None,
            "primary": False,
        },
        "ollama": {
            "model": OLLAMA_MODEL,
            "base_url": OLLAMA_BASE_URL,
            "primary": False,
        }
    }


# ============================================================
# ROOT
# ============================================================

@app.get("/")
async def root():
    return {
        "message": "🚀 Cortexa Backend Running",
        "version": "2.4",
        "status": "active",
        "provider_chain": ["cerebras", "groq", "ollama"],
        "endpoints": [
            "/api/chat", "/chat",
            "/api/register", "/api/login", "/api/logout", "/api/me",
            "/api/upload-document", "/upload-document",
            "/api/search-document", "/search-document",
            "/api/documents", "/documents",
            "/api/generate-audio", "/generate-audio",
            "/audio/{filename}",
            "/api/youtube-search", "/youtube-search",
            "/api/youtube-video-info", "/youtube-video-info",
            "/api/youtube-summary", "/youtube-summary",
            "/health", "/models"
        ]
    }


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))

    print("================================================")
    print("🚀 CORTEXA BACKEND STARTING")
    print(f"🌐 Port: {port}")
    print(f"💾 DB: {DB_PATH}")
    print(f"🧠 Cerebras: {'✅ configured' if cerebras_client else '❌ missing'}")
    print(f"🧠 Groq:     {'✅ configured' if groq_client else '⏭️  skipped'}")
    print(f"🦙 Ollama:   {OLLAMA_BASE_URL}")
    print("================================================")

    uvicorn.run(app, host="0.0.0.0", port=port)
