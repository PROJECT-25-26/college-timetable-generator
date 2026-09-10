"""add campus building floor tables

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-09-09
"""

from alembic import op
import sqlalchemy as sa


revision = 'a7b8c9d0e1f2'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── campuses ─────────────────────────────────────────────────────────────
    op.create_table(
        'campuses',
        sa.Column('id',          sa.String(36),  nullable=False),
        sa.Column('name',        sa.String(120), nullable=False),
        sa.Column('description', sa.Text(),       nullable=True),
        sa.Column('created_at',  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at',  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    # ── buildings ─────────────────────────────────────────────────────────────
    op.create_table(
        'buildings',
        sa.Column('id',        sa.String(36),  nullable=False),
        sa.Column('campus_id', sa.String(36),  nullable=False),
        sa.Column('name',      sa.String(120), nullable=False),
        sa.Column('code',      sa.String(20),  nullable=False),
        sa.Column('pos_x',     sa.Integer(),   nullable=False, server_default='0'),
        sa.Column('pos_y',     sa.Integer(),   nullable=False, server_default='0'),
        sa.Column('width',     sa.Integer(),   nullable=False, server_default='120'),
        sa.Column('height',    sa.Integer(),   nullable=False, server_default='80'),
        sa.Column('color',     sa.String(9),   nullable=False, server_default='#6366f1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['campus_id'], ['campuses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('campus_id', 'code', name='uq_building_campus_code'),
    )

    # ── floors ────────────────────────────────────────────────────────────────
    op.create_table(
        'floors',
        sa.Column('id',          sa.String(36),   nullable=False),
        sa.Column('building_id', sa.String(36),   nullable=False),
        sa.Column('name',        sa.String(120),  nullable=False),
        sa.Column('level',       sa.SmallInteger(), nullable=False, server_default='0'),
        sa.Column('grid_rows',   sa.Integer(),    nullable=False, server_default='20'),
        sa.Column('grid_cols',   sa.Integer(),    nullable=False, server_default='30'),
        sa.Column('cell_size_m', sa.Float(),      nullable=False, server_default='1.0'),
        sa.Column('grid_data',   sa.Text(),       nullable=True),
        sa.Column('created_at',  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at',  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['building_id'], ['buildings.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('building_id', 'level', name='uq_floor_building_level'),
        sa.CheckConstraint('grid_rows >= 5 AND grid_rows <= 200', name='ck_floor_rows_range'),
        sa.CheckConstraint('grid_cols >= 5 AND grid_cols <= 200', name='ck_floor_cols_range'),
        sa.CheckConstraint('cell_size_m > 0',                     name='ck_floor_cell_size_positive'),
    )


def downgrade() -> None:
    op.drop_table('floors')
    op.drop_table('buildings')
    op.drop_table('campuses')
