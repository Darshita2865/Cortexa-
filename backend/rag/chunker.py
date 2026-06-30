"""
Document Chunking Module
Splits text into manageable pieces for retrieval
"""

import re
from typing import List, Dict

class DocumentChunker:
    def __init__(self, chunk_size: int = 500, overlap: int = 50):
        """
        Initialize chunker with size and overlap settings
        
        Args:
            chunk_size: Target size of each chunk in characters
            overlap: Number of characters to overlap between chunks
        """
        self.chunk_size = chunk_size
        self.overlap = overlap
    
    def chunk_text(self, text: str) -> List[Dict[str, any]]:
        """
        Split text into overlapping chunks
        
        Args:
            text: Full document text
        
        Returns:
            List of chunks with metadata
        """
        if not text or len(text) < self.chunk_size:
            return [{
                'text': text,
                'index': 0,
                'char_start': 0,
                'char_end': len(text),
                'length': len(text)
            }]
        
        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        chunks = []
        current_chunk = []
        current_length = 0
        
        for sentence in sentences:
            sentence_len = len(sentence)
            
            # If this sentence alone is bigger than chunk_size, force split
            if sentence_len > self.chunk_size:
                # Add what we have as a chunk
                if current_chunk:
                    chunk_text = ' '.join(current_chunk)
                    chunks.append({
                        'text': chunk_text,
                        'index': len(chunks),
                        'char_start': chunks[-1]['char_end'] if chunks else 0,
                        'char_end': chunks[-1]['char_end'] + len(chunk_text) if chunks else len(chunk_text),
                        'length': len(chunk_text)
                    })
                    current_chunk = []
                    current_length = 0
                
                # Split long sentence into smaller pieces
                for i in range(0, len(sentence), self.chunk_size - self.overlap):
                    piece = sentence[i:i + self.chunk_size]
                    if piece:
                        chunks.append({
                            'text': piece,
                            'index': len(chunks),
                            'char_start': i,
                            'char_end': i + len(piece),
                            'length': len(piece)
                        })
                continue
            
            # Check if adding this sentence exceeds chunk size
            if current_length + sentence_len > self.chunk_size and current_chunk:
                # Save current chunk
                chunk_text = ' '.join(current_chunk)
                chunks.append({
                    'text': chunk_text,
                    'index': len(chunks),
                    'char_start': chunks[-1]['char_end'] if chunks else 0,
                    'char_end': chunks[-1]['char_end'] + len(chunk_text) if chunks else len(chunk_text),
                    'length': len(chunk_text)
                })
                
                # Keep overlap sentences
                overlap_text = ' '.join(current_chunk[-self.overlap:])
                current_chunk = [overlap_text] if overlap_text else []
                current_length = len(overlap_text)
            
            current_chunk.append(sentence)
            current_length += sentence_len + 1  # +1 for space
        
        # Save final chunk
        if current_chunk:
            chunk_text = ' '.join(current_chunk)
            chunks.append({
                'text': chunk_text,
                'index': len(chunks),
                'char_start': chunks[-1]['char_end'] if chunks else 0,
                'char_end': chunks[-1]['char_end'] + len(chunk_text) if chunks else len(chunk_text),
                'length': len(chunk_text)
            })
        
        return chunks
    
    def get_chunk_summary(self, chunks: List[Dict]) -> Dict:
        """Get summary statistics about chunks"""
        if not chunks:
            return {'total_chunks': 0, 'total_chars': 0, 'avg_size': 0}
        
        total_chars = sum(c['length'] for c in chunks)
        return {
            'total_chunks': len(chunks),
            'total_chars': total_chars,
            'avg_size': total_chars // len(chunks),
            'min_size': min(c['length'] for c in chunks),
            'max_size': max(c['length'] for c in chunks)
        }
