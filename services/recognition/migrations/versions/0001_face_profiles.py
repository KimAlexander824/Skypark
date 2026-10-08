"""Модуль распознавания: таблица эмбеддингов лиц face_profiles (pgvector + HNSW)

Revision ID: 0001
Revises:
Create Date: 2026-10-07
"""

import pgvector.sqlalchemy
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "face_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(512), nullable=False),
        sa.Column("det_score", sa.Float(), nullable=False),
        sa.Column("thumbnail", sa.LargeBinary(), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_face_profiles_child_id", "face_profiles", ["child_id"])
    op.create_index(
        "ix_face_profiles_hnsw",
        "face_profiles",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_table("face_profiles")
