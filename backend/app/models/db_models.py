from sqlalchemy import Column, String, Text, DateTime, Float, Integer, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

Base = declarative_base()


def gen_id():
    return str(uuid.uuid4())


class Document(Base):
    __tablename__ = "documents"

    id          = Column(String, primary_key=True, default=gen_id)
    plant_id    = Column(String, default="plant_001")
    filename    = Column(String, nullable=False)
    doc_type    = Column(String, default="unknown")
    source_path = Column(String)
    page_count  = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    status      = Column(String, default="pending")
    created_at  = Column(DateTime, default=datetime.utcnow)
    entities    = relationship("Entity", back_populates="document", cascade="all, delete")


class Entity(Base):
    __tablename__ = "entities"

    id          = Column(String, primary_key=True, default=gen_id)
    document_id = Column(String, ForeignKey("documents.id"))
    plant_id    = Column(String, default="plant_001")
    entity_type = Column(String)
    label       = Column(String)
    value       = Column(String)
    page_num    = Column(Integer, default=0)
    confidence  = Column(Float, default=1.0)
    document    = relationship("Document", back_populates="entities")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id         = Column(String, primary_key=True, default=gen_id)
    plant_id   = Column(String, default="plant_001")
    created_at = Column(DateTime, default=datetime.utcnow)
    messages   = relationship("ChatMessage", back_populates="session", cascade="all, delete")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id         = Column(String, primary_key=True, default=gen_id)
    session_id = Column(String, ForeignKey("chat_sessions.id"))
    role       = Column(String)
    content    = Column(Text)
    sources    = Column(Text)
    agent_type = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    session    = relationship("ChatSession", back_populates="messages")
