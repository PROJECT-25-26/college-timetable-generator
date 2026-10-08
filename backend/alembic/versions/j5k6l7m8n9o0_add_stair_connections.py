"""add stair_connections to floors table

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-10-06

"""
from alembic import op
import sqlalchemy as sa


revision = 'j5k6l7m8n9o0'
down_revision = 'i4j5k6l7m8n9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add nullable stair_connections column to store stair/lift connection JSON on floors
    op.add_column('floors', sa.Column('stair_connections', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('floors', 'stair_connections')
