from app.services.embeddings import EmbeddingsService, is_deferred_ocr_placeholder


def test_is_deferred_ocr_placeholder_matches_video_prefix():
    assert is_deferred_ocr_placeholder("[VIDEO] OCR déféré — sera extrait à l'accès")
    assert is_deferred_ocr_placeholder("   [VIDEO] OCR déféré — sera extrait à l'accès")
    assert not is_deferred_ocr_placeholder("[VIDEO] Something else")


def test_is_deferred_ocr_placeholder_matches_image_prefix():
    assert is_deferred_ocr_placeholder("[IMAGE] OCR déféré — sera extrait à l'accès")
    assert is_deferred_ocr_placeholder(" \n\t[IMAGE] OCR déféré — sera extrait à l'accès")
    assert not is_deferred_ocr_placeholder("[IMAGE] Something else")


def test_is_deferred_ocr_placeholder_handles_empty():
    assert not is_deferred_ocr_placeholder(None)
    assert not is_deferred_ocr_placeholder("")
    assert not is_deferred_ocr_placeholder("   ")


def test_process_document_short_circuits_on_placeholder_without_init():
    # We intentionally avoid EmbeddingsService.__init__ (Gemini client + API key).
    service = EmbeddingsService.__new__(EmbeddingsService)
    assert service.process_document("[IMAGE] OCR déféré — sera extrait à l'accès") == []

