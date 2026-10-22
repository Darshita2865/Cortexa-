from fastapi import (
    FastAPI,
    Request,
    UploadFile,
    File,
    HTTPException,
    Depends
)

from fastapi.responses import (
    JSONResponse,
    FileResponse
)

from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import (
    HTTPBearer,
    HTTPAuthorizationCredentials
)

from fastapi.staticfiles import StaticFiles

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
import json

from typing import Optional, Dict, Any
from datetime import datetime, timedelta

from dotenv import load_dotenv

import jwt
from passlib.context import CryptContext

from rag.chunker import DocumentChunker
from rag.search import KeywordSearch
from rag.embedder import Embedder
from rag.vector_store import VectorStore


# LOAD ENVIRONMENT VARIABLES
# AI providers and fallback order are configured in the MULTI-PROVIDER section below.

load_dotenv()

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "your-super-secret-key-change-this"
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 7

DB_PATH = os.getenv("DB_PATH", "./cortexa.db")


# FASTAPI APP
app = FastAPI(
    title="Cortexa AI API",
    description="Cortexa AI Knowledge Intelligence Platform",
    version="3.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SECURITY
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)
security = HTTPBearer()

import time
import hashlib
from collections import OrderedDict


class LLMError(Exception):
    """All providers failed (internal; the chat still answers via offline mode)."""


class ProviderError(Exception):
    def __init__(self, message: str, cooldown: int = 30):
        super().__init__(message)
        self.cooldown = cooldown


_cooldown_until: Dict[str, float] = {}
_last_error: Dict[str, str] = {}


def _all_providers() -> Dict[str, Dict[str, Any]]:
    ollama_url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    return {
        "gemini": {
            "name": "gemini",
            "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            "key": os.getenv("GEMINI_API_KEY"),
            "model": os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
            "needs_key": True,
            "timeout": 25,
        },
        "openrouter": {
            "name": "openrouter",
            "url": "https://openrouter.ai/api/v1/chat/completions",
            "key": os.getenv("OPENROUTER_API_KEY"),
            "model": os.getenv(
                "OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free"
            ),
            "needs_key": True,
            "timeout": 30,
        },
        "mistral": {
            "name": "mistral",
            "url": "https://api.mistral.ai/v1/chat/completions",
            "key": os.getenv("MISTRAL_API_KEY"),
            "model": os.getenv("MISTRAL_MODEL", "mistral-small-latest"),
            "needs_key": True,
            "timeout": 25,
        },
        "groq": {
            "name": "groq",
            "url": "https://api.groq.com/openai/v1/chat/completions",
            "key": os.getenv("GROQ_API_KEY"),
            "model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            "needs_key": True,
            "timeout": 25,
        },
        "huggingface": {
            "name": "huggingface",
            "url": "https://router.huggingface.co/v1/chat/completions",
            "key": os.getenv("HF_TOKEN"),
            "model": os.getenv("HF_MODEL", "openai/gpt-oss-120b"),
            "needs_key": True,
            "timeout": 30,
        },
        "custom": {
            "name": "custom",
            "url": os.getenv("CUSTOM_API_URL", ""),
            "key": os.getenv("CUSTOM_API_KEY"),
            "model": os.getenv("CUSTOM_MODEL", ""),
            "needs_key": False,
            "timeout": 30,
        },
        "ollama": {
            "name": "ollama",
            "url": f"{ollama_url}/v1/chat/completions",
            "key": None,
            "model": os.getenv("OLLAMA_MODEL", "llama3.2:3b"),
            "needs_key": False,
            "timeout": 120, 
        },
    }


def enabled_providers() -> list:
    order = os.getenv(
        "LLM_PROVIDER_ORDER",
        "gemini,openrouter,mistral,groq,huggingface,custom,ollama",
    )
    allp = _all_providers()
    result = []
    for name in [n.strip().lower() for n in order.split(",") if n.strip()]:
        p = allp.get(name)
        if not p:
            continue
        if name == "ollama" and os.getenv("ENABLE_OLLAMA", "true").lower() == "false":
            continue
        if name == "custom" and not (p["url"] and p["model"]):
            continue
        if p["needs_key"] and not p["key"]:
            continue
        result.append(p)
    return result


