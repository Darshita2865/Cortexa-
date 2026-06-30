"""
Embedding Generator Module
Converts text to vector representations for semantic search
"""

from typing import List
import numpy as np

class Embedder:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Initialize the embedding model
        
        Args:
            model_name: Name of the sentence-transformers model
        """
        self.model_name = model_name
        self.model = None
        self._initialized = False
    
    def initialize(self):
        """Load the embedding model (lazy loading)"""
        if self._initialized:
            return
        
        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(self.model_name)
            self._initialized = True
            print(f"✅ Embedding model loaded: {self.model_name}")
        except ImportError:
            print("❌ sentence-transformers not installed. Install with: pip install sentence-transformers")
            self._initialized = False
    
    def embed_text(self, text: str) -> List[float]:
        """Convert text to embedding vector"""
        if not self._initialized:
            self.initialize()
        
        if not self.model:
            return [0.0] * 384  # Return zero vector if model not available
        
        return self.model.encode(text).tolist()
    
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Convert multiple texts to embeddings"""
        if not self._initialized:
            self.initialize()
        
        if not self.model:
            return [[0.0] * 384 for _ in texts]
        
        embeddings = self.model.encode(texts)
        return embeddings.tolist() if hasattr(embeddings, 'tolist') else embeddings
