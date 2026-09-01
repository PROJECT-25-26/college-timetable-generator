"""timetable persistence — add timetables + timetable_slots tables

Revision ID: d1e2f3a4b5c6
Revises: c1d2e3f4a5b6
Create Date: 2026-09-01
"""

from alembic import op
import sqlalchemy as sa

revision = 'd1e2f3a4b5c6'
down_revision = 'c1d2e3f4a5b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── timetables ────────────────────────────────────────────────────────────
    op.create_table(
        'timetables',
        sa.Column('id',             sa.String(36),  nullable=False),
        sa.Column('label',          sa.String(120), nullable=True),
        sa.Column('status',         sa.String(20),  nullable=False),
        sa.Column('solver_wall_ms', sa.Integer(),   nullable=True),
        sa.Column('message',        sa.Text(),       nullable=True),
        sa.Column('created_at',     sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── timetable_slots ───────────────────────────────────────────────────────
    op.create_table(
        'timetable_slots',
        sa.Column('id',           sa.String(36),   nullable=False),
        sa.Column('timetable_id', sa.String(36),   nullable=False),
        sa.Column('section_id',   sa.String(36),   nullable=True),
        sa.Column('subject_id',   sa.String(36),   nullable=True),
        sa.Column('teacher_id',   sa.String(36),   nullable=True),
        sa.Column('room_id',      sa.String(36),   nullable=True),
        sa.Column('day_of_week',  sa.SmallInteger(), nullable=False),
        sa.Column('period_index', sa.SmallInteger(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(
            ['timetable_id'], ['timetables.id'],
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['section_id'], ['class_sections.id'],
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['subject_id'], ['subjects.id'],
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['teacher_id'], ['teachers.id'],
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['room_id'], ['rooms.id'],
            ondelete='SET NULL',
        ),
    )

    # Index for fetching all slots of a timetable efficiently
    op.create_index('ix_timetable_slots_timetable_id', 'timetable_slots', ['timetable_id'])


def downgrade() -> None:
    op.drop_index('ix_timetable_slots_timetable_id', table_name='timetable_slots')
    op.drop_table('timetable_slots')
    op.drop_table('timetables')