def is_configured() -> bool:
    return len(enabled_providers()) > 0


def _call_one(
    p: Dict[str, Any], messages, max_tokens: int, temperature: float,
    timeout: Optional[float] = None
) -> str:
    headers = {"Content-Type": "application/json"}
    if p["key"]:
        headers["Authorization"] = f"Bearer {p['key']}"

    try:
        r = requests.post(
            p["url"],
            headers=headers,
            json={
                "model": p["model"],
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
            timeout=timeout or p["timeout"],
        )
    except requests.RequestException as e:
        raise ProviderError(f"cannot reach {p['name']}: {str(e)[:120]}", 60)

    code = r.status_code
    if code == 429:
        raise ProviderError("rate limit reached (429)", 60)
    if code == 402:
        raise ProviderError("no credits (402)", 1800)
    if code in (401, 403):
        raise ProviderError(f"access denied ({code}): {r.text[:150]}", 1800)
    if code == 404:
        raise ProviderError(
            f"model '{p['model']}' not found (404): {r.text[:150]}", 1800
        )
    if code == 400:
        raise ProviderError(f"bad request (400): {r.text[:150]}", 0)
    if not r.ok:
        raise ProviderError(f"error {code}: {r.text[:150]}", 30)

    try:
        text = r.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError, TypeError):
        raise ProviderError("unexpected response format", 30)
    if not text:
        raise ProviderError("empty response", 30)
    return text


def call_llm(messages, max_tokens: int = 800, temperature: float = 0.7):
    """Returns (text, provider_name). Raises LLMError only if ALL providers fail."""
    providers = enabled_providers()
    if not providers:
        raise LLMError("no provider configured")

    budget = float(os.getenv("LLM_TOTAL_TIMEOUT", "90"))
    started = time.time()

    for respect_cooldown in (True, False):
        tried = 0
        for p in providers:
            name = p["name"]
            remaining = budget - (time.time() - started)
            if remaining < 3:
                break
            if respect_cooldown and _cooldown_until.get(name, 0) > time.time():
                continue
            tried += 1
            try:
                text = _call_one(
                    p, messages, max_tokens, temperature,
                    timeout=min(p["timeout"], remaining),
                )
                _last_error.pop(name, None)
                _cooldown_until.pop(name, None)
                return text, name
            except ProviderError as e:
                _last_error[name] = str(e)[:200]
                if e.cooldown:
                    _cooldown_until[name] = time.time() + e.cooldown
                print(f"⚠️ Provider '{name}' failed: {e} -> trying next")
        if tried or (budget - (time.time() - started)) < 3:
            break

    details = "; ".join(f"{k}: {v}" for k, v in _last_error.items())
    raise LLMError(details or "all providers unavailable")


def provider_status(test: bool = False) -> list:
    out = []
    now = time.time()
    for p in enabled_providers():
        name = p["name"]
        status = "ready"
        if test:
            try:
                _call_one(
                    p, [{"role": "user", "content": "Say OK"}], 20, 0.0
                )
                status = "connected"
                _last_error.pop(name, None)
                _cooldown_until.pop(name, None)
            except ProviderError as e:
                status = f"error: {e}"
        left = int(max(0, _cooldown_until.get(name, 0) - now))
        out.append({
            "name": name,
            "model": p["model"],
            "status": status,
            "cooldown_seconds_left": left,
            "last_error": _last_error.get(name),
        })
    return out

_cache: "OrderedDict[str, tuple]" = OrderedDict()
CACHE_TTL = 3600
CACHE_MAX = 200


def _cache_key(message: str, context: Optional[str]) -> str:
    raw = message.strip().lower() + "||" + (context or "")[:300]
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def cache_get(key: str) -> Optional[str]:
    item = _cache.get(key)
    if item and time.time() - item[0] < CACHE_TTL:
        return item[1]
    _cache.pop(key, None)
    return None


