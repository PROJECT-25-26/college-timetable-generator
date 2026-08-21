"""Homeroom for class sections and remove max_periods_per_day

Revision ID: c1d2e3f4a5b6
Revises: b2c3d4e5f6a7
Create Date: 2026-08-21 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Remove max_periods_per_day from subjects ─────────────────────
    with op.batch_alter_table('subjects', schema=None) as batch_op:
        batch_op.drop_column('max_periods_per_day')

    # ── 2. Remove max_periods_per_day + old constraints from teachers ───
    with op.batch_alter_table('teachers', schema=None) as batch_op:
        try:
            batch_op.drop_constraint('ck_teacher_max_day_min', type_='check')
        except Exception:
            pass
        try:
            batch_op.drop_constraint('ck_teacher_max_week_gte_day', type_='check')
        except Exception:
            pass
        batch_op.drop_column('max_periods_per_day')
        batch_op.create_check_constraint(
            'ck_teacher_max_week_min',
            'max_periods_per_week >= 1'
        )

    # ── 3. Add homeroom_id FK to class_sections ─────────────────────────
    with op.batch_alter_table('class_sections', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('homeroom_id', sa.String(36), nullable=True)
        )
        batch_op.create_foreign_key(
            'fk_class_sections_homeroom_id',
            'rooms',
            ['homeroom_id'],
            ['id'],
            ondelete='SET NULL'
        )


def downgrade() -> None:
    # ── Reverse homeroom FK ─────────────────────────────────────────────
    with op.batch_alter_table('class_sections', schema=None) as batch_op:
        batch_op.drop_constraint('fk_class_sections_homeroom_id', type_='foreignkey')
        batch_op.drop_column('homeroom_id')

    # ── Restore teachers.max_periods_per_day ───────────────────────────
    with op.batch_alter_table('teachers', schema=None) as batch_op:
        try:
            batch_op.drop_constraint('ck_teacher_max_week_min', type_='check')
        except Exception:
            pass
        batch_op.add_column(
            sa.Column('max_periods_per_day', sa.SmallInteger(), nullable=False, server_default='6')
        )
        batch_op.create_check_constraint(
            'ck_teacher_max_day_min',
            'max_periods_per_day >= 1'
        )
        batch_op.create_check_constraint(
            'ck_teacher_max_week_gte_day',
            'max_periods_per_week >= max_periods_per_day'
        )

    # ── Restore subjects.max_periods_per_day ───────────────────────────
    with op.batch_alter_table('subjects', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('max_periods_per_day', sa.SmallInteger(), nullable=True)
        )
