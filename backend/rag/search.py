"""
Simple Keyword-Based Search
Finds chunks that best match the user's question
"""

from typing import List, Dict, Tuple
import re
from collections import Counter

class KeywordSearch:
    def __init__(self):
        self.chunks = []
        self.stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 
                          'of', 'to', 'for', 'with', 'on', 'at', 'from',
                          'by', 'in', 'as', 'that', 'this', 'these', 'those'}
    
    def index_chunks(self, chunks: List[Dict]):
        """Store chunks for searching"""
        self.chunks = chunks
    
    def search(self, query: str, top_k: int = 3) -> List[Dict]:
        """
        Search for relevant chunks using keyword matching
        
        Args:
            query: User's question
            top_k: Number of chunks to return
        
        Returns:
            List of relevant chunks with relevance scores
        """
        if not self.chunks:
            return []
        
        # Process query
        query_words = self._extract_keywords(query)
        
        if not query_words:
            return self.chunks[:top_k]
        
        # Score each chunk
        scored_chunks = []
        for chunk in self.chunks:
            chunk_words = self._extract_keywords(chunk['text'])
            
            # Calculate overlap score
            overlap = len(set(query_words) & set(chunk_words))
            
            # Boost score for exact phrase matches
            phrase_score = 0
            query_lower = query.lower()
            chunk_lower = chunk['text'].lower()
            if query_lower in chunk_lower:
                phrase_score = len(query_lower) / len(chunk_lower) * 10
            
            # Combine scores
            score = overlap + phrase_score
            
            if score > 0:
                scored_chunks.append({
                    **chunk,
                    'relevance_score': round(score, 2)
                })
        
        # Sort by relevance score (highest first)
        scored_chunks.sort(key=lambda x: x['relevance_score'], reverse=True)
        
        # Return top k
        return scored_chunks[:top_k]
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract meaningful keywords from text"""
        # Convert to lowercase and split
        words = re.findall(r'\b[a-zA-Z]+\b', text.lower())
        
        # Remove stop words and short words
        keywords = [w for w in words if w not in self.stop_words and len(w) > 2]
        
        return keywords
    
    def search_with_preview(self, query: str, top_k: int = 3) -> List[Dict]:
        """
        Search and include a preview snippet
        """
        results = self.search(query, top_k)
        
        for result in results:
            text = result['text']
            # Find where query appears in text
            query_lower = query.lower()
            text_lower = text.lower()
            
            if query_lower in text_lower:
                pos = text_lower.find(query_lower)
                start = max(0, pos - 50)
                end = min(len(text), pos + len(query) + 100)
                result['preview'] = '...' + text[start:end] + '...'
            else:
                # If query not found, show first 150 chars
                result['preview'] = text[:150] + '...' if len(text) > 150 else text
        
        return results