def cache_put(key: str, value: str):
    _cache[key] = (time.time(), value)
    while len(_cache) > CACHE_MAX:
        _cache.popitem(last=False)


_rate: Dict[str, list] = {}


def is_rate_limited(ip: str) -> bool:
    limit = int(os.getenv("RATE_LIMIT_PER_MIN", "20"))
    if limit <= 0 or not ip:
        return False
    now = time.time()
    hits = [t for t in _rate.get(ip, []) if now - t < 60]
    if len(hits) >= limit:
        _rate[ip] = hits
        return True
    hits.append(now)
    _rate[ip] = hits
    if len(_rate) > 5000:
        _rate.clear()
    return False


def get_client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""

def offline_answer(message: str, context: Optional[str]) -> str:
    try:
        if context and len(context) > 10:
            return (
                "The AI engine is temporarily unavailable, but here is the most "
                "relevant text from your uploaded document:\n\n"
                + context[:1200]
                + "\n\nPlease ask again in a minute for a full AI answer."
            )
        text = (message or "").strip().lower()
        if re.match(r"^(hi|hello|hey|hii|helo|good (morning|afternoon|evening))\b", text):
            return (
                "Hi! I'm Cortexa. My AI engine is taking a short break, so I "
                "can only give limited replies right now. Please ask again in "
                "a minute."
            )
        return (
            "I received your message, but my AI engine is temporarily busy. "
            "Please try again in a minute. Your chat is saved, and nothing "
            "was lost."
        )
    except Exception:
        return "Please try again in a minute."


LLM_MODEL = ", ".join(p["name"] + ":" + p["model"] for p in enabled_providers())
print(f"🧠 AI providers (in order): {LLM_MODEL or 'NONE (offline mode only)'}")


