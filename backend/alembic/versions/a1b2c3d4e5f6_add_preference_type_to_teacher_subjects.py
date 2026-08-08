"""Add preference_type to teacher_subjects

Revision ID: a1b2c3d4e5f6
Revises: 65497a6c20e5
Create Date: 2026-08-08 10:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '65497a6c20e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add preference_type column with a safe server default so existing rows get 'willing'
    op.add_column(
        'teacher_subjects',
        sa.Column(
            'preference_type',
            sa.String(length=20),
            nullable=False,
            server_default='willing',
        ),
    )
    op.create_check_constraint(
        'ck_teacher_subject_preference_type',
        'teacher_subjects',
        "preference_type IN ('preferred', 'willing', 'avoid')",
    )


def downgrade() -> None:
    op.drop_constraint(
        'ck_teacher_subject_preference_type',
        'teacher_subjects',
        type_='check',
    )
    op.drop_column('teacher_subjects', 'preference_type')
