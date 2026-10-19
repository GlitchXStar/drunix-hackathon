from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "risk-service"

def test_model_info():
    response = client.get("/v1/model-info")
    assert response.status_code == 200
    data = response.json()
    assert data["training_data_label"] == "synthetic"