# USER DATABASE 
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
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chats (
                    id TEXT PRIMARY KEY,
                    user_email TEXT NOT NULL,
                    title TEXT NOT NULL,
                    messages TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            self._conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_chats_user_email ON chats(user_email)"
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

    def list_chats(self, user_email: str) -> list:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM chats WHERE user_email = ? ORDER BY updated_at DESC",
                (user_email,)
            ).fetchall()
        result = []
        for row in rows:
            result.append({
                "id": row["id"],
                "title": row["title"],
                "messages": json.loads(row["messages"]),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            })
        return result

    def get_chat(self, user_email: str, chat_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM chats WHERE id = ? AND user_email = ?",
                (chat_id, user_email)
            ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "title": row["title"],
            "messages": json.loads(row["messages"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def save_chat(
        self,
        user_email: str,
        chat_id: Optional[str],
        title: str,
        messages: list
    ) -> Dict[str, Any]:
        now = datetime.utcnow().isoformat()
        messages_json = json.dumps(messages)

        with self._lock:
            if chat_id:
                existing = self._conn.execute(
                    "SELECT id FROM chats WHERE id = ? AND user_email = ?",
                    (chat_id, user_email)
                ).fetchone()
                if existing:
                    self._conn.execute(
                        "UPDATE chats SET title = ?, messages = ?, updated_at = ? "
                        "WHERE id = ? AND user_email = ?",
                        (title, messages_json, now, chat_id, user_email)
                    )
                    self._conn.commit()
                    return {
                        "id": chat_id, "title": title, "messages": messages,
                        "updated_at": now
                    }
                chat_id = None

            if not chat_id:
                chat_id = "chat_" + uuid.uuid4().hex[:12]
                self._conn.execute(
                    "INSERT INTO chats (id, user_email, title, messages, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (chat_id, user_email, title, messages_json, now, now)
                )
                self._conn.commit()

        return {"id": chat_id, "title": title, "messages": messages, "updated_at": now}

    def delete_chat(self, user_email: str, chat_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM chats WHERE id = ? AND user_email = ?",
                (chat_id, user_email)
            )
            self._conn.commit()
            return cur.rowcount > 0


db = UserDatabase()

# RAG SETUP
print("🔧 Initializing RAG components...")

chunker = DocumentChunker(chunk_size=500, overlap=50)
search_engine = KeywordSearch()
embedder = Embedder(model_name="all-MiniLM-L6-v2")
vector_store = VectorStore(persist_directory="./vector_store")

document_store = {}
embedder_ready = False


def ensure_embedder():
    global embedder_ready

    if not embedder_ready:
        try:
            embedder.initialize()
            embedder_ready = True
            print("✅ Embedder initialized!")
        except Exception as e:
            print(f"⚠️ Embedder initialization failed: {e}")
            raise

    return embedder

try:
    vector_store.initialize()
    print("✅ Vector store initialized!")
except Exception as e:
    print(f"⚠️ Vector store initialization failed: {e}")

print("✅ RAG initialization completed!")

class Message(BaseModel):
    message: str
    document_content: Optional[str] = None
    audio: bool = False


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


class ChatSave(BaseModel):
    chat_id: Optional[str] = None
    title: str
    messages: list


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


# AI RESPONSE
async def get_ai_response(message: str, context: Optional[str] = None):
    """Returns (text, provider_name). Always returns something."""
    try:
        key = _cache_key(message, context)
        cached = cache_get(key)
        if cached:
            return cached, "cache"

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        if context and context != "null" and len(context) > 10:
            messages.append({
                "role": "system",
                "content": "Reference document:\n" + context[:3000]
            })
        messages.append({"role": "user", "content": message})

        answer, provider = await run_in_threadpool(call_llm, messages, 800)
        cache_put(key, answer)
        print(f"✅ Response from {provider}")
        return answer, provider
    except Exception as e:
        print(f"❌ All providers failed, using offline answer: {str(e)[:300]}")
        return offline_answer(message, context), "offline"


# YOUTUBE HELPERS
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

# AUTH DEPENDENCY
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


# AUTH ROUTES
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

@app.get("/api/chats")
async def api_list_chats(current_user: dict = Depends(get_current_user)):
    chats = db.list_chats(current_user["email"])
    return {"chats": chats}


@app.get("/api/chats/{chat_id}")
async def api_get_chat(
    chat_id: str,
    current_user: dict = Depends(get_current_user)
):
    chat = db.get_chat(current_user["email"], chat_id)
    if not chat:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})
    return {"chat": chat}


@app.post("/api/chats")
async def api_save_chat(
    data: ChatSave,
    current_user: dict = Depends(get_current_user)
):
    saved = db.save_chat(
        current_user["email"],
        data.chat_id,
        data.title,
        data.messages
    )
    return {"chat": saved}


@app.delete("/api/chats/{chat_id}")
async def api_delete_chat(
    chat_id: str,
    current_user: dict = Depends(get_current_user)
):
    deleted = db.delete_chat(current_user["email"], chat_id)
    if not deleted:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})
    return {"status": "success", "message": f"Chat {chat_id} deleted"}

