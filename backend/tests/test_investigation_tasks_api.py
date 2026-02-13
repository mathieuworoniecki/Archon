"""
Archon Backend - Investigation Tasks API Tests
"""


class TestInvestigationTasksAuth:
    def test_list_tasks_requires_auth(self, client):
        resp = client.get("/api/tasks/")
        assert resp.status_code == 401

    def test_create_task_requires_auth(self, client):
        resp = client.post("/api/tasks/", json={"title": "Task 1"})
        assert resp.status_code == 401


class TestInvestigationTasksCRUD:
    def test_tasks_crud_minimal(self, client, admin_headers):
        list_resp = client.get("/api/tasks/", headers=admin_headers)
        assert list_resp.status_code == 200
        assert list_resp.json() == []

        create_resp = client.post(
            "/api/tasks/",
            json={
                "title": "  Analyze mailbox  ",
                "description": "Check suspicious sender patterns",
            },
            headers=admin_headers,
        )
        assert create_resp.status_code == 200
        created = create_resp.json()
        task_id = created["id"]
        assert created["title"] == "Analyze mailbox"
        assert created["description"] == "Check suspicious sender patterns"
        assert created["status"] == "todo"
        assert created["priority"] == "medium"
        assert created["project_path"] is None
        assert created["document_id"] is None

        update_resp = client.patch(
            f"/api/tasks/{task_id}",
            json={
                "title": "  Analyze mailbox headers  ",
                "status": "in_progress",
                "priority": "high",
                "assignee_username": "testanalyst",
            },
            headers=admin_headers,
        )
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["id"] == task_id
        assert updated["title"] == "Analyze mailbox headers"
        assert updated["status"] == "in_progress"
        assert updated["priority"] == "high"
        assert updated["assignee_username"] == "testanalyst"

        filtered_list_resp = client.get(
            "/api/tasks/?status=in_progress",
            headers=admin_headers,
        )
        assert filtered_list_resp.status_code == 200
        filtered = filtered_list_resp.json()
        assert len(filtered) == 1
        assert filtered[0]["id"] == task_id

        delete_resp = client.delete(f"/api/tasks/{task_id}", headers=admin_headers)
        assert delete_resp.status_code == 200
        deleted = delete_resp.json()
        assert deleted["status"] == "deleted"
        assert deleted["task_id"] == task_id

        list_after_delete = client.get("/api/tasks/", headers=admin_headers)
        assert list_after_delete.status_code == 200
        assert list_after_delete.json() == []
