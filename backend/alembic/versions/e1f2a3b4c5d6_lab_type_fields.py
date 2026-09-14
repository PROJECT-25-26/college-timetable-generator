"""add lab_type to rooms and required_lab_type to subjects

Revision ID: e1f2a3b4c5d6
Revises: d1e2f3a4b5c6
Create Date: 2026-09-02
"""

from alembic import op
import sqlalchemy as sa


revision = 'e1f2a3b4c5d6'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('rooms', sa.Column('lab_type', sa.String(length=50), nullable=True))
    op.add_column('subjects', sa.Column('required_lab_type', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('subjects', 'required_lab_type')
    op.drop_column('rooms', 'lab_type')
