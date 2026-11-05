"""Entrance gate/door split: add gate_labels to floors + entrance_pair_distances table

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-10-07

"""
from alembic import op
import sqlalchemy as sa


revision = 'k6l7m8n9o0p1'
down_revision = 'j5k6l7m8n9o0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add gate_labels JSON column to floors
    #    Stores {"row,col": "label"} for gate cells painted on this floor.
    op.add_column('floors', sa.Column('gate_labels', sa.Text(), nullable=True))

    # 2. Create entrance_pair_distances table for per-gate cross-building distances
    op.create_table(
        'entrance_pair_distances',
        sa.Column('id',           sa.String(36),  primary_key=True),
        sa.Column('campus_id',    sa.String(36),  sa.ForeignKey('campuses.id',  ondelete='CASCADE'), nullable=False),
        sa.Column('floor_a_id',   sa.String(36),  sa.ForeignKey('floors.id',    ondelete='CASCADE'), nullable=False),
        sa.Column('gate_a_row',   sa.Integer(),   nullable=False),
        sa.Column('gate_a_col',   sa.Integer(),   nullable=False),
        sa.Column('gate_a_label', sa.String(80),  nullable=True),
        sa.Column('floor_b_id',   sa.String(36),  sa.ForeignKey('floors.id',    ondelete='CASCADE'), nullable=False),
        sa.Column('gate_b_row',   sa.Integer(),   nullable=False),
        sa.Column('gate_b_col',   sa.Integer(),   nullable=False),
        sa.Column('gate_b_label', sa.String(80),  nullable=True),
        sa.Column('distance_m',     sa.Float(),   nullable=False, server_default='0'),
        sa.Column('distance_cells', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            'floor_a_id', 'gate_a_row', 'gate_a_col',
            'floor_b_id', 'gate_b_row', 'gate_b_col',
            name='uq_entrance_pair'
        ),
    )


def downgrade() -> None:
    op.drop_table('entrance_pair_distances')
    op.drop_column('floors', 'gate_labels')
