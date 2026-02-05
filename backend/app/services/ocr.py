"""
War Room Backend - OCR Service
Text extraction from images and scanned PDFs using Tesseract
"""
import os
from pathlib import Path
from typing import Optional, Tuple
from PIL import Image
import pytesseract
import fitz  # PyMuPDF
from ..config import get_settings
from ..models import DocumentType

settings = get_settings()

# Configure Tesseract path for Windows
if os.path.exists(settings.tesseract_cmd):
    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd


class OCRService:
    """Service for extracting text from documents using OCR."""
    
    # Supported file extensions
    PDF_EXTENSIONS = {".pdf"}
    IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif", ".webp"}
    VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".wmv"}
    TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".xml", ".html", ".htm", ".log"}
    
    def __init__(self):
        self.tesseract_available = self._check_tesseract()
    
    def _check_tesseract(self) -> bool:
        """Check if Tesseract is available."""
        try:
            pytesseract.get_tesseract_version()
            return True
        except Exception:
            return False
    
    def detect_type(self, file_path: str) -> DocumentType:
        """Detect document type based on extension."""
        ext = Path(file_path).suffix.lower()
        
        if ext in self.PDF_EXTENSIONS:
            return DocumentType.PDF
        elif ext in self.IMAGE_EXTENSIONS:
            return DocumentType.IMAGE
        elif ext in self.VIDEO_EXTENSIONS:
            return DocumentType.IMAGE  # Treat videos as images for indexing (will OCR keyframes)
        elif ext in self.TEXT_EXTENSIONS:
            return DocumentType.TEXT
        else:
            return DocumentType.UNKNOWN
    
    def extract_text(self, file_path: str) -> Tuple[str, bool]:
        """
        Extract text from a file.
        
        Returns:
            Tuple of (text_content, used_ocr)
        """
        ext = Path(file_path).suffix.lower()
        
        # Check if it's a video first (special handling)
        if ext in self.VIDEO_EXTENSIONS:
            return self._extract_from_video(file_path)
        
        doc_type = self.detect_type(file_path)
        
        if doc_type == DocumentType.PDF:
            return self._extract_from_pdf(file_path)
        elif doc_type == DocumentType.IMAGE:
            return self._extract_from_image(file_path)
        elif doc_type == DocumentType.TEXT:
            return self._extract_from_text(file_path)
        else:
            return "", False
    
    def _extract_from_pdf(self, file_path: str) -> Tuple[str, bool]:
        """Extract text from PDF, using OCR if needed."""
        try:
            doc = fitz.open(file_path)
            text_parts = []
            used_ocr = False
            
            for page_num, page in enumerate(doc):
                # Try normal text extraction first
                text = page.get_text()
                
                # If page has very little text, try OCR
                if len(text.strip()) < 50 and self.tesseract_available:
                    # Render page to image
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better OCR
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    
                    # OCR the image
                    ocr_text = pytesseract.image_to_string(img, lang="fra+eng")
                    if len(ocr_text.strip()) > len(text.strip()):
                        text = ocr_text
                        used_ocr = True
                
                if text.strip():
                    text_parts.append(f"--- Page {page_num + 1} ---\n{text}")
            
            doc.close()
            return "\n\n".join(text_parts), used_ocr
            
        except Exception as e:
            raise RuntimeError(f"Failed to extract text from PDF: {e}")
    
    def _extract_from_image(self, file_path: str) -> Tuple[str, bool]:
        """Extract text from image using OCR."""
        if not self.tesseract_available:
            raise RuntimeError("Tesseract is not available for OCR")
        
        try:
            img = Image.open(file_path)
            
            # Convert to RGB if necessary
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            
            text = pytesseract.image_to_string(img, lang="fra+eng")
            return text, True
            
        except Exception as e:
            raise RuntimeError(f"Failed to extract text from image: {e}")
    
    def _extract_from_text(self, file_path: str) -> Tuple[str, bool]:
        """Extract text from plain text file."""
        try:
            # Try multiple encodings
            encodings = ["utf-8", "latin-1", "cp1252"]
            
            for encoding in encodings:
                try:
                    with open(file_path, "r", encoding=encoding) as f:
                        return f.read(), False
                except UnicodeDecodeError:
                    continue
            
            # Fallback: read as binary and decode with errors ignored
            with open(file_path, "rb") as f:
                content = f.read()
                return content.decode("utf-8", errors="ignore"), False
                
        except Exception as e:
            raise RuntimeError(f"Failed to read text file: {e}")
    
    def _extract_from_video(self, file_path: str) -> Tuple[str, bool]:
        """
        Extract text from video by:
        1. Extracting keyframes every 30 seconds using ffmpeg
        2. Running OCR on each frame
        3. Combining all unique text
        """
        import subprocess
        import tempfile
        import shutil
        
        if not self.tesseract_available:
            return "", False
        
        try:
            # Create temp directory for frames
            temp_dir = tempfile.mkdtemp(prefix="archon_video_")
            
            try:
                # Extract keyframes every 30 seconds (1 frame per 30 sec)
                # -vf fps=1/30 means 1 frame every 30 seconds
                frame_pattern = os.path.join(temp_dir, "frame_%04d.jpg")
                
                result = subprocess.run([
                    'ffmpeg', '-i', file_path,
                    '-vf', 'fps=1/30,scale=1280:-1',  # 1 frame/30s, resize to 1280px width
                    '-q:v', '3',  # Good quality JPEG
                    '-frames:v', '20',  # Max 20 frames (10 min of video)
                    frame_pattern
                ], capture_output=True, timeout=120)  # 2 min timeout
                
                # Find all extracted frames
                frames = sorted([f for f in os.listdir(temp_dir) if f.startswith("frame_")])
                
                if not frames:
                    return "", False
                
                # OCR each frame
                all_texts = []
                seen_texts = set()  # Deduplicate similar texts
                
                for frame_file in frames:
                    frame_path = os.path.join(temp_dir, frame_file)
                    try:
                        img = Image.open(frame_path)
                        if img.mode not in ("RGB", "L"):
                            img = img.convert("RGB")
                        
                        text = pytesseract.image_to_string(img, lang="fra+eng")
                        text = text.strip()
                        
                        # Only keep if there's meaningful text and it's not duplicate
                        if len(text) > 20:
                            # Simple deduplication: check if first 100 chars are unique
                            text_key = text[:100].lower()
                            if text_key not in seen_texts:
                                seen_texts.add(text_key)
                                frame_num = frame_file.replace("frame_", "").replace(".jpg", "")
                                time_sec = int(frame_num) * 30
                                time_str = f"{time_sec//60}:{time_sec%60:02d}"
                                all_texts.append(f"--- Video @{time_str} ---\n{text}")
                        
                        img.close()
                    except Exception:
                        continue
                
                combined_text = "\n\n".join(all_texts)
                return combined_text, True if combined_text else False
                
            finally:
                # Cleanup temp directory
                shutil.rmtree(temp_dir, ignore_errors=True)
                
        except subprocess.TimeoutExpired:
            return "", False
        except Exception as e:
            # ffmpeg not available or other error
            return "", False
    
    def get_file_metadata(self, file_path: str) -> dict:
        """Get file metadata."""
        path = Path(file_path)
        stat = path.stat()
        
        return {
            "file_name": path.name,
            "file_size": stat.st_size,
            "file_modified_at": stat.st_mtime,
        }


# Singleton instance
_ocr_service: Optional[OCRService] = None


def get_ocr_service() -> OCRService:
    """Get the OCR service singleton."""
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = OCRService()
    return _ocr_service
