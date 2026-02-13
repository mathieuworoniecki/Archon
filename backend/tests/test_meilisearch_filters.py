"""
Archon Backend - Meilisearch filter builder tests
"""
import pytest

from app.services.meilisearch import MeilisearchService


class _FakeIndex:
    def __init__(self):
        self.calls = []

    def search(self, query, params):
        self.calls.append({"query": query, "params": params})
        return {
            "hits": [],
            "processingTimeMs": 1,
            "estimatedTotalHits": 0,
        }


class _FakeClient:
    def __init__(self, index):
        self._index = index

    def index(self, _index_name):
        return self._index


def _build_service():
    fake_index = _FakeIndex()
    service = object.__new__(MeilisearchService)
    service.client = _FakeClient(fake_index)
    service.index_name = "test-index"
    return service, fake_index


def test_search_builds_safe_combined_filters():
    service, fake_index = _build_service()

    service.search(
        query="invoice",
        file_types=["pdf", "text"],
        scan_ids=[12, 17],
        project_path="/workspace/docs",
    )

    assert len(fake_index.calls) == 1
    assert fake_index.calls[0]["params"]["filter"] == (
        '(file_type = "pdf" OR file_type = "text") '
        'AND (scan_id = 12 OR scan_id = 17) '
        'AND file_path STARTS WITH "/workspace/docs"'
    )


def test_search_escapes_string_filters_to_block_injection():
    service, fake_index = _build_service()

    service.search(
        query="contract",
        file_types=['pdf" OR scan_id = 999'],
        project_path='/repo/" OR file_type = "image',
    )

    assert len(fake_index.calls) == 1
    assert fake_index.calls[0]["params"]["filter"] == (
        'file_type = "pdf\\" OR scan_id = 999" '
        'AND file_path STARTS WITH "/repo/\\" OR file_type = \\"image"'
    )


@pytest.mark.parametrize(
    ("kwargs", "error_message"),
    [
        ({"file_types": "pdf"}, "file_types must be a list of strings"),
        ({"scan_ids": 10}, "scan_ids must be a list of integers"),
        ({"file_types": [123]}, "file_type filter value must be a string"),
        ({"file_types": ["   "]}, "file_type filter value cannot be empty"),
        ({"scan_ids": ["12"]}, "scan_ids entries must be integers"),
        ({"scan_ids": [True]}, "scan_ids entries must be integers"),
        ({"project_path": "   "}, "file_path filter value cannot be empty"),
    ],
)
def test_search_rejects_invalid_filters(kwargs, error_message):
    service, fake_index = _build_service()

    with pytest.raises(ValueError) as exc_info:
        service.search(query="any", **kwargs)

    assert error_message in str(exc_info.value)
    assert fake_index.calls == []