# CHAT HANDLER
async def chat_handler(data: Message, client_ip: str = ""):
    try:
        user_msg = data.message.strip()
        print(f"📥 Chat request: {user_msg}")

        if not user_msg:
            return {"role": "assistant", "response": "Please enter a message! 💙"}

        if is_rate_limited(client_ip):
            return {
                "role": "assistant",
                "response": "You're sending messages very fast. Please wait a few seconds and try again. 💙",
                "provider": "rate_limit",
                "degraded": True,
            }

        context = ""

        if document_store:
            try:
                ensure_embedder()
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
                except Exception as ke:
                    print(f"⚠️ Keyword search failed: {ke}")

        reply, provider = await get_ai_response(user_msg, context)
        return {
            "role": "assistant",
            "response": reply,
            "provider": provider,
            "degraded": provider == "offline",
        }

    except Exception as e:
        print(f"❌ Chat error: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.post("/api/chat")
async def api_chat(data: Message, request: Request):
    return await chat_handler(data, get_client_ip(request))


@app.post("/chat")
async def legacy_chat(data: Message, request: Request):
    return await chat_handler(data, get_client_ip(request))


@app.post("/api/predict")
async def predict(request: dict):
    try:
        message = request.get("message", "")
        if not message:
            return JSONResponse(
                status_code=400,
                content={"error": "No message provided"}
            )
        chat_data = Message(message=message)
        return await chat_handler(chat_data)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# DOCUMENT ROUTES
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
            ensure_embedder()
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
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/upload-document")
async def api_upload_document(file: UploadFile = File(...)):
    return await upload_document_handler(file)


@app.post("/upload-document")
async def legacy_upload_document(file: UploadFile = File(...)):
    return await upload_document_handler(file)


async def search_document_handler(data: dict):
    query = data.get("query", "")
    top_k = data.get("top_k", 3)
    if not query:
        return {"error": "No query provided"}
    if not document_store:
        return {"error": "No documents uploaded yet"}

    try:
        ensure_embedder()
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
        return JSONResponse(status_code=404, content={"error": "Document not found"})
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


# YOUTUBE ROUTES
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

        try:
            answer, _provider = await run_in_threadpool(call_llm, messages, 500)
            return {
                "summary": answer,
                "title": info["title"],
                "video_id": video_id
            }
        except LLMError as e:
            print(f"⚠️ Summary failed: {str(e)[:500]}")
            desc = (info.get("description") or "").strip()[:800]
            return {
                "summary": (
                    "The AI is temporarily unavailable, so here is the video "
                    "description instead:\n\n" + (desc or "No description available.")
                ),
                "title": info["title"],
                "video_id": video_id,
                "provider": "offline",
            }
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/youtube-summary")
async def api_youtube_summary(data: dict):
    return await youtube_summary_handler(data)


@app.post("/youtube-summary")
async def legacy_youtube_summary(data: dict):
    return await youtube_summary_handler(data)


# AUDIO ROUTES
async def generate_audio_handler(data: dict):
    try:
        text = data.get("text", "")
        if not text:
            return JSONResponse(status_code=400, content={"error": "No text provided"})

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
        return JSONResponse(status_code=500, content={"error": str(e)})


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
        return JSONResponse(status_code=404, content={"error": "Audio file not found"})
    return FileResponse(filepath, media_type="audio/mpeg")


# ============================================================
# CONFIG / HEALTH / MODELS / ROOT

@app.get("/api/config")
async def get_config():
    return {
        "status": "success",
        "config": {
            "api_url": "/api/chat",
            "version": "3.0",
            "provider_chain": [p["name"] for p in enabled_providers()] + ["offline"],
            "features": {
                "audio": True,
                "video": True,
                "reports": True,
                "learning": True,
                "games": True
            }
        }
    }


@app.get("/health")
async def health(test: bool = False):
    providers = await run_in_threadpool(provider_status, test)

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
        "ai_providers": providers,
        "offline_fallback": "always_on",
        "youtube_api": "configured" if YOUTUBE_API_KEY else "not configured",
        "auth_enabled": True,
        "rag_enabled": True,
        "vector_store_count": vector_count,
        "db_path": DB_PATH,
    }


@app.get("/models")
async def list_models():
    return {
        "providers": [
            {"name": p["name"], "model": p["model"]}
            for p in enabled_providers()
        ]
    }


@app.get("/")
async def root():
    return {
        "message": "🚀 Cortexa Backend Running",
        "version": "3.0",
        "status": "active",
        "provider_chain": [p["name"] for p in enabled_providers()],
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

# STATIC FILES

FRONTEND_DIR = os.getenv("FRONTEND_DIR", "frontend")

if os.path.isdir(FRONTEND_DIR):
    app.mount(
        "/",
        StaticFiles(directory=FRONTEND_DIR, html=True),
        name="frontend"
    )
    print(f"✅ Frontend mounted from ./{FRONTEND_DIR}")
else:
    print(f"ℹ️ No frontend directory at ./{FRONTEND_DIR} — API-only mode")


# START SERVER
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))

    print("================================================")
    print("🚀 CORTEXA BACKEND STARTING")
    print(f"🌐 Port: {port}")
    print(f"💾 DB: {DB_PATH}")
    print(f"🧠 AI providers: {LLM_MODEL or 'NONE (offline mode only)'}")
    print("================================================")

    uvicorn.run(app, host="0.0.0.0", port=port)
