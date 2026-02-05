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
