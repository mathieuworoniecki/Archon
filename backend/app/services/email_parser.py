"""
Archon Backend - Email Parser Service
Parses EML, PST, and MBOX email archives to extract headers, body, and attachments.
"""
import email
import email.policy
import email.utils
import mailbox
import subprocess
import tempfile
import shutil
import logging
from pathlib import Path
from typing import List, Optional, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class EmailAttachment:
    """Represents an email attachment."""
    filename: str
    content_type: str
    size: int
    data: bytes = field(repr=False)


@dataclass
class EmailResult:
    """Parsed email result."""
    from_addr: str = ""
    to_addr: str = ""
    cc_addr: str = ""
    subject: str = ""
    date: str = ""
    message_id: str = ""
    in_reply_to: str = ""
    body_text: str = ""
    body_html: str = ""
    attachments: List[EmailAttachment] = field(default_factory=list)

    def to_searchable_text(self) -> str:
        """Convert email to a single searchable text block."""
        parts = []
        if self.from_addr:
            parts.append(f"From: {self.from_addr}")
        if self.to_addr:
            parts.append(f"To: {self.to_addr}")
        if self.cc_addr:
            parts.append(f"CC: {self.cc_addr}")
        if self.subject:
            parts.append(f"Subject: {self.subject}")
        if self.date:
            parts.append(f"Date: {self.date}")
        if self.message_id:
            parts.append(f"Message-ID: {self.message_id}")
        
        parts.append("")  # separator
        
        if self.body_text:
            parts.append(self.body_text)
        elif self.body_html:
            # Basic HTML stripping for search
            import re
            text = re.sub(r'<[^>]+>', ' ', self.body_html)
            text = re.sub(r'\s+', ' ', text).strip()
            parts.append(text)
        
        if self.attachments:
            parts.append(f"\n--- Attachments ({len(self.attachments)}) ---")
            for att in self.attachments:
                parts.append(f"  - {att.filename} ({att.content_type}, {att.size} bytes)")
        
        return "\n".join(parts)


