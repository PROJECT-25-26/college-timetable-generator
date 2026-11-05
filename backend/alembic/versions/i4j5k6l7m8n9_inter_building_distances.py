"""add inter_building_distances table

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-10-05

"""
from alembic import op
import sqlalchemy as sa


revision = 'i4j5k6l7m8n9'
down_revision = 'g2h3i4j5k6l7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'inter_building_distances',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('campus_id', sa.String(length=36), nullable=False),
        sa.Column('building_a_id', sa.String(length=36), nullable=False),
        sa.Column('building_b_id', sa.String(length=36), nullable=False),
        sa.Column('distance_m', sa.Float(), nullable=False, server_default='0'),
        sa.Column('distance_cells', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['campus_id'], ['campuses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['building_a_id'], ['buildings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['building_b_id'], ['buildings.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('building_a_id', 'building_b_id', name='uq_building_pair_distance')
    )


def downgrade() -> None:
    op.drop_table('inter_building_distances')
