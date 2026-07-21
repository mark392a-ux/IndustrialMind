from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    groq_api_key: str = ""
    deepseek_api_key: str = ""
    cohere_api_key: str = ""
    gemini_api_key: str = ""
    app_env: str = "development"
    secret_key: str = "changeme"

    chroma_persist_path: str = "./data/chroma"
    graph_persist_path: str = "./data/graph.pkl"
    upload_path: str = "./data/uploads"
    eval_path: str = "./eval"

    class Config:
        env_file = ".env"
        extra = "ignore"

    def ensure_dirs(self):
        for p in [self.chroma_persist_path, self.upload_path,
                  self.eval_path, Path(self.graph_persist_path).parent]:
            Path(p).mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()
