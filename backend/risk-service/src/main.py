import os
from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

app = FastAPI(title="TrustLedger Credit Risk Service", version="1.0.0")

INTERNAL_TOKEN = os.getenv("INTERNAL_TOKEN", "dev-internal-token-secret")
MODEL_VERSION = os.getenv("MODEL_VERSION", "v1-synthetic-initial")
DATA_LABEL = os.getenv("DATA_LABEL", "synthetic")

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str

class ModelInfoResponse(BaseModel):
    model_version: str
    feature_schema_version: str
    training_data_label: str

@app.get("/health", response_model=HealthResponse)
def health_check():
    return HealthResponse(status="ok", service="risk-service", version="1.0.0")

@app.get("/v1/model-info", response_model=ModelInfoResponse)
def get_model_info():
    return ModelInfoResponse(
        model_version=MODEL_VERSION,
        feature_schema_version="1.0",
        training_data_label=DATA_LABEL
    )
