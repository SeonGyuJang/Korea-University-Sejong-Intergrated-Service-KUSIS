"""
학습 로그 모델
"""
from . import db

class StudyLog(db.Model):
    __tablename__ = 'study_logs'

    entry_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    date = db.Column(db.String(10), nullable=False, index=True)
    duration_seconds = db.Column(db.Integer, default=0, nullable=False)

    __table_args__ = (db.UniqueConstraint('user_id', 'date', name='_user_date_uc'),)
