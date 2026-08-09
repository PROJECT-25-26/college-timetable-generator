"""Rename requires_lab to lab and add subject scheduling fields

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-09 14:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('subjects', 'requires_lab', new_column_name='lab')

    op.add_column(
        'subjects',
        sa.Column('lab_consecutive_periods', sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        'subjects',
        sa.Column('weekly_lab_sessions', sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        'subjects',
        sa.Column('max_periods_per_day', sa.SmallInteger(), nullable=True),
    )

    # Backfill existing rows
    op.execute(
        "UPDATE subjects SET max_periods_per_day = 2 WHERE lab = false"
    )
    op.execute(
        "UPDATE subjects SET lab_consecutive_periods = 2, weekly_lab_sessions = 1 WHERE lab = true"
    )


def downgrade() -> None:
    op.drop_column('subjects', 'max_periods_per_day')
    op.drop_column('subjects', 'weekly_lab_sessions')
    op.drop_column('subjects', 'lab_consecutive_periods')
    op.alter_column('subjects', 'lab', new_column_name='requires_lab')
