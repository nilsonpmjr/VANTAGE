import httpx
import pytest

from threat_misp import MISPClient, adapt_misp_events


def test_adapt_misp_events_builds_canonical_documents():
    payload = {
        "response": [
            {
                "Event": {
                    "id": "42",
                    "uuid": "event-uuid-42",
                    "info": "Suspicious infrastructure cluster",
                    "publish_timestamp": "1773921600",
                    "threat_level_id": "1",
                    "Tag": [{"name": "tlp:amber"}, {"name": "osint"}],
                    "Attribute": [
                        {"type": "ip-dst", "value": "198.51.100.10"},
                        {"type": "domain", "value": "example.test"},
                    ],
                    "Orgc": {"name": "MISP Sharing Group"},
                }
            }
        ]
    }

    documents = adapt_misp_events("misp_events", "https://misp.example.test", payload)

    assert len(documents) == 1
    document = documents[0]
    assert document["source_id"] == "misp_events"
    assert document["source_type"] == "misp"
    assert document["family"] == "misp"
    assert document["external_id"] == "event-uuid-42"
    assert document["severity"] == "high"
    assert document["data"]["attributes"]["attribute_count"] == 2
    assert "misp" in document["tags"]
    assert "tlp:amber" in document["tags"]
    assert "domain" in document["tags"]
    assert document["data"]["link"] == "https://misp.example.test/events/view/42"


@pytest.mark.asyncio
async def test_misp_client_test_connection_uses_expected_endpoint(monkeypatch):
    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.kwargs = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url):
            request = httpx.Request("GET", f"https://misp.example.test{url}")
            return httpx.Response(200, request=request, json={"version": "2.4.999"})

    monkeypatch.setattr("threat_misp.httpx.AsyncClient", FakeClient)

    client = MISPClient(
        base_url="https://misp.example.test",
        api_key="secret",
        verify_tls=False,
    )
    result = await client.test_connection()

    assert result["ok"] is True
    assert result["version"] == "2.4.999"


@pytest.mark.asyncio
async def test_misp_client_fetch_events_paginates_until_short_page(monkeypatch):
    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.calls = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, json):
            self.calls.append((url, json))
            request = httpx.Request("POST", f"https://misp.example.test{url}")
            if json["page"] == 1:
                payload = {"response": [{"Event": {"id": "1", "uuid": "uuid-1"}}]}
            else:
                payload = {"response": []}
            return httpx.Response(200, request=request, json=payload)

    fake_client = FakeClient()
    monkeypatch.setattr("threat_misp.httpx.AsyncClient", lambda *args, **kwargs: fake_client)

    client = MISPClient(
        base_url="https://misp.example.test",
        api_key="secret",
    )
    result = await client.fetch_events(page_size=1, max_pages=3)

    assert len(result["response"]) == 1
    assert fake_client.calls[0][1]["page"] == 1
    assert fake_client.calls[1][1]["page"] == 2
