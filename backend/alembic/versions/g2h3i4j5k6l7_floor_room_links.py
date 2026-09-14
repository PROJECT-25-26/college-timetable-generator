"""add room_links column to floors

Revision ID: g2h3i4j5k6l7
Revises: a7b8c9d0e1f2
Create Date: 2026-09-12
"""

from alembic import op
import sqlalchemy as sa


revision = 'g2h3i4j5k6l7'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add nullable room_links column to store blob-to-record link JSON
    op.add_column('floors', sa.Column('room_links', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('floors', 'room_links')