class EmailParserService:
    """
    Service for parsing email files.
    
    Supports:
    - EML files (RFC 5322 standard email format)
    - MBOX files (Unix mailbox format, multiple emails)
    - PST files (Microsoft Outlook, via readpst CLI)
    """

    # Supported extensions
    EML_EXTENSIONS = {".eml", ".msg"}
    MBOX_EXTENSIONS = {".mbox", ".mbx"}
    PST_EXTENSIONS = {".pst", ".ost"}
    
    ALL_EXTENSIONS = EML_EXTENSIONS | MBOX_EXTENSIONS | PST_EXTENSIONS

    def is_email_file(self, file_path: str) -> bool:
        """Check if a file is a supported email format."""
        return Path(file_path).suffix.lower() in self.ALL_EXTENSIONS
    
    def get_email_type(self, file_path: str) -> str:
        """Get the email file type: eml, mbox, or pst."""
        ext = Path(file_path).suffix.lower()
        if ext in self.EML_EXTENSIONS:
            return "eml"
        elif ext in self.MBOX_EXTENSIONS:
            return "mbox"
        elif ext in self.PST_EXTENSIONS:
            return "pst"
        return "unknown"

    def parse_eml(self, file_path: str) -> EmailResult:
        """
        Parse a single EML file.
        
        Args:
            file_path: Path to the .eml file
            
        Returns:
            EmailResult with parsed headers, body, and attachments
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"EML file not found: {file_path}")
        
        with open(path, "rb") as f:
            msg = email.message_from_binary_file(f, policy=email.policy.default)
        
        return self._parse_message(msg)

    def parse_mbox(self, file_path: str) -> List[EmailResult]:
        """
        Parse an MBOX file containing multiple emails.
        
        Args:
            file_path: Path to the .mbox file
            
        Returns:
            List of EmailResult for each message in the mailbox
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"MBOX file not found: {file_path}")
        
        results = []
        mbox = mailbox.mbox(str(path))
        
        try:
            for i, msg in enumerate(mbox):
                try:
                    result = self._parse_message(msg)
                    results.append(result)
                except Exception as e:
                    logger.warning(f"Failed to parse message {i} in {file_path}: {e}")
        finally:
            mbox.close()
        
        return results

    def parse_pst(self, file_path: str) -> List[EmailResult]:
        """
        Parse a PST/OST file using readpst CLI.
        
        Extracts emails to a temp directory as EML files, then parses each.
        Requires: pst-utils package (readpst binary).
        
        Args:
            file_path: Path to the .pst file
            
        Returns:
            List of EmailResult for each message in the PST
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"PST file not found: {file_path}")
        
        # Check readpst availability
        if not shutil.which("readpst"):
            raise RuntimeError(
                "readpst not found. Install pst-utils: apt-get install pst-utils"
            )
        
        temp_dir = tempfile.mkdtemp(prefix="archon_pst_")
        results = []
        
        try:
            # Extract PST to EML files
            # -e = individual eml files, -o = output dir, -q = quiet
            cmd = ["readpst", "-e", "-o", temp_dir, "-q", str(path)]
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 min timeout
            )
            
            if proc.returncode != 0:
                logger.error(f"readpst failed: {proc.stderr}")
                raise RuntimeError(f"readpst failed: {proc.stderr[:200]}")
            
            # Parse all extracted EML files
            temp_path = Path(temp_dir)
            for eml_file in sorted(temp_path.rglob("*.eml")):
                try:
                    result = self.parse_eml(str(eml_file))
                    results.append(result)
                except Exception as e:
                    logger.warning(f"Failed to parse extracted EML {eml_file.name}: {e}")
        
        finally:
            # Cleanup temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)
        
        return results

    def extract_text(self, file_path: str) -> Tuple[str, bool]:
        """
        Extract searchable text from an email file.
        
        Returns:
            Tuple of (text_content, is_email_type)  
        """
        email_type = self.get_email_type(file_path)
        
        try:
            if email_type == "eml":
                result = self.parse_eml(file_path)
                return result.to_searchable_text(), True
                
            elif email_type == "mbox":
                results = self.parse_mbox(file_path)
                texts = []
                for i, result in enumerate(results):
                    texts.append(f"=== Email {i + 1}/{len(results)} ===")
                    texts.append(result.to_searchable_text())
                    texts.append("")
                return "\n".join(texts), True
                
            elif email_type == "pst":
                results = self.parse_pst(file_path)
                texts = []
                for i, result in enumerate(results):
                    texts.append(f"=== Email {i + 1}/{len(results)} ===")
                    texts.append(result.to_searchable_text())
                    texts.append("")
                return "\n".join(texts), True
            
            else:
                return "", False
                
        except Exception as e:
            logger.error(f"Email parsing failed for {file_path}: {e}")
            return f"[Email parsing error: {e}]", False

    def _parse_message(self, msg) -> EmailResult:
        """Parse an email.message.Message object into EmailResult."""
        result = EmailResult()
        
        # Headers
        result.from_addr = str(msg.get("From", ""))
        result.to_addr = str(msg.get("To", ""))
        result.cc_addr = str(msg.get("Cc", ""))
        result.subject = str(msg.get("Subject", ""))
        result.date = str(msg.get("Date", ""))
        result.message_id = str(msg.get("Message-ID", ""))
        result.in_reply_to = str(msg.get("In-Reply-To", ""))
        
        # Body and attachments
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                disposition = str(part.get("Content-Disposition", ""))
                
                if "attachment" in disposition:
                    # Attachment
                    try:
                        data = part.get_payload(decode=True) or b""
                        filename = part.get_filename() or "unnamed_attachment"
                        result.attachments.append(EmailAttachment(
                            filename=filename,
                            content_type=content_type,
                            size=len(data),
                            data=data
                        ))
                    except Exception as e:
                        logger.warning(f"Failed to extract attachment: {e}")
                
                elif content_type == "text/plain" and not result.body_text:
                    try:
                        payload = part.get_payload(decode=True)
                        if payload:
                            charset = part.get_content_charset() or "utf-8"
                            result.body_text = payload.decode(charset, errors="replace")
                    except Exception:
                        pass
                
                elif content_type == "text/html" and not result.body_html:
                    try:
                        payload = part.get_payload(decode=True)
                        if payload:
                            charset = part.get_content_charset() or "utf-8"
                            result.body_html = payload.decode(charset, errors="replace")
                    except Exception:
                        pass
        else:
            # Single-part message
            content_type = msg.get_content_type()
            try:
                payload = msg.get_payload(decode=True)
                if payload:
                    charset = msg.get_content_charset() or "utf-8"
                    text = payload.decode(charset, errors="replace")
                    if content_type == "text/html":
                        result.body_html = text
                    else:
                        result.body_text = text
            except Exception:
                pass
        
        return result


# Singleton
_email_parser: Optional[EmailParserService] = None


def get_email_parser() -> EmailParserService:
    """Get the email parser service singleton."""
    global _email_parser
    if _email_parser is None:
        _email_parser = EmailParserService()
    return _email_parser
